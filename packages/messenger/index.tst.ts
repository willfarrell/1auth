/// <reference types="node" />

import type { CredentialOptions } from "@1auth/authn";
import type { RandomConfigObject } from "@1auth/crypto";
import type { MessengerOptions, Row, Store } from "@1auth/messenger";
import configure, {
	count,
	create,
	createToken,
	exists,
	getOptions,
	list,
	lookup,
	randomId,
	remove,
	select,
	token,
	verifyToken,
} from "@1auth/messenger";
import * as dynamodbTable from "@1auth/messenger/table/dynamodb.js";
import * as sqlTable from "@1auth/messenger/table/sql.js";
import * as notify from "@1auth/notify";
import * as storeDynamoDB from "@1auth/store-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { describe, expect, test } from "tstyche";

describe("configure", () => {
	test("takes partial options", () => {
		expect(configure({ store: storeDynamoDB, notify })).type.toBe<void>();
		expect(configure({ token: token({ expire: 300 }) })).type.toBe<void>();
		expect(configure).type.not.toBeCallableWith({ token: randomId() });
		expect(storeDynamoDB).type.toBeAssignableTo<Store>();
	});

	test("getOptions and factories", () => {
		expect(getOptions()).type.toBe<MessengerOptions>();
		expect(randomId()).type.toBe<RandomConfigObject>();
		expect(token()).type.toBe<CredentialOptions>();
	});
});

describe("messenger", () => {
	test("reads", () => {
		expect(exists("emailAddress", "a@example.com")).type.toBe<
			Promise<string | undefined>
		>();
		expect(count("emailAddress", "sub_1")).type.toBe<Promise<number>>();
		expect(lookup("emailAddress", "a@example.com")).type.toBe<
			Promise<Row | undefined>
		>();
		expect(list("emailAddress", "sub_1")).type.toBe<Promise<Row[]>>();
		expect(select("emailAddress", "sub_1", "messenger_1")).type.toBe<
			Promise<Row | undefined>
		>();
	});

	test("create needs a digest", () => {
		expect(
			create("emailAddress", "sub_1", { value: "a@example.com", digest: "d" }),
		).type.toBe<Promise<string | undefined>>();
		expect(create).type.not.toBeCallableWith("emailAddress", "sub_1", {
			value: "a@example.com",
		});
	});

	test("tokens and remove", () => {
		expect(createToken("emailAddress", "sub_1", "messenger_1")).type.toBe<
			Promise<string>
		>();
		expect(
			verifyToken("emailAddress", "sub_1", "123456", "messenger_1"),
		).type.toBe<Promise<void>>();
		expect(remove("emailAddress", "sub_1", "messenger_1")).type.toBe<
			Promise<void>
		>();
	});
});

describe("tables", () => {
	test("sql and dynamodb tables", () => {
		expect(sqlTable.name).type.toBe<string>();
		expect(sqlTable.truncate({ query: async () => [] })).type.toBe<
			Promise<unknown>
		>();
		expect(dynamodbTable.drop(new DynamoDBClient())).type.toBe<Promise<void>>();
	});
});
