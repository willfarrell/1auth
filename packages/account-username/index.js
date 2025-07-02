import {
	lookup as accountLookup,
	getOptions as accountOptions,
	update as accountUpdate,
} from "@1auth/account";

import { createSeasonedDigest, symmetricDecryptFields } from "@1auth/crypto";

// Only allow characters that are safe to encode
// not allowed because it can be used to declare and extension
let usernameBlacklistRegExp;
const options = {
	id: "username",
	allowedCharRegExp: /^[a-z0-9_-]*$/,
	usernameBlacklist: [],
	minLength: 1,
	maxLength: 32,
};
export default (params) => {
	Object.assign(options, accountOptions(), params);
	if (options.usernameBlacklist.length) {
		usernameBlacklistRegExp = new RegExp(
			`(${options.usernameBlacklist.map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
		);
	}
};

export const exists = async (username) => {
	const usernameSanitized = sanitize(username);
	const usernameDigest = createSeasonedDigest(usernameSanitized);
	return options.store.exists(options.table, {
		digest: usernameDigest,
	});
};

export const lookup = async (username) => {
	const usernameSanitized = sanitize(username);
	const usernameDigest = createSeasonedDigest(usernameSanitized);

	let item = await options.store.select(options.table, {
		digest: usernameDigest,
	});
	if (!item) return;
	// must match @1auth/account
	item = symmetricDecryptFields(
		item,
		{ encryptedKey: item.encryptionKey, sub: item.sub },
		options.encryptedFields,
	);
	item.encryptionKey = undefined;
	return item;
};

export const create = async (sub, username) => {
	if (!sub || typeof sub !== "string") {
		throw new Error("401 Unauthorized", { cause: { sub } });
	}
	const usernameSanitized = sanitize(username);
	const usernameValidate = validate(usernameSanitized);
	if (usernameValidate !== true) {
		throw new Error(usernameValidate, {
			cause: { username, usernameSanitized },
		});
	}
	const usernameDigest = createSeasonedDigest(usernameSanitized);
	const usernameExists = await options.store.exists(options.table, {
		digest: usernameDigest,
	});
	if (usernameExists) {
		throw new Error("409 Conflict", { cause: { username, usernameSanitized } });
	}

	await accountUpdate(sub, {
		value: username,
		digest: usernameDigest,
	});
};

export const update = async (sub, username) => {
	await create(sub, username);
	await options.notify.trigger("account-username-change", sub);
};

export const recover = async (sub) => {
	const { value: username } = await accountLookup(sub);
	await options.notify.trigger("account-username-recover", sub, { username });
};

export const sanitize = (value) => {
	if (!value || typeof value !== "string") {
		throw new Error("400 Bad Request", { cause: { value } });
	}
	return value
		.trim()
		.toLocaleLowerCase()
		.normalize("NFKD")
		.replace(/\p{Diacritic}/gu, "");
};

export const validate = (value) => {
	let valid = true;
	if (valid === true) valid = validateLength(value);
	if (valid === true) valid = validateAllowedChar(value);
	if (valid === true) valid = validateBlacklist(value);
	return valid;
};

export const validateLength = (value) => {
	if (value.length < options.minLength || options.maxLength < value.length) {
		return "400 Bad Request";
	}
	return true;
};

export const validateAllowedChar = (value) => {
	// TODO URL encode compare
	if (!options.allowedCharRegExp.test(value)) {
		return "400 Bad Request";
	}
	return true;
};

export const validateBlacklist = (value) => {
	if (usernameBlacklistRegExp?.test(value)) {
		return "409 Conflict";
	}
	return true;
};
