/// <reference types="node" />

import type {
	AccountOptions,
	IdGenerator,
	Notify,
	Row,
	Store,
} from "@1auth/account";
import configure, {
	create,
	exists,
	expire,
	getOptions,
	lookup,
	randomId,
	randomSubject,
	remove,
	update,
	updateIdentifier,
} from "@1auth/account";
import * as dynamodbTable from "@1auth/account/table/dynamodb.js";
import * as sqlTable from "@1auth/account/table/sql.js";
import type { RandomConfigObject } from "@1auth/crypto";
import * as notify from "@1auth/notify";
import * as notifySqs from "@1auth/notify-sqs";
import * as storeD1 from "@1auth/store-d1";
import * as storeDynamoDB from "@1auth/store-dynamodb";
import * as storePostgres from "@1auth/store-postgres";
import * as storeSqlite from "@1auth/store-sqlite";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { describe, expect, test } from "tstyche";

describe("contracts", () => {
	test("every store module is a Store", () => {
		expect(storeDynamoDB).type.toBeAssignableTo<Store>();
		expect(storeSqlite).type.toBeAssignableTo<Store>();
		expect(storePostgres).type.toBeAssignableTo<Store>();
		expect(storeD1).type.toBeAssignableTo<Store>();
		expect({}).type.not.toBeAssignableTo<Store>();
	});

	test("every notify module is a Notify", () => {
		expect(notify).type.toBeAssignableTo<Notify>();
		expect(notifySqs).type.toBeAssignableTo<Notify>();
	});
});

describe("configure", () => {
	test("takes a store and notify module", () => {
		expect(configure({ store: storeSqlite, notify })).type.toBe<void>();
		expect(
			configure({ encryptedFields: ["name"], removeExpireOffset: 60 }),
		).type.toBe<void>();
		expect(configure).type.not.toBeCallableWith({ store: {} });
	});

	test("getOptions returns AccountOptions", () => {
		expect(getOptions()).type.toBe<AccountOptions>();
	});

	test("id generators", () => {
		expect(randomId()).type.toBe<RandomConfigObject>();
		expect(
			randomSubject({ prefix: "s_", entropy: 128 }),
		).type.toBe<RandomConfigObject>();
		expect(randomId()).type.toBeAssignableTo<IdGenerator>();
	});
});

describe("account", () => {
	test("reads", () => {
		expect(exists("sub_1")).type.toBe<Promise<string | undefined>>();
		expect(lookup("sub_1")).type.toBe<Promise<Row>>();
	});

	test("writes", () => {
		expect(create()).type.toBe<Promise<string>>();
		expect(create({ name: "x" })).type.toBe<Promise<string>>();
		expect(update("sub_1", { name: "x" })).type.toBe<Promise<void>>();
		expect(
			updateIdentifier("sub_1", { value: "username", digest: "sha3-384:x" }),
		).type.toBe<Promise<void>>();
		expect(expire("sub_1")).type.toBe<Promise<void>>();
		expect(remove("sub_1")).type.toBe<Promise<void>>();
		expect(remove).type.not.toBeCallableWith();
	});
});

describe("tables", () => {
	test("sql and dynamodb tables", () => {
		expect(sqlTable.name).type.toBe<string>();
		expect(sqlTable.create({ query: async () => [] })).type.toBe<
			Promise<unknown>
		>();
		expect(dynamodbTable.create(new DynamoDBClient())).type.toBe<
			Promise<void>
		>();
		expect(dynamodbTable.create).type.not.toBeCallableWith({
			query: async () => [],
		});
	});
});
