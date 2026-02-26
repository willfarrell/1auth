import { deepStrictEqual, ok, strictEqual } from "node:assert/strict";
import { describe, it, test } from "node:test";

const nowInSeconds = () => Math.floor(Date.now() / 1000);

const tests = (store, mocks) => {
	const table = mocks.table.name;
	const emptyRow = mocks.table.emptyRow;
	// Build expected row matching the store's object prototype (e.g. null-prototype for SQLite)
	const expectedRow = (...sources) => {
		const proto = Object.getPrototypeOf(emptyRow());
		return Object.assign(Object.create(proto), ...sources);
	};

	test.before(async () => {
		await mocks.table.create(mocks.storeClient, table);
	});

	test.beforeEach(async (t) => {
		t.mock.method(mocks, "log");
	});

	test.afterEach(async (t) => {
		t.mock.reset();
		await mocks.table.truncate(mocks.storeClient, table);
	});

	test.after(async () => {
		await mocks.table.drop(mocks.storeClient, table);
		mocks.storeClient.after?.();
	});

	describe("exists", () => {
		it("Should return undefined when nothing found", async () => {
			const row = { id: 1, sub: "sub_000", value: "a" };
			const result = await store.exists(table, { id: row.id, sub: row.sub });
			strictEqual(result, undefined);
			strictEqual(mocks.log.mock.calls.length, 1);
		});
		it("Should return sub when something found {id, sub}", async () => {
			const row = { id: 1, sub: "sub_000", value: "a" };
			await store.insert(table, row);
			const result = await store.exists(table, { id: row.id, sub: row.sub });
			strictEqual(result, row.sub);
			strictEqual(mocks.log.mock.calls.length, 2);
		});
		it("Should return sub when something found {id}", async () => {
			const row = { id: 1, sub: "sub_000", value: "a" };
			await store.insert(table, row);
			const result = await store.exists(table, { id: row.id });
			strictEqual(result, row.sub);
			strictEqual(mocks.log.mock.calls.length, 2);
		});
		it("Should return sub when something found {sub}", async () => {
			const row = { id: 1, sub: "sub_000", value: "a" };
			await store.insert(table, row);
			const result = await store.exists(table, { sub: row.sub });
			strictEqual(result, row.sub);
			strictEqual(mocks.log.mock.calls.length, 2);
		});
		it("Should return sub when something found {sub, id:undefined}", async () => {
			const row = { id: 1, sub: "sub_000", value: "a" };
			await store.insert(table, row);
			const result = await store.exists(table, { sub: row.sub, id: undefined });
			strictEqual(result, row.sub);
			strictEqual(mocks.log.mock.calls.length, 2);
		});
		it("Should return sub when something found {digest}", async () => {
			const row = { id: 1, sub: "sub_000", value: "a", digest: "d" };
			await store.insert(table, row);
			const result = await store.exists(table, { digest: row.digest });
			strictEqual(result, row.sub);
			strictEqual(mocks.log.mock.calls.length, 2);
		});
	});
	describe("count", () => {
		it("Should return 0 when nothing found", async () => {
			const result = await store.count(table, { id: 1 });
			strictEqual(result, 0);
			strictEqual(mocks.log.mock.calls.length, 1);
		});
		it("Should return # when something found", async () => {
			const row = { id: 1, sub: "sub_000", value: "a" };
			await store.insert(table, row);
			const result = await store.count(table, { id: row.id });
			strictEqual(result, 1);
			strictEqual(mocks.log.mock.calls.length, 2);
		});
	});
	describe("select", () => {
		it("Should return undefined when nothing found", async () => {
			const result = await store.select(table, { id: 1 });
			strictEqual(result, undefined);
			strictEqual(mocks.log.mock.calls.length, 1);
		});
		it("Should return item when something found {id, sub}", async () => {
			const row = { id: 1, sub: "sub_000", value: "a" };
			await store.insert(table, row);
			const result = await store.exists(table, { id: row.id, sub: row.sub });
			strictEqual(result, row.sub);
			strictEqual(mocks.log.mock.calls.length, 2);
		});
	});
	describe("insert/update", () => {
		it("Should return object when something found", async () => {
			const row = { id: 1, sub: "sub_000", value: "a" };
			const id = await store.insert(table, row);
			strictEqual(id, row.id);
			strictEqual(mocks.log.mock.calls.length, 1);

			row.value = "b";
			await store.update(
				table,
				{ sub: "sub_000", id: row.id },
				{ value: row.value },
			);
			strictEqual(mocks.log.mock.calls.length, 2);
			// returns all fields
			let result = await store.select(table, { id: row.id });

			deepStrictEqual(result, Object.assign(emptyRow(), row));
			strictEqual(mocks.log.mock.calls.length, 3);
			// returns fields
			result = await store.select(table, { sub: "sub_000", id: row.id }, [
				"value",
			]);
			deepStrictEqual(result, expectedRow({ value: row.value }));
			strictEqual(mocks.log.mock.calls.length, 4);
		});
		it("Should return object with random id when something found", async () => {
			const row = { sub: "sub_000", value: "a" };
			const id = await store.insert(table, row);
			ok(id);
			row.value = "b";
			await store.update(table, { sub: "sub_000", id }, { value: row.value });
			strictEqual(mocks.log.mock.calls.length, 2);
			// returns all fields
			let result = await store.select(table, { id });
			deepStrictEqual(result, Object.assign(emptyRow(), { id }, row));
			strictEqual(mocks.log.mock.calls.length, 3);
			// returns fields
			result = await store.select(table, { sub: "sub_000", id }, ["value"]);
			deepStrictEqual(result, expectedRow({ value: row.value }));
			strictEqual(mocks.log.mock.calls.length, 4);
		});
		it("Should add in `timeToLiveKey` when `expire` is inserted", async () => {
			const expire = nowInSeconds() + 86400;
			const row = { id: 1, sub: "sub_000", value: "a", expire };
			await store.insert(table, row);
			const result = await store.select(table, { sub: "sub_000", id: row.id });
			ok(expire < result[mocks.table.timeToLiveKey]);
		});
		it("Should not mutate the input values object on insert", async () => {
			const row = { sub: "sub_000", value: "x" };
			const rowCopy = structuredClone(row);
			await store.insert(table, row);
			deepStrictEqual(row, rowCopy);
		});
		it("Should add in `timeToLiveKey` when `expire` is updated", async () => {
			const expire = nowInSeconds() + 86400;
			const row = { id: 1, sub: "sub_000", value: "a" };
			await store.insert(table, row);
			await store.update(table, { sub: "sub_000", id: row.id }, { expire });
			const result = await store.select(table, { sub: "sub_000", id: row.id });
			ok(expire < result[mocks.table.timeToLiveKey]);
		});
	});
	describe("selectList", () => {
		it("Should return [] when nothing found", async () => {
			const result = await store.selectList(table, { id: 1 });
			deepStrictEqual(result, []);
			strictEqual(mocks.log.mock.calls.length, 1);
		});
		it("Should return object[] when filtered by `id`", async () => {
			const rows = [
				{ id: 1, sub: "sub_000", value: "a" },
				{ id: 2, sub: "sub_000", value: "b" },
			];
			await store.insertList(table, rows);
			const result = await store.selectList(table, { id: rows[0].id });
			deepStrictEqual(result, [Object.assign(emptyRow(), rows[0])]);
			strictEqual(mocks.log.mock.calls.length, 2);
		});
	});
	describe("insertList", () => {
		it("Should return array of id's after inserted", async () => {
			const rows = [
				{ id: 1, sub: "sub_000", value: "a" },
				{ id: 2, sub: "sub_000", value: "b" },
			];
			await store.insertList(table, rows);
			strictEqual(mocks.log.mock.calls.length, 1);
			const result = await store.selectList(table, { sub: "sub_000" });
			deepStrictEqual(
				result,
				rows.map((row) => Object.assign(emptyRow(), row)),
			);
		});
		it("Should add in `timeToLiveKey` when `expire` is inserted", async () => {
			const expire = nowInSeconds() + 86400;
			const rows = [{ id: 1, sub: "sub_000", value: "a", expire }];
			await store.insertList(table, rows);
			const result = await store.select(table, {
				sub: "sub_000",
				id: rows[0].id,
			});
			ok(expire < result[mocks.table.timeToLiveKey]);
		});
	});
	describe("remove", () => {
		it("Should remove row in store using {id:''}", async () => {
			const rows = [
				{ id: 1, sub: "sub_000", value: "a" },
				{ id: 2, sub: "sub_000", value: "b" },
			];
			await store.insertList(table, rows);
			await store.remove(table, { sub: "sub_000", id: rows[0].id });
			const result = await store.selectList(table, { sub: rows[0].sub });
			deepStrictEqual(result, [Object.assign(emptyRow(), rows[1])]);
			strictEqual(mocks.log.mock.calls.length, 3);
		});
		it("Should remove row in store using {id:'', sub:''}", async () => {
			const rows = [
				{ id: 1, sub: "sub_000", value: "a" },
				{ id: 2, sub: "sub_000", value: "b" },
			];
			await store.insertList(table, rows);
			await store.remove(table, { sub: rows[0].sub, id: rows[0].id });
			const result = await store.selectList(table, { sub: rows[0].sub });
			deepStrictEqual(result, [Object.assign(emptyRow(), rows[1])]);
			strictEqual(mocks.log.mock.calls.length, 3);
		});
	});
	describe("updateList", () => {
		it("Should update multiple rows in store", async () => {
			const rows = [
				{ id: 1, sub: "sub_000", value: "a" },
				{ id: 2, sub: "sub_000", value: "b" },
			];
			await store.insertList(table, rows);
			await store.updateList(
				table,
				[
					{ sub: "sub_000", id: rows[0].id },
					{ sub: "sub_000", id: rows[1].id },
				],
				{ value: "z" },
			);
			const result = await store.selectList(table, { sub: "sub_000" });
			strictEqual(result[0].value, "z");
			strictEqual(result[1].value, "z");
		});
	});
	describe("removeList", () => {
		it("Should remove rows in store using {id:[], sub:''}", async () => {
			const rows = [
				{ id: 1, sub: "sub_000", value: "a" },
				{ id: 2, sub: "sub_000", value: "b" },
				{ id: 3, sub: "sub_000", value: "c" },
			];
			await store.insertList(table, rows);
			await store.removeList(table, {
				sub: "sub_000",
				id: [rows[0].id, rows[1].id],
			});
			const result = await store.selectList(table, { sub: rows[0].sub });
			strictEqual(mocks.log.mock.calls.length, 3);
			deepStrictEqual(result, [Object.assign(emptyRow(), rows[2])]);
		});
	});
};
export default tests;
