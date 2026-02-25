// Copyright 2003 - 2026 will Farrell, and 1Auth contributors.
// SPDX-License-Identifier: MIT
import { lookup as accountLookup } from "@1auth/account";
import {
	authenticate as authnAuthenticate,
	count as authnCount,
	create as authnCreate,
	createList as authnCreateList,
	expire as authnExpire,
	getOptions as authnGetOptions,
	list as authnList,
	remove as authnRemove,
	select as authnSelect,
	update as authnUpdate,
	verify as authnVerify,
} from "@1auth/authn";
import { makeRandomConfigObject, nowInSeconds } from "@1auth/crypto";

import {
	generateAuthenticationOptions,
	generateRegistrationOptions,
	verifyAuthenticationResponse,
	verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { isoUint8Array } from "@simplewebauthn/server/helpers";

const id = "WebAuthn";
// minimumAuthenticateAllowCredentials: 3, // Add fake auth ids

export const token = ({
	type = "token",
	otp = true,
	expire = 10 * 60,
	encode = (value) => JSON.stringify(value),
	decode = (value) => JSON.parse(value),
	verify = async (response, value) => {
		const { verified, registrationInfo } = await verifyRegistrationResponse({
			...value,
			response,
		});
		if (!verified) throw new Error("Failed verifyRegistrationResponse");
		return { registrationInfo: jsonEncodeSecret(registrationInfo) };
	},
	...params
} = {}) =>
	makeRandomConfigObject({
		id,
		type,
		otp,
		expire,
		encode,
		decode,
		verify,
		...params,
	});

export const secret = ({
	type = "secret",
	otp = false,
	encode = (value) => {
		let encodedValue = jsonEncodeSecret(value);
		encodedValue = JSON.stringify(encodedValue);
		return encodedValue;
	},
	decode = (encodedValue) => {
		let value = JSON.parse(encodedValue);
		value = jsonParseSecret(value);
		return value;
	},
	...params
} = {}) =>
	makeRandomConfigObject({
		id,
		type,
		otp,
		encode,
		decode,
		...params,
	});

export const challenge = ({
	type = "challenge",
	otp = true,
	expire = 10 * 60,
	// create: () => randomAlphaNumeric(challenge.minLength),
	encode = (value) => {
		value.authenticator = jsonEncodeSecret(value.authenticator);
		const encodedValue = JSON.stringify(value);
		return encodedValue;
	},
	decode = (encodedValue) => {
		const value = JSON.parse(encodedValue);
		value.authenticator = jsonParseSecret(value.authenticator);
		return value;
	},
	verify = async (response, value) => {
		const { verified, authenticationInfo } = await verifyAuthenticationResponse(
			{
				...value,
				credential: value.authenticator.credential,
				response,
			},
		);
		if (!verified) throw new Error("Failed verifyAuthenticationResponse");
		value.authenticator.credential.counter = authenticationInfo.newCounter;
		return true;
	},
	cleanup = async (sub, value, { sourceId } = {}) => {
		// update counter & lastused on secret
		const now = nowInSeconds();
		const { encryptionKey } = await options.store.select(
			options.table,
			{ id: sourceId, sub },
			["encryptionKey"],
		);

		await authnUpdate(options.secret, {
			id: sourceId,
			sub,
			encryptedKey: encryptionKey,
			value: value.authenticator,
			update: now,
			lastused: now,
		});
	},
	...params
} = {}) =>
	makeRandomConfigObject({
		id,
		type,
		otp,
		expire,
		encode,
		decode,
		verify,
		cleanup,
		...params,
	});

const defaults = {
	id,
	origin: undefined, // with https://
	name: undefined,
	residentKey: "discouraged", // https://fy.blackhats.net.au/blog/2023-02-02-how-hype-will-turn-your-security-key-into-junk/
	userVerification: "preferred",
	preferredAuthenticatorType: undefined, // 'securityKey' | 'localDevice' | 'remoteDevice' - https://simplewebauthn.dev/docs/packages/server#fine-tuning-the-registration-experience-with-preferredauthenticatortype
	secret: secret(),
	token: token(),
	challenge: challenge(),
};
const options = {};
export default (opt = {}) => {
	Object.assign(options, authnGetOptions(), defaults, opt);
};
export const getOptions = () => options;

export const count = async (sub) => {
	return await authnCount(options.secret, sub);
};

export const list = async (sub) => {
	return await authnList(options.secret, sub);
};

export const select = async (sub, id) => {
	return await authnSelect(options.secret, sub, id);
};

export const authenticate = async (username, input) => {
	return await authnAuthenticate(options.challenge, username, input);
};

export const create = async (sub) => {
	return await createToken(sub);
};

export const verify = async (
	sub,
	response,
	{ name = null } = {},
	notify = true,
) => {
	const value = await verifyToken(sub, response);
	const { id } = await authnCreate(options.secret, sub, {
		name,
		value,
		verify: nowInSeconds(),
	});

	if (notify) {
		await options.notify.trigger("authn-webauthn-create", sub, { name });
	}
	return { id, secret: value };
};

const createToken = async (sub) => {
	const [credentials, account] = await Promise.all([
		authnList(options.secret, sub, undefined, ["encryptionKey", "value"]),
		accountLookup(sub),
	]);
	const excludeCredentials = [];
	for (let i = credentials.length; i--; ) {
		const credential = credentials[i];
		const value = options.secret.decode(credential.value);
		excludeCredentials.push({
			id: value.credential.id,
			type: "public-key",
		});
	}

	const registrationOptions = {
		rpName: options.name,
		rpID: new URL(options.origin).hostname,
		userID: isoUint8Array.fromUTF8String(sub),
		userName: account.username ?? "username",
		attestationType: "none",
		excludeCredentials,
		preferredAuthenticatorType: options.preferredAuthenticatorType,
		// PassKey
		authenticatorSelection: {
			residentKey: options.residentKey,
			userVerification: options.userVerification,
		},
		// extras?
		// timeout
		// pubKeyCredParams: [
		//   {
		//     type: 'public-key',
		//     alg: -8 // EdDSA
		//   },
		//   {
		//     type: 'public-key',
		//     alg: -7 // ES256
		//   },
		//   {
		//     type: 'public-key',
		//     alg: -257 // RS256
		//   }
		// ]
	};
	const secret = await generateRegistrationOptions(registrationOptions);
	const value = {
		expectedChallenge: secret.challenge,
		expectedOrigin: options.origin,
		expectedRPID: new URL(options.origin).hostname,
		requireUserVerification: true, // PassKey
	};
	const { id } = await authnCreate(options.token, sub, { value });

	return { id, secret };
};

const verifyToken = async (sub, credential) => {
	const { registrationInfo } = await authnVerify(
		options.token,
		sub,
		credential,
	);
	return registrationInfo;
};

export const createChallenge = async (sub) => {
	// Remove previous challenges for this user
	const previousChallenges = await authnList(
		options.challenge,
		sub,
		undefined,
		["id"],
	);
	for (const prev of previousChallenges) {
		await authnRemove(options.challenge, sub, prev.id);
	}

	const now = nowInSeconds();

	const credentials = await authnList(options.secret, sub, undefined, [
		"id",
		"encryptionKey",
		"value",
	]);
	const allowCredentials = [];
	for (let i = credentials.length; i--; ) {
		const credential = credentials[i];
		const authenticator = options.secret.decode(credential.value);
		allowCredentials.push({
			id: authenticator.credential.id,
			type: "public-key",
		});
	}

	if (!allowCredentials.length) {
		if (options.log) {
			options.log("@1auth/authn-webauthn allowCredentials is empty");
		}
		return {};
	}

	const authenticationOptions = {
		rpID: new URL(options.origin).hostname,
		allowCredentials,
		userVerification: options.userVerification,
	};
	const secret = await generateAuthenticationOptions(authenticationOptions);

	const challenges = [];
	for (let i = credentials.length; i--; ) {
		const credential = credentials[i];
		const authenticator = options.secret.decode(credential.value);
		const value = {
			authenticator,
			expectedChallenge: secret.challenge,
			expectedOrigin: options.origin,
			expectedRPID: new URL(options.origin).hostname,
			requireUserVerification: true, // PassKey
		};
		challenges.push({
			sourceId: credential.id,
			value,
			update: now,
		});
	}
	const id = await authnCreateList(options.challenge, sub, challenges);

	return { id, secret };
};

export const expire = async (sub, id) => {
	await authnExpire(options.secret, sub, id);
	await options.notify.trigger("authn-webauthn-expire", sub);
};

export const remove = async (sub, id) => {
	await authnRemove(options.secret, sub, id);
	await options.notify.trigger("authn-webauthn-remove", sub);
};

const jsonEncodeSecret = (value) => {
	if (!value) return value;
	value.credential.publicKey = credentialNormalize(value.credential.publicKey);
	value.attestationObject = credentialNormalize(value.attestationObject);
	return value;
};

const jsonParseSecret = (value) => {
	value.credential.publicKey = credentialBuffer(value.credential.publicKey);
	value.attestationObject = credentialBuffer(value.attestationObject);
	return value;
};

const credentialNormalize = (value) => {
	let arr = value.data;
	if (!arr) {
		arr = Object.values(value);
	}
	return arr;
};

const credentialBuffer = (value) => {
	return Buffer.from(credentialNormalize(value));
};
