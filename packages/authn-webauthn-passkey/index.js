// Copyright 2003 - 2026 will Farrell, and 1Auth contributors.
// SPDX-License-Identifier: MIT
import { makePreset } from "@1auth/authn-webauthn";

// A discoverable credential, usable as the only factor: it has to be resident to
// log in without a username, and user verified to stand in for a password.
const preset = {
	notifyId: "authn-webauthn-passkey",
	residentKey: "required",
	userVerification: "required",
	preferredAuthenticatorType: "localDevice",
	credentialDeviceType: "multiDevice",
};

// Its own `options`, separate from `@1auth/authn-webauthn` and
// `@1auth/authn-webauthn-securitykey`
//
// A PassKey on this device and one on a phone are the same credential to
// `authenticate`, and a single challenge carries one `allowCredentials` set, so
// both live under this one id. Pick between them per registration instead:
// `create(sub, {preferredAuthenticatorType: 'remoteDevice'})`
const webauthn = makePreset(preset, "WebAuthnPassKey");

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
