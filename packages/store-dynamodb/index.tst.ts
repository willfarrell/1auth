/// <reference types="node" />

import type { DynamoDBStoreOptions, Row } from "@1auth/store-dynamodb";
import configure, {
	exists,
	insert,
	insertList,
	makeQueryParams,
	remove,
	removeList,
	select,
	selectList,
	update,
} from "@1auth/store-dynamodb";
import * as table from "@1auth/store-dynamodb/table/dynamodb.js";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { describe, expect, test } from "tstyche";

describe("configure", () => {
	test("takes partial options with a DynamoDBClient", () => {
		expect(
			configure({ client: new DynamoDBClient(), randomId: () => "id_1" }),
		).type.toBe<void>();
		expect(configure()).type.toBe<void>();
		expect(configure).type.not.toBeCallableWith({ client: "dynamodb" });
	});

	test("options", () => {
		expect<DynamoDBStoreOptions["client"]>().type.toBe<DynamoDBClient>();
		expect<DynamoDBStoreOptions["timeToLiveKey"]>().type.toBe<string>();
	});
});

describe("store", () => {
	test("reads", () => {
		expect(exists("test", { sub: "sub_1" })).type.toBe<
			Promise<string | undefined>
		>();
		expect(select("test", { sub: "sub_1", id: "1" })).type.toBe<
			Promise<Row | undefined>
		>();
		expect(selectList("test", { digest: "d" }, ["sub"])).type.toBe<
			Promise<Row[]>
		>();
	});

	test("writes", () => {
		expect(insert("test", { sub: "sub_1", id: "1" })).type.toBe<
			Promise<unknown>
		>();
		expect(insertList("test", [{ sub: "sub_1", id: "1" }])).type.toBe<
			Promise<unknown[]>
		>();
		expect(update("test", { sub: "sub_1", id: "1" }, { value: "x" })).type.toBe<
			Promise<void>
		>();
		expect(remove("test", { sub: "sub_1", id: "1" })).type.toBe<
			Promise<boolean>
		>();
		expect(removeList("test", { sub: "sub_1", id: ["1"] })).type.toBe<
			Promise<void>
		>();
	});

	test("makeQueryParams", () => {
		expect(
			makeQueryParams({ sub: "sub_1" }).KeyConditionExpression,
		).type.toBe<string>();
	});
});

describe("table/dynamodb.js", () => {
	test("table helpers take a DynamoDBClient", () => {
		const client = new DynamoDBClient();
		expect(table.create(client)).type.toBe<Promise<void>>();
		expect(table.createTyped(client, table.typedName)).type.toBe<
			Promise<void>
		>();
		expect(table.truncate(client)).type.toBe<Promise<void>>();
		expect(table.drop(client, "test")).type.toBe<Promise<void>>();
		expect(table.emptyRow()).type.toBe<Record<string, unknown>>();
		expect(table.create).type.not.toBeCallableWith({ query: () => {} });
	});
});
