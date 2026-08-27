// Copyright 2003 - 2026 will Farrell, and 1Auth contributors.
// SPDX-License-Identifier: MIT
import { makePreset } from "@1auth/authn-webauthn";

// Re-exported so an app that depends on this preset never has to reach past it
// to the base package for the two halves of request binding.
export { formInputName, makeRequestHash } from "@1auth/authn-webauthn";

// A roaming authenticator used as a second factor. A security key holds a limited
// number of discoverable credentials, and as a 2nd factor it doesn't need one.
// https://fy.blackhats.net.au/blog/2023-02-02-how-hype-will-turn-your-security-key-into-junk/
const preset = {
	notifyId: "authn-webauthn-securitykey",
	residentKey: "discouraged",
	userVerification: "required",
	preferredAuthenticatorType: "securityKey",
	credentialDeviceType: "singleDevice",
};

// Its own `options`, separate from `@1auth/authn-webauthn` and
// `@1auth/authn-webauthn-passkey`
const webauthn = makePreset(preset, "WebAuthnSecurityKey");

export default webauthn.configure;
export const {
	authenticate,
	challenge,
	count,
	create,
	createChallenge,
	expire,
	getOptions,
	list,
	remove,
	secret,
	select,
	token,
	verify,
} = webauthn;
