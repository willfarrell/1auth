/// <reference types="node" />

import type { CredentialOptions, Row } from "@1auth/authn";
import type { WebAuthnInstance, WebAuthnOptions } from "@1auth/authn-webauthn";
import configure, {
	authenticate,
	challenge,
	count,
	create,
	createChallenge,
	createInstance,
	expire,
	formInputName,
	getOptions,
	list,
	makePreset,
	makeRequestHash,
	remove,
	secret,
	select,
	token,
	verify,
} from "@1auth/authn-webauthn";
import type {
	AuthenticationResponseJSON,
	PublicKeyCredentialCreationOptionsJSON,
	PublicKeyCredentialRequestOptionsJSON,
	RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { describe, expect, test } from "tstyche";

declare const registrationResponse: RegistrationResponseJSON;
declare const authenticationResponse: AuthenticationResponseJSON;

describe("instances", () => {
	test("createInstance and makePreset", () => {
		expect(createInstance()).type.toBe<WebAuthnInstance>();
		expect(
			makePreset({ residentKey: "required" }, "WebAuthnPassKey"),
		).type.toBe<WebAuthnInstance>();
		expect(makePreset).type.not.toBeCallableWith(
			{ residentKey: "always" },
			"x",
		);
	});

	test("configure takes partial options", () => {
		expect(
			configure({
				origin: "https://example.com",
				name: "Example",
				userVerification: "required",
				preferredAuthenticatorType: "securityKey",
				credentialDeviceType: "singleDevice",
				userName: (account: Row) => account.value,
			}),
		).type.toBe<void>();
		expect(configure).type.not.toBeCallableWith({
			preferredAuthenticatorType: "usb",
		});
		expect(getOptions()).type.toBe<WebAuthnOptions>();
	});

	test("credential factories", () => {
		expect(secret()).type.toBe<CredentialOptions>();
		expect(token({ expire: 300 })).type.toBe<CredentialOptions>();
		expect(challenge({ id: "WebAuthn" })).type.toBe<CredentialOptions>();
	});
});

describe("request binding", () => {
	test("makeRequestHash", () => {
		expect(formInputName).type.toBe<string>();
		expect(
			makeRequestHash({
				url: new URL("https://example.com/login"),
				body: new URLSearchParams(),
			}),
		).type.toBe<string>();
		expect(makeRequestHash).type.not.toBeCallableWith({
			url: "https://example.com/login",
			body: new URLSearchParams(),
		});
	});
});

describe("registration", () => {
	test("create returns creation options for the browser", () => {
		expect(create("sub_1")).type.toBe<
			Promise<{ id: string; secret: PublicKeyCredentialCreationOptionsJSON }>
		>();
		expect(
			create("sub_1", { preferredAuthenticatorType: "remoteDevice" }),
		).type.toBe<
			Promise<{ id: string; secret: PublicKeyCredentialCreationOptionsJSON }>
		>();
	});

	test("verify takes the browser response", () => {
		expect(verify("sub_1", registrationResponse)).type.toBe<
			Promise<{ id: string; secret: Row }>
		>();
		expect(
			verify("sub_1", registrationResponse, { name: "YubiKey" }, false),
		).type.toBe<Promise<{ id: string; secret: Row }>>();
		expect(verify).type.not.toBeCallableWith("sub_1", authenticationResponse);
	});
});

describe("authentication", () => {
	test("createChallenge returns request options for the browser", () => {
		expect(createChallenge("sub_1")).type.toBe<
			Promise<{
				id?: string[];
				secret: PublicKeyCredentialRequestOptionsJSON;
			}>
		>();
		expect(createChallenge(undefined, { username: "username" })).type.toBe<
			Promise<{
				id?: string[];
				secret: PublicKeyCredentialRequestOptionsJSON;
			}>
		>();
	});

	test("authenticate takes the browser response", () => {
		expect(authenticate("username", authenticationResponse)).type.toBe<
			Promise<string>
		>();
		expect(
			authenticate("username", authenticationResponse, { requestHash: "h" }),
		).type.toBe<Promise<string>>();
		expect(authenticate).type.not.toBeCallableWith(
			"username",
			registrationResponse,
		);
	});
});

describe("credentials", () => {
	test("reads and writes", () => {
		expect(count("sub_1")).type.toBe<Promise<number>>();
		expect(list("sub_1")).type.toBe<Promise<Row[]>>();
		expect(select("sub_1", "authn_1")).type.toBe<Promise<Row | undefined>>();
		expect(expire("sub_1", "authn_1")).type.toBe<Promise<void>>();
		expect(remove("sub_1", "authn_1")).type.toBe<Promise<void>>();
	});
});
