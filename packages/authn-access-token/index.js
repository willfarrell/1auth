// Copyright 2003 - 2026 will Farrell, and 1Auth contributors.
// SPDX-License-Identifier: MIT
import {
	authenticate as authnAuthenticate,
	count as authnCount,
	create as authnCreate,
	expire as authnExpire,
	getOptions as authnGetOptions,
	list as authnList,
	remove as authnRemove,
	select as authnSelect,
} from "@1auth/authn";
import {
	createDigest,
	createSecretHash,
	makeRandomConfigObject,
	verifySecretHash,
} from "@1auth/crypto";

const id = "accessToken";

export const username = ({
	type = "username",
	prefix = "pat-",
	entropy = 112,
	...params
} = {}) =>
	makeRandomConfigObject({
		id,
		type,
		prefix,
		entropy,
		...params,
	});

export const secret = ({
	type = "secret",
	prefix = "pat-",
	entropy = 112,
	otp = false,
	expire = 30 * 24 * 60 * 60,
	encode = (value) => createSecretHash(value),
	decode = (value) => value,
	verify = (value, hash) => verifySecretHash(hash, value),
	...params
} = {}) =>
	makeRandomConfigObject({
		id,
		type,
		prefix,
		entropy,
		otp,
		expire,
		encode,
		decode,
		verify,
		...params,
	});

const defaults = {
	id,
	username: username(),
	secret: secret(),
};
const options = {};
export default (opt = {}) => {
	Object.assign(options, authnGetOptions(), defaults, opt);
};

// authenticate(accessToken, accessToken)
export const authenticate = async (username, secret) => {
	return await authnAuthenticate(options.secret, username, secret);
};

export const exists = async (username) => {
	if (!username || typeof username !== "string") {
		throw new Error("404 Not Found", { cause: { username } });
	}
	const digest = createDigest(username);
	return options.store.exists(options.table, { digest });
};

export const count = async (sub) => {
	return await authnCount(options.secret, sub);
};

export const lookup = async (username) => {
	if (!username || typeof username !== "string") {
		throw new Error("404 Not Found", { cause: { username } });
	}
	const digest = createDigest(username);
	const authn = await options.store.select(options.table, { digest });
	if (authn) {
		const now = nowInSeconds();
		if (authn.expire < now) {
			return;
		}
		return authn;
	}
};

export const select = async (sub, id) => {
	return await authnSelect(options.secret, sub, id);
};

export const list = async (sub) => {
	return await authnList(options.secret, sub);
};

// expire: expire duration (s)
export const create = async (sub, values = {}) => {
	const username = await options.username.create();
	const digest = createDigest(username);
	const secret = await options.secret.create();
	const now = nowInSeconds();
	const { id, expire } = await authnCreate(options.secret, sub, {
		...values,
		value: secret,
		digest,
		verify: now,
	});
	await options.notify.trigger("authn-access-token-create", sub, {
		expire,
	});

	return { id, username, secret };
};

export const expire = async (sub, id) => {
	await authnExpire(options.secret, sub, id);
	await options.notify.trigger("authn-access-token-expire", sub);
};

export const remove = async (sub, id) => {
	await authnRemove(options.secret, sub, id);
	await options.notify.trigger("authn-access-token-remove", sub);
};

const nowInSeconds = () => Math.floor(Date.now() / 1000);
