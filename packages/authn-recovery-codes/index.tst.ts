/// <reference types="node" />

import type { CredentialOptions, Row } from "@1auth/authn";
import type { RecoveryCode } from "@1auth/authn-recovery-codes";
import configure, {
	authenticate,
	count,
	create,
	list,
	remove,
	secret,
	update,
} from "@1auth/authn-recovery-codes";
import { describe, expect, test } from "tstyche";

describe("configure", () => {
	test("takes partial options", () => {
		expect(configure({ count: 10, secret: secret() })).type.toBe<void>();
		expect(configure).type.not.toBeCallableWith({ count: "10" });
	});

	test("secret factory", () => {
		expect(secret()).type.toBe<CredentialOptions>();
		expect(secret({ entropy: 64 })).type.toBe<CredentialOptions>();
	});
});

describe("recovery codes", () => {
	test("create and update return the plain text codes", () => {
		expect(create("sub_1")).type.toBe<Promise<RecoveryCode[]>>();
		expect(update("sub_1")).type.toBe<Promise<RecoveryCode[]>>();
		expect<RecoveryCode["value"]>().type.toBe<string>();
	});

	test("reads", () => {
		expect(authenticate("username", "code")).type.toBe<Promise<string>>();
		expect(count("sub_1")).type.toBe<Promise<number>>();
		expect(list("sub_1")).type.toBe<Promise<Row[]>>();
	});

	test("remove one or all", () => {
		expect(remove("sub_1")).type.toBe<Promise<void>>();
		expect(remove("sub_1", "authn_1")).type.toBe<Promise<void>>();
		expect(remove).type.not.toBeCallableWith();
	});
});
