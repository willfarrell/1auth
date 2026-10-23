import { deepStrictEqual, ok, rejects, strictEqual } from "node:assert/strict";
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
		it("Should reject an undefined filter value {sub, id:undefined}", async () => {
			const row = { id: 1, sub: "sub_000", value: "a" };
			await store.insert(table, row);
			await rejects(() => store.exists(table, { sub: row.sub, id: undefined }));
		});
		it("Should return sub when something found {digest}", async () => {
			const row = { id: 1, sub: "sub_000", value: "a", digest: "d" };
			await store.insert(table, row);
			const result = await store.exists(table, { digest: row.digest });
			strictEqual(result, row.sub);
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
		it("Should return only requested fields", async () => {
			const rows = [
				{ id: 1, sub: "sub_000", value: "a" },
				{ id: 2, sub: "sub_000", value: "b" },
			];
			await store.insertList(table, rows);
			const result = await store.selectList(table, { sub: "sub_000" }, [
				"value",
			]);
			strictEqual(result.length, 2);
			for (const row of result) {
				ok(row.value);
				strictEqual(row.id, undefined);
			}
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
		it("Should insert rows that do not share the same fields", async () => {
			// only the row with `expire` gets a `timeToLiveKey`
			const expire = nowInSeconds() + 86400;
			await store.insertList(table, [
				{ id: 1, sub: "sub_000", value: "a" },
				{ id: 2, sub: "sub_000", expire, value: "b" },
			]);
			const first = await store.select(table, { sub: "sub_000", id: 1 });
			const second = await store.select(table, { sub: "sub_000", id: 2 });
			strictEqual(first.value, "a");
			ok(!first.expire);
			strictEqual(second.value, "b");
			strictEqual(second.expire, expire);
			ok(expire < second[mocks.table.timeToLiveKey]);
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
	describe("contract", () => {
		it("Should not expose count or updateList", async () => {
			// nothing called them; each was one more surface to keep in step
			strictEqual(store.count, undefined);
			strictEqual(store.updateList, undefined);
		});
		const rows = [
			{ id: 1, sub: "sub_000", value: "a" },
			{ id: 2, sub: "sub_000", value: "b" },
		];
		const valuesOf = async () =>
			(await store.selectList(table, { sub: "sub_000" }))
				.map((row) => row.value)
				.sort();
		it("Should reject insert of an existing primary key", async () => {
			await store.insert(table, rows[0]);
			await rejects(() => store.insert(table, { ...rows[0], value: "z" }));
			deepStrictEqual(await valuesOf(), ["a"]);
		});
		it("Should not create a row when update matches nothing", async () => {
			const result = await store.update(
				table,
				{ sub: "sub_000", id: 1 },
				{ value: "z" },
			);
			strictEqual(result, undefined);
			deepStrictEqual(await store.selectList(table, { sub: "sub_000" }), []);
			strictEqual(
				await store.select(table, { sub: "sub_000", id: 1 }),
				undefined,
			);
		});
		it("Should not select a row when a non-key filter does not match", async () => {
			await store.insert(table, rows[0]);
			strictEqual(
				await store.select(table, { sub: "sub_000", id: 1, value: "z" }),
				undefined,
			);
			strictEqual(
				(await store.select(table, { sub: "sub_000", id: 1, value: "a" }))
					.value,
				"a",
			);
		});
		it("Should not update a row when a non-key filter does not match", async () => {
			await store.insert(table, rows[0]);
			const result = await store.update(
				table,
				{ sub: "sub_000", id: 1, value: "z" },
				{ value: "y" },
			);
			strictEqual(result, undefined);
			deepStrictEqual(await valuesOf(), ["a"]);
			await store.update(
				table,
				{ sub: "sub_000", id: 1, value: "a" },
				{ value: "y" },
			);
			deepStrictEqual(await valuesOf(), ["y"]);
		});
		it("Should not remove a row when a non-key filter does not match", async () => {
			await store.insert(table, rows[0]);
			strictEqual(
				await store.remove(table, { sub: "sub_000", id: 1, value: "z" }),
				false,
			);
			deepStrictEqual(await valuesOf(), ["a"]);
			strictEqual(
				await store.remove(table, { sub: "sub_000", id: 1, value: "a" }),
				true,
			);
			deepStrictEqual(await valuesOf(), []);
		});
		it("Should refuse to remove with an empty array filter", async () => {
			await store.insertList(table, rows);
			await rejects(() => store.remove(table, { sub: [] }));
			await rejects(() => store.remove(table, { sub: "sub_000", id: [] }));
			deepStrictEqual(await valuesOf(), ["a", "b"]);
		});
		it("Should refuse to update or remove with an undefined filter value", async () => {
			await store.insertList(table, rows);
			await rejects(() =>
				store.update(table, { sub: "sub_000", id: undefined }, { value: "z" }),
			);
			await rejects(() =>
				store.remove(table, { sub: "sub_000", id: undefined }),
			);
			deepStrictEqual(await valuesOf(), ["a", "b"]);
		});
		it("Should select from a list filter", async () => {
			await store.insertList(table, [
				...rows,
				{ id: 3, sub: "sub_000", value: "c" },
			]);
			deepStrictEqual(
				(await store.selectList(table, { sub: "sub_000", value: ["a", "c"] }))
					.map((row) => row.value)
					.sort(),
				["a", "c"],
			);
		});
	});
	describe("log", () => {
		// Every operation announces itself. Without asserting the text, the package
		// id and the method name are both free to be anything.
		const firstArgOf = async (fn) => {
			const before = mocks.log.mock.calls.length;
			await fn();
			return mocks.log.mock.calls[before].arguments[0];
		};
		it("Should name the package and the operation", async () => {
			const row = { id: 1, sub: "sub_000", value: "a" };
			const prefix = `@1auth/store-${mocks.id} `;
			strictEqual(
				await firstArgOf(() => store.insert(table, row)),
				`${prefix}insert(`,
			);
			strictEqual(
				await firstArgOf(() => store.exists(table, { id: row.id })),
				`${prefix}exists(`,
			);
			strictEqual(
				await firstArgOf(() => store.select(table, { id: row.id })),
				`${prefix}select(`,
			);
			strictEqual(
				await firstArgOf(() => store.selectList(table, { sub: row.sub })),
				`${prefix}selectList(`,
			);
			strictEqual(
				await firstArgOf(() =>
					store.insertList(table, [{ id: 2, sub: "sub_000", value: "b" }]),
				),
				`${prefix}insertList(`,
			);
			// DynamoDB writes need the full key, not just the id
			const key = { sub: row.sub, id: row.id };
			strictEqual(
				await firstArgOf(() => store.update(table, key, { value: "z" })),
				`${prefix}update(`,
			);
			strictEqual(
				await firstArgOf(() => store.remove(table, key)),
				`${prefix}remove(`,
			);
			// removeList is an alias of remove in the SQL stores, its own operation in DynamoDB
			ok(
				/^@1auth\/store-\w[\w-]* remove(List)?\($/.test(
					await firstArgOf(() =>
						store.removeList(table, { sub: row.sub, id: [2] }),
					),
				),
			);
		});
	});
	describe("empty lists", () => {
		it("Should insert nothing from an omitted list", async () => {
			deepStrictEqual(await store.insertList(table), []);
			deepStrictEqual(await store.selectList(table, { sub: "sub_000" }), []);
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
