/// <reference types="node" />

import type {
	AuthnOptions,
	Credential,
	CredentialOptions,
	Notify,
	Row,
	Store,
} from "@1auth/authn";
import configure, {
	authenticate,
	count,
	create,
	createList,
	expire,
	getOptions,
	list,
	makeType,
	randomId,
	remove,
	removeList,
	select,
	subject,
	update,
	verify,
	verifySecret,
} from "@1auth/authn";
import * as dynamodbTable from "@1auth/authn/table/dynamodb.js";
import * as sqlTable from "@1auth/authn/table/sql.js";
import type { RandomConfigObject } from "@1auth/crypto";
import { makeRandomConfigObject } from "@1auth/crypto";
import * as notify from "@1auth/notify";
import * as storeDynamoDB from "@1auth/store-dynamodb";
import * as storeSqlite from "@1auth/store-sqlite";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { describe, expect, test } from "tstyche";

declare const credentialOptions: CredentialOptions;

describe("contracts", () => {
	test("store and notify modules", () => {
		expect(storeDynamoDB).type.toBeAssignableTo<Store>();
		expect(storeSqlite).type.toBeAssignableTo<Store>();
		expect(notify).type.toBeAssignableTo<Notify>();
	});

	test("CredentialOptions needs encode, decode and verify", () => {
		expect(
			makeRandomConfigObject(),
		).type.not.toBeAssignableTo<CredentialOptions>();
		expect({
			...makeRandomConfigObject({ id: "x", type: "secret" }),
			encode: (value: string) => value,
			decode: (value: string) => value,
			verify: async (input: string, value: string) => input === value,
		}).type.toBeAssignableTo<CredentialOptions>();
	});
});

describe("configure", () => {
	test("takes partial options", () => {
		expect(
			configure({
				store: storeSqlite,
				notify,
				usernameExists: [async (username: string) => username],
				authenticationDuration: 500,
			}),
		).type.toBe<void>();
		expect(configure).type.not.toBeCallableWith({ usernameExists: "x" });
	});

	test("getOptions and randomId", () => {
		expect(getOptions()).type.toBe<AuthnOptions>();
		expect(randomId()).type.toBe<RandomConfigObject>();
	});
});

describe("credentials", () => {
	test("reads", () => {
		expect(count(credentialOptions, "sub_1")).type.toBe<Promise<number>>();
		expect(list(credentialOptions, "sub_1")).type.toBe<Promise<Row[]>>();
		expect(
			list(credentialOptions, "sub_1", { sourceId: "s" }, ["id"]),
		).type.toBe<Promise<Row[]>>();
		expect(select(credentialOptions, "sub_1", "authn_1")).type.toBe<
			Promise<Row | undefined>
		>();
		expect(subject("username")).type.toBe<Promise<string | undefined>>();
		expect(makeType(credentialOptions)).type.toBe<string>();
		expect(makeType({ id: "accessToken", type: "secret" })).type.toBe<string>();
	});

	test("create", () => {
		expect(create(credentialOptions, "sub_1", { value: "x" })).type.toBe<
			Promise<Credential>
		>();
		expect(createList(credentialOptions, "sub_1", [{}])).type.toBe<
			Promise<string[]>
		>();
	});

	test("authenticate and verify", () => {
		expect(authenticate(credentialOptions, "username", "secret")).type.toBe<
			Promise<string>
		>();
		expect(
			authenticate(credentialOptions, "username", {}, { requestHash: "h" }),
		).type.toBe<Promise<string>>();
		expect(verify(credentialOptions, "sub_1", "123456")).type.toBe<
			Promise<Row>
		>();
		expect(verifySecret(credentialOptions, "sub_1", "authn_1")).type.toBe<
			Promise<void>
		>();
	});

	test("writes", () => {
		expect(
			update(credentialOptions, { id: "authn_1", sub: "sub_1", value: {} }),
		).type.toBe<Promise<void>>();
		expect(update).type.not.toBeCallableWith(credentialOptions, { id: "1" });
		expect(expire(credentialOptions, "sub_1", "authn_1")).type.toBe<
			Promise<void>
		>();
		expect(remove(credentialOptions, "sub_1", "authn_1")).type.toBe<
			Promise<boolean>
		>();
		expect(removeList(credentialOptions, "sub_1", ["authn_1"])).type.toBe<
			Promise<void>
		>();
		expect(removeList).type.not.toBeCallableWith(
			credentialOptions,
			"sub_1",
			"authn_1",
		);
	});
});

describe("tables", () => {
	test("sql and dynamodb tables", () => {
		expect(sqlTable.timeToLiveKey).type.toBe<string>();
		expect(sqlTable.drop({ query: async () => [] })).type.toBe<
			Promise<unknown>
		>();
		expect(dynamodbTable.truncate(new DynamoDBClient())).type.toBe<
			Promise<void>
		>();
	});
});
