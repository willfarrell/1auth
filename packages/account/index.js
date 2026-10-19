// Copyright 2003 - 2026 will Farrell, and 1Auth contributors.
// SPDX-License-Identifier: MIT
import {
	assertSub,
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
	// Grace window before the row is hard-deleted by the store cleanup sweep.
	// Lets queued `account-remove` handlers cascade safely and enables recovery.
	removeExpireOffset: 10 * 24 * 60 * 60,
};
const options = {};
export default (opt = {}) => {
	Object.assign(options, defaults, opt);
};
export const getOptions = () => options;

// Columns this package (and account-username, through `updateIdentifier`)
// owns. Callers commonly pass request bodies straight through, so these are
// dropped rather than trusted. `create` stays settable on insert for imports.
// `update` isn't listed: every write stamps it after the caller's values.
const ownedKeys = [
	"id",
	"sub",
	"encryptionKey",
	"value",
	"digest",
	"create",
	"expire",
	"remove",
];
// Stryker disable next-line ArrayDeclaration: no owned key is named like the mutant's entry
const withoutOwnedKeys = (values, allowed = []) => {
	const params = { ...values };
	for (const key of ownedKeys) {
		if (!allowed.includes(key)) delete params[key];
	}
	return params;
};

// expire() and remove() stamp the current second, so the tie is expired
const isExpired = (account) =>
	!!account.expire && account.expire <= nowInSeconds();

export const exists = async (sub) => {
	if (!sub || typeof sub !== "string") {
		throw new Error("404 Not Found", { cause: { sub } });
	}
	const account = await options.store.select(options.table, { sub }, [
		"sub",
		"expire",
	]);
	if (!account || isExpired(account)) return;
	return account.sub;
};

export const lookup = async (sub) => {
	if (!sub || typeof sub !== "string") {
		throw new Error("404 Not Found", { cause: { sub } });
	}
	const account = await options.store.select(options.table, { sub });
	if (!account || isExpired(account)) {
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
		withoutOwnedKeys(values, ["create"]),
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

	return sub;
};

// for in the clear user metadata
export const update = async (sub, values = {}) => {
	await write(sub, withoutOwnedKeys(values));
};

// The username (or other lookup identifier) and its digest. Only for sibling
// packages that have already checked the digest is free.
export const updateIdentifier = async (sub, { value, digest }) => {
	await write(sub, { value, digest });
};

const write = async (sub, values) => {
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
	assertSub(sub);
	await options.store.update(
		options.table,
		{ sub },
		{ expire: nowInSeconds() },
	);
	await options.notify?.trigger("account-expire", sub);
};

export const remove = async (sub) => {
	if (!sub || typeof sub !== "string") {
		throw new Error("404 Not Found", { cause: { sub } });
	}
	const expire = nowInSeconds();
	await options.store.update(
		options.table,
		{ sub },
		{ expire, remove: expire + options.removeExpireOffset },
	);
	await options.notify?.trigger("account-remove", sub);
};
