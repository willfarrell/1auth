// Copyright 2003 - 2026 will Farrell, and 1Auth contributors.
// SPDX-License-Identifier: MIT
import {
	assertId,
	assertSub,
	createSeasonedDigest,
	makeRandomConfigObject,
	nowInSeconds,
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
	...params
} = {}) =>
	makeRandomConfigObject({
		id,
		prefix,
		entropy,
		...params,
	});

const sortKeys = (value) => {
	if (Array.isArray(value)) return value.map(sortKeys);
	if (!value || typeof value !== "object") return value;
	const sorted = {};
	for (const key of Object.keys(value).sort()) {
		sorted[key] = sortKeys(value[key]);
	}
	return sorted;
};

const defaults = {
	id,
	notifyId: "authn-session", // template id prefix, set per instance when running more than one
	log: false,
	store: undefined,
	notify: undefined,
	table: "sessions",
	idGenerate: true, // turn off to allow DB to handle
	randomId: randomId(),
	randomSessionId: randomSessionId(),
	expire: 12 * 60 * 60,
	encryptedFields: ["value"],
	encode: (value) => JSON.stringify(sortKeys(value ?? {})),
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
		if (session.expire && session.expire < now) {
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
	assertSub(sub, { id });
	assertId(id, { sub });
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

// The device key a session is bound to, addressed by `id` alone because a DBSC
// refresh only carries the Sec-Session-Id header, never a `sub`.
// Deliberately projects a fixed, narrow field list: unlike `sid`, `id` travels
// in a plaintext header, so this must never hand back `value`, `digest` or
// `encryptionKey`.
const bindingFields = ["id", "sub", "publicKey", "create", "expire"];
export const selectBinding = async (id) => {
	assertId(id);
	return await options.store.select(options.table, { id }, bindingFields);
};

export const list = async (sub) => {
	assertSub(sub);
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

const makeSessionValues = async (sub, value, values) => {
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
	return { sid, digest, encryptedKey, encryptedValues };
};

/**
 * Session Create
 * @param sub
 * @param value {os, browser, ip, ...}
 */
export const create = async (sub, value, values = {}) => {
	assertSub(sub);
	if (!value) {
		throw new Error("400 Bad Request", { cause: { sub } });
	}
	const now = nowInSeconds();
	const { sid, digest, encryptedKey, encryptedValues } =
		await makeSessionValues(sub, value, values);
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
		params.id = await options.randomId.create();
	}
	params.id = await options.store.insert(options.table, params);
	params.sid = sid;
	return params;
};

/**
 * Session Rotate
 * Issues the next `sid` on an existing row, in place. `id`, `publicKey`, `create`
 * and `expire` all survive, which is what lets a DBSC `session_identifier` stay
 * stable across refreshes while the credential behind it rotates, and what keeps
 * `expire` an absolute cap rather than one that slides forward on every refresh.
 * Assumes the row exists -- the caller has already read it, see `selectBinding`.
 * @param sub
 * @param id
 * @param value {os, browser, ip, ...}
 */
export const rotate = async (sub, id, value, values = {}) => {
	assertSub(sub, { id });
	assertId(id, { sub });
	const now = nowInSeconds();
	const { sid, digest, encryptedKey, encryptedValues } =
		await makeSessionValues(sub, value, values);
	const params = {
		...encryptedValues,
		digest,
		encryptionKey: encryptedKey,
		update: now,
		// Deliberately does NOT touch `expire`. Extending it here would slide the
		// absolute cap forward on every refresh, so a session that keeps refreshing
		// would never end -- an absolute timeout that is not absolute.
	};
	await options.store.update(options.table, { sub, id }, params);
	return { ...params, sub, id, sid };
};

// Before creating a new session, check if metadata is new
export const check = async (sub, value = {}) => {
	assertSub(sub);
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
	await options.notify.trigger(`${options.notifyId}-new-device`, sub);
};

export const expire = async (sub, id) => {
	assertSub(sub, { id });
	assertId(id, { sub });
	const now = nowInSeconds();
	await options.store.update(
		options.table,
		{ sub, id },
		{ update: now, expire: now - 1 },
	);
};

export const remove = async (sub, id) => {
	assertSub(sub, { id });
	assertId(id, { sub });
	await options.store.remove(options.table, { sub, id });
};

export const sign = (sid) => {
	return symmetricSignatureSign(sid);
};

export const verify = (sidWithSignature) => {
	return symmetricSignatureVerify(sidWithSignature);
};
