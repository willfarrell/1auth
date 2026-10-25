/// <reference types="node" />

import type { Row } from "@1auth/store-postgres";
import configure, {
	getPlaceholder,
	insert,
	log,
	makeSqlParts,
	makeSqlPartsFor,
	update,
} from "@1auth/store-postgres";
import * as table from "@1auth/store-postgres/table/postgres.js";
import type * as storeSql from "@1auth/store-sql";
import type { SqlParts } from "@1auth/store-sql";
import { describe, expect, test } from "tstyche";

describe("store", () => {
	test("configure takes a pg-shaped client", () => {
		expect(
			configure({ client: { query: async () => ({ rows: [] }) } }),
		).type.toBe<void>();
		expect(configure).type.not.toBeCallableWith("client");
	});

	test("same signatures as @1auth/store-sql", () => {
		expect(insert).type.toBe<typeof storeSql.insert>();
		expect(log).type.toBe<typeof storeSql.log>();
		expect(makeSqlPartsFor).type.toBe<typeof storeSql.makeSqlPartsFor>();
	});

	test("reads and writes", () => {
		expect(update("test", { id: "1" }, { value: "x" })).type.toBe<
			Promise<void>
		>();
		expect(getPlaceholder(1)).type.toBe<string>();
		expect(
			makeSqlParts({ sub: "sub_1" }, { value: "x" }),
		).type.toBe<SqlParts>();
		expect(insert("test", { sub: "sub_1" } as Row)).type.toBe<
			Promise<unknown>
		>();
	});
});

describe("table/postgres.js", () => {
	test("table helpers take a client with query", () => {
		const client = { query: async (sql: string) => ({ rows: [], sql }) };
		expect(table.name).type.toBe<string>();
		expect(table.create(client)).type.toBe<Promise<unknown>>();
		expect(table.truncate(client)).type.toBe<Promise<unknown>>();
		expect(table.emptyRow()).type.toBe<Record<string, unknown>>();
	});
});
