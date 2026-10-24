/// <reference types="node" />

import type * as storeSql from "@1auth/store-sql";
import type { Row } from "@1auth/store-sqlite";
import configure, {
	exists,
	insertList,
	normalizeValues,
	removeList,
	select,
	selectList,
} from "@1auth/store-sqlite";
import * as table from "@1auth/store-sqlite/table/sqlite.js";
import { describe, expect, test } from "tstyche";

describe("store", () => {
	test("configure takes a client", () => {
		expect(
			configure({ client: { query: async () => [] }, log: false }),
		).type.toBe<void>();
		expect(configure).type.not.toBeCallableWith({
			timeToLiveExpireOffset: "1",
		});
	});

	test("same signatures as @1auth/store-sql", () => {
		expect(exists).type.toBe<typeof storeSql.exists>();
		expect(selectList).type.toBe<typeof storeSql.selectList>();
		expect(normalizeValues).type.toBe<typeof storeSql.normalizeValues>();
	});

	test("reads and writes", () => {
		expect(select("test", { sub: "sub_1" }, ["value"])).type.toBe<
			Promise<Row | undefined>
		>();
		expect(insertList("test", [])).type.toBe<Promise<Row[]>>();
		expect(removeList("test", { id: ["1", "2"] })).type.toBe<
			Promise<boolean>
		>();
	});
});

describe("table/sqlite.js", () => {
	test("table helpers take a client with query", () => {
		const client = { query: async (sql: string) => [sql] };
		expect(table.timeToLiveKey).type.toBe<string>();
		expect(table.create(client, "test")).type.toBe<Promise<unknown>>();
		expect(table.emptyRow()).type.toBe<Record<string, unknown>>();
		expect(table.drop).type.not.toBeCallableWith();
	});
});
