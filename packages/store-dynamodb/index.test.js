import { deepEqual, equal, ok, rejects } from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomInt } from "node:crypto";
import { describe, it, test } from "node:test";
import tests from "../store/index.test.js";

const nowInSeconds = () => Math.floor(Date.now() / 1000);

import * as store from "../store-dynamodb/index.js";
import * as mockDatabase from "./mock.js";
import * as mockDatabaseTable from "./table/dynamodb.js";

// Which command this store builds, and what it puts in it, is the contract with
// DynamoDB: two filter shapes can return the same row while querying entirely
// different indexes. Recording every command lets the tests assert the request,
// not just the response.
const sent = [];
const baseConfig = {
	log: (...args) => mocks.log(...args),
	client: {
		send: (command) => {
			sent.push(command);
			return mocks.storeClient.send(command);
		},
	},
	randomId: () => randomInt(281_474_976_710_655),
};
const configure = (opt = {}) => store.default({ ...baseConfig, ...opt });
configure();

const lastSent = () => sent[sent.length - 1];
const sentNames = () => sent.map((command) => command.constructor.name);

const mocks = {
	...mockDatabase,
	id: "dynamodb",
	table: mockDatabaseTable,
};

const table = mockDatabaseTable.name;

describe("@1auth/store-dynamodb", () => {
	tests(store, mocks);

	describe("mock", () => {
		const isReadyWith = (env) =>
			execFileSync(
				process.execPath,
				[
					"--input-type=module",
					"-e",
					`const m = await import(${JSON.stringify(new URL("./mock.js", import.meta.url).href)}); console.log(m.isReady()); m.storeClient.destroy();`,
				],
				{ env: { ...process.env, ...env }, encoding: "utf8" },
			).trim();
		it("Should not be ready when SKIP_DYNAMODB is set, even with the container up", () => {
			equal(isReadyWith({ SKIP_DYNAMODB: "1" }), "false");
		});
		it("Should be ready when the container is up", () => {
			equal(isReadyWith({ SKIP_DYNAMODB: "" }), "true");
		});
	});

	describe("makeQueryParams", () => {
		it("Should format {ExpressionAttributeNames} properly", async () => {
			const { ExpressionAttributeNames } = store.makeQueryParams({
				id: [1, 2],
				sub: "sub_000",
			});
			deepEqual(ExpressionAttributeNames, {
				"#id": "id",
				"#sub": "sub",
			});
		});
		it("Should format {ExpressionAttributeValues} properly", async () => {
			const { ExpressionAttributeValues } = store.makeQueryParams({
				id: [1, 2],
				sub: "sub_000",
			});
			deepEqual(ExpressionAttributeValues, {
				":id_0": { N: "1" },
				":id_1": { N: "2" },
				":sub": {
					S: "sub_000",
				},
			});
		});
		it("Should format {KeyConditionExpression} properly", async () => {
			const { KeyConditionExpression } = store.makeQueryParams({
				id: [1, 2],
				sub: "sub_000",
			});
			equal(KeyConditionExpression, "#id IN (:id_0, :id_1) and #sub = :sub");
		});
		it("Should format {UpdateExpression} properly", async () => {
			const { UpdateExpression } = store.makeQueryParams({
				id: 1,
				sub: "sub_000",
			});
			equal(UpdateExpression, "SET #id = :id, #sub = :sub");
		});
	});

	describe("makeQueryParams edge cases", () => {
		it("Should skip undefined filter values", async () => {
			const { ExpressionAttributeNames, KeyConditionExpression } =
				store.makeQueryParams({ sub: "sub_000", id: undefined });
			deepEqual(ExpressionAttributeNames, { "#sub": "sub" });
			equal(KeyConditionExpression, "#sub = :sub");
		});

		it("Should handle single scalar filter", async () => {
			const result = store.makeQueryParams({ sub: "sub_000" });
			equal(result.KeyConditionExpression, "#sub = :sub");
			deepEqual(result.ExpressionAttributeValues, {
				":sub": { S: "sub_000" },
			});
		});

		it("Should handle numeric filter value", async () => {
			const result = store.makeQueryParams({ id: 42 });
			deepEqual(result.ExpressionAttributeValues, {
				":id": { N: "42" },
			});
			equal(result.KeyConditionExpression, "#id = :id");
		});

		it("Should handle empty filters", async () => {
			const result = store.makeQueryParams({});
			equal(result.KeyConditionExpression, "");
			equal(result.UpdateExpression, "SET ");
			deepEqual(result.ExpressionAttributeNames, {});
			deepEqual(result.ExpressionAttributeValues, {});
		});

		it("Should handle string array filter values", async () => {
			const result = store.makeQueryParams({ sub: ["sub_000", "sub_001"] });
			equal(result.KeyConditionExpression, "#sub IN (:sub_0, :sub_1)");
			deepEqual(result.ExpressionAttributeValues, {
				":sub_0": { S: "sub_000" },
				":sub_1": { S: "sub_001" },
			});
		});
		it("Should keep a list item's placeholder apart from a key named like it", async () => {
			const result = store.makeQueryParams({ id: [1, 2], id_0: 9 });
			equal(
				result.KeyConditionExpression,
				"#id IN (:id_0, :id_1) and #id_0 = :id_0_1",
			);
			deepEqual(result.ExpressionAttributeValues, {
				":id_0": { N: "1" },
				":id_1": { N: "2" },
				":id_0_1": { N: "9" },
			});
		});
	});

	describe("integration", () => {
		test.before(async () => {
			await mockDatabaseTable.create(mocks.storeClient, table);
		});
		test.beforeEach(() => {
			sent.length = 0;
		});
		test.afterEach(async () => {
			await mockDatabaseTable.truncate(mocks.storeClient, table);
		});
		test.after(async () => {
			await mockDatabaseTable.drop(mocks.storeClient, table);
		});

		describe("command selection", () => {
			// Each filter shape has exactly one right way to reach DynamoDB. Several
			// of them return the same row either way, so the row alone proves
			// nothing -- the command and its key expression are the contract.
			const query = async (filters, fields) => {
				sent.length = 0;
				await store.select(table, filters, fields);
				return lastSent();
			};

			it("Should read {sub, id} straight off the table", async () => {
				await store.insert(table, { id: 1, sub: "sub_000", value: "a" });
				const command = await query({ sub: "sub_000", id: 1 });
				equal(command.constructor.name, "GetItemCommand");
				deepEqual(command.input.Key, {
					sub: { S: "sub_000" },
					id: { N: "1" },
				});
				equal(command.input.IndexName, undefined);
				// no field list asked for, so none is sent
				equal(command.input.AttributesToGet, undefined);
			});

			it("Should ask for only the named attributes off the table", async () => {
				await store.insert(table, { id: 1, sub: "sub_000", value: "a" });
				const command = await query({ sub: "sub_000", id: 1 }, ["value"]);
				equal(command.constructor.name, "GetItemCommand");
				deepEqual(command.input.AttributesToGet, ["value"]);
			});

			it("Should query the digest index for {digest}", async () => {
				await store.insert(table, {
					id: 1,
					sub: "sub_000",
					value: "a",
					digest: "d1",
				});
				const command = await query({ digest: "d1" });
				equal(command.constructor.name, "QueryCommand");
				equal(command.input.IndexName, "digest");
				equal(command.input.KeyConditionExpression, "#digest = :digest");
				equal(command.input.FilterExpression, undefined);
			});

			it("Should query the sub index for {sub}", async () => {
				await store.insert(table, { id: 1, sub: "sub_000", value: "a" });
				const command = await query({ sub: "sub_000" });
				equal(command.constructor.name, "QueryCommand");
				equal(command.input.IndexName, "sub");
				equal(command.input.KeyConditionExpression, "#sub = :sub");
			});

			it("Should query the key index for {id}", async () => {
				await store.insert(table, { id: 1, sub: "sub_000", value: "a" });
				const command = await query({ id: 1 });
				equal(command.constructor.name, "QueryCommand");
				equal(command.input.IndexName, "key");
				equal(command.input.KeyConditionExpression, "#id = :id");
			});

			it("Should join a multi-field projection with commas", async () => {
				await store.insert(table, { id: 1, sub: "sub_000", value: "a" });
				sent.length = 0;
				const rows = await store.selectList(table, { sub: "sub_000" }, [
					"id",
					"value",
				]);
				equal(lastSent().input.ProjectionExpression, "#id, #value");
				deepEqual(rows, [{ id: 1, value: "a" }]);
			});

			it("Should surface an error that is not a missing item", async () => {
				// the empty-key case returns undefined, anything else has to escape
				equal(
					await store.select(table, { sub: "sub_000", id: 404 }),
					undefined,
				);
				await rejects(
					() => store.select("table_does_not_exist", { sub: "s", id: 1 }),
					(e) => e.name === "ResourceNotFoundException",
				);
			});
		});

		describe("key and filter split", () => {
			// Against a table whose sub and digest indexes are keyed on `type`, the
			// way filters are divided between KeyConditionExpression and
			// FilterExpression is what makes the query legal at all.
			const typed = mockDatabaseTable.typedName;
			const row = {
				id: 1,
				sub: "sub_000",
				value: "a",
				digest: "d1",
				type: "t1",
			};
			test.before(async () => {
				await mockDatabaseTable.createTyped(mocks.storeClient, typed);
			});
			test.beforeEach(async () => {
				await store.insert(typed, row);
				sent.length = 0;
			});
			test.afterEach(async () => {
				await mockDatabaseTable.truncate(mocks.storeClient, typed);
			});
			test.after(async () => {
				await mockDatabaseTable.drop(mocks.storeClient, typed);
			});

			it("Should key on `type` for the sub index", async () => {
				const rows = await store.selectList(typed, {
					sub: row.sub,
					type: row.type,
				});
				equal(lastSent().input.IndexName, "sub");
				equal(
					lastSent().input.KeyConditionExpression,
					"#sub = :sub and #type = :type",
				);
				equal(lastSent().input.FilterExpression, undefined);
				equal(rows.length, 1);
			});

			it("Should key on `type` for the digest index", async () => {
				const rows = await store.selectList(typed, {
					digest: row.digest,
					type: row.type,
				});
				equal(lastSent().input.IndexName, "digest");
				equal(
					lastSent().input.KeyConditionExpression,
					"#digest = :digest and #type = :type",
				);
				equal(lastSent().input.FilterExpression, undefined);
				equal(rows.length, 1);
			});

			it("Should filter on `type` for the key index", async () => {
				// the key index is partitioned on `id` alone
				const rows = await store.selectList(typed, {
					id: row.id,
					type: row.type,
				});
				equal(lastSent().input.IndexName, "key");
				equal(lastSent().input.KeyConditionExpression, "#id = :id");
				equal(lastSent().input.FilterExpression, "#type = :type");
				equal(rows.length, 1);
			});

			it("Should key on sub+id and filter the rest off the table", async () => {
				const rows = await store.selectList(typed, {
					sub: row.sub,
					id: row.id,
					type: row.type,
				});
				equal(lastSent().input.IndexName, undefined);
				equal(
					lastSent().input.KeyConditionExpression,
					"#sub = :sub and #id = :id",
				);
				equal(lastSent().input.FilterExpression, "#type = :type");
				equal(rows.length, 1);
			});

			it("Should not key on `id` off the digest index", async () => {
				const rows = await store.selectList(typed, {
					digest: row.digest,
					id: row.id,
				});
				equal(lastSent().input.IndexName, "digest");
				equal(lastSent().input.KeyConditionExpression, "#digest = :digest");
				equal(lastSent().input.FilterExpression, "#id = :id");
				equal(rows.length, 1);
			});

			it("Should removeList only rows of the given `type`", async () => {
				await store.removeList(typed, {
					sub: row.sub,
					id: [row.id],
					type: "t2",
				});
				equal((await store.selectList(typed, { sub: row.sub })).length, 1);
				await store.removeList(typed, {
					sub: row.sub,
					id: [row.id],
					type: "t1",
				});
				equal((await store.selectList(typed, { sub: row.sub })).length, 0);
			});

			it("Should join several filters with `and`", async () => {
				const rows = await store.selectList(typed, {
					id: row.id,
					type: row.type,
					value: row.value,
				});
				equal(
					lastSent().input.FilterExpression,
					"#type = :type and #value = :value",
				);
				equal(rows.length, 1);
			});
		});

		describe("remove command selection", () => {
			it("Should delete by key without querying first", async () => {
				await store.insert(table, { id: 1, sub: "sub_000", value: "a" });
				sent.length = 0;
				equal(await store.remove(table, { sub: "sub_000", id: 1 }), true);
				deepEqual(sentNames(), ["DeleteItemCommand"]);
				deepEqual(lastSent().input.Key, {
					sub: { S: "sub_000" },
					id: { N: "1" },
				});
				equal(lastSent().input.ReturnValues, "ALL_OLD");
			});

			it("Should report false when there was nothing to delete", async () => {
				equal(await store.remove(table, { sub: "sub_000", id: 404 }), false);
			});

			it("Should query first when a non-key filter is present", async () => {
				await store.insert(table, {
					id: 1,
					sub: "sub_000",
					value: "a",
					digest: "d1",
				});
				sent.length = 0;
				equal(await store.remove(table, { digest: "d1" }), true);
				deepEqual(sentNames(), ["QueryCommand", "DeleteItemCommand"]);
			});

			it("Should delete by key when a key filter is joined by a non-key one", async () => {
				await store.insert(table, {
					id: 1,
					sub: "sub_000",
					value: "a",
					type: "t1",
				});
				sent.length = 0;
				equal(
					await store.remove(table, { sub: "sub_000", id: 1, type: "t1" }),
					true,
				);
				deepEqual(sentNames(), ["DeleteItemCommand"]);
			});

			it("Should report false when a non-key filter matches nothing", async () => {
				equal(await store.remove(table, { digest: "nomatch" }), false);
				deepEqual(sentNames(), ["QueryCommand"]);
			});

			it("Should report false when the row vanishes between query and delete", async () => {
				// the delete is what decides, not the query that found the candidate
				await store.insert(table, {
					id: 1,
					sub: "sub_000",
					value: "a",
					digest: "d1",
				});
				configure({
					client: {
						send: async (command) => {
							sent.push(command);
							const res = await mocks.storeClient.send(command);
							if (command.constructor.name === "DeleteItemCommand") {
								return { ...res, Attributes: undefined };
							}
							return res;
						},
					},
				});
				try {
					equal(await store.remove(table, { digest: "d1" }), false);
				} finally {
					configure();
				}
			});
		});

		describe("conditions", () => {
			const row = { id: 1, sub: "sub_000", value: "a", type: "t1" };

			it("Should insert only where the key is free", async () => {
				await store.insert(table, row);
				equal(
					lastSent().input.ConditionExpression,
					"attribute_not_exists(#sub) and attribute_not_exists(#id)",
				);
				deepEqual(lastSent().input.ExpressionAttributeNames, {
					"#sub": "sub",
					"#id": "id",
				});
				await rejects(
					() => store.insert(table, row),
					(e) => e.name === "ConditionalCheckFailedException",
				);
			});

			it("Should update only an existing row matching every filter", async () => {
				await store.insert(table, row);
				sent.length = 0;
				await store.update(
					table,
					{ sub: row.sub, id: row.id, type: "t1" },
					{ value: "b" },
				);
				deepEqual(sentNames(), ["UpdateItemCommand"]);
				const { input } = lastSent();
				deepEqual(input.Key, { sub: { S: "sub_000" }, id: { N: "1" } });
				equal(input.UpdateExpression, "SET #value = :value");
				equal(
					input.ConditionExpression,
					"attribute_exists(#sub) and attribute_exists(#id) and #type = :if_type",
				);
				deepEqual(input.ExpressionAttributeValues, {
					":value": { S: "b" },
					":if_type": { S: "t1" },
				});
				equal((await store.select(table, { sub: row.sub, id: 1 })).value, "b");

				await store.update(
					table,
					{ sub: row.sub, id: row.id, type: "t2" },
					{ type: "t3" },
				);
				equal((await store.select(table, { sub: row.sub, id: 1 })).type, "t1");
			});

			it("Should set a list value as a list", async () => {
				await store.insert(table, row);
				await store.update(
					table,
					{ sub: row.sub, id: row.id },
					{ value: ["a", "b"] },
				);
				deepEqual(
					(await store.select(table, { sub: row.sub, id: row.id })).value,
					["a", "b"],
				);
			});

			it("Should leave an attribute set to undefined as it was", async () => {
				await store.insert(table, row);
				await store.update(
					table,
					{ sub: row.sub, id: row.id },
					{ value: "b", type: undefined },
				);
				equal(lastSent().input.UpdateExpression, "SET #value = :value");
				const updated = await store.select(table, { sub: row.sub, id: row.id });
				equal(updated.value, "b");
				equal(updated.type, "t1");
			});

			it("Should keep a set value apart from a condition named like it", async () => {
				await store.insert(table, row);
				await store.update(
					table,
					{ sub: row.sub, id: row.id, type: "t1" },
					{ if_type: "y" },
				);
				equal(
					(await store.select(table, { sub: row.sub, id: row.id })).if_type,
					"y",
				);
			});

			it("Should key an update on sub alone for a sub-keyed table", async () => {
				await rejects(() =>
					store.update(table, { sub: row.sub }, { value: "b" }),
				);
				equal(lastSent().input.ConditionExpression, "attribute_exists(#sub)");
				deepEqual(lastSent().input.Key, { sub: { S: "sub_000" } });
			});

			it("Should surface an update error that is not a failed condition", async () => {
				await rejects(
					() =>
						store.update(
							"table_does_not_exist",
							{ sub: "s", id: 1 },
							{
								value: "b",
							},
						),
					(e) => e.name === "ResourceNotFoundException",
				);
			});

			it("Should delete by key with the rest as a condition", async () => {
				await store.insert(table, row);
				sent.length = 0;
				equal(
					await store.remove(table, { sub: row.sub, id: row.id, type: "t2" }),
					false,
				);
				deepEqual(sentNames(), ["DeleteItemCommand"]);
				equal(lastSent().input.ConditionExpression, "#type = :if_type");
				equal(
					await store.remove(table, { sub: row.sub, id: row.id, type: "t1" }),
					true,
				);
				equal(await store.select(table, { sub: row.sub, id: 1 }), undefined);
			});

			it("Should query first without the full key", async () => {
				await store.insertList(table, [
					row,
					{ id: 2, sub: row.sub, value: "b", type: "t2" },
					{ id: 3, sub: row.sub, value: "c", type: "t2" },
				]);
				sent.length = 0;
				equal(await store.remove(table, { sub: row.sub, value: "a" }), true);
				deepEqual(sentNames(), ["QueryCommand", "DeleteItemCommand"]);
				equal(await store.remove(table, { sub: row.sub, id: [2, 3] }), true);
				deepEqual(await store.selectList(table, { sub: row.sub }), []);
			});

			it("Should delete by sub alone for a sub-keyed table", async () => {
				sent.length = 0;
				await rejects(() => store.remove(table, { sub: row.sub }));
				deepEqual(sentNames(), ["DeleteItemCommand"]);
				deepEqual(lastSent().input.Key, { sub: { S: "sub_000" } });
			});

			it("Should surface a delete error that is not a failed condition", async () => {
				await rejects(
					() =>
						store.remove("table_does_not_exist", {
							sub: "s",
							id: 1,
							type: "t1",
						}),
					(e) => e.name === "ResourceNotFoundException",
				);
			});

			it("Should match non-key filters after a GetItem", async () => {
				await store.insert(table, row);
				sent.length = 0;
				equal(
					await store.select(table, { sub: row.sub, id: 1, type: "t2" }),
					undefined,
				);
				equal(
					await store.exists(table, { sub: row.sub, id: 1, type: "t2" }),
					undefined,
				);
				deepEqual(sentNames(), ["GetItemCommand", "GetItemCommand"]);
				deepEqual(
					await store.select(table, { sub: row.sub, id: 1, type: "t1" }, [
						"value",
					]),
					{ value: "a" },
				);
				deepEqual(lastSent().input.AttributesToGet, ["value", "type"]);
				deepEqual(
					await store.select(table, {
						sub: row.sub,
						id: 1,
						type: ["t0", "t1"],
					}),
					row,
				);
			});
		});

		describe("filters", () => {
			const rejectsWith = (fn, message) =>
				rejects(fn, { message: `@1auth/store-dynamodb ${message}` });

			it("Should reject undefined and empty array filter values", async () => {
				for (const fn of [
					store.exists,
					store.select,
					store.selectList,
					store.remove,
					(t, f) => store.update(t, f, { value: "b" }),
				]) {
					await rejectsWith(
						() => fn(table, { sub: "sub_000", id: undefined }),
						"filter value is undefined",
					);
					await rejectsWith(
						() => fn(table, { sub: "sub_000", id: [] }),
						"filter value is an empty array",
					);
				}
				deepEqual(sent, []);
			});

			it("Should refuse update and remove without a key", async () => {
				for (const fn of [
					() => store.update(table, {}, { value: "b" }),
					() => store.update(table, undefined, { value: "b" }),
					() => store.update(table, { type: "t1" }, { value: "b" }),
					() => store.remove(table, {}),
					() => store.remove(table),
				]) {
					await rejectsWith(fn, "refusing to write without a filter");
				}
				deepEqual(sent, []);
			});

			it("Should match any of a list filter", async () => {
				await store.insertList(table, [
					{ id: 1, sub: "sub_000", value: "a" },
					{ id: 2, sub: "sub_000", value: "b" },
					{ id: 3, sub: "sub_000", value: "c" },
				]);
				sent.length = 0;
				const rows = await store.selectList(table, {
					sub: "sub_000",
					id: [1, 3],
				});
				deepEqual(rows.map((r) => r.id).sort(), [1, 3]);
				equal(lastSent().input.KeyConditionExpression, "#sub = :sub");
				equal(lastSent().input.FilterExpression, "#id IN (:id_0, :id_1)");
			});
		});

		describe("pagination", () => {
			const paged = () =>
				configure({
					client: {
						send: (command) => {
							sent.push(command);
							if (command.constructor.name === "QueryCommand") {
								command.input.Limit = 1;
							}
							return mocks.storeClient.send(command);
						},
					},
				});

			it("Should read every page of a query", async () => {
				await store.insertList(table, [
					{ id: 1, sub: "sub_000", value: "a" },
					{ id: 2, sub: "sub_000", value: "b" },
					{ id: 3, sub: "sub_000", value: "c" },
				]);
				paged();
				try {
					equal((await store.selectList(table, { sub: "sub_000" })).length, 3);
					deepEqual(
						await store.selectList(table, { sub: "sub_000", value: "c" }, [
							"id",
						]),
						[{ id: 3 }],
					);
					equal(
						(await store.select(table, { sub: "sub_000", value: "c" })).id,
						3,
					);
					ok(sent.length > 6);
				} finally {
					configure();
				}
			});
		});

		describe("batch writes", () => {
			const rowsOf = (n) =>
				Array.from({ length: n }, (_, i) => ({
					id: i + 1,
					sub: "sub_000",
					value: `v${i}`,
				}));
			const sizesOf = (name) =>
				sent
					.filter((c) => c.constructor.name === name)
					.map((c) =>
						name === "TransactWriteItemsCommand"
							? c.input.TransactItems.length
							: c.input.RequestItems[table].length,
					);
			const batchSizes = () => sizesOf("BatchWriteItemCommand");
			const listed = async () =>
				(await store.selectList(table, { sub: "sub_000" }))
					.map((r) => r.id)
					.sort((x, y) => x - y);

			it("Should insert in transactions of 100, each put conditional", async () => {
				sent.length = 0;
				deepEqual(
					await store.insertList(table, rowsOf(150)),
					rowsOf(150).map((r) => r.id),
				);
				deepEqual(sizesOf("TransactWriteItemsCommand"), [100, 50]);
				deepEqual(batchSizes(), []);
				const put = sent[0].input.TransactItems[0].Put;
				equal(put.TableName, table);
				equal(
					put.ConditionExpression,
					"attribute_not_exists(#sub) and attribute_not_exists(#id)",
				);
				deepEqual(put.ExpressionAttributeNames, { "#sub": "sub", "#id": "id" });
				equal((await listed()).length, 150);
			});

			it("Should reject a list holding an existing key, writing none of it", async () => {
				await store.insert(table, rowsOf(2)[1]);
				await rejects(
					() => store.insertList(table, rowsOf(3)),
					(e) => e.name === "TransactionCanceledException",
				);
				deepEqual(await listed(), [2]);
			});

			it("Should remove in chunks of 25", async () => {
				await store.insertList(table, rowsOf(60));
				sent.length = 0;
				await store.removeList(table, {
					sub: "sub_000",
					id: rowsOf(55).map((r) => r.id),
				});
				deepEqual(batchSizes(), [25, 25, 5]);
				equal((await listed()).length, 5);
			});

			it("Should remove only rows matching every other filter", async () => {
				await store.insertList(table, rowsOf(3));
				sent.length = 0;
				await store.removeList(table, {
					sub: "sub_000",
					id: [1, 2],
					value: "v0",
				});
				deepEqual(sentNames(), ["QueryCommand", "DeleteItemCommand"]);
				deepEqual(await listed(), [2, 3]);
			});

			it("Should retry unprocessed items", async () => {
				await store.insertList(table, rowsOf(3));
				configure({
					client: {
						send: async (command) => {
							sent.push(command);
							if (command.constructor.name === "BatchWriteItemCommand") {
								const requests = command.input.RequestItems[table];
								if (requests.length > 1) {
									await mocks.storeClient.send(
										new command.constructor({
											RequestItems: { [table]: requests.slice(0, -1) },
										}),
									);
									return {
										UnprocessedItems: { [table]: requests.slice(-1) },
									};
								}
							}
							return mocks.storeClient.send(command);
						},
					},
				});
				try {
					sent.length = 0;
					await store.removeList(table, { sub: "sub_000", id: [1, 2, 3] });
					deepEqual(batchSizes(), [3, 1]);
					deepEqual(await listed(), []);
				} finally {
					configure();
				}
			});

			it("Should throw when items stay unprocessed", async () => {
				configure({
					client: {
						send: async (command) => {
							sent.push(command);
							return { UnprocessedItems: command.input.RequestItems };
						},
					},
				});
				try {
					sent.length = 0;
					await rejects(
						() => store.removeList(table, { sub: "sub_000", id: [1, 2] }),
						{
							message:
								"@1auth/store-dynamodb batch write left unprocessed items",
							cause: { table, count: 2 },
						},
					);
					deepEqual(batchSizes(), [2, 2, 2, 2, 2, 2]);
				} finally {
					configure();
				}
			});
		});

		describe("queries without a key", () => {
			it("Should throw clearly when no filter can key the query", async () => {
				for (const filters of [{ id: [1, 2] }, { value: "a" }]) {
					sent.length = 0;
					await rejects(() => store.selectList(table, filters), {
						message: "@1auth/store-dynamodb filters have no key to query on",
						cause: { table, filters },
					});
					deepEqual(sent, []);
				}
			});
		});

		describe("time to live", () => {
			it("Should set `remove` exactly `timeToLiveExpireOffset` past `expire`", async () => {
				const expire = nowInSeconds() + 86400;
				await store.insert(table, {
					id: 1,
					sub: "sub_000",
					value: "a",
					expire,
				});
				const inserted = await store.select(table, { sub: "sub_000", id: 1 });
				equal(inserted.remove, expire + 10 * 24 * 60 * 60);

				const updated = nowInSeconds() + 172800;
				await store.update(
					table,
					{ sub: "sub_000", id: 1 },
					{ expire: updated },
				);
				const after = await store.select(table, { sub: "sub_000", id: 1 });
				equal(after.remove, updated + 10 * 24 * 60 * 60);

				await store.insertList(table, [
					{ id: 2, sub: "sub_000", value: "b", expire },
				]);
				const listed = await store.select(table, { sub: "sub_000", id: 2 });
				equal(listed.remove, expire + 10 * 24 * 60 * 60);
			});

			it("Should leave an explicit `remove` alone", async () => {
				// a caller that names its own removal date owns it
				const expire = nowInSeconds() + 86400;
				const remove = expire + 1;
				await store.insert(table, {
					id: 1,
					sub: "sub_000",
					value: "a",
					expire,
					remove,
				});
				equal(
					(await store.select(table, { sub: "sub_000", id: 1 })).remove,
					remove,
				);

				await store.update(
					table,
					{ sub: "sub_000", id: 1 },
					{ expire, remove },
				);
				equal(
					(await store.select(table, { sub: "sub_000", id: 1 })).remove,
					remove,
				);

				await store.insertList(table, [
					{ id: 2, sub: "sub_000", value: "b", expire, remove },
				]);
				equal(
					(await store.select(table, { sub: "sub_000", id: 2 })).remove,
					remove,
				);
			});
		});

		describe("insertList", () => {
			it("Should return exactly the ids it wrote", async () => {
				deepEqual(
					await store.insertList(table, [
						{ id: 1, sub: "sub_000", value: "a" },
						{ id: 2, sub: "sub_000", value: "b" },
					]),
					[1, 2],
				);
			});
		});

		describe("marshalling", () => {
			it("Should drop undefined values rather than reject them", async () => {
				await store.insert(table, {
					id: 1,
					sub: "sub_000",
					value: "a",
					digest: undefined,
				});
				const row = await store.select(table, { sub: "sub_000", id: 1 });
				equal(row.digest, undefined);
				equal("digest" in row, false);
			});
		});

		describe("log", () => {
			it("Should close every logged call with a bracket", async () => {
				// the trailing ")" completes the "method(" the call opens with
				const row = { id: 1, sub: "sub_000", value: "a" };
				const key = { sub: row.sub, id: row.id };
				const argsOf = async (fn) => {
					const before = mocks.log.mock.calls.length;
					await fn();
					return mocks.log.mock.calls[before].arguments;
				};
				const prefix = "@1auth/store-dynamodb ";
				deepEqual(await argsOf(() => store.insert(table, row)), [
					`${prefix}insert(`,
					table,
					row,
					")",
				]);
				deepEqual(await argsOf(() => store.exists(table, key)), [
					`${prefix}exists(`,
					table,
					key,
					")",
				]);
				deepEqual(await argsOf(() => store.select(table, key, ["value"])), [
					`${prefix}select(`,
					table,
					key,
					["value"],
					")",
				]);
				deepEqual(await argsOf(() => store.selectList(table, key)), [
					`${prefix}selectList(`,
					table,
					key,
					")",
				]);
				deepEqual(
					await argsOf(() =>
						store.insertList(table, [{ id: 2, sub: row.sub, value: "b" }]),
					),
					[
						`${prefix}insertList(`,
						table,
						[{ id: 2, sub: row.sub, value: "b" }],
						")",
					],
				);
				deepEqual(
					await argsOf(() => store.update(table, key, { value: "z" })),
					[`${prefix}update(`, table, key, { value: "z" }, ")"],
				);
				deepEqual(await argsOf(() => store.remove(table, key)), [
					`${prefix}remove(`,
					table,
					key,
					")",
				]);
				const listFilters = { sub: row.sub, id: [2] };
				deepEqual(await argsOf(() => store.removeList(table, listFilters)), [
					`${prefix}removeList(`,
					table,
					listFilters,
					")",
				]);
			});

			it("Should stay silent, not crash, when logging is off", async () => {
				// `log: false` is not callable: the guard is what keeps every one of
				// these from taking the call down
				configure({ log: false });
				try {
					const row = { id: 1, sub: "sub_000", value: "a" };
					const key = { sub: row.sub, id: row.id };
					await store.insert(table, row);
					await store.insertList(table, [{ id: 2, sub: row.sub, value: "b" }]);
					await store.exists(table, key);
					await store.select(table, key);
					await store.selectList(table, key);
					await store.update(table, key, { value: "z" });
					await store.remove(table, key);
					await store.removeList(table, { sub: row.sub, id: [2] });
					equal(mocks.log.mock.calls.length, 0);
				} finally {
					configure();
				}
			});

			it("Should default to no logging at all", async () => {
				// re-applying the defaults has to put `log` back to false, so this
				// one goes around `configure` and names no logger
				store.default({ client: baseConfig.client });
				try {
					await store.insert(table, { id: 1, sub: "sub_000", value: "a" });
					equal(mocks.log.mock.calls.length, 0);
				} finally {
					configure();
				}
			});
		});

		describe("select index paths", () => {
			it("Should select by digest (uses digest GSI)", async () => {
				const row = {
					id: 1,
					sub: "sub_000",
					value: "a",
					digest: "digest_abc",
				};
				await store.insert(table, row);
				const result = await store.select(table, { digest: "digest_abc" });
				equal(result.sub, "sub_000");
				equal(result.digest, "digest_abc");
			});

			it("Should select by sub only (uses sub GSI)", async () => {
				const row = { id: 1, sub: "sub_000", value: "a" };
				await store.insert(table, row);
				const result = await store.select(table, { sub: "sub_000" });
				equal(result.sub, "sub_000");
				equal(result.value, "a");
			});

			it("Should select by id only (uses key GSI)", async () => {
				const row = { id: 1, sub: "sub_000", value: "a" };
				await store.insert(table, row);
				const result = await store.select(table, { id: 1 });
				equal(result.id, 1);
				equal(result.sub, "sub_000");
			});

			it("Should select by sub+id (uses GetItem)", async () => {
				const row = { id: 1, sub: "sub_000", value: "a" };
				await store.insert(table, row);
				const result = await store.select(table, {
					sub: "sub_000",
					id: 1,
				});
				equal(result.sub, "sub_000");
				equal(result.id, 1);
				equal(result.value, "a");
			});
		});

		describe("insert edge cases", () => {
			it("Should throw when no id and no randomId are available", async () => {
				configure({ randomId: undefined });
				try {
					await rejects(
						() => store.insert(table, { sub: "sub_000", value: "a" }),
						{ message: /needs an `id`/ },
					);
				} finally {
					configure();
				}
			});
			it("Should assign randomId when no id provided", async () => {
				const row = { sub: "sub_000", value: "a" };
				const id = await store.insert(table, row);
				ok(id);
				ok(typeof id === "number");
				const result = await store.select(table, { sub: "sub_000", id });
				equal(result.value, "a");
			});

			it("Should not mutate the input values object on update", async () => {
				await store.insert(table, { id: 1, sub: "sub_000", value: "a" });
				const updateValues = { value: "b" };
				const updateCopy = structuredClone(updateValues);
				await store.update(table, { sub: "sub_000", id: 1 }, updateValues);
				deepEqual(updateValues, updateCopy);
			});

			it("Should insert without expire and not add timeToLiveKey", async () => {
				const row = { id: 1, sub: "sub_000", value: "a" };
				await store.insert(table, row);
				const result = await store.select(table, {
					sub: "sub_000",
					id: row.id,
				});
				equal(result[mockDatabaseTable.timeToLiveKey], undefined);
			});
		});

		describe("remove edge cases", () => {
			it("Should remove by sub+id (direct delete)", async () => {
				await store.insert(table, { id: 1, sub: "sub_000", value: "a" });
				await store.insert(table, { id: 2, sub: "sub_000", value: "b" });
				await store.remove(table, { sub: "sub_000", id: 1 });
				const result = await store.selectList(table, { sub: "sub_000" });
				equal(result.length, 1);
				equal(result[0].id, 2);
			});

			it("Should remove by non-key filter (query then delete)", async () => {
				await store.insert(table, {
					id: 1,
					sub: "sub_000",
					value: "a",
					digest: "d1",
				});
				await store.insert(table, {
					id: 2,
					sub: "sub_000",
					value: "b",
					digest: "d2",
				});
				await store.remove(table, { digest: "d1" });
				const result = await store.selectList(table, { sub: "sub_000" });
				equal(result.length, 1);
				equal(result[0].id, 2);
			});
		});

		describe("selectList edge cases", () => {
			it("Should return multiple items filtered by sub", async () => {
				await store.insert(table, { id: 1, sub: "sub_000", value: "a" });
				await store.insert(table, { id: 2, sub: "sub_000", value: "b" });
				await store.insert(table, { id: 3, sub: "sub_001", value: "c" });
				const result = await store.selectList(table, { sub: "sub_000" });
				equal(result.length, 2);
			});

			it("Should return only requested fields in selectList", async () => {
				await store.insert(table, { id: 1, sub: "sub_000", value: "a" });
				await store.insert(table, { id: 2, sub: "sub_000", value: "b" });
				const result = await store.selectList(table, { sub: "sub_000" }, [
					"value",
				]);
				equal(result.length, 2);
				for (const row of result) {
					ok(row.value);
				}
			});
		});
	});
});
