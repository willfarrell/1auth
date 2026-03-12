import { deepEqual, equal, ok } from "node:assert/strict";
import { randomInt } from "node:crypto";
import { describe, it, test } from "node:test";
import tests from "../store/index.test.js";
import * as store from "../store-dynamodb/index.js";
import * as mockDatabase from "./mock.js";
import * as mockDatabaseTable from "./table/dynamodb.js";

store.default({
	log: (...args) => mocks.log(...args),
	client: {
		send: (...args) => mocks.storeClient.send(...args),
	},
	randomId: () => randomInt(281_474_976_710_655),
});

const mocks = {
	...mockDatabase,
	table: mockDatabaseTable,
};

const table = mockDatabaseTable.name;

describe("store-dynamodb", () => {
	tests(store, mocks);

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
			const { ExpressionAttributeValues } = store.makeQueryParams(
				{ id: [1, 2], sub: "sub_000" },
				["value"],
			);
			deepEqual(ExpressionAttributeValues, {
				":id": {
					NS: ["1", "2"],
				},
				":sub": {
					S: "sub_000",
				},
			});
		});
		it("Should format {KeyConditionExpression} properly", async () => {
			const { KeyConditionExpression } = store.makeQueryParams(
				{ id: [1, 2], sub: "sub_000" },
				["value"],
			);
			equal(KeyConditionExpression, "#id IN (:id) and #sub = :sub");
		});
		it("Should format {UpdateExpression} properly", async () => {
			const { UpdateExpression } = store.makeQueryParams(
				{ id: [1, 2], sub: "sub_000" },
				["value"],
			);
			equal(UpdateExpression, "SET #id = :id, #sub = :sub");
		});
		it("Should format {ProjectionExpression} properly", async () => {
			const { ProjectionExpression, AttributesToGet } = store.makeQueryParams(
				{ id: [1, 2], sub: "sub_000" },
				["value"],
			);
			equal(ProjectionExpression, ":value");
			deepEqual(AttributesToGet, [":value"]);
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

		it("Should not include ProjectionExpression when no fields", async () => {
			const result = store.makeQueryParams({ sub: "sub_000" });
			equal(result.ProjectionExpression, undefined);
			equal(result.AttributesToGet, undefined);
		});

		it("Should handle multiple fields", async () => {
			const result = store.makeQueryParams({ sub: "sub_000" }, [
				"value",
				"digest",
			]);
			equal(result.ProjectionExpression, ":value, :digest");
			deepEqual(result.AttributesToGet, [":value", ":digest"]);
			equal(result.ExpressionAttributeNames["#value"], "value");
			equal(result.ExpressionAttributeNames["#digest"], "digest");
		});

		it("Should deduplicate ProjectionExpression fields", async () => {
			const result = store.makeQueryParams({ sub: "sub_000" }, [
				"value",
				"value",
			]);
			equal(result.ProjectionExpression, ":value");
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
			equal(result.KeyConditionExpression, "#sub IN (:sub)");
			deepEqual(result.ExpressionAttributeValues, {
				":sub": { SS: ["sub_000", "sub_001"] },
			});
		});
	});

	describe("integration", () => {
		test.before(async () => {
			await mockDatabaseTable.create(mocks.storeClient, table);
		});
		test.afterEach(async () => {
			await mockDatabaseTable.truncate(mocks.storeClient, table);
		});
		test.after(async () => {
			await mockDatabaseTable.drop(mocks.storeClient, table);
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

		describe("count edge cases", () => {
			it("Should count by sub", async () => {
				await store.insert(table, { id: 1, sub: "sub_000", value: "a" });
				await store.insert(table, { id: 2, sub: "sub_000", value: "b" });
				await store.insert(table, { id: 3, sub: "sub_001", value: "c" });
				const result = await store.count(table, { sub: "sub_000" });
				equal(result, 2);
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
