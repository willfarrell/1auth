// Copyright 2003 - 2026 will Farrell, and 1Auth contributors.
// SPDX-License-Identifier: MIT
import {
	authenticate as authnAuthenticate,
	count as authnCount,
	// create as authnCreate,
	createList as authnCreateList,
	getOptions as authnGetOptions,
	//select as authnSelect,
	list as authnList,
	remove as authnRemove,
	removeList as authnRemoveList,
} from "@1auth/authn";
import {
	createSecretHash,
	makeRandomConfigObject,
	verifySecretHash,
} from "@1auth/crypto";

// aka lookup secret
const id = "recoveryCodes";

export const secret = ({
	type = "secret",
	entropy = 112,
	otp = true,
	encode = (value) => createSecretHash(value),
	decode = (value) => value,
	verify = (value, hash) => verifySecretHash(hash, value),
	...params
} = {}) =>
	makeRandomConfigObject({
		id,
		type,
		entropy,
		otp,
		encode,
		decode,
		verify,
		...params,
	});

const defaults = {
	id,
	secret: secret(),
	count: 5,
};
const options = {};
export default (opt = {}) => {
	Object.assign(options, authnGetOptions(), defaults, opt);
};

export const authenticate = async (username, secret) => {
	return await authnAuthenticate(options.secret, username, secret);
};

export const count = async (sub) => {
	return await authnCount(options.secret, sub);
};

// export const select = async (sub, id) => {
//   return await authnSelect(options.secret, sub, id);
// };

export const list = async (sub) => {
	return await authnList(options.secret, sub);
};

export const create = async (sub) => {
	const secrets = await createSecrets(sub, options.count);
	await options.notify.trigger("authn-recovery-codes-create", sub);
	return secrets;
};

export const update = async (sub) => {
	if (!sub || typeof sub !== "string") {
		throw new Error("401 Unauthorized", { cause: { sub } });
	}
	const existingSecrets = await options.store.selectList(options.table, {
		sub,
		type: `${options.secret.id}-${options.secret.type}`,
	});
	const secrets = await createSecrets(sub, options.count);

	const id = existingSecrets.map((item) => item.id);
	await authnRemoveList(options.secret, sub, id);

	await options.notify.trigger("authn-recovery-codes-update", sub);
	return secrets;
};

export const remove = async (sub, id) => {
	if (id) {
		await authnRemove(options.secret, sub, id);
	} else {
		if (!sub || typeof sub !== "string") {
			throw new Error("401 Unauthorized", { cause: { sub } });
		}
		const ids = await options.store
			.selectList(options.table, {
				sub,
				type: `${options.id}-${options.secret.type}`,
			})
			.then((res) => res.map((item) => item.id));
		await authnRemoveList(options.secret, sub, ids);
	}

	await options.notify.trigger("authn-recovery-codes-remove", sub);
};

const createSecrets = async (sub, count = options.count) => {
	const secrets = [];
	const now = nowInSeconds();
	for (let i = count; i--; ) {
		const secret = await options.secret.create();
		secrets.push({
			value: secret,
			verify: now,
		});
	}
	await authnCreateList(options.secret, sub, secrets);
	return secrets;
};

const nowInSeconds = () => Math.floor(Date.now() / 1000);
