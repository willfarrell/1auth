/// <reference types="node" />

import type { Row, SqlParts, SqlStore } from "@1auth/store-sql";
import configure, {
	createSqlStore,
	exists,
	getPlaceholder,
	getPlaceholderFor,
	insert,
	insertList,
	makeInsertList,
	makeSqlParts,
	makeSqlPartsFor,
	makeValues,
	normalizeValues,
	parseValues,
	remove,
	removeList,
	select,
	selectList,
	update,
	withTimeToLive,
} from "@1auth/store-sql";
import * as table from "@1auth/store-sql/table/sql.js";
import { describe, expect, test } from "tstyche";

describe("createSqlStore", () => {
	test("returns a SqlStore", () => {
		expect(createSqlStore({ id: "sqlite" })).type.toBe<SqlStore>();
		expect(
			createSqlStore({
				id: "d1",
				placeholder: "$",
				query: async (client, sql, parameters) =>
					client
						.prepare(sql)
						.bind(...parameters)
						.all(),
			}),
		).type.toBe<SqlStore>();
		expect(createSqlStore).type.not.toBeCallableWith();
	});
});

describe("default store", () => {
	test("configure takes partial options", () => {
		expect(configure({ client: {}, log: console.log })).type.toBe<void>();
		expect(configure()).type.toBe<void>();
		expect(configure).type.not.toBeCallableWith({ timeToLiveKey: 1 });
	});

	test("reads", () => {
		expect(exists("accounts", { sub: "sub_1" })).type.toBe<
			Promise<string | undefined>
		>();
		expect(select("accounts", { sub: "sub_1" }, ["sub"])).type.toBe<
			Promise<Row | undefined>
		>();
		expect(selectList("accounts", { sub: ["sub_1", "sub_2"] })).type.toBe<
			Promise<Row[]>
		>();
	});

	test("writes", () => {
		expect(insert("accounts", { sub: "sub_1" })).type.toBe<Promise<unknown>>();
		expect(insertList("accounts", [{ sub: "sub_1" }])).type.toBe<
			Promise<Row[]>
		>();
		expect(update("accounts", { sub: "sub_1" }, { value: 1 })).type.toBe<
			Promise<void>
		>();
		expect(remove("accounts", { sub: "sub_1" })).type.toBe<Promise<boolean>>();
		expect(removeList("accounts", { sub: "sub_1" })).type.toBe<
			Promise<boolean>
		>();
	});

	test("sql builders", () => {
		expect(getPlaceholder(1)).type.toBe<string>();
		expect(makeSqlParts({ sub: "sub_1" })).type.toBe<SqlParts>();
	});
});

describe("builders", () => {
	test("placeholders and parts", () => {
		expect(getPlaceholderFor("$", 1)).type.toBe<string>();
		expect(
			makeSqlPartsFor("?", { sub: "sub_1" }, {}, [], 1),
		).type.toBe<SqlParts>();
		expect(makeInsertList("?", [{ sub: "sub_1" }])).type.toBe<{
			insert: string;
			parameters: unknown[];
		}>();
	});

	test("value transforms", () => {
		const options = { timeToLiveKey: "remove", timeToLiveExpireOffset: 10 };
		expect(withTimeToLive({ expire: 1 }, options)).type.toBe<{
			expire: number;
		}>();
		expect(makeValues({ expire: 1 }, options)).type.toBe<Row>();
		expect(normalizeValues({ create: 1 })).type.toBe<void>();
		expect(parseValues(undefined)).type.toBe<void>();
	});
});

describe("table/sql.js", () => {
	test("table helpers take a client with query", () => {
		const client = { query: async (sql: string) => [sql] };
		expect(table.name).type.toBe<string>();
		expect(table.create(client)).type.toBe<Promise<unknown>>();
		expect(table.truncate(client, "test")).type.toBe<Promise<unknown>>();
		expect(table.drop(client)).type.toBe<Promise<unknown>>();
		expect(table.emptyRow()).type.toBe<Record<string, unknown>>();
		expect(table.create).type.not.toBeCallableWith({});
	});
});
