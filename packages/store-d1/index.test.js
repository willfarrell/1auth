import {
	deepEqual,
	deepStrictEqual,
	equal,
	ok,
	strictEqual,
} from "node:assert/strict";
import { describe, it, test } from "node:test";
import tests from "../store/index.test.js";
import * as store from "./index.js";
import * as mockDatabase from "./mock.js";
import * as mockDatabaseTable from "./table/d1.js";

store.default({
	log: (...args) => mocks.log(...args),
	client: mockDatabase.storeClient,
});

const mocks = {
	...mockDatabase,
	table: mockDatabaseTable,
};

const table = mockDatabaseTable.name;
const nowInSeconds = () => Math.floor(Date.now() / 1000);

// Extended table with otp and all date fields for normalizeValues/parseValues coverage
const extTable = "test_ext";
const createExtTable = async () => {
	await mockDatabase.storeClient
		.prepare(
			`CREATE TABLE IF NOT EXISTS ${extTable} (
			"id"       INTEGER PRIMARY KEY AUTOINCREMENT,
			"sub"      VARCHAR(15)  NOT NULL,
			"value"    VARCHAR(256) NOT NULL,
			"otp"      INTEGER      DEFAULT NULL,
			"create"   TIMESTAMP WITH TIME ZONE DEFAULT NULL,
			"update"   TIMESTAMP WITH TIME ZONE DEFAULT NULL,
			"verify"   TIMESTAMP WITH TIME ZONE DEFAULT NULL,
			"lastused" TIMESTAMP WITH TIME ZONE DEFAULT NULL,
			"expire"   TIMESTAMP WITH TIME ZONE DEFAULT NULL,
			"remove"   TIMESTAMP WITH TIME ZONE DEFAULT NULL
		)`,
		)
		.run();
};
const truncateExtTable = async () => {
	await mockDatabase.storeClient.prepare(`DELETE FROM ${extTable}`).run();
};
const dropExtTable = async () => {
	await mockDatabase.storeClient
		.prepare(`DROP TABLE IF EXISTS ${extTable}`)
		.run();
};

describe("store-d1", () => {
	tests(store, mocks);
	describe("default", () => {
		it("Should merge options", async () => {
			store.default({ placeholder: "?" });
			const { insert } = store.makeSqlParts({}, { a: "a" });
			equal(insert, '("a") VALUES (?)');
		});
	});
	describe("getPlaceholder", () => {
		it("Should return ? for default placeholder", async () => {
			store.default({ placeholder: "?" });
			equal(store.getPlaceholder(1), "?");
			equal(store.getPlaceholder(5), "?");
		});
		it("Should return $N for $ placeholder", async () => {
			store.default({ placeholder: "$" });
			equal(store.getPlaceholder(1), "$1");
			equal(store.getPlaceholder(3), "$3");
			store.default({ placeholder: "?" });
		});
	});
	describe("makeSqlParts", () => {
		it("Should format {select} with fields", async () => {
			const { select, parameters } = store.makeSqlParts({}, {}, ["a", "b"]);
			equal(select, '"a", "b"');
			deepEqual(parameters, []);
		});

		it("Should format {select} to * when no fields", async () => {
			const { select, parameters } = store.makeSqlParts({}, {}, []);
			equal(select, "*");
			deepEqual(parameters, []);
		});

		it("Should format {insert} with ? placeholder", async () => {
			store.default({ placeholder: "?" });
			const { insert, parameters } = store.makeSqlParts({}, { a: "a", b: "b" });
			equal(insert, '("a", "b") VALUES (?,?)');
			deepEqual(parameters, ["a", "b"]);
		});

		it("Should format {update} with ? placeholder", async () => {
			store.default({ placeholder: "?" });
			const { update, parameters } = store.makeSqlParts({}, { a: "a", b: "b" });
			equal(update, '"a" = ?, "b" = ?');
			deepEqual(parameters, ["a", "b"]);
		});

		it("Should format {where} with ? placeholder", async () => {
			store.default({ placeholder: "?" });
			const { where, parameters } = store.makeSqlParts({
				a: "a",
				bc: ["b", "c"],
				d: "d",
			});
			equal(where, 'WHERE "a" = ? AND "bc" IN (?,?) AND "d" = ?');
			deepEqual(parameters, ["a", "b", "c", "d"]);
		});

		it("Should skip undefined filter values in {where}", async () => {
			const { where, parameters } = store.makeSqlParts({
				a: "a",
				b: undefined,
				c: "c",
			});
			equal(where, 'WHERE "a" = ? AND "c" = ?');
			deepEqual(parameters, ["a", "c"]);
		});

		it("Should return empty {where} when no filters", async () => {
			const { where, parameters } = store.makeSqlParts({});
			equal(where, "");
			deepEqual(parameters, []);
		});

		it("Should respect idxStart parameter", async () => {
			store.default({ placeholder: "$" });
			const { insert } = store.makeSqlParts({}, { a: "a", b: "b" }, [], 5);
			equal(insert, '("a", "b") VALUES ($5,$6)');
			store.default({ placeholder: "?" });
		});

		it("Should combine values and filters parameters", async () => {
			const { update, where, parameters } = store.makeSqlParts(
				{ id: 1 },
				{ value: "x" },
			);
			equal(update, '"value" = ?');
			equal(where, 'WHERE "id" = ?');
			deepEqual(parameters, ["x", 1]);
		});

		it("Should handle empty array filter", async () => {
			const { where, parameters } = store.makeSqlParts({ id: [] });
			equal(where, "");
			deepEqual(parameters, []);
		});

		it("Should format {select} with single field", async () => {
			const { select } = store.makeSqlParts({}, {}, ["id"]);
			equal(select, '"id"');
		});
	});
	describe("normalizeValues/parseValues round-trip", () => {
		test.before(async () => {
			await createExtTable();
		});
		test.afterEach(async () => {
			await truncateExtTable();
		});
		test.after(async () => {
			await dropExtTable();
		});
		it("Should round-trip otp true as boolean", async () => {
			const ts = nowInSeconds();
			await store.insert(extTable, {
				id: 1,
				sub: "sub_otp",
				value: "v",
				otp: true,
				create: ts,
			});
			const result = await store.select(extTable, { id: 1 });
			strictEqual(result.otp, true);
		});
		it("Should round-trip otp false as boolean", async () => {
			await store.insert(extTable, {
				id: 1,
				sub: "sub_otp",
				value: "v",
				otp: false,
			});
			const result = await store.select(extTable, { id: 1 });
			strictEqual(result.otp, false);
		});
		it("Should round-trip otp via update", async () => {
			await store.insert(extTable, {
				id: 1,
				sub: "sub_otp",
				value: "v",
				otp: false,
			});
			await store.update(extTable, { id: 1 }, { otp: true });
			const result = await store.select(extTable, { id: 1 });
			strictEqual(result.otp, true);
		});
		it("Should round-trip create timestamp", async () => {
			const ts = nowInSeconds();
			await store.insert(extTable, {
				id: 1,
				sub: "sub_ts",
				value: "v",
				create: ts,
			});
			const result = await store.select(extTable, { id: 1 });
			strictEqual(result.create, ts);
		});
		it("Should round-trip update timestamp", async () => {
			const ts = nowInSeconds();
			await store.insert(extTable, {
				id: 1,
				sub: "sub_ts",
				value: "v",
				update: ts,
			});
			const result = await store.select(extTable, { id: 1 });
			strictEqual(result.update, ts);
		});
		it("Should round-trip verify timestamp", async () => {
			const ts = nowInSeconds();
			await store.insert(extTable, {
				id: 1,
				sub: "sub_ts",
				value: "v",
				verify: ts,
			});
			const result = await store.select(extTable, { id: 1 });
			strictEqual(result.verify, ts);
		});
		it("Should round-trip lastused timestamp", async () => {
			const ts = nowInSeconds();
			await store.insert(extTable, {
				id: 1,
				sub: "sub_ts",
				value: "v",
				lastused: ts,
			});
			const result = await store.select(extTable, { id: 1 });
			strictEqual(result.lastused, ts);
		});
		it("Should round-trip expire timestamp", async () => {
			const ts = nowInSeconds();
			await store.insert(extTable, {
				id: 1,
				sub: "sub_ts",
				value: "v",
				expire: ts,
			});
			const result = await store.select(extTable, { id: 1 });
			strictEqual(result.expire, ts);
		});
		it("Should round-trip remove timestamp", async () => {
			const ts = nowInSeconds();
			store.default({ timeToLiveKey: "" });
			await store.insert(extTable, {
				id: 1,
				sub: "sub_ts",
				value: "v",
				remove: ts,
			});
			const result = await store.select(extTable, { id: 1 });
			strictEqual(result.remove, ts);
			store.default({ timeToLiveKey: "remove" });
		});
		it("Should round-trip all 6 date fields simultaneously", async () => {
			const ts = nowInSeconds();
			store.default({ timeToLiveKey: "" });
			await store.insert(extTable, {
				id: 1,
				sub: "sub_all",
				value: "v",
				create: ts,
				update: ts + 1,
				verify: ts + 2,
				lastused: ts + 3,
				expire: ts + 4,
				remove: ts + 5,
			});
			const result = await store.select(extTable, { id: 1 });
			strictEqual(result.create, ts);
			strictEqual(result.update, ts + 1);
			strictEqual(result.verify, ts + 2);
			strictEqual(result.lastused, ts + 3);
			strictEqual(result.expire, ts + 4);
			strictEqual(result.remove, ts + 5);
			store.default({ timeToLiveKey: "remove" });
		});
		it("Should preserve null date fields", async () => {
			await store.insert(extTable, {
				id: 1,
				sub: "sub_null",
				value: "v",
			});
			const result = await store.select(extTable, { id: 1 });
			strictEqual(result.create, null);
			strictEqual(result.update, null);
			strictEqual(result.verify, null);
			strictEqual(result.lastused, null);
			strictEqual(result.expire, null);
			strictEqual(result.remove, null);
		});
		it("Should parse date fields in selectList", async () => {
			const ts = nowInSeconds();
			await store.insert(extTable, {
				id: 1,
				sub: "sub_list",
				value: "v",
				create: ts,
				verify: ts,
			});
			await store.insert(extTable, {
				id: 2,
				sub: "sub_list",
				value: "w",
				create: ts,
				lastused: ts,
			});
			const results = await store.selectList(extTable, { sub: "sub_list" });
			strictEqual(results.length, 2);
			strictEqual(results[0].create, ts);
			strictEqual(results[0].verify, ts);
			strictEqual(results[1].create, ts);
			strictEqual(results[1].lastused, ts);
		});
		it("Should normalize actual boolean to string via String()", async () => {
			// A non-otp boolean value goes through the String(v) branch
			// in normalizeValues: not null, not string, not number,
			// not undefined, not object → String(true) = "true"
			await store.insert(extTable, {
				id: 1,
				sub: "sub_bool",
				value: true,
			});
			const result = await store.select(extTable, { id: 1 });
			strictEqual(result.value, "true");
		});
		it("Should normalize actual object to JSON via JSON.stringify()", async () => {
			// An object value goes through JSON.stringify branch in normalizeValues
			const obj = { key: "val", nested: [1, 2] };
			await store.insert(extTable, {
				id: 1,
				sub: "sub_obj",
				value: obj,
			});
			const result = await store.select(extTable, { id: 1 });
			strictEqual(result.value, JSON.stringify(obj));
		});
		it("Should normalize otp undefined to false (via 0)", async () => {
			// otp: undefined → hasOwn is true → undefined ? 1 : 0 → 0
			// parseValues: typeof 0 === "number" → !!0 → false
			await store.insert(extTable, {
				id: 1,
				sub: "sub_undef",
				value: "v",
				otp: undefined,
			});
			const result = await store.select(extTable, { id: 1 });
			strictEqual(result.otp, false);
		});
		it("Should normalize undefined non-date value to null", async () => {
			// digest: undefined → not otp, not date → for loop:
			// v !== null, not string, not number → v === undefined → null
			await store.insert(table, {
				id: 1,
				sub: "sub_undef_v",
				value: "v",
				digest: undefined,
			});
			const result = await store.select(table, { id: 1 });
			strictEqual(result.digest, null);
			await mockDatabaseTable.truncate(mockDatabase.storeClient, table);
		});
		it("Should update date fields via update path", async () => {
			const ts = nowInSeconds();
			await store.insert(extTable, {
				id: 1,
				sub: "sub_upd",
				value: "v",
			});
			await store.update(extTable, { id: 1 }, { verify: ts, lastused: ts });
			const result = await store.select(extTable, { id: 1 });
			strictEqual(result.verify, ts);
			strictEqual(result.lastused, ts);
		});
		it("Should handle expire with TTL on update path", async () => {
			const expire = nowInSeconds() + 86400;
			await store.insert(extTable, {
				id: 1,
				sub: "sub_ttl",
				value: "v",
			});
			await store.update(extTable, { id: 1 }, { expire });
			const result = await store.select(extTable, { id: 1 });
			strictEqual(result.expire, expire);
			ok(result.remove > expire);
		});
	});
	describe("normalizeValues (via insert)", () => {
		it("Should serialize object values to JSON", async () => {
			const obj = { nested: true };
			const row = { id: 1, sub: "sub_json", value: JSON.stringify(obj) };
			await store.insert(table, row);
			const result = await store.select(table, { id: 1 });
			equal(result.value, JSON.stringify(obj));
			await mockDatabaseTable.truncate(mockDatabase.storeClient, table);
		});
		it("Should store null values", async () => {
			const row = { id: 1, sub: "sub_null", value: "v", digest: null };
			await store.insert(table, row);
			const result = await store.select(table, { id: 1 });
			strictEqual(result.digest, null);
			await mockDatabaseTable.truncate(mockDatabase.storeClient, table);
		});
	});
	describe("D1-specific behavior", () => {
		it("Should return last_row_id when no id provided in insert", async () => {
			const id = await store.insert(table, { sub: "sub_auto", value: "v" });
			strictEqual(typeof id, "number");
			ok(id > 0);
			const result = await store.select(table, { id });
			equal(result.sub, "sub_auto");
			await mockDatabaseTable.truncate(mockDatabase.storeClient, table);
		});
		it("Should return provided id when id is in insert values", async () => {
			const id = await store.insert(table, {
				id: 42,
				sub: "sub_42",
				value: "v",
			});
			strictEqual(id, 42);
			await mockDatabaseTable.truncate(mockDatabase.storeClient, table);
		});
		it("Should fall back to last_row_id when id is undefined", async () => {
			const id = await store.insert(table, {
				id: undefined,
				sub: "sub_undef",
				value: "v",
			});
			strictEqual(typeof id, "number");
			ok(id > 0);
			await mockDatabaseTable.truncate(mockDatabase.storeClient, table);
		});
		it("Should fall back to last_row_id when id is null", async () => {
			const id = await store.insert(table, {
				id: null,
				sub: "sub_null_id",
				value: "v",
			});
			strictEqual(typeof id, "number");
			ok(id > 0);
			await mockDatabaseTable.truncate(mockDatabase.storeClient, table);
		});
		it("Should use batch for insertList", async () => {
			const rows = [
				{ id: 1, sub: "sub_batch1", value: "a" },
				{ id: 2, sub: "sub_batch2", value: "b" },
				{ id: 3, sub: "sub_batch3", value: "c" },
			];
			const res = await store.insertList(table, rows);
			strictEqual(res.length, 3);
			const result = await store.selectList(table, {
				sub: ["sub_batch1", "sub_batch2", "sub_batch3"],
			});
			strictEqual(result.length, 3);
			await mockDatabaseTable.truncate(mockDatabase.storeClient, table);
		});
		it("Should handle insertList with empty array", async () => {
			const res = await store.insertList(table, []);
			strictEqual(res.length, 0);
		});
		it("Should not mutate input rows in insertList", async () => {
			const rows = [
				{ sub: "sub_imm1", value: "a" },
				{ sub: "sub_imm2", value: "b" },
			];
			const rowsCopy = structuredClone(rows);
			await store.insertList(table, rows);
			deepStrictEqual(rows, rowsCopy);
			await mockDatabaseTable.truncate(mockDatabase.storeClient, table);
		});
		it("Should not mutate input values in update", async () => {
			await store.insert(table, { id: 1, sub: "sub_upd", value: "a" });
			const values = { value: "b" };
			const valuesCopy = structuredClone(values);
			await store.update(table, { id: 1 }, values);
			deepStrictEqual(values, valuesCopy);
			await mockDatabaseTable.truncate(mockDatabase.storeClient, table);
		});
		it("Should return empty list from selectList with no matches", async () => {
			const result = await store.selectList(table, { sub: "nonexistent" });
			deepStrictEqual(result, []);
		});
		it("Should return all rows from selectList with no filters", async () => {
			await store.insertList(table, [
				{ id: 1, sub: "sub_a", value: "a" },
				{ id: 2, sub: "sub_b", value: "b" },
			]);
			const result = await store.selectList(table);
			strictEqual(result.length, 2);
			await mockDatabaseTable.truncate(mockDatabase.storeClient, table);
		});
		it("Should return 0 from count with no matches", async () => {
			const result = await store.count(table);
			strictEqual(result, 0);
		});
		it("Should return correct count with multiple rows", async () => {
			await store.insertList(table, [
				{ id: 1, sub: "sub_cnt", value: "a" },
				{ id: 2, sub: "sub_cnt", value: "b" },
				{ id: 3, sub: "sub_other", value: "c" },
			]);
			const all = await store.count(table);
			strictEqual(all, 3);
			const filtered = await store.count(table, { sub: "sub_cnt" });
			strictEqual(filtered, 2);
			await mockDatabaseTable.truncate(mockDatabase.storeClient, table);
		});
		it("Should skip timeToLiveKey when timeToLiveKey is falsy", async () => {
			store.default({ timeToLiveKey: "" });
			const expire = nowInSeconds() + 86400;
			await store.insert(table, {
				id: 1,
				sub: "sub_nottl",
				value: "v",
				expire,
			});
			const result = await store.select(table, { id: 1 });
			strictEqual(result.remove, null);
			store.default({ timeToLiveKey: "remove" });
			await mockDatabaseTable.truncate(mockDatabase.storeClient, table);
		});
		it("Should return settled results from updateList", async () => {
			await store.insertList(table, [
				{ id: 1, sub: "sub_ul", value: "a" },
				{ id: 2, sub: "sub_ul", value: "b" },
			]);
			const results = await store.updateList(table, [{ id: 1 }, { id: 2 }], {
				value: "z",
			});
			strictEqual(results.length, 2);
			strictEqual(results[0].status, "fulfilled");
			strictEqual(results[1].status, "fulfilled");
			await mockDatabaseTable.truncate(mockDatabase.storeClient, table);
		});
	});
	describe("logging", () => {
		it("Should work without logging enabled", async () => {
			store.default({ log: false });
			await store.insert(table, { id: 1, sub: "sub_nolog", value: "v" });
			const ex = await store.exists(table, { id: 1 });
			strictEqual(ex, "sub_nolog");
			const cnt = await store.count(table, { id: 1 });
			strictEqual(cnt, 1);
			const row = await store.select(table, { id: 1 });
			strictEqual(row.value, "v");
			const list = await store.selectList(table, { id: 1 });
			strictEqual(list.length, 1);
			await store.update(table, { id: 1 }, { value: "w" });
			await store.updateList(table, [{ id: 1 }], { value: "x" });
			await store.remove(table, { id: 1 });
			store.default({ log: (...args) => mocks.log(...args) });
			await mockDatabaseTable.truncate(mockDatabase.storeClient, table);
		});
	});
	describe("removeList", () => {
		it("Should be the same function reference as remove", async () => {
			strictEqual(store.removeList, store.remove);
		});
	});
	describe("table/d1.js", () => {
		it("Should create emptyRow with null prototype", async () => {
			const row = mockDatabaseTable.emptyRow();
			strictEqual(Object.getPrototypeOf(row), null);
		});
		it("Should create emptyRow with correct default values", async () => {
			const row = mockDatabaseTable.emptyRow();
			strictEqual(row.id, 0);
			strictEqual(row.sub, null);
			strictEqual(row.value, null);
			strictEqual(row.digest, null);
			strictEqual(row.expire, null);
			strictEqual(row.remove, null);
		});
		it("Should create independent emptyRow instances", async () => {
			const row1 = mockDatabaseTable.emptyRow();
			const row2 = mockDatabaseTable.emptyRow();
			row1.id = 99;
			strictEqual(row2.id, 0);
		});
		it("Should have exactly 6 keys on emptyRow", async () => {
			const row = mockDatabaseTable.emptyRow();
			strictEqual(Object.keys(row).length, 6);
		});
		it("Should export correct table name", async () => {
			strictEqual(mockDatabaseTable.name, "test");
		});
		it("Should export correct timeToLiveKey", async () => {
			strictEqual(mockDatabaseTable.timeToLiveKey, "remove");
		});
		it("Should create/truncate/drop table with explicit name", async () => {
			const tmpTable = "test_table_ops";
			await mockDatabaseTable.create(mockDatabase.storeClient, tmpTable);
			await store.insert(tmpTable, { id: 1, sub: "s", value: "v" });
			const before = await store.count(tmpTable);
			strictEqual(before, 1);
			await mockDatabaseTable.truncate(mockDatabase.storeClient, tmpTable);
			const after = await store.count(tmpTable);
			strictEqual(after, 0);
			await mockDatabaseTable.drop(mockDatabase.storeClient, tmpTable);
		});
		it("Should create/truncate/drop table with default name", async () => {
			// Uses the default "test" table name — the shared tests already
			// created/dropped it, so CREATE IF NOT EXISTS is safe
			await mockDatabaseTable.create(mockDatabase.storeClient);
			await store.insert(mockDatabaseTable.name, {
				id: 1,
				sub: "s",
				value: "v",
			});
			await mockDatabaseTable.truncate(mockDatabase.storeClient);
			const cnt = await store.count(mockDatabaseTable.name);
			strictEqual(cnt, 0);
			await mockDatabaseTable.drop(mockDatabase.storeClient);
			// Recreate for any subsequent tests
			await mockDatabaseTable.create(mockDatabase.storeClient);
		});
	});
});
