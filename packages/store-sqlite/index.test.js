import { deepEqual, equal } from "node:assert/strict";
import { describe, it, test } from "node:test";
import tests from "../store/index.test.js";
import * as store from "./index.js";
import * as mockDatabase from "./mock.js";
import * as mockDatabaseTable from "./table/sqlite.js";

store.default({
	log: (...args) => mocks.log(...args),
	client: {
		query: (...args) => mocks.storeClient.query(...args),
	},
});

const mocks = {
	...mockDatabase,
	table: mockDatabaseTable,
};

const table = mockDatabaseTable.name;

describe("store-sqlite", () => {
	tests(store, mocks);
	describe("makeSqlParts", () => {
		it("Should format {select} properly", async () => {
			const filters = {};
			const values = {};
			const fields = ["a", "b"];

			store.default({ placeholder: "$" });
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

			store.default({ placeholder: "$" });
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

			store.default({ placeholder: "$" });
			const { insert, parameters } = store.makeSqlParts(filters, values);

			equal(insert, '("a", "b") VALUES ($1,$2)');
			deepEqual(parameters, ["a", "b"]);
		});

		it("Should format {update} properly", async () => {
			const filters = {};
			const values = { a: "a", b: "b" };

			store.default({ placeholder: "$" });
			const { update, parameters } = store.makeSqlParts(filters, values);

			equal(update, '"a" = $1, "b" = $2');
			deepEqual(parameters, ["a", "b"]);
		});

		it("Should format {where} properly", async () => {
			const filters = { a: "a", bc: ["b", "c"], d: "d" };

			store.default({ placeholder: "$" });
			const { where, parameters } = store.makeSqlParts(filters);

			equal(where, 'WHERE "a" = $1 AND "bc" IN ($2,$3) AND "d" = $4');
			deepEqual(parameters, ["a", "b", "c", "d"]);
		});
	});
	describe("makeSqlParts with default placeholder", () => {
		it("Should format {insert} with ? placeholder", async () => {
			store.default({ placeholder: "?" });
			const { insert, parameters } = store.makeSqlParts({}, { a: "a", b: "b" });
			equal(insert, '("a", "b") VALUES (?,?)');
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
	});

	describe("makeSqlParts edge cases", () => {
		it("Should handle combined filters and values for UPDATE", async () => {
			store.default({ placeholder: "$" });
			const { update, where, parameters } = store.makeSqlParts(
				{ id: 1, sub: "sub_000" },
				{ value: "b" },
			);
			equal(update, '"value" = $1');
			equal(where, 'WHERE "id" = $2 AND "sub" = $3');
			deepEqual(parameters, ["b", 1, "sub_000"]);
		});

		it("Should handle idxStart parameter", async () => {
			store.default({ placeholder: "$" });
			const { insert, parameters } = store.makeSqlParts(
				{},
				{ a: "a", b: "b" },
				[],
				5,
			);
			equal(insert, '("a", "b") VALUES ($5,$6)');
			deepEqual(parameters, ["a", "b"]);
		});

		it("Should return empty where when no filters", async () => {
			store.default({ placeholder: "$" });
			const { where, parameters } = store.makeSqlParts({});
			equal(where, "");
			deepEqual(parameters, []);
		});

		it("Should skip undefined filter values", async () => {
			store.default({ placeholder: "$" });
			const { where, parameters } = store.makeSqlParts({
				a: "a",
				b: undefined,
				c: "c",
			});
			equal(where, 'WHERE "a" = $1 AND "c" = $2');
			deepEqual(parameters, ["a", "c"]);
		});

		it("Should handle empty array filter value", async () => {
			store.default({ placeholder: "$" });
			const { where, parameters } = store.makeSqlParts({
				a: [],
			});
			equal(where, "");
			deepEqual(parameters, []);
		});
	});

	describe("getPlaceholder", () => {
		it("Should return $N for $ placeholder", async () => {
			store.default({ placeholder: "$" });
			equal(store.getPlaceholder(1), "$1");
			equal(store.getPlaceholder(5), "$5");
		});

		it("Should return ? for ? placeholder", async () => {
			store.default({ placeholder: "?" });
			equal(store.getPlaceholder(1), "?");
			equal(store.getPlaceholder(5), "?");
		});
	});

	describe("normalizeValues / parseValues round-trip", () => {
		test.before(async () => {
			await mockDatabaseTable.create(mocks.storeClient, table);
		});
		test.afterEach(async () => {
			await mockDatabaseTable.truncate(mocks.storeClient, table);
		});
		test.after(async () => {
			await mockDatabaseTable.drop(mocks.storeClient, table);
		});

		it("Should round-trip otp boolean values", async () => {
			store.default({ placeholder: "?" });
			const row = { id: 1, sub: "sub_000", value: "a" };

			// otp = true
			await store.insert(table, { ...row, otp: true });
			let result = await store.select(table, { id: row.id });
			equal(result.otp, true);
			await mocks.table.truncate(mocks.storeClient, table);

			// otp = false
			await store.insert(table, { ...row, otp: false });
			result = await store.select(table, { id: row.id });
			equal(result.otp, false);
		});

		it("Should round-trip date fields (create, update, verify, lastused)", async () => {
			store.default({ placeholder: "?" });
			const now = Math.floor(Date.now() / 1000);
			const row = {
				id: 1,
				sub: "sub_000",
				value: "a",
				create: now,
				update: now + 100,
				verify: now + 200,
				lastused: now + 300,
			};
			await store.insert(table, row);
			const result = await store.select(table, { id: row.id });
			equal(result.create, now);
			equal(result.update, now + 100);
			equal(result.verify, now + 200);
			equal(result.lastused, now + 300);
		});

		it("Should handle object values by JSON stringifying", async () => {
			store.default({ placeholder: "?" });
			const obj = { key: "val", nested: [1, 2] };
			const row = { id: 1, sub: "sub_000", value: JSON.stringify(obj) };
			await store.insert(table, row);
			const result = await store.select(table, { id: row.id });
			equal(result.value, JSON.stringify(obj));
		});

		it("Should not mutate the input values object on update", async () => {
			store.default({ placeholder: "?" });
			await store.insert(table, { id: 1, sub: "sub_000", value: "a" });
			const updateValues = { value: "b" };
			const updateCopy = structuredClone(updateValues);
			await store.update(table, { id: 1 }, updateValues);
			deepEqual(updateValues, updateCopy);
		});

		it("Should insert without expire and not add timeToLiveKey", async () => {
			store.default({ placeholder: "?" });
			const row = { id: 1, sub: "sub_000", value: "a" };
			await store.insert(table, row);
			const result = await store.select(table, { id: row.id });
			equal(result[mocks.table.timeToLiveKey], null);
		});
	});

	describe("count edge cases", () => {
		test.before(async () => {
			await mockDatabaseTable.create(mocks.storeClient, table);
		});
		test.afterEach(async () => {
			await mockDatabaseTable.truncate(mocks.storeClient, table);
		});
		test.after(async () => {
			await mockDatabaseTable.drop(mocks.storeClient, table);
		});

		it("Should count all rows with empty filters", async () => {
			store.default({ placeholder: "?" });
			await store.insert(table, { id: 1, sub: "sub_000", value: "a" });
			await store.insert(table, { id: 2, sub: "sub_001", value: "b" });
			const result = await store.count(table);
			equal(result, 2);
		});
	});

	describe("selectList edge cases", () => {
		test.before(async () => {
			await mockDatabaseTable.create(mocks.storeClient, table);
		});
		test.afterEach(async () => {
			await mockDatabaseTable.truncate(mocks.storeClient, table);
		});
		test.after(async () => {
			await mockDatabaseTable.drop(mocks.storeClient, table);
		});

		it("Should return all rows with empty filters", async () => {
			store.default({ placeholder: "?" });
			await store.insert(table, { id: 1, sub: "sub_000", value: "a" });
			await store.insert(table, { id: 2, sub: "sub_001", value: "b" });
			const result = await store.selectList(table);
			equal(result.length, 2);
		});

		it("Should parse date fields in selectList results", async () => {
			store.default({ placeholder: "?" });
			const now = Math.floor(Date.now() / 1000);
			await store.insert(table, {
				id: 1,
				sub: "sub_000",
				value: "a",
				expire: now + 1000,
			});
			await store.insert(table, {
				id: 2,
				sub: "sub_000",
				value: "b",
				expire: now + 2000,
			});
			const result = await store.selectList(table, { sub: "sub_000" });
			equal(result[0].expire, now + 1000);
			equal(result[1].expire, now + 2000);
		});
	});
});
