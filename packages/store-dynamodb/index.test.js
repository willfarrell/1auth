import { deepEqual, equal, ok } from "node:assert/strict";
import { describe, it, test } from "node:test";
import * as store from "../store-dynamodb/index.js";
import { client } from "./mock.dynamodb.js";
import testTableParams from "./table/dynamodb.js";

const table = "test";
const timeToLiveKey = "remove";
const nowInSeconds = () => Math.floor(Date.now() / 1000);

store.default({
	log: (...args) => {
		mocks.log(...args);
		//console.log(...args);
	},
	client,
	timeToLiveKey,
});

const mocks = {
	log: () => {},
};
test.beforeEach(async (t) => {
	await store.__table(testTableParams(table, { timeToLiveKey }));
	t.mock.method(mocks, "log");
});

test.afterEach(async (t) => {
	t.mock.reset();
	await store.__clear(table);
});

describe("store-dynamodb", () => {
	it("`exists` Should return undefined when nothing found", async () => {
		const result = await store.exists(table, { id: 1 });
		equal(result, undefined);
		equal(mocks.log.mock.calls.length, 1 * 2 + 1);
	});
	it("`exists` Should return sub when something found", async () => {
		const row = { id: 1, sub: "sub_000", value: "a" };
		await store.insert(table, row);
		const result = await store.exists(table, { id: row.id });
		equal(result, row.sub);
		equal(mocks.log.mock.calls.length, 2 * 2 + 1);
	});
	it("`count` Should return 0 when nothing found", async () => {
		const result = await store.count(table, { id: 1 });
		equal(result, 0);
		equal(mocks.log.mock.calls.length, 1 * 2 + 1);
	});
	it("`count` Should return # when something found", async () => {
		const row = { id: 1, sub: "sub_000", value: "a" };
		await store.insert(table, row);
		const result = await store.count(table, { id: row.id });
		equal(result, 1);
		equal(mocks.log.mock.calls.length, 2 * 2 + 1);
	});
	it("`select` Should return undefined when nothing found", async () => {
		const result = await store.select(table, { id: 1 });
		equal(result, undefined);
		equal(mocks.log.mock.calls.length, 1 * 2);
	});
	it("`insert`/`update`/`select` Should return object when something found", async () => {
		const row = { id: 1, sub: "sub_000", value: "a", value2: "b" };
		await store.insert(table, row);
		//let result = await store.select(table, { id: row.id });
		row.value = "c";
		await store.update(
			table,
			{ sub: "sub_000", id: row.id },
			{ value: row.value },
		);
		// returns all fields
		let result = await store.select(table, { sub: "sub_000", id: row.id });
		deepEqual(result, row);
		// returns fields
		result = await store.select(table, { sub: "sub_000", id: row.id }, [
			"value",
		]);
		deepEqual(result, { value: row.value });
		equal(mocks.log.mock.calls.length, 4 * 2);
	});
	it("`insert` Should add in `timeToLiveKey` when `expire` is set", async () => {
		const expire = nowInSeconds() + 86400;
		const row = { id: 1, sub: "sub_000", value: "a", expire };
		await store.insert(table, row);
		const result = await store.select(table, { sub: "sub_000", id: row.id });
		ok(expire < result[timeToLiveKey]);
	});
	it("`update` Should add in `timeToLiveKey` when `expire` is set", async () => {
		const expire = nowInSeconds() + 86400;
		const row = { id: 1, sub: "sub_000", value: "a" };
		await store.insert(table, row);
		await store.update(table, { sub: "sub_000", id: row.id }, { expire });
		const result = await store.select(table, { sub: "sub_000", id: row.id });
		ok(expire < result[timeToLiveKey]);
	});
	it("`selectList` Should return [] when nothing found", async () => {
		const result = await store.selectList(table, { id: 1 });
		deepEqual(result, []);
		equal(mocks.log.mock.calls.length, 1 * 2);
	});
	it("`insertList`/`update`/`selectList` Should return object[] when something found", async () => {
		const rows = [
			{ id: 1, sub: "sub_000", value: "a" },
			{ id: 2, sub: "sub_000", value: "c" },
		];
		await store.insertList(table, rows);
		let result = await store.selectList(table, {
			id: rows[0].id,
		});
		deepEqual(result, [rows[0]]);
		equal(mocks.log.mock.calls.length, 2 * 2);

		rows[0].value = "d";
		rows[1].value = "d";
		await store.update(
			table,
			{ sub: "sub_000", id: [rows[0].id, rows[1].id] },
			{ value: "d" },
		);
		result = await store.selectList(table, {
			id: rows[1].id,
		});
		deepEqual(result, [rows[1]]);
		equal(mocks.log.mock.calls.length, 2 * 2 + 3 * 2 + 1);

		// returns all fields
		result = await store.selectList(table, { sub: rows[0].sub });
		deepEqual(result.reverse(), rows);
		// returns some fields
		// result = await store.selectList(table, { sub: rows[0].sub }, ["value"]);
		// deepEqual(
		//   result.reverse(),
		//   rows.map((row) => ({ value: row.value })),
		// );
		equal(mocks.log.mock.calls.length, 6 * 2 + 1);
	});
	it("`insertList` Should add in `timeToLiveKey` when `expire` is set", async () => {
		const expire = nowInSeconds() + 86400;
		const row = { id: 1, sub: "sub_000", value: "a", expire };
		await store.insertList(table, [row]);
		const result = await store.select(table, { sub: "sub_000", id: row.id });
		ok(expire < result[timeToLiveKey]);
	});
	it("`remove` Should remove row in store using {sub,id}", async () => {
		const rows = [
			{ id: 1, sub: "sub_000", value: "a" },
			{ id: 2, sub: "sub_000", value: "b" },
		];
		await store.insertList(table, rows);
		await store.remove(table, { sub: "sub_000", id: rows[0].id });
		const result = await store.selectList(table, { sub: rows[0].sub });
		deepEqual(result, [rows[1]]);
		equal(mocks.log.mock.calls.length, 3 * 2);
	});
	/* it("`remove` Should remove row in store using {id:'', sub:''}", async () => {
    const rows = [
      { id: 1, sub: "sub_000", value: "a" },
      { id: 2, sub: "sub_000", value: "b" },
    ];
    await store.insertList(table, rows);
    await store.remove(table, { sub: rows[0].sub, id: rows[0].id,  });
    const result = await store.selectList(table, { sub: rows[0].sub });
    deepEqual(result, [rows[1]]);
    equal(mocks.log.mock.calls.length, 3);
  }); */
	/* it("`remove` Should remove rows in store using {id:[]}", async () => {
    const rows = [
      { id: 1, sub: "sub_000", value: "a" },
      { id: 2, sub: "sub_000", value: "b" },
      { id: 3, sub: "sub_000", value: "c" },
    ];
    await store.insertList(table, rows);
    await store.remove(table, { sub: "sub_000",id: [rows[0].id, rows[1].id] });
    const result = await store.selectList(table, { sub: rows[0].sub });
    deepEqual(result, [rows[2]]);
    equal(mocks.log.mock.calls.length, 3 * 2);
    }); */

	describe("makeQueryParams", () => {
		it("Should format {ExpressionAttributeNames} properly", async () => {
			const { ExpressionAttributeNames } = store.makeQueryParams(
				{ id: [1, 2], sub: "sub_000" },
				//["value"],
			);
			deepEqual(ExpressionAttributeNames, {
				"#id": "id",
				"#sub": "sub",
				//"#value": "value",
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
	});
});
