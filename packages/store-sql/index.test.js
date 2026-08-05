import { deepStrictEqual, equal, strictEqual } from "node:assert/strict";
import { describe, it } from "node:test";
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
import * as mockDatabaseTable from "./table/sql.js";

store.default({
	log: (...args) => mocks.log(...args),
	client: { query: (...args) => mocks.storeClient.query(...args) },
});

const mocks = { ...mockDatabase, id: "sql", table: mockDatabaseTable };

const nowInSeconds = () => Math.floor(Date.now() / 1000);

// Swap in a client that records the SQL it is handed and replays a canned
// result, so the exact statement and the defensive reads around it are assertable.
const withClient = async (result, fn) => {
	const seen = [];
	store.default({
		client: {
			query: async (sql, parameters) => {
				seen.push({ sql, parameters });
				return typeof result === "function" ? result(sql) : result;
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

describe("store-sql", () => {
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
				(await withClient(undefined, () => store.exists("test", { id: 1 })))
					.returned,
				undefined,
			);
			strictEqual(
				(await withClient(undefined, () => store.select("test", { id: 1 })))
					.returned,
				undefined,
			);
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
	describe("option defaults", () => {
		it("Should default timeToLiveExpireOffset to 10 days", async () => {
			const expire = nowInSeconds();
			const { seen } = await withClient([{ id: 1 }], () =>
				store.insert("test", { id: 1, expire }),
			);
			const [, expireParam, removeParam] = seen[0].parameters;
			strictEqual(
				(Date.parse(removeParam) - Date.parse(expireParam)) / 1000,
				10 * 24 * 60 * 60,
			);
		});
	});
	describe("getPlaceholder", () => {
		it("Should read the configured placeholder", async () => {
			store.default({ placeholder: "?" });
			equal(store.getPlaceholder(1), "?");
			store.default({ placeholder: "$" });
			equal(store.getPlaceholder(3), "$3");
			store.default({ placeholder: "?" });
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
});
