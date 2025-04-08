import { deepEqual, equal, ok } from "node:assert/strict";
import { describe, it, test } from "node:test";

import * as store from "../store-memory/index.js";
// import * as storeDyanmoDB from "../packages/store-dynamodb/index.js";
// import * as storeSQL from "../packages/store-sql/index.js";

store.default({
	log: (...args) => {
		mocks.log(...args);
	},
});

const table = "test";

const mocks = {
	log: () => {},
	query: () => {},
};
test.beforeEach(async (t) => {
	t.mock.method(mocks, "log");
	t.mock.method(mocks, "query");
});

test.afterEach(async (t) => {
	t.mock.reset();
	await store.__clear(table);
});

// TODO run dynamo db local
// TODO run sqlite local

// TODO add in special expire filter
describe("store-memory", () => {
	it("`exists` Should return undefined when nothing found", async () => {
		const result = await store.exists(table, { id: 1 });
		equal(result, undefined);
		equal(mocks.log.mock.calls.length, 1);
	});
	it("`exists` Should return sub when something found", async () => {
		const row = { id: 1, sub: "sub_000", value: "a" };
		await store.insert(table, row);
		const result = await store.exists(table, { id: row.id });
		equal(result, row.sub);
		equal(mocks.log.mock.calls.length, 2);
	});
	it("`count` Should return 0 when nothing found", async () => {
		const result = await store.count(table, { id: 1 });
		equal(result, 0);
		equal(mocks.log.mock.calls.length, 1);
	});
	it("`count` Should return # when something found", async () => {
		const row = { id: 1, sub: "sub_000", value: "a" };
		await store.insert(table, row);
		const result = await store.count(table, { id: row.id });
		equal(result, 1);
		equal(mocks.log.mock.calls.length, 2);
	});
	it("`select` Should return undefined when nothing found", async () => {
		const result = await store.select(table, { id: 1 });
		equal(result, undefined);
		equal(mocks.log.mock.calls.length, 1);
	});
	it("`insert`/`update`/`select` Should return object when something found", async () => {
		const row = { id: 1, sub: "sub_000", value: "a" };
		const id = await store.insert(table, row);
		equal(id, row.id);
		//let result = await store.select(table, { id: row.id });
		row.value = "b";
		await store.update(
			table,
			{ sub: "sub_000", id: row.id },
			{ value: row.value },
		);
		const result = await store.select(table, { id: row.id });
		deepEqual(result, row);
		equal(mocks.log.mock.calls.length, 3);
	});
	it("`insert`/`update`/`select` Should return object with random id when something found", async () => {
		const row = { sub: "sub_000", value: "a" };
		const id = await store.insert(table, row);
		ok(id);
		//let result = await store.select(table, { id: row.id });
		row.value = "b";
		await store.update(table, { sub: "sub_000", id }, { value: row.value });
		const result = await store.select(table, { id });
		equal(JSON.stringify(result), JSON.stringify({ id, ...row }));
		equal(mocks.log.mock.calls.length, 3);
	});
	it("`selectList` Should return [] when nothing found", async () => {
		const result = await store.selectList(table, { id: 1 });
		deepEqual(result, []);
		equal(mocks.log.mock.calls.length, 1);
	});
	it("`insertList`/`selectList` Should return object[] when something found", async () => {
		const rows = [
			{ id: 1, sub: "sub_000", value: "a" },
			{ id: 2, sub: "sub_000", value: "b" },
		];
		await store.insertList(table, rows);
		let result = await store.selectList(table, { id: rows[0].id });
		deepEqual(result, [rows[0]]);
		equal(mocks.log.mock.calls.length, 2);

		result = await store.selectList(table, { sub: rows[0].sub });
		deepEqual(result, rows);
		equal(mocks.log.mock.calls.length, 3);
	});
	it("`remove` Should remove row in store using {id:''}", async () => {
		const rows = [
			{ id: 1, sub: "sub_000", value: "a" },
			{ id: 2, sub: "sub_000", value: "b" },
		];
		await store.insertList(table, rows);
		await store.remove(table, { sub: "sub_000", id: rows[0].id });
		const result = await store.selectList(table, { sub: rows[0].sub });
		deepEqual(result, [rows[1]]);
		equal(mocks.log.mock.calls.length, 3);
	});
	it("`remove` Should remove row in store using {id:'', sub:''}", async () => {
		const rows = [
			{ id: 1, sub: "sub_000", value: "a" },
			{ id: 2, sub: "sub_000", value: "b" },
		];
		await store.insertList(table, rows);
		await store.remove(table, { sub: rows[0].sub, id: rows[0].id });
		const result = await store.selectList(table, { sub: rows[0].sub });
		deepEqual(result, [rows[1]]);
		equal(mocks.log.mock.calls.length, 3);
	});
	it("`remove` Should remove rows in store using {id:[]}", async () => {
		const rows = [
			{ id: 1, sub: "sub_000", value: "a" },
			{ id: 2, sub: "sub_000", value: "b" },
			{ id: 3, sub: "sub_000", value: "c" },
		];
		await store.insertList(table, rows);
		await store.remove(table, { sub: "sub_000", id: [rows[0].id, rows[1].id] });
		const result = await store.selectList(table, { sub: rows[0].sub });
		deepEqual(result, [rows[2]]);
		equal(mocks.log.mock.calls.length, 3);
	});
});
