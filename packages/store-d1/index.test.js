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
import * as mockDatabaseTable from "./table/d1.js";

store.default({
	log: (...args) => mocks.log(...args),
	client: mockDatabase.storeClient,
});

const mocks = {
	...mockDatabase,
	id: "d1",
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

// Swap in a binding client that records the SQL it is handed and replays a canned
// result, so the exact statement and the defensive reads around it are assertable.
const withClient = async (result, fn) => {
	const seen = [];
	store.default({
		client: {
			prepare: (sql) => ({
				bind: (...parameters) => {
					seen.push({ sql, parameters });
					return {
						first: async () => result?.[0],
						all: async () => ({ results: result ?? [] }),
						run: async () => ({}),
					};
				},
			}),
		},
	});
	try {
		return { seen, returned: await fn() };
	} finally {
		store.default({ client: mockDatabase.storeClient });
	}
};

describe("store-d1", () => {
	tests(store, mocks);
	describe("generated sql", () => {
		it("Should select only sub in exists", async () => {
			const { seen } = await withClient([], () =>
				store.exists("test", { id: 1 }),
			);
			equal(seen[0].sql, 'SELECT "sub" FROM test WHERE "id" = ? LIMIT 1');
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
		it("Should return generated id when no id provided in insert", async () => {
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
		it("Should generate an id when id is undefined", async () => {
			const id = await store.insert(table, {
				id: undefined,
				sub: "sub_undef",
				value: "v",
			});
			strictEqual(typeof id, "number");
			ok(id > 0);
			await mockDatabaseTable.truncate(mockDatabase.storeClient, table);
		});
		it("Should generate an id when id is null", async () => {
			const id = await store.insert(table, {
				id: null,
				sub: "sub_null_id",
				value: "v",
			});
			strictEqual(typeof id, "number");
			ok(id > 0);
			await mockDatabaseTable.truncate(mockDatabase.storeClient, table);
		});
		it("Should insert multiple rows in insertList", async () => {
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
	describe("remove return value", () => {
		it("Should return true when a row was removed", async () => {
			await store.insert(table, { id: 1, sub: "sub_rm", value: "a" });
			strictEqual(await store.remove(table, { id: 1 }), true);
		});

		it("Should return false when no row was removed", async () => {
			strictEqual(await store.remove(table, { id: 404 }), false);
		});
	});
	describe("options defaults", () => {
		it("Should prefix log messages with the package id", async () => {
			await store.remove(table, { id: 404 });
			strictEqual(
				mocks.log.mock.calls[0].arguments[0],
				"@1auth/store-d1 remove(",
			);
		});

		it("Should default timeToLiveExpireOffset to 10 days", async () => {
			const expire = nowInSeconds();
			await store.insert(table, { id: 7, sub: "sub_ttl", value: "a", expire });
			const result = await store.select(table, { id: 7 });
			strictEqual(result.remove, expire + 10 * 24 * 60 * 60);
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
