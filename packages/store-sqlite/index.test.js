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
import {
	getPlaceholderFor,
	log,
	makeInsertList,
	makeSqlPartsFor,
	makeValues,
	normalizeValues,
	parseValues,
	withTimeToLive,
} from "./index.js";
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
	id: "sqlite",
	table: mockDatabaseTable,
};

const table = mockDatabaseTable.name;
const nowInSeconds = () => Math.floor(Date.now() / 1000);

// Swap in a client that records the SQL it is handed and replays a canned result,
// so the exact statement and the defensive reads around it are assertable.
const withClient = async (result, fn) => {
	const seen = [];
	store.default({
		client: {
			query: async (sql, parameters) => {
				seen.push({ sql, parameters });
				return result;
			},
		},
	});
	try {
		return { seen, returned: await fn() };
	} finally {
		store.default({
			client: { query: (...args) => mocks.storeClient.query(...args) },
		});
	}
};

describe("store-sqlite", () => {
	tests(store, mocks);
	describe("generated sql", () => {
		it("Should select only sub in exists", async () => {
			const { seen } = await withClient([], () =>
				store.exists("test", { id: 1 }),
			);
			equal(seen[0].sql, 'SELECT "sub" FROM test WHERE "id" = ? LIMIT 1');
		});
		it("Should tolerate a client returning nothing", async () => {
			// `res?.[0]` rather than `res[0]`: a client is free to resolve undefined
			strictEqual(
				(await withClient(undefined, () => store.remove("test", { id: 1 })))
					.returned,
				false,
			);
		});
		it("Should report whether remove deleted a row", async () => {
			strictEqual(
				(await withClient([{ id: 1 }], () => store.remove("test", { id: 1 })))
					.returned,
				true,
			);
			// no RETURNING row: nothing matched the filter
			strictEqual(
				(await withClient([], () => store.remove("test", { id: 1 }))).returned,
				false,
			);
			// a row without an id still counts as nothing removed
			strictEqual(
				(await withClient([{}], () => store.remove("test", { id: 1 })))
					.returned,
				false,
			);
		});
	});
	describe("log", () => {
		it("Should prefix with the package id", async () => {
			const calls = [];
			log(
				{ id: "widget", log: (...args) => calls.push(args) },
				"remove",
				"test",
				{ id: 1 },
			);
			deepStrictEqual(calls, [
				["@1auth/store-widget remove(", "test", { id: 1 }, ")"],
			]);
		});
		it("Should do nothing when log is false", async () => {
			log({ id: "widget", log: false }, "remove", "test");
		});
	});

	describe("makeValues", () => {
		const options = { timeToLiveKey: "remove", timeToLiveExpireOffset: 100 };
		it("Should apply timeToLive then normalize", async () => {
			deepStrictEqual(makeValues({ otp: true, expire: 50 }, options), {
				otp: 1,
				expire: "1970-01-01T00:00:50.000Z",
				remove: "1970-01-01T00:02:30.000Z",
			});
		});
		it("Should not mutate the input", async () => {
			const values = { otp: true, expire: 50 };
			const copy = structuredClone(values);
			makeValues(values, options);
			deepStrictEqual(values, copy);
		});
	});

	describe("getPlaceholderFor", () => {
		it("Should return $N for $ placeholder", async () => {
			equal(getPlaceholderFor("$", 1), "$1");
			equal(getPlaceholderFor("$", 5), "$5");
		});
		it("Should return the placeholder as-is otherwise", async () => {
			equal(getPlaceholderFor("?", 1), "?");
			equal(getPlaceholderFor("?", 5), "?");
			equal(getPlaceholderFor("@", 5), "@");
		});
	});

	describe("makeSqlPartsFor", () => {
		it("Should format {select} with fields", async () => {
			equal(makeSqlPartsFor("?", {}, {}, ["a", "b"]).select, '"a", "b"');
		});
		it("Should format {select} with a single field", async () => {
			equal(makeSqlPartsFor("?", {}, {}, ["id"]).select, '"id"');
		});
		it("Should format {select} to * without fields", async () => {
			equal(makeSqlPartsFor("?", {}, {}, []).select, "*");
			equal(makeSqlPartsFor("?").select, "*");
		});
		it("Should format {insert} with ? placeholder", async () => {
			const { insert, parameters } = makeSqlPartsFor(
				"?",
				{},
				{ a: "a", b: "b" },
			);
			equal(insert, '("a", "b") VALUES (?,?)');
			deepStrictEqual(parameters, ["a", "b"]);
		});
		it("Should format {insert} with $ placeholder", async () => {
			const { insert, parameters } = makeSqlPartsFor(
				"$",
				{},
				{ a: "a", b: "b" },
			);
			equal(insert, '("a", "b") VALUES ($1,$2)');
			deepStrictEqual(parameters, ["a", "b"]);
		});
		it("Should format {update}", async () => {
			equal(
				makeSqlPartsFor("?", {}, { a: "a", b: "b" }).update,
				'"a" = ?, "b" = ?',
			);
			equal(
				makeSqlPartsFor("$", {}, { a: "a", b: "b" }).update,
				'"a" = $1, "b" = $2',
			);
		});
		it("Should format {where} for scalars and arrays", async () => {
			const { where, parameters } = makeSqlPartsFor("$", {
				a: "a",
				bc: ["b", "c"],
				d: "d",
			});
			equal(where, 'WHERE "a" = $1 AND "bc" IN ($2,$3) AND "d" = $4');
			deepStrictEqual(parameters, ["a", "b", "c", "d"]);
		});
		it("Should return an empty {where} without filters", async () => {
			const { where, parameters } = makeSqlPartsFor("?", {});
			equal(where, "");
			deepStrictEqual(parameters, []);
		});
		it("Should skip undefined filter values", async () => {
			const { where, parameters } = makeSqlPartsFor("$", {
				a: "a",
				b: undefined,
				c: "c",
			});
			equal(where, 'WHERE "a" = $1 AND "c" = $2');
			deepStrictEqual(parameters, ["a", "c"]);
		});
		it("Should skip an empty array filter value", async () => {
			const { where, parameters } = makeSqlPartsFor("$", { a: [] });
			equal(where, "");
			deepStrictEqual(parameters, []);
		});
		it("Should continue the index from values into filters", async () => {
			const { update, where, parameters } = makeSqlPartsFor(
				"$",
				{ id: 1, sub: "sub_000" },
				{ value: "b" },
			);
			equal(update, '"value" = $1');
			equal(where, 'WHERE "id" = $2 AND "sub" = $3');
			deepStrictEqual(parameters, ["b", 1, "sub_000"]);
		});
		it("Should honour idxStart", async () => {
			const { insert } = makeSqlPartsFor("$", {}, { a: "a", b: "b" }, [], 5);
			equal(insert, '("a", "b") VALUES ($5,$6)');
		});
	});

	describe("makeInsertList", () => {
		it("Should build a single row insert", async () => {
			const { insert, parameters } = makeInsertList("$", [{ a: "a", b: "b" }]);
			equal(insert, '("a", "b") VALUES ($1,$2)');
			deepStrictEqual(parameters, ["a", "b"]);
		});
		it("Should append value groups for subsequent rows", async () => {
			const { insert, parameters } = makeInsertList("$", [
				{ a: "a", b: "b" },
				{ a: "c", b: "d" },
				{ a: "e", b: "f" },
			]);
			equal(insert, '("a", "b") VALUES ($1,$2), ($3,$4), ($5,$6)');
			deepStrictEqual(parameters, ["a", "b", "c", "d", "e", "f"]);
		});
		it("Should repeat the ? placeholder per row", async () => {
			const { insert } = makeInsertList("?", [{ a: "a" }, { a: "b" }]);
			equal(insert, '("a") VALUES (?), (?)');
		});
		it("Should build nothing from an empty list", async () => {
			const { insert, parameters } = makeInsertList("$", []);
			equal(insert, "");
			deepStrictEqual(parameters, []);
		});
	});

	describe("withTimeToLive", () => {
		const options = { timeToLiveKey: "remove", timeToLiveExpireOffset: 100 };
		it("Should add the timeToLiveKey from expire", async () => {
			const values = { expire: 1000 };
			deepStrictEqual(withTimeToLive(values, options), {
				expire: 1000,
				remove: 1100,
			});
		});
		it("Should return the same object", async () => {
			const values = { expire: 1000 };
			strictEqual(withTimeToLive(values, options), values);
		});
		it("Should use a custom timeToLiveKey", async () => {
			deepStrictEqual(
				withTimeToLive(
					{ expire: 1000 },
					{ timeToLiveKey: "ttl", timeToLiveExpireOffset: 5 },
				),
				{ expire: 1000, ttl: 1005 },
			);
		});
		it("Should skip when there is no expire", async () => {
			deepStrictEqual(withTimeToLive({ value: "a" }, options), { value: "a" });
		});
		it("Should skip when timeToLiveKey is falsy", async () => {
			deepStrictEqual(
				withTimeToLive({ expire: 1000 }, { ...options, timeToLiveKey: "" }),
				{ expire: 1000 },
			);
		});
		it("Should not overwrite an existing timeToLiveKey", async () => {
			deepStrictEqual(withTimeToLive({ expire: 1000, remove: 5 }, options), {
				expire: 1000,
				remove: 5,
			});
		});
		it("Should overwrite a null timeToLiveKey", async () => {
			deepStrictEqual(withTimeToLive({ expire: 1000, remove: null }, options), {
				expire: 1000,
				remove: 1100,
			});
		});
	});

	describe("normalizeValues", () => {
		it("Should ignore a missing values object", async () => {
			strictEqual(normalizeValues(undefined), undefined);
			strictEqual(normalizeValues(null), undefined);
		});
		it("Should convert otp to an integer", async () => {
			const truthy = { otp: true };
			normalizeValues(truthy);
			strictEqual(truthy.otp, 1);
			const falsy = { otp: false };
			normalizeValues(falsy);
			strictEqual(falsy.otp, 0);
			const missing = { otp: undefined };
			normalizeValues(missing);
			strictEqual(missing.otp, 0);
		});
		it("Should not add otp when absent", async () => {
			const values = { value: "a" };
			normalizeValues(values);
			strictEqual(Object.hasOwn(values, "otp"), false);
		});
		it("Should convert every date field to ISO", async () => {
			const values = {
				create: 10,
				update: 20,
				verify: 30,
				lastused: 40,
				expire: 50,
				remove: 60,
			};
			normalizeValues(values);
			deepStrictEqual(values, {
				create: "1970-01-01T00:00:10.000Z",
				update: "1970-01-01T00:00:20.000Z",
				verify: "1970-01-01T00:00:30.000Z",
				lastused: "1970-01-01T00:00:40.000Z",
				expire: "1970-01-01T00:00:50.000Z",
				remove: "1970-01-01T00:01:00.000Z",
			});
		});
		it("Should leave null date fields alone", async () => {
			const values = {
				create: null,
				update: null,
				verify: null,
				lastused: null,
				expire: null,
				remove: null,
			};
			normalizeValues(values);
			deepStrictEqual(values, {
				create: null,
				update: null,
				verify: null,
				lastused: null,
				expire: null,
				remove: null,
			});
		});
		it("Should stringify objects and arrays as JSON", async () => {
			const values = { a: { k: "v" }, b: [1, 2] };
			normalizeValues(values);
			deepStrictEqual(values, { a: '{"k":"v"}', b: "[1,2]" });
		});
		it("Should stringify other non-primitives with String()", async () => {
			const values = { a: true, b: false, c: 10n };
			normalizeValues(values);
			deepStrictEqual(values, { a: "true", b: "false", c: "10" });
		});
		it("Should convert undefined to null", async () => {
			const values = { a: undefined };
			normalizeValues(values);
			deepStrictEqual(values, { a: null });
		});
		it("Should pass strings, numbers and null through untouched", async () => {
			const values = { a: "a", b: 1, c: 0, d: null, e: "" };
			normalizeValues(values);
			deepStrictEqual(values, { a: "a", b: 1, c: 0, d: null, e: "" });
		});
	});

	describe("parseValues", () => {
		it("Should ignore a missing values object", async () => {
			strictEqual(parseValues(undefined), undefined);
			strictEqual(parseValues(null), undefined);
		});
		it("Should convert a numeric otp to a boolean", async () => {
			const truthy = { otp: 1 };
			parseValues(truthy);
			strictEqual(truthy.otp, true);
			const falsy = { otp: 0 };
			parseValues(falsy);
			strictEqual(falsy.otp, false);
		});
		it("Should leave a non-numeric otp alone", async () => {
			const values = { otp: null };
			parseValues(values);
			strictEqual(values.otp, null);
		});
		it("Should not add otp when absent", async () => {
			const values = { value: "a" };
			parseValues(values);
			strictEqual(Object.hasOwn(values, "otp"), false);
		});
		it("Should convert every date field to seconds", async () => {
			const values = {
				create: "1970-01-01T00:00:10.000Z",
				update: "1970-01-01T00:00:20.000Z",
				verify: "1970-01-01T00:00:30.000Z",
				lastused: "1970-01-01T00:00:40.000Z",
				expire: "1970-01-01T00:00:50.000Z",
				remove: "1970-01-01T00:01:00.000Z",
			};
			parseValues(values);
			deepStrictEqual(values, {
				create: 10,
				update: 20,
				verify: 30,
				lastused: 40,
				expire: 50,
				remove: 60,
			});
		});
		it("Should leave null date fields alone", async () => {
			const values = { create: null, expire: null };
			parseValues(values);
			deepStrictEqual(values, { create: null, expire: null });
		});
		it("Should round-trip normalizeValues", async () => {
			const ts = nowInSeconds();
			const values = { otp: true, expire: ts };
			normalizeValues(values);
			parseValues(values);
			deepStrictEqual(values, { otp: true, expire: ts });
		});
	});
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

		it("Should format {select} with single field", async () => {
			store.default({ placeholder: "$" });
			const { select } = store.makeSqlParts({}, {}, ["id"]);
			equal(select, '"id"');
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

	describe("integration", () => {
		test.before(async () => {
			await mockDatabaseTable.create(mocks.storeClient, table);
		});
		test.afterEach(async () => {
			await mockDatabaseTable.truncate(mocks.storeClient, table);
		});

		describe("normalizeValues / parseValues round-trip", () => {
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

			it("Should round-trip otp via update", async () => {
				store.default({ placeholder: "?" });
				await store.insert(table, {
					id: 1,
					sub: "sub_000",
					value: "a",
					otp: false,
				});
				await store.update(table, { id: 1 }, { otp: true });
				const result = await store.select(table, { id: 1 });
				strictEqual(result.otp, true);
			});

			it("Should normalize otp undefined to false (via 0)", async () => {
				store.default({ placeholder: "?" });
				await store.insert(table, {
					id: 1,
					sub: "sub_000",
					value: "a",
					otp: undefined,
				});
				const result = await store.select(table, { id: 1 });
				strictEqual(result.otp, false);
			});

			it("Should round-trip date fields (create, update, verify, lastused)", async () => {
				store.default({ placeholder: "?" });
				const now = nowInSeconds();
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

			it("Should round-trip expire timestamp", async () => {
				store.default({ placeholder: "?" });
				const ts = nowInSeconds();
				await store.insert(table, {
					id: 1,
					sub: "sub_000",
					value: "a",
					expire: ts,
				});
				const result = await store.select(table, { id: 1 });
				strictEqual(result.expire, ts);
			});

			it("Should round-trip remove timestamp independently", async () => {
				store.default({ placeholder: "?", timeToLiveKey: "" });
				const ts = nowInSeconds();
				await store.insert(table, {
					id: 1,
					sub: "sub_000",
					value: "a",
					remove: ts,
				});
				const result = await store.select(table, { id: 1 });
				strictEqual(result.remove, ts);
				store.default({ timeToLiveKey: "remove" });
			});

			it("Should round-trip all 6 date fields simultaneously", async () => {
				store.default({ placeholder: "?", timeToLiveKey: "" });
				const ts = nowInSeconds();
				await store.insert(table, {
					id: 1,
					sub: "sub_000",
					value: "a",
					create: ts,
					update: ts + 1,
					verify: ts + 2,
					lastused: ts + 3,
					expire: ts + 4,
					remove: ts + 5,
				});
				const result = await store.select(table, { id: 1 });
				strictEqual(result.create, ts);
				strictEqual(result.update, ts + 1);
				strictEqual(result.verify, ts + 2);
				strictEqual(result.lastused, ts + 3);
				strictEqual(result.expire, ts + 4);
				strictEqual(result.remove, ts + 5);
				store.default({ timeToLiveKey: "remove" });
			});

			it("Should preserve null date fields", async () => {
				store.default({ placeholder: "?" });
				await store.insert(table, {
					id: 1,
					sub: "sub_000",
					value: "a",
				});
				const result = await store.select(table, { id: 1 });
				strictEqual(result.create, null);
				strictEqual(result.update, null);
				strictEqual(result.verify, null);
				strictEqual(result.lastused, null);
				strictEqual(result.expire, null);
				strictEqual(result.remove, null);
			});

			it("Should normalize actual boolean to string via String()", async () => {
				store.default({ placeholder: "?" });
				await store.insert(table, {
					id: 1,
					sub: "sub_000",
					value: true,
				});
				const result = await store.select(table, { id: 1 });
				strictEqual(result.value, "true");
			});

			it("Should normalize actual object to JSON via JSON.stringify()", async () => {
				store.default({ placeholder: "?" });
				const obj = { key: "val", nested: [1, 2] };
				await store.insert(table, {
					id: 1,
					sub: "sub_000",
					value: obj,
				});
				const result = await store.select(table, { id: 1 });
				strictEqual(result.value, JSON.stringify(obj));
			});

			it("Should handle pre-stringified object values", async () => {
				store.default({ placeholder: "?" });
				const obj = { key: "val", nested: [1, 2] };
				const row = { id: 1, sub: "sub_000", value: JSON.stringify(obj) };
				await store.insert(table, row);
				const result = await store.select(table, { id: row.id });
				equal(result.value, JSON.stringify(obj));
			});

			it("Should normalize undefined non-date value to null", async () => {
				store.default({ placeholder: "?" });
				await store.insert(table, {
					id: 1,
					sub: "sub_000",
					value: "v",
					digest: undefined,
				});
				const result = await store.select(table, { id: 1 });
				strictEqual(result.digest, null);
			});

			it("Should store null values", async () => {
				store.default({ placeholder: "?" });
				await store.insert(table, {
					id: 1,
					sub: "sub_000",
					value: "v",
					digest: null,
				});
				const result = await store.select(table, { id: 1 });
				strictEqual(result.digest, null);
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

			it("Should update date fields via update path", async () => {
				store.default({ placeholder: "?" });
				const ts = nowInSeconds();
				await store.insert(table, {
					id: 1,
					sub: "sub_000",
					value: "v",
				});
				await store.update(table, { id: 1 }, { verify: ts, lastused: ts });
				const result = await store.select(table, { id: 1 });
				strictEqual(result.verify, ts);
				strictEqual(result.lastused, ts);
			});

			it("Should handle expire with TTL on update path", async () => {
				store.default({ placeholder: "?" });
				const expire = nowInSeconds() + 86400;
				await store.insert(table, {
					id: 1,
					sub: "sub_000",
					value: "v",
				});
				await store.update(table, { id: 1 }, { expire });
				const result = await store.select(table, { id: 1 });
				strictEqual(result.expire, expire);
				ok(result.remove > expire);
			});
		});

		describe("count edge cases", () => {
			it("Should count all rows with empty filters", async () => {
				store.default({ placeholder: "?" });
				await store.insert(table, { id: 1, sub: "sub_000", value: "a" });
				await store.insert(table, { id: 2, sub: "sub_001", value: "b" });
				const result = await store.count(table);
				equal(result, 2);
			});

			it("Should return correct filtered count", async () => {
				store.default({ placeholder: "?" });
				await store.insert(table, {
					id: 1,
					sub: "sub_000",
					value: "a",
				});
				await store.insert(table, {
					id: 2,
					sub: "sub_000",
					value: "b",
				});
				await store.insert(table, {
					id: 3,
					sub: "sub_001",
					value: "c",
				});
				const all = await store.count(table);
				strictEqual(all, 3);
				const filtered = await store.count(table, { sub: "sub_000" });
				strictEqual(filtered, 2);
			});
		});

		describe("selectList edge cases", () => {
			it("Should return all rows with empty filters", async () => {
				store.default({ placeholder: "?" });
				await store.insert(table, { id: 1, sub: "sub_000", value: "a" });
				await store.insert(table, { id: 2, sub: "sub_001", value: "b" });
				const result = await store.selectList(table);
				equal(result.length, 2);
			});

			it("Should parse date fields in selectList results", async () => {
				store.default({ placeholder: "?" });
				const now = nowInSeconds();
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

		describe("insertList edge cases", () => {
			it("Should not mutate input rows", async () => {
				store.default({ placeholder: "?" });
				const rows = [
					{ sub: "sub_000", value: "a" },
					{ sub: "sub_001", value: "b" },
				];
				const rowsCopy = structuredClone(rows);
				await store.insertList(table, rows);
				deepStrictEqual(rows, rowsCopy);
			});
		});

		describe("updateList edge cases", () => {
			it("Should return settled results from updateList", async () => {
				store.default({ placeholder: "?" });
				await store.insertList(table, [
					{ id: 1, sub: "sub_000", value: "a" },
					{ id: 2, sub: "sub_000", value: "b" },
				]);
				const results = await store.updateList(table, [{ id: 1 }, { id: 2 }], {
					value: "z",
				});
				strictEqual(results.length, 2);
				strictEqual(results[0].status, "fulfilled");
				strictEqual(results[1].status, "fulfilled");
			});
		});

		describe("timeToLiveKey edge cases", () => {
			it("Should skip timeToLiveKey when falsy", async () => {
				store.default({ placeholder: "?", timeToLiveKey: "" });
				const expire = nowInSeconds() + 86400;
				await store.insert(table, {
					id: 1,
					sub: "sub_000",
					value: "v",
					expire,
				});
				const result = await store.select(table, { id: 1 });
				strictEqual(result.remove, null);
				store.default({ timeToLiveKey: "remove" });
			});
		});

		describe("logging", () => {
			it("Should work without logging enabled", async () => {
				store.default({ placeholder: "?", log: false });
				await store.insert(table, {
					id: 1,
					sub: "sub_000",
					value: "v",
				});
				const ex = await store.exists(table, { id: 1 });
				strictEqual(ex, "sub_000");
				const cnt = await store.count(table, { id: 1 });
				strictEqual(cnt, 1);
				const row = await store.select(table, { id: 1 });
				strictEqual(row.value, "v");
				const list = await store.selectList(table, { id: 1 });
				strictEqual(list.length, 1);
				await store.update(table, { id: 1 }, { value: "w" });
				await store.updateList(table, [{ id: 1 }], { value: "x" });
				await store.remove(table, { id: 1 });
				store.default({
					log: (...args) => mocks.log(...args),
				});
			});

			it("Should prefix log messages with the package id", async () => {
				store.default({ placeholder: "?" });
				await store.remove(table, { id: 1 });
				strictEqual(
					mocks.log.mock.calls[0].arguments[0],
					"@1auth/store-sqlite remove(",
				);
			});
		});

		describe("remove return value", () => {
			it("Should return true when a row was removed", async () => {
				store.default({ placeholder: "?" });
				await store.insert(table, { id: 1, sub: "sub_000", value: "a" });
				strictEqual(await store.remove(table, { id: 1 }), true);
			});

			it("Should return false when no row was removed", async () => {
				store.default({ placeholder: "?" });
				strictEqual(await store.remove(table, { id: 1 }), false);
			});
		});

		describe("options defaults", () => {
			it("Should default timeToLiveExpireOffset to 10 days", async () => {
				store.default({ placeholder: "?", timeToLiveKey: "remove" });
				const expire = nowInSeconds();
				await store.insert(table, {
					id: 1,
					sub: "sub_000",
					value: "a",
					expire,
				});
				const result = await store.select(table, { id: 1 });
				strictEqual(result.remove, expire + 10 * 24 * 60 * 60);
			});

			it("Should return undefined when the client yields no rows", async () => {
				store.default({
					placeholder: "?",
					client: { query: async () => undefined },
				});
				strictEqual(await store.select(table, { id: 1 }), undefined);
				strictEqual(await store.exists(table, { id: 1 }), undefined);
				store.default({
					client: { query: (...args) => mocks.storeClient.query(...args) },
				});
			});
		});
	});

	describe("removeList", () => {
		it("Should be the same function reference as remove", async () => {
			strictEqual(store.removeList, store.remove);
		});
	});

	describe("table/sqlite.js", () => {
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
			strictEqual(row.otp, null);
			strictEqual(row.create, null);
			strictEqual(row.update, null);
			strictEqual(row.verify, null);
			strictEqual(row.lastused, null);
			strictEqual(row.expire, null);
			strictEqual(row.remove, null);
		});
		it("Should create independent emptyRow instances", async () => {
			const row1 = mockDatabaseTable.emptyRow();
			const row2 = mockDatabaseTable.emptyRow();
			row1.id = 99;
			strictEqual(row2.id, 0);
		});
		it("Should have exactly 11 keys on emptyRow", async () => {
			const row = mockDatabaseTable.emptyRow();
			strictEqual(Object.keys(row).length, 11);
		});
		it("Should export correct table name", async () => {
			strictEqual(mockDatabaseTable.name, "test");
		});
		it("Should export correct timeToLiveKey", async () => {
			strictEqual(mockDatabaseTable.timeToLiveKey, "remove");
		});
		it("Should create/truncate/drop table with explicit name", async () => {
			const tmpTable = "test_table_ops";
			await mockDatabaseTable.create(mocks.storeClient, tmpTable);
			await store.insert(tmpTable, { id: 1, sub: "s", value: "v" });
			const before = await store.count(tmpTable);
			strictEqual(before, 1);
			await mockDatabaseTable.truncate(mocks.storeClient, tmpTable);
			const after = await store.count(tmpTable);
			strictEqual(after, 0);
			await mockDatabaseTable.drop(mocks.storeClient, tmpTable);
		});
		it("Should create/truncate/drop table with default name", async () => {
			await mockDatabaseTable.create(mocks.storeClient);
			await store.insert(mockDatabaseTable.name, {
				id: 1,
				sub: "s",
				value: "v",
			});
			await mockDatabaseTable.truncate(mocks.storeClient);
			const cnt = await store.count(mockDatabaseTable.name);
			strictEqual(cnt, 0);
			await mockDatabaseTable.drop(mocks.storeClient);
			await mockDatabaseTable.create(mocks.storeClient);
		});
	});
});
