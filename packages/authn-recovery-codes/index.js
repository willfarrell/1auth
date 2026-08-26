// Copyright 2003 - 2026 will Farrell, and 1Auth contributors.
// SPDX-License-Identifier: MIT
import {
	authenticate as authnAuthenticate,
	count as authnCount,
	createList as authnCreateList,
	getOptions as authnGetOptions,
	list as authnList,
	remove as authnRemove,
	removeList as authnRemoveList,
} from "@1auth/authn";
import {
	assertSub,
	createSecretHash,
	makeRandomConfigObject,
	nowInSeconds,
	verifySecretHash,
} from "@1auth/crypto";

// aka lookup secret
const id = "recoveryCodes";

export const secret = ({
	type = "secret",
	entropy = 128, // ASVS 5.0 11.5.1
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
	notifyId: "authn-recovery-codes", // template id prefix, set per instance when running more than one
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
	assertSub(sub);
	return await authnCount(options.secret, sub);
};

export const list = async (sub) => {
	return await authnList(options.secret, sub);
};

export const create = async (sub) => {
	const secrets = await createSecrets(sub, options.count);
	await options.notify.trigger(`${options.notifyId}-create`, sub);
	return secrets;
};

export const update = async (sub) => {
	assertSub(sub);
	const existingSecrets = await options.store.selectList(options.table, {
		sub,
		type: `${options.secret.id}-${options.secret.type}`,
	});
	const secrets = await createSecrets(sub, options.count);

	const id = existingSecrets.map((item) => item.id);
	await authnRemoveList(options.secret, sub, id);

	await options.notify.trigger(`${options.notifyId}-update`, sub);
	return secrets;
};

export const remove = async (sub, id) => {
	if (id) {
		await authnRemove(options.secret, sub, id);
	} else {
		assertSub(sub);
		const ids = await options.store
			.selectList(options.table, {
				sub,
				type: `${options.secret.id}-${options.secret.type}`,
			})
			.then((res) => res.map((item) => item.id));
		await authnRemoveList(options.secret, sub, ids);
	}

	await options.notify.trigger(`${options.notifyId}-remove`, sub);
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
