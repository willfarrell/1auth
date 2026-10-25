/// <reference types="node" />

import type { RandomConfigObject } from "@1auth/crypto";
import * as notify from "@1auth/notify";
import type {
	CreatedSession,
	Notify,
	RotatedSession,
	Row,
	SessionOptions,
	Store,
} from "@1auth/session";
import configure, {
	check,
	create,
	expire,
	getOptions,
	list,
	lookup,
	randomId,
	randomSessionId,
	remove,
	rotate,
	select,
	selectBinding,
	sign,
	verify,
} from "@1auth/session";
import * as dynamodbTable from "@1auth/session/table/dynamodb.js";
import * as sqlTable from "@1auth/session/table/sql.js";
import * as storePostgres from "@1auth/store-postgres";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { describe, expect, test } from "tstyche";

describe("configure", () => {
	test("takes partial options", () => {
		expect(
			configure({
				store: storePostgres,
				notify,
				expire: 60 * 60,
				idleExpire: false,
				limit: 5,
			}),
		).type.toBe<void>();
		expect(
			configure({
				encode: (value: { ip: string }) => JSON.stringify(value),
				decode: (value: string) => JSON.parse(value),
			}),
		).type.toBe<void>();
		expect(configure).type.not.toBeCallableWith({ limit: "5" });
		expect(storePostgres).type.toBeAssignableTo<Store>();
		expect(notify).type.toBeAssignableTo<Notify>();
	});

	test("getOptions and factories", () => {
		expect(getOptions()).type.toBe<SessionOptions>();
		expect(randomId()).type.toBe<RandomConfigObject>();
		expect(randomSessionId({ entropy: 256 })).type.toBe<RandomConfigObject>();
	});
});

describe("session", () => {
	test("create returns the sid once", () => {
		const session = create("sub_1", { os: "macOS", browser: "Firefox" });
		expect(session).type.toBe<Promise<CreatedSession>>();
		expect(create).type.not.toBeCallableWith("sub_1");
	});

	test("rotate keeps the row", () => {
		expect(rotate("sub_1", "session_1", { os: "macOS" })).type.toBe<
			Promise<RotatedSession>
		>();
		expect<RotatedSession["sid"]>().type.toBe<string>();
	});

	test("reads", () => {
		expect(lookup("sid_1")).type.toBe<Promise<Row | undefined>>();
		expect(lookup("sid_1", { os: "macOS" })).type.toBe<
			Promise<Row | undefined>
		>();
		expect(select("sub_1", "session_1")).type.toBe<Promise<Row | undefined>>();
		expect(selectBinding("session_1")).type.toBe<Promise<Row | undefined>>();
		expect(list("sub_1")).type.toBe<Promise<Row[]>>();
	});

	test("writes", () => {
		expect(check("sub_1", { os: "macOS" })).type.toBe<Promise<void>>();
		expect(expire("sub_1", "session_1")).type.toBe<Promise<void>>();
		expect(remove("sub_1", "session_1")).type.toBe<Promise<void>>();
	});

	test("sign and verify", () => {
		expect(sign("sid_1")).type.toBe<string>();
		expect(verify("sid_1.sig")).type.toBe<string | false>();
	});
});

describe("tables", () => {
	test("dynamodb create takes the dbsc option", () => {
		const client = new DynamoDBClient();
		expect(dynamodbTable.create(client)).type.toBe<Promise<void>>();
		expect(dynamodbTable.create(client, "sessions", { dbsc: false })).type.toBe<
			Promise<void>
		>();
		expect(dynamodbTable.create).type.not.toBeCallableWith(client, "sessions", {
			dbsc: "no",
		});
		expect(sqlTable.create({ query: async () => [] })).type.toBe<
			Promise<unknown>
		>();
	});
});
