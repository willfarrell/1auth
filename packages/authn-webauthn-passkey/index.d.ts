// Copyright 2003 - 2026 will Farrell, and 1Auth contributors.
// SPDX-License-Identifier: MIT
import type { WebAuthnInstance } from "@1auth/authn-webauthn";

export type {
	AuthenticatorType,
	WebAuthnOptions,
} from "@1auth/authn-webauthn";
export { formInputName, makeRequestHash } from "@1auth/authn-webauthn";

/** Resident, user verified, multi device. `id` defaults to `WebAuthnPassKey`. */
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
