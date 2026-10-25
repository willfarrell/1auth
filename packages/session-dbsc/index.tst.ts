/// <reference types="node" />

import type { RotatedSession, Row } from "@1auth/session";
import type { DbscOptions, DbscSessionConfig } from "@1auth/session-dbsc";
import configure, {
	boundToken,
	boundTokenVerify,
	challenge,
	challengeHeader,
	dbscCookieHeader,
	expire,
	getOptions,
	list,
	lookup,
	refresh,
	register,
	registrationHeader,
	remove,
	select,
	sidCookieHeader,
	terminate,
	verifyProof,
} from "@1auth/session-dbsc";
import * as dynamodbTable from "@1auth/session-dbsc/table/dynamodb.js";
import * as sqlTable from "@1auth/session-dbsc/table/sql.js";
import * as storeSqlite from "@1auth/store-sqlite";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { describe, expect, test } from "tstyche";

describe("configure", () => {
	test("takes its own options and @1auth/session's", () => {
		expect(
			configure({
				require: true,
				dbscCookieExpire: 60,
				scope: { include_site: false },
				store: storeSqlite,
				expire: 60 * 60,
			}),
		).type.toBe<void>();
		expect(configure).type.not.toBeCallableWith({ require: "yes" });
		expect(configure).type.not.toBeCallableWith({ limit: "5" });
		expect(getOptions()).type.toBe<DbscOptions>();
	});
});

describe("headers and cookies", () => {
	test("return strings", () => {
		expect(challenge()).type.toBe<string>();
		expect(boundToken("session_1")).type.toBe<string>();
		expect(boundTokenVerify("token", "session_1")).type.toBe<boolean>();
		expect(registrationHeader()).type.toBe<string>();
		expect(registrationHeader({ authorization: "code" })).type.toBe<string>();
		expect(challengeHeader("session_1")).type.toBe<string>();
		expect(sidCookieHeader("sid_1")).type.toBe<string>();
		expect(dbscCookieHeader("token")).type.toBe<string>();
		expect(terminate("session_1")).type.toBe<{
			session_identifier: string;
			continue: false;
		}>();
	});
});

describe("binding", () => {
	test("verifyProof", () => {
		expect(
			verifyProof("a.b.c", { aud: "https://example.com/dbsc/register" }),
		).type.toBe<Promise<{ publicKey: string; payload: Record<string, any> }>>();
	});

	test("register and refresh", () => {
		expect(
			register("sid_1", "a.b.c", { aud: "https://example.com/dbsc/register" }),
		).type.toBe<
			Promise<{
				id: string;
				session: RotatedSession;
				bound: string;
				config: DbscSessionConfig;
			}>
		>();
		expect(
			refresh("session_1", "a.b.c", {
				aud: "https://example.com/dbsc/refresh",
			}),
		).type.toBe<
			Promise<{ id: string; bound: string; config: DbscSessionConfig }>
		>();
		expect(refresh).type.not.toBeCallableWith("session_1");
	});

	test("session passthroughs", () => {
		expect(lookup("sid_1", undefined)).type.toBe<Promise<Row | undefined>>();
		expect(lookup("sid_1", "bound", { os: "macOS" })).type.toBe<
			Promise<Row | undefined>
		>();
		expect(select("sub_1", "session_1")).type.toBe<Promise<Row | undefined>>();
		expect(list("sub_1")).type.toBe<Promise<Row[]>>();
		expect(expire("sub_1", "session_1")).type.toBe<Promise<void>>();
		expect(remove("sub_1", "session_1")).type.toBe<Promise<void>>();
	});
});

describe("tables", () => {
	test("challenge tables", () => {
		expect(sqlTable.name).type.toBe<string>();
		expect(sqlTable.create({ query: async () => [] })).type.toBe<
			Promise<unknown>
		>();
		expect(dynamodbTable.create(new DynamoDBClient())).type.toBe<
			Promise<void>
		>();
	});
});
