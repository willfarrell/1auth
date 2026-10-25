// Copyright 2003 - 2026 will Farrell, and 1Auth contributors.
// SPDX-License-Identifier: MIT
import type {
	AuthnOptions,
	CredentialOptions,
	Notify,
	Row,
} from "@1auth/authn";
import type { RandomConfigOptions } from "@1auth/crypto";
import type {
	AuthenticationResponseJSON,
	CredentialDeviceType,
	PublicKeyCredentialCreationOptionsJSON,
	PublicKeyCredentialRequestOptionsJSON,
	RegistrationResponseJSON,
	ResidentKeyRequirement,
	UserVerificationRequirement,
} from "@simplewebauthn/server";

/** Form field that carries the WebAuthn response, left out of the request hash. */
export const formInputName: string;

/** base64url hash of the path, query and form body, binds a challenge to a request. */
export function makeRequestHash(request: {
	url: URL;
	body: FormData | URLSearchParams;
}): string;

export type AuthenticatorType = "securityKey" | "localDevice" | "remoteDevice";

/** Extends the `@1auth/authn` options it is configured from. */
export interface WebAuthnOptions extends AuthnOptions {
	notify: Notify;
	/** Template id prefix, set per instance when running more than one. */
	notifyId: string;
	/** Relying party origin, with `https://`. */
	origin: string;
	/** Relying party name. */
	name: string;
	residentKey: ResidentKeyRequirement;
	userVerification: UserVerificationRequirement;
	/** Unexpired challenges kept per account. */
	challengeKeep: number;
	/** Browser hint only. */
	preferredAuthenticatorType: AuthenticatorType | undefined;
	/** What registrations are accepted, independent of the browser hint. */
	credentialDeviceType: CredentialDeviceType | undefined;
	/** Display name shown in the authenticator prompt. */
	userName: (account: Row) => string;
	secret: CredentialOptions;
	token: CredentialOptions;
	challenge: CredentialOptions;
}

export interface WebAuthnInstance {
	/** Resolves `sub`, throws `401 Unauthorized` when the assertion fails. */
	authenticate: (
		username: string,
		input: AuthenticationResponseJSON,
		options?: { requestHash?: string },
	) => Promise<string>;
	challenge: (params?: RandomConfigOptions) => CredentialOptions;
	configure: (opt?: Partial<WebAuthnOptions>) => void;
	count: (sub: string) => Promise<number>;
	/** Starts a registration, `secret` goes to the browser. */
	create: (
		sub: string,
		options?: { preferredAuthenticatorType?: AuthenticatorType },
	) => Promise<{ id: string; secret: PublicKeyCredentialCreationOptionsJSON }>;
	/** `id` holds one stored challenge id per credential, absent on a decoy. */
	createChallenge: (
		sub: string | undefined,
		options?: { username?: string },
	) => Promise<{
		id?: string[];
		secret: PublicKeyCredentialRequestOptionsJSON;
	}>;
	expire: (sub: string, id: string) => Promise<void>;
	getOptions: () => WebAuthnOptions;
	list: (sub: string) => Promise<Row[]>;
	remove: (sub: string, id: string) => Promise<void>;
	secret: (params?: RandomConfigOptions) => CredentialOptions;
	select: (sub: string, id: string) => Promise<Row | undefined>;
	token: (params?: RandomConfigOptions) => CredentialOptions;
	/** Completes a registration, throws `409 Conflict` when the credential is already registered. */
	verify: (
		sub: string,
		response: RegistrationResponseJSON,
		options?: { name?: string | null },
		notify?: boolean,
	) => Promise<{ id: string; secret: Row }>;
}

/** A WebAuthn instance with its own options. */
export function createInstance(): WebAuthnInstance;

/** An instance whose `configure` applies `preset` under the caller's options. */
export function makePreset(
	preset: Partial<WebAuthnOptions>,
	defaultId: string,
): WebAuthnInstance;

declare const configure: WebAuthnInstance["configure"];
export default configure;

export const authenticate: WebAuthnInstance["authenticate"];
export const challenge: WebAuthnInstance["challenge"];
export const count: WebAuthnInstance["count"];
export const create: WebAuthnInstance["create"];
export const createChallenge: WebAuthnInstance["createChallenge"];
export const expire: WebAuthnInstance["expire"];
export const getOptions: WebAuthnInstance["getOptions"];
export const list: WebAuthnInstance["list"];
export const remove: WebAuthnInstance["remove"];
export const secret: WebAuthnInstance["secret"];
export const select: WebAuthnInstance["select"];
export const token: WebAuthnInstance["token"];
export const verify: WebAuthnInstance["verify"];
