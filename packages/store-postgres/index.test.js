import { deepEqual, equal, ok, strictEqual } from "node:assert/strict";
import { describe, it, test } from "node:test";
import tests from "../store/index.test.js";
import * as store from "./index.js";
import * as mockDatabase from "./mock.js";
import * as mockDatabaseTable from "./table/postgres.js";

store.default({
	log: (...args) => mocks.log(...args),
	client: {
		query: (...args) => mocks.storeClient.query(...args),
	},
});

const mocks = {
	...mockDatabase,
	id: "postgres",
	table: mockDatabaseTable,
};

const nowInSeconds = () => Math.floor(Date.now() / 1000);

// Extended table with otp for normalizeValues/parseValues coverage
const extTable = "test_ext";
const createExtTable = async () =>
	await mocks.storeClient.query(`
	CREATE TABLE IF NOT EXISTS ${extTable}
	(
		"id"     INTEGER PRIMARY KEY,
		"sub"    VARCHAR(15)              NOT NULL,
		"value"  VARCHAR(256)             NOT NULL,
		"digest" VARCHAR(256)             DEFAULT NULL,
		"otp"    INTEGER                  DEFAULT NULL,

		"expire"   TIMESTAMP WITH TIME ZONE DEFAULT NULL,
		"remove"   TIMESTAMP WITH TIME ZONE DEFAULT NULL
	)`);
const truncateExtTable = async () =>
	await mocks.storeClient.query(`DELETE FROM ${extTable}`);
const dropExtTable = async () =>
	await mocks.storeClient.query(`DROP TABLE IF EXISTS ${extTable}`);

describe("store-postgres", () => {
	describe("exports", () => {
		it("Should expose getPlaceholder bound to the configured placeholder", () => {
			equal(store.getPlaceholder(1), "$1");
			equal(store.getPlaceholder(7), "$7");
		});
		it("Should ignore a missing values object", () => {
			equal(store.normalizeValues(undefined), undefined);
			equal(store.parseValues(undefined), undefined);
		});
	});

	tests(store, mocks);
	describe("makeSqlParts", () => {
		it("Should format {select} properly", async () => {
			const filters = {};
			const values = {};
			const fields = ["a", "b"];

			store.default({ placeholder: "?" });
			const { select, parameters } = store.makeSqlParts(
				filters,
				values,
				fields,
			);

			equal(select, '"a", "b"');
			deepEqual(parameters, []);
		});

		it("Should format {select} to *", async () => {
			const filters = {};
			const values = {};
			const fields = [];

			store.default({ placeholder: "?" });
			const { select, parameters } = store.makeSqlParts(
				filters,
				values,
				fields,
			);

			equal(select, "*");
			deepEqual(parameters, []);
		});

		it("Should format {insert} properly", async () => {
			const filters = {};
			const values = { a: "a", b: "b" };

			store.default({ placeholder: "?" });
			const { insert, parameters } = store.makeSqlParts(filters, values);

			equal(insert, '("a", "b") VALUES (?,?)');
			deepEqual(parameters, ["a", "b"]);
		});

		it("Should format {update} properly", async () => {
			const filters = {};
			const values = { a: "a", b: "b" };

			store.default({ placeholder: "?" });
			const { update, parameters } = store.makeSqlParts(filters, values);

			equal(update, '"a" = ?, "b" = ?');
			deepEqual(parameters, ["a", "b"]);
		});

		it("Should format {where} properly", async () => {
			const filters = { a: "a", bc: ["b", "c"], d: "d" };

			store.default({ placeholder: "?" });
			const { where, parameters } = store.makeSqlParts(filters);

			equal(where, 'WHERE "a" = ? AND "bc" IN (?,?) AND "d" = ?');
			deepEqual(parameters, ["a", "b", "c", "d"]);
		});
	});
	describe("makeSqlParts with default placeholder", () => {
		it("Should format {insert} with $ placeholder", async () => {
			store.default({ placeholder: "$" });
			const { insert, parameters } = store.makeSqlParts({}, { a: "a", b: "b" });
			equal(insert, '("a", "b") VALUES ($1,$2)');
			deepEqual(parameters, ["a", "b"]);
		});

		it("Should format {where} with $ placeholder", async () => {
			store.default({ placeholder: "$" });
			const { where, parameters } = store.makeSqlParts({
				a: "a",
				bc: ["b", "c"],
				d: "d",
			});
			equal(where, 'WHERE "a" = $1 AND "bc" IN ($2,$3) AND "d" = $4');
			deepEqual(parameters, ["a", "b", "c", "d"]);
		});
	});

	describe("integration", () => {
		test.before(async () => {
			await createExtTable();
		});
		test.afterEach(async () => {
			await truncateExtTable();
		});
		test.after(async () => {
			await dropExtTable();
		});

		describe("normalizeValues / parseValues round-trip", () => {
			it("Should round-trip otp boolean values", async () => {
				store.default({ placeholder: "$" });
				const row = { id: 1, sub: "sub_000", value: "a" };

				// otp = true
				await store.insert(extTable, { ...row, otp: true });
				let result = await store.select(extTable, { id: row.id });
				strictEqual(result.otp, true);
				await truncateExtTable();

				// otp = false
				await store.insert(extTable, { ...row, otp: false });
				result = await store.select(extTable, { id: row.id });
				strictEqual(result.otp, false);
			});

			it("Should round-trip otp via update", async () => {
				store.default({ placeholder: "$" });
				await store.insert(extTable, {
					id: 1,
					sub: "sub_000",
					value: "a",
					otp: false,
				});
				await store.update(extTable, { id: 1 }, { otp: true });
				const result = await store.select(extTable, { id: 1 });
				strictEqual(result.otp, true);
			});

			it("Should normalize otp undefined to false (via 0)", async () => {
				store.default({ placeholder: "$" });
				await store.insert(extTable, {
					id: 1,
					sub: "sub_000",
					value: "a",
					otp: undefined,
				});
				const result = await store.select(extTable, { id: 1 });
				strictEqual(result.otp, false);
			});

			it("Should normalize actual array to JSON via JSON.stringify()", async () => {
				store.default({ placeholder: "$" });
				const arr = [1, 2];
				await store.insert(extTable, {
					id: 1,
					sub: "sub_000",
					value: arr,
				});
				const result = await store.select(extTable, { id: 1 });
				strictEqual(result.value, JSON.stringify(arr));
			});

			it("Should normalize actual object to JSON via JSON.stringify()", async () => {
				store.default({ placeholder: "$" });
				const obj = { key: "val", nested: [1, 2] };
				await store.insert(extTable, {
					id: 1,
					sub: "sub_000",
					value: obj,
				});
				const result = await store.select(extTable, { id: 1 });
				strictEqual(result.value, JSON.stringify(obj));
			});

			it("Should normalize actual boolean to string via String()", async () => {
				store.default({ placeholder: "$" });
				await store.insert(extTable, {
					id: 1,
					sub: "sub_000",
					value: true,
				});
				const result = await store.select(extTable, { id: 1 });
				strictEqual(result.value, "true");
			});

			it("Should normalize undefined non-date value to null", async () => {
				store.default({ placeholder: "$" });
				await store.insert(extTable, {
					id: 1,
					sub: "sub_000",
					value: "v",
					digest: undefined,
				});
				const result = await store.select(extTable, { id: 1 });
				strictEqual(result.digest, null);
			});

			it("Should round-trip expire timestamp", async () => {
				store.default({ placeholder: "$" });
				const ts = nowInSeconds();
				await store.insert(extTable, {
					id: 1,
					sub: "sub_000",
					value: "a",
					expire: ts,
				});
				const result = await store.select(extTable, { id: 1 });
				strictEqual(result.expire, ts);
				ok(result.remove > ts);
			});
		});

		describe("remove", () => {
			it("Should return true when a row was removed", async () => {
				store.default({ placeholder: "$" });
				await store.insert(extTable, { id: 1, sub: "sub_000", value: "a" });
				const result = await store.remove(extTable, { id: 1 });
				strictEqual(result, true);
				strictEqual(await store.select(extTable, { id: 1 }), undefined);
			});

			it("Should return false when no row was removed", async () => {
				store.default({ placeholder: "$" });
				const result = await store.remove(extTable, { id: 1 });
				strictEqual(result, false);
			});
		});
	});
});
