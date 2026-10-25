/// <reference types="node" />

import type { CredentialOptions, Row } from "@1auth/authn";
import configure, {
	authenticate,
	count,
	create,
	exists,
	expire,
	list,
	lookup,
	remove,
	secret,
	select,
	username,
} from "@1auth/authn-access-token";
import type { RandomConfigObject } from "@1auth/crypto";
import { describe, expect, test } from "tstyche";

describe("configure", () => {
	test("takes partial options", () => {
		expect(
			configure({ notifyId: "pat", secret: secret({ expire: 60 }) }),
		).type.toBe<void>();
		expect(
			configure({ username: username({ prefix: "tok-" }) }),
		).type.toBe<void>();
		expect(configure).type.not.toBeCallableWith({ secret: username() });
	});

	test("username and secret factories", () => {
		expect(username()).type.toBe<RandomConfigObject>();
		expect(secret()).type.toBe<CredentialOptions>();
		expect(secret({ entropy: 256 })).type.toBe<CredentialOptions>();
	});
});

describe("access token", () => {
	test("create returns the plain text token once", () => {
		expect(create("sub_1")).type.toBe<
			Promise<{ id: string; username: string; secret: string }>
		>();
		expect(create("sub_1", { name: "ci" })).type.toBe<
			Promise<{ id: string; username: string; secret: string }>
		>();
	});

	test("reads", () => {
		expect(authenticate("pat-u", "pat-s")).type.toBe<Promise<string>>();
		expect(exists("pat-u")).type.toBe<Promise<string | undefined>>();
		expect(count("sub_1")).type.toBe<Promise<number>>();
		expect(lookup("pat-u")).type.toBe<Promise<Row | undefined>>();
		expect(select("sub_1", "authn_1")).type.toBe<Promise<Row | undefined>>();
		expect(list("sub_1")).type.toBe<Promise<Row[]>>();
	});

	test("writes", () => {
		expect(expire("sub_1", "authn_1")).type.toBe<Promise<void>>();
		expect(remove("sub_1", "authn_1")).type.toBe<Promise<void>>();
		expect(remove).type.not.toBeCallableWith("sub_1");
	});
});
