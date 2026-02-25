// Copyright 2003 - 2026 will Farrell, and 1Auth contributors.
// SPDX-License-Identifier: MIT
import {
	makeRandomConfigObject,
	nowInSeconds,
	symmetricDecryptFields,
	symmetricEncryptFields,
	symmetricGenerateEncryptionKey,
} from "@1auth/crypto";

const id = "account";

export const randomId = ({ prefix = "user_", ...params } = {}) =>
	makeRandomConfigObject({
		id,
		prefix,
		...params,
	});

export const randomSubject = ({ prefix = "sub_", ...params } = {}) =>
	makeRandomConfigObject({
		id,
		prefix,
		...params,
	});

const defaults = {
	id,
	store: undefined,
	notify: undefined,
	table: "accounts",
	idGenerate: true,
	randomId: randomId(),
	randomSubject: randomSubject(),
	encryptedFields: [],
};
const options = {};
export default (opt = {}) => {
	Object.assign(options, defaults, opt);
};
export const getOptions = () => options;

export const exists = async (sub) => {
	if (!sub || typeof sub !== "string") {
		throw new Error("404 Not Found", { cause: { sub } });
	}
	return options.store.exists(options.table, { sub });
};

export const lookup = async (sub) => {
	if (!sub || typeof sub !== "string") {
		throw new Error("404 Not Found", { cause: { sub } });
	}
	const account = await options.store.select(options.table, { sub });
	if (!account) {
		throw new Error("404 Not Found", { cause: { sub } });
	}
	const { encryptionKey: encryptedKey } = account;
	account.encryptionKey = undefined;
	const decryptedAccount = symmetricDecryptFields(
		account,
		{ encryptedKey, sub },
		options.encryptedFields,
	);
	return decryptedAccount;
};

export const create = async (values = {}) => {
	const sub = await options.randomSubject.create();

	const { encryptionKey, encryptedKey } = symmetricGenerateEncryptionKey(sub);
	const encryptedValues = symmetricEncryptFields(
		values,
		{ encryptionKey, sub },
		options.encryptedFields,
	);

	const now = nowInSeconds();
	const params = {
		create: now, // allow use for migration import
		...encryptedValues,
		sub,
		encryptionKey: encryptedKey,
		update: now,
	};
	if (options.idGenerate) {
		params.id = await options.randomId.create();
	}
	await options.store.insert(options.table, params);

	// TODO update guest session, attach sub
	return sub;
};

// for in the clear user metadata
export const update = async (sub, values = {}) => {
	if (!sub || typeof sub !== "string") {
		throw new Error("404 Not Found", { cause: { sub } });
	}
	const account = await options.store.select(
		options.table,
		{
			sub,
		},
		["encryptionKey"],
	);
	if (!account) {
		throw new Error("404 Not Found", { cause: { sub } });
	}
	const { encryptionKey: encryptedKey } = account;

	const encryptedValues = symmetricEncryptFields(
		values,
		{ encryptedKey, sub },
		options.encryptedFields,
	);

	await options.store.update(
		options.table,
		{ sub },
		{ ...encryptedValues, update: nowInSeconds() },
	);
};

export const expire = async (sub) => {
	if (!sub || typeof sub !== "string") {
		throw new Error("401 Unauthorized", { cause: { sub } });
	}
	await options.store.update(
		options.table,
		{ sub },
		{ expire: nowInSeconds() },
	);
};

export const remove = async (sub) => {
	if (!sub || typeof sub !== "string") {
		throw new Error("404 Not Found", { cause: { sub } });
	}
	// Should trigger removal of credentials and messengers
	await options.store.remove(options.table, { sub });
};
