/// <reference types="node" />

import type * as webauthn from "@1auth/authn-webauthn";
import type { WebAuthnInstance } from "@1auth/authn-webauthn";
import type { WebAuthnOptions } from "@1auth/authn-webauthn-securitykey";
import configure, {
	authenticate,
	create,
	createChallenge,
	formInputName,
	getOptions,
	makeRequestHash,
	verify,
} from "@1auth/authn-webauthn-securitykey";
import { describe, expect, test } from "tstyche";

describe("security key preset", () => {
	test("configure takes partial options, id included", () => {
		expect(
			configure({
				id: "SecurityKey",
				origin: "https://example.com",
				name: "Example",
			}),
		).type.toBe<void>();
		expect(configure()).type.toBe<void>();
		expect(configure).type.toBe<WebAuthnInstance["configure"]>();
		expect(configure).type.not.toBeCallableWith({ residentKey: "always" });
	});

	test("same API as an @1auth/authn-webauthn instance", () => {
		expect(getOptions()).type.toBe<WebAuthnOptions>();
		expect(create).type.toBe<WebAuthnInstance["create"]>();
		expect(createChallenge).type.toBe<WebAuthnInstance["createChallenge"]>();
		expect(verify).type.toBe<WebAuthnInstance["verify"]>();
		expect(authenticate).type.toBe<WebAuthnInstance["authenticate"]>();
	});

	test("re-exports request binding", () => {
		expect(formInputName).type.toBe<typeof webauthn.formInputName>();
		expect(makeRequestHash).type.toBe<typeof webauthn.makeRequestHash>();
	});
});
