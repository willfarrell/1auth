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

// https://simplewebauthn.dev/docs/packages/server#fine-tuning-the-registration-experience-with-preferredauthenticatortype
const authenticatorAttachments = {
	securityKey: "cross-platform",
	localDevice: "platform",
	remoteDevice: "cross-platform",
};

// `preferredAuthenticatorType` only sets browser hints, the user is free to
// register something else entirely. BE (`multiDevice`) is the signal that
// separates a syncable passkey from a hardware bound key.
const authenticatorTypeVerify = (
	authenticatorType,
	registrationInfo,
	response,
) => {
	if (!authenticatorType) return;
	const passkey = registrationInfo.credentialDeviceType === "multiDevice";
	if (passkey === (authenticatorType === "securityKey")) {
		throw new Error("Failed authenticatorType", {
			cause: {
				authenticatorType,
				credentialDeviceType: registrationInfo.credentialDeviceType,
			},
		});
	}
	// ponytail: attachment is optional in the spec, so local vs remote is only
	// checked when the browser reports it. The security relevant split is above.
	const { authenticatorAttachment } = response;
	if (
		authenticatorAttachment &&
		authenticatorAttachment !== authenticatorAttachments[authenticatorType]
	) {
		throw new Error("Failed authenticatorType", {
			cause: { authenticatorType, authenticatorAttachment },
		});
	}
};

/**
 * A self contained WebAuthn instance with its own `options`. Sibling packages
 * (`@1auth/authn-webauthn-passkey`, `@1auth/authn-webauthn-securitykey`) each hold one, so
 * two ceremonies can run different policies without sharing config.
 */
export const createInstance = () => {
	const options = {};

	const token = ({
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
			if (!verified)
				throw new Error("Failed verifyRegistrationResponse", {
					cause: { response },
				});
			authenticatorTypeVerify(
				value.authenticatorType,
				registrationInfo,
				response,
			);
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

	const secret = ({
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

	const challenge = ({
		type = "challenge",
		otp = true,
		expire = 10 * 60,
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
			const { verified, authenticationInfo } =
				await verifyAuthenticationResponse({
					...value,
					credential: value.authenticator.credential,
					response,
				});
			if (!verified)
				throw new Error("Failed verifyAuthenticationResponse", {
					cause: { response },
				});
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
		notifyId: "authn-webauthn", // template id prefix, set per instance when running more than one
		origin: undefined, // with https://
		name: undefined,
		residentKey: "discouraged", // https://fy.blackhats.net.au/blog/2023-02-02-how-hype-will-turn-your-security-key-into-junk/
		userVerification: "preferred",
		preferredAuthenticatorType: undefined, // 'securityKey' | 'localDevice' | 'remoteDevice' - https://simplewebauthn.dev/docs/packages/server#fine-tuning-the-registration-experience-with-preferredauthenticatortype
		// Display name shown in the authenticator prompt. Defaults to where
		// `@1auth/account-username` puts the username, override when it lives
		// elsewhere on the account.
		userName: (account) => account.value ?? "username",
		secret: secret(),
		token: token(),
		challenge: challenge(),
	};

	const configure = (opt = {}) => {
		Object.assign(options, authnGetOptions(), defaults, opt);
	};
	const getOptions = () => options;

	const count = async (sub) => {
		return await authnCount(options.secret, sub);
	};

	const list = async (sub) => {
		return await authnList(options.secret, sub);
	};

	const select = async (sub, id) => {
		return await authnSelect(options.secret, sub, id);
	};

	const authenticate = async (username, input) => {
		return await authnAuthenticate(options.challenge, username, input);
	};

	const create = async (
		sub,
		{ preferredAuthenticatorType = options.preferredAuthenticatorType } = {},
	) => {
		if (
			preferredAuthenticatorType &&
			!authenticatorAttachments[preferredAuthenticatorType]
		) {
			throw new Error("400 Bad Request", {
				cause: { preferredAuthenticatorType },
			});
		}
		return await createToken(sub, preferredAuthenticatorType);
	};

	const verify = async (sub, response, { name = null } = {}, notify = true) => {
		const value = await verifyToken(sub, response);
		const { id } = await authnCreate(options.secret, sub, {
			name,
			value,
			verify: nowInSeconds(),
		});

		if (notify) {
			await options.notify.trigger(`${options.notifyId}-create`, sub, { name });
		}
		return { id, secret: value };
	};

	const createToken = async (sub, preferredAuthenticatorType) => {
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
			userName: options.userName(account),
			attestationType: "none",
			excludeCredentials,
			preferredAuthenticatorType,
			// PassKey
			authenticatorSelection: {
				residentKey: options.residentKey,
				userVerification: options.userVerification,
			},
		};
		const secret = await generateRegistrationOptions(registrationOptions);
		const value = {
			expectedChallenge: secret.challenge,
			expectedOrigin: options.origin,
			expectedRPID: new URL(options.origin).hostname,
			requireUserVerification: true, // PassKey
			authenticatorType: preferredAuthenticatorType,
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

	const createChallenge = async (sub) => {
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

	const expire = async (sub, id) => {
		await authnExpire(options.secret, sub, id);
		await options.notify.trigger(`${options.notifyId}-expire`, sub);
	};

	const remove = async (sub, id) => {
		await authnRemove(options.secret, sub, id);
		await options.notify.trigger(`${options.notifyId}-remove`, sub);
	};

	return {
		authenticate,
		challenge,
		configure,
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
	};
};

/**
 * An instance wired to one fixed policy, for the sibling packages that ship a
 * single preset. The preset sits under caller options, so an app can still
 * override any of it, `id` included, at configure time.
 */
export const makePreset = (preset, defaultId) => {
	const instance = createInstance();
	const configure = ({ id = defaultId, ...opt } = {}) =>
		instance.configure({
			...preset,
			secret: instance.secret({ id }),
			token: instance.token({ id }),
			challenge: instance.challenge({ id }),
			...opt,
		});
	return { ...instance, configure };
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

// The default instance, for apps running a single WebAuthn policy
const self = createInstance();
export default self.configure;
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
} = self;
