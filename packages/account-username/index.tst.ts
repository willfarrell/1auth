/// <reference types="node" />

import type { AccountOptions, Row } from "@1auth/account";
import type { AccountUsernameOptions } from "@1auth/account-username";
import configure, {
	create,
	exists,
	getOptions,
	lookup,
	recover,
	sanitize,
	update,
	validate,
	validateAllowedChar,
	validateBlacklist,
	validateLength,
} from "@1auth/account-username";
import { describe, expect, test } from "tstyche";

describe("configure", () => {
	test("takes partial options", () => {
		expect(
			configure({ usernameBlacklist: ["admin"], minLength: 3, maxLength: 16 }),
		).type.toBe<void>();
		expect(configure({ allowedCharRegExp: /^[a-z]*$/ })).type.toBe<void>();
		expect(configure).type.not.toBeCallableWith({ allowedCharRegExp: "a-z" });
	});

	test("options extend @1auth/account", () => {
		expect(getOptions()).type.toBe<AccountUsernameOptions>();
		expect<AccountUsernameOptions>().type.toBeAssignableTo<AccountOptions>();
	});
});

describe("username", () => {
	test("reads", () => {
		expect(exists("username")).type.toBe<Promise<string | undefined>>();
		expect(lookup("username")).type.toBe<Promise<Row | undefined>>();
	});

	test("writes", () => {
		expect(create("sub_1", "username")).type.toBe<Promise<void>>();
		expect(update("sub_1", "username")).type.toBe<Promise<void>>();
		expect(recover("sub_1")).type.toBe<Promise<void>>();
		expect(create).type.not.toBeCallableWith("username");
	});

	test("sanitize and validate", () => {
		expect(sanitize(" UserName ")).type.toBe<string>();
		expect(validate("username")).type.toBe<string | true>();
		expect(validateLength("username")).type.toBe<string | true>();
		expect(validateAllowedChar("username")).type.toBe<string | true>();
		expect(validateBlacklist("username")).type.toBe<string | true>();
	});
});
