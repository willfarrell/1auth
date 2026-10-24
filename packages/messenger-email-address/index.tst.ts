/// <reference types="node" />

import type { CredentialOptions } from "@1auth/authn";
import type { MessengerOptions, Row } from "@1auth/messenger";
import type { EmailAddressOptions } from "@1auth/messenger-email-address";
import configure, {
	count,
	create,
	createToken,
	exists,
	list,
	lookup,
	mask,
	remove,
	sanitize,
	select,
	token,
	validate,
	verifyToken,
} from "@1auth/messenger-email-address";
import { describe, expect, test } from "tstyche";

describe("configure", () => {
	test("takes partial options", () => {
		expect(
			configure({
				optionalDotDomains: ["gmail.com"],
				aliasDomains: { "pm.me": "protonmail.com" },
				usernameBlacklist: ["admin"],
			}),
		).type.toBe<void>();
		expect(configure).type.not.toBeCallableWith({ aliasDomains: ["pm.me"] });
		expect<EmailAddressOptions>().type.toBeAssignableTo<MessengerOptions>();
	});

	test("token factory", () => {
		expect(token()).type.toBe<CredentialOptions>();
	});
});

describe("email address", () => {
	test("reads", () => {
		expect(exists("a@example.com")).type.toBe<Promise<string | undefined>>();
		expect(count("sub_1")).type.toBe<Promise<number>>();
		expect(lookup("a@example.com")).type.toBe<Promise<Row | undefined>>();
		expect(list("sub_1")).type.toBe<Promise<Row[]>>();
		expect(select("sub_1", "messenger_1")).type.toBe<
			Promise<Row | undefined>
		>();
	});

	test("writes", () => {
		expect(create("sub_1", "a@example.com")).type.toBe<
			Promise<string | undefined>
		>();
		expect(createToken("sub_1", "messenger_1")).type.toBe<Promise<string>>();
		expect(verifyToken("sub_1", "123456", "messenger_1")).type.toBe<
			Promise<void>
		>();
		expect(remove("sub_1", "messenger_1")).type.toBe<Promise<void>>();
		expect(verifyToken).type.not.toBeCallableWith("sub_1", "123456");
	});

	test("sanitize, validate and mask", () => {
		expect(sanitize(" A.B+tag@Gmail.com")).type.toBe<string>();
		expect(validate("a@example.com")).type.toBe<string | true>();
		expect(mask("a@example.com")).type.toBe<string>();
	});
});
