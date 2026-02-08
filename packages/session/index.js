// Copyright 2003 - 2026 will Farrell, and 1Auth contributors.
// SPDX-License-Identifier: MIT
import {
	createSeasonedDigest,
	makeRandomConfigObject,
	safeEqual,
	symmetricDecrypt,
	symmetricDecryptFields,
	symmetricEncryptFields,
	symmetricGenerateEncryptionKey,
	symmetricSignatureSign,
	symmetricSignatureVerify,
} from "@1auth/crypto";

const id = "session";

export const randomId = ({ prefix = "session_", ...params } = {}) =>
	makeRandomConfigObject({
		id,
		prefix,
		...params,
	});
export const randomSessionId = ({
	prefix = "sid_",
	entropy = 128,
	expire = 15 * 60,
	...params
} = {}) =>
	makeRandomConfigObject({
		id,
		prefix,
		entropy,
		expire,
		...params,
	});

const defaults = {
	id,
	log: false,
	store: undefined,
	notify: undefined,
	table: "sessions",
	idGenerate: true, // turn off to allow DB to handle
	randomId: randomId(),
	randomSessionId: randomSessionId(),
	expire: 15 * 60,
	encryptedFields: ["value"],
	encode: (value) => JSON.stringify(value ?? {}),
	decode: (value) => JSON.parse(value),
	checkMetadata: (oldSession, newSession) => safeEqual(oldSession, newSession),
};
const options = {};
export default (opt = {}) => {
	Object.assign(options, defaults, opt);
};
export const getOptions = () => options;

export const lookup = async (sid, value = {}) => {
	if (!sid || typeof sid !== "string") {
		throw new Error("401 Unauthorized", { cause: { sid } });
	}
	const digest = createSeasonedDigest(sid);
	const session = await options.store.select(options.table, { digest });
	if (session) {
		const now = nowInSeconds();
		if (session.expire < now) {
			return;
		}
		const encodedValue = options.encode(value);
		const decryptedValue = symmetricDecrypt(session.value, {
			sub: session.sub,
			encryptedKey: session.encryptionKey,
		});
		if (options.checkMetadata(decryptedValue, encodedValue)) {
			return session;
		}
	}
};

export const select = async (sub, id) => {
	if (!sub || typeof sub !== "string") {
		throw new Error("401 Unauthorized", { cause: { sub, id } });
	}
	if (!id || typeof id !== "string") {
		throw new Error("404 Not Found", { cause: { sub, id } });
	}
	const session = await options.store.select(options.table, { sub, id });
	if (!session) return;

	const { encryptionKey: encryptedKey } = session;
	session.encryptionKey = undefined;

	const decryptedValues = symmetricDecryptFields(
		session,
		{ encryptedKey, sub },
		options.encryptedFields,
	);
	decryptedValues.value = options.decode(decryptedValues.value);
	return decryptedValues;
};

export const list = async (sub) => {
	if (!sub || typeof sub !== "string") {
		throw new Error("401 Unauthorized", { cause: { sub } });
	}
	const items = await options.store.selectList(options.table, { sub });
	const sessions = [];
	for (let i = items.length; i--; ) {
		const session = items[i];
		const { encryptionKey: encryptedKey, sub } = session;
		session.encryptionKey = undefined;
		const decryptedSession = symmetricDecryptFields(
			session,
			{ encryptedKey, sub },
			options.encryptedFields,
		);

		decryptedSession.value = options.decode(decryptedSession.value);
		sessions.push(decryptedSession);
	}
	return sessions;
};

/**
 * Session Create
 * @param sub
 * @param value {os, browser, ip, ...}
 */
export const create = async (sub, value, values = {}) => {
	if (!sub || typeof sub !== "string") {
		throw new Error("401 Unauthorized", { cause: { sub } });
	}
	if (!value) {
		throw new Error("400 Bad Request", { cause: { sub } });
	}
	const now = nowInSeconds();
	const sid = await options.randomSessionId.create();
	const digest = createSeasonedDigest(sid);

	const encodedValue = options.encode(value);

	const { encryptedKey, encryptionKey } = symmetricGenerateEncryptionKey(sub);
	const encryptedValues = symmetricEncryptFields(
		{
			...values,
			value: encodedValue,
		},
		{
			encryptionKey,
			sub,
		},
		options.encryptedFields,
	);
	const params = {
		...encryptedValues,
		digest,
		sub,
		encryptionKey: encryptedKey,
		create: now,
		update: now,
		expire: now + options.expire,
	};
	if (options.idGenerate) {
		params.id = await options.randomId.create(options.idPrefix);
	}
	params.id = await options.store.insert(options.table, params);
	params.sid = sid;
	return params;
};

// Before creating a new session, check if metadata is new
export const check = async (sub, value = {}) => {
	if (!sub || typeof sub !== "string") {
		throw new Error("401 Unauthorized", { cause: { sub } });
	}
	const encodedValue = options.encode(value);
	const sessions = await options.store.selectList(options.table, { sub });
	for (const session of sessions) {
		const decryptedValue = symmetricDecrypt(session.value, {
			sub,
			encryptedKey: session.encryptionKey,
		});
		if (options.checkMetadata(decryptedValue, encodedValue)) {
			return;
		}
	}
	options.notify.trigger("authn-session-new-device", sub);
};

export const expire = async (sub, id) => {
	if (!sub || typeof sub !== "string") {
		throw new Error("401 Unauthorized", { cause: { sub, id } });
	}
	if (!id || typeof id !== "string") {
		throw new Error("404 Not Found", { cause: { sub, id } });
	}
	const now = nowInSeconds();
	await options.store.update(
		options.table,
		{ sub, id },
		{ update: now, expire: now - 1 },
	);
};

export const remove = async (sub, id) => {
	if (!sub || typeof sub !== "string") {
		throw new Error("401 Unauthorized", { cause: { sub, id } });
	}
	if (!id || typeof id !== "string") {
		throw new Error("404 Not Found", { cause: { sub, id } });
	}
	await options.store.remove(options.table, { sub, id });
};

export const sign = (sid) => {
	return symmetricSignatureSign(sid);
};

export const verify = (sidWithSignature) => {
	return symmetricSignatureVerify(sidWithSignature);
};

// guest or onboard session to authenticated
// export const rotate = async (sub, meta) => {
//   await remove()
//   return create()
// }
const nowInSeconds = () => Math.floor(Date.now() / 1000);
