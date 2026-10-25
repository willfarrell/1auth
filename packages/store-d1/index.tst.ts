/// <reference types="node" />

import type { Row } from "@1auth/store-d1";
import configure, {
	exists,
	getPlaceholder,
	insert,
	makeValues,
	remove,
	select,
	selectList,
	update,
} from "@1auth/store-d1";
import * as table from "@1auth/store-d1/table/d1.js";
import type * as storeSql from "@1auth/store-sql";
import { describe, expect, test } from "tstyche";

describe("store", () => {
	test("configure takes a client", () => {
		expect(configure({ client: {} })).type.toBe<void>();
		expect(configure).type.not.toBeCallableWith({ placeholder: 1 });
	});

	test("same signatures as @1auth/store-sql", () => {
		expect(exists).type.toBe<typeof storeSql.exists>();
		expect(select).type.toBe<typeof storeSql.select>();
		expect(update).type.toBe<typeof storeSql.update>();
		expect(makeValues).type.toBe<typeof storeSql.makeValues>();
	});

	test("reads and writes", () => {
		expect(select("test", { sub: "sub_1" })).type.toBe<
			Promise<Row | undefined>
		>();
		expect(selectList("test")).type.toBe<Promise<Row[]>>();
		expect(insert("test", { sub: "sub_1" })).type.toBe<Promise<unknown>>();
		expect(remove("test", { id: "1" })).type.toBe<Promise<boolean>>();
		expect(getPlaceholder(2)).type.toBe<string>();
	});
});

describe("table/d1.js", () => {
	test("table helpers take a D1 database", () => {
		const client = { prepare: (sql: string) => ({ run: async () => sql }) };
		expect(table.create(client)).type.toBe<Promise<unknown>>();
		expect(table.truncate(client)).type.toBe<Promise<unknown>>();
		expect(table.drop(client, "test")).type.toBe<Promise<unknown>>();
		expect(table.emptyRow()).type.toBe<Record<string, unknown>>();
		expect(table.create).type.not.toBeCallableWith({ query: () => {} });
	});
});
