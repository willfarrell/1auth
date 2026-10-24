// Copyright 2003 - 2026 will Farrell, and 1Auth contributors.
// SPDX-License-Identifier: MIT
import { setTimeout } from "node:timers/promises";
import {
	assertId,
	assertSub,
	makeRandomConfigObject,
	nowInSeconds,
	symmetricDecryptFields,
	symmetricEncryptFields,
	symmetricGenerateEncryptionKey,
} from "@1auth/crypto";

const id = "authn";

export const randomId = ({ prefix = "authn_", ...params } = {}) =>
	makeRandomConfigObject({
		id,
		prefix,
		...params,
	});

const defaults = {
	id,
	log: false,
	store: undefined,
	notify: undefined,
	table: "authentications",
	idGenerate: true,
	randomId: randomId(),
	authenticationDuration: 250, // minimum duration authentication should take (ms), must exceed worst-case secret hash time
	otpMaxAttempts: 5,
	usernameExists: [], // hooks to allow what to be used as a username
	encryptedFields: ["value"],
};
const options = {};
export default (opt = {}) => {
	Object.assign(options, defaults, opt);
};
export const getOptions = () => options;

export const count = async (credentialOptions, sub) => {
	assertSub(sub);
	const type = makeType(credentialOptions);
	const credentials = await options.store.selectList(
		options.table,
		{ sub, type },
		["verify", "expire"],
	);
	let count = 0;
	const now = nowInSeconds();
	for (let i = credentials.length; i--; ) {
		const credential = credentials[i];
		if (credential.expire && credential.expire < now) {
			continue;
		}
		if (!credential.verify) {
			continue;
		}
		count += 1;
	}
	return count;
};

export const list = async (credentialOptions, sub, params, fields) => {
	assertSub(sub);
	const type = makeType(credentialOptions);
	const items = await options.store.selectList(
		options.table,
		{
			...params,
			sub,
			type,
		},
		fields,
	);
	const now = nowInSeconds();
	const list = [];
	for (let i = items.length; i--; ) {
		const item = items[i];
		if (item.expire && item.expire < now) {
			continue;
		}
		const { encryptionKey: encryptedKey } = item;
		item.encryptionKey = undefined;
		const decryptedItem = symmetricDecryptFields(
			item,
			{ encryptedKey, sub },
			options.encryptedFields,
		);
		list.push(decryptedItem);
	}
	return list;
};

const createCredential = async (
	credentialOptions,
	sub,
	{ id, value, expire, ...values },
) => {
	assertSub(sub);
	const now = nowInSeconds();
	const type = makeType(credentialOptions);
	const { otp } = credentialOptions;
	expire ??= credentialOptions.expire;
	expire &&= now + expire;

	if (options.idGenerate) {
		id ??= await options.randomId.create();
	}
	value ??= credentialOptions.create();
	const encodedValue = await credentialOptions.encode(value);

	const { encryptionKey, encryptedKey } = symmetricGenerateEncryptionKey(sub);
	const encryptedValues = symmetricEncryptFields(
		{ ...values, value: encodedValue },
		{ encryptionKey, sub },
		options.encryptedFields,
	);
	const params = {
		...encryptedValues,
		sub,
		type,
		otp,
		encryptionKey: encryptedKey,
		create: now,
		update: now,
	};
	if (expire) {
		params.expire = expire;
	}
	if (options.idGenerate) {
		params.id = id;
	}
	return params;
};

export const create = async (credentialOptions, sub, values) => {
	const params = await createCredential(credentialOptions, sub, values);
	const id = await options.store.insert(options.table, params);
	return { ...params, id };
};

export const createList = async (credentialOptions, sub, list) => {
	const rows = await Promise.all(
		list.map((values) => createCredential(credentialOptions, sub, values)),
	);
	const res = await options.store.insertList(options.table, rows);
	// SQL stores resolve `RETURNING id` rows, store-dynamodb resolves bare ids
	return res.map((row) => row.id ?? row);
};

// Only used by webauthn to update counter within value
export const update = async (
	credentialOptions,
	{ id, sub, encryptionKey, encryptedKey, value, ...values },
) => {
	const now = nowInSeconds();

	const encodedValue = await credentialOptions.encode(value);

	const encryptedValues = symmetricEncryptFields(
		{ ...values, value: encodedValue },
		{ encryptionKey, encryptedKey, sub },
		options.encryptedFields,
	);

	return await options.store.update(
		options.table,
		{ sub, id },
		{
			...encryptedValues,
			update: now,
		},
	);
};

export const subject = async (username) => {
	return await Promise.all(
		options.usernameExists.map((exists) => {
			return exists(username);
		}),
	).then((identities) => {
		return identities.filter((lookup) => lookup)[0];
	});
};

const dummyValues = new Map();
const dummyVerify = async (credentialOptions, secret, credentialParams) => {
	const type = makeType(credentialOptions);
	if (!dummyValues.has(type)) {
		dummyValues.set(
			type,
			(async () =>
				await credentialOptions.encode(await credentialOptions.create()))(),
		);
	}
	try {
		const value = await credentialOptions.decode(await dummyValues.get(type));
		await credentialOptions.verify(secret, value, {}, credentialParams);
	} catch (_e) {}
};

const decryptCredential = async (credentialOptions, sub, credential) => {
	const { encryptionKey: encryptedKey } = credential;
	const decryptedCredential = symmetricDecryptFields(
		credential,
		{ encryptedKey, sub },
		options.encryptedFields,
	);
	const { value, ...values } = decryptedCredential;
	return { value: await credentialOptions.decode(value), values };
};

export const authenticate = async (
	credentialOptions,
	username,
	secret,
	credentialParams = {},
) => {
	const timeout = setTimeout(options.authenticationDuration);

	const sub = await subject(username);
	if (!sub) {
		await dummyVerify(credentialOptions, secret, credentialParams);
		await timeout;
		throw new Error("401 Unauthorized", { cause: { username } });
	}
	const type = makeType(credentialOptions);
	const filters = { sub, type };
	if (credentialOptions.digest) {
		filters.digest = credentialOptions.digest;
	}

	const credentials = await options.store.selectList(options.table, filters, [
		"id",
		"encryptionKey",
		"value",
		"otp",
		"verify",
		"expire",
		"sourceId",
	]);
	const now = nowInSeconds();
	const candidates = [];
	let skipIgnoredCount = 0;
	let skipExpiredCount = 0;
	for (const credential of credentials) {
		// non-opt credentials must be verified before use
		if (!credential.otp && !credential.verify) {
			skipIgnoredCount += 1;
			continue;
		}
		// skip expired
		if (credential.expire && credential.expire < now) {
			skipExpiredCount += 1;
			continue;
		}
		candidates.push(credential);
	}
	if (!candidates.length) {
		await dummyVerify(credentialOptions, secret, credentialParams);
	}

	const results = await Promise.all(
		candidates.map(async (credential) => {
			try {
				const { value, values } = await decryptCredential(
					credentialOptions,
					sub,
					credential,
				);
				const valid = await credentialOptions.verify(
					secret,
					value,
					values,
					credentialParams,
				);
				return valid && { credential, value, values };
			} catch (e) {
				if (options.log) {
					options.log(e);
				}
			}
		}),
	);

	let valid;
	for (const result of results) {
		if (!result) {
			continue;
		}
		const { credential, value, values } = result;
		const { id, otp } = credential;
		if (otp) {
			const consumed = await remove(credentialOptions, sub, id);
			if (!consumed) {
				continue;
			}
		} else {
			await options.store.update(options.table, { id, sub }, { lastused: now });
		}

		if (credentialOptions.cleanup) {
			await credentialOptions.cleanup(sub, value, values);
		}
		valid = true;
		break;
	}

	await timeout;
	if (!valid) {
		// cause is for developer debugging only, never expose to end users
		let type = "invalid";
		const credentialsCount = credentials.length - skipIgnoredCount;
		if (credentialsCount === 0) {
			type = "missing";
		} else if (skipExpiredCount === credentialsCount) {
			type = "expired";
		}
		throw new Error("401 Unauthorized", { cause: { type } });
	}
	return sub;
};

export const verifySecret = async (_credentialOptions, sub, id) => {
	assertSub(sub, { id });
	assertId(id, { sub });
	const now = nowInSeconds();
	await options.store.update(
		options.table,
		{ sub, id },
		{ update: now, verify: now },
	);
};

export const verify = async (credentialOptions, sub, input) => {
	const timeout = setTimeout(options.authenticationDuration);
	if (!sub || typeof sub !== "string") {
		await timeout;
		throw new Error("401 Unauthorized", { cause: { sub } });
	}
	// Can be string or json (webauthn)
	if (!input) {
		await timeout;
		throw new Error("401 Unauthorized", { cause: { sub, input } });
	}

	const type = makeType(credentialOptions);
	const filters = { sub, type };
	if (credentialOptions.sourceId) {
		filters.sourceId = credentialOptions.sourceId;
	}

	const credentials = await options.store.selectList(options.table, filters);

	const now = nowInSeconds();
	let valid;
	let credential;
	let skipExpiredCount = 0;
	for (credential of credentials) {
		// skip expired
		if (credential.expire && credential.expire < now) {
			skipExpiredCount += 1;
			continue;
		}
		const { id, otp } = credential;
		try {
			const { value, values } = await decryptCredential(
				credentialOptions,
				sub,
				credential,
			);
			valid = await credentialOptions.verify(input, value, values);
		} catch (e) {
			if (options.log) {
				options.log(e);
			}
		}
		if (!valid) {
			if (otp) {
				await failedAttempt(credentialOptions, sub, credential);
			}
			continue;
		}
		if (otp) {
			const consumed = await remove(credentialOptions, sub, id);
			if (!consumed) {
				valid = undefined;
				continue;
			}
		}
		break;
	}

	await timeout;

	if (!valid) {
		// cause is for developer debugging only, never expose to end users
		let type = "invalid";
		const credentialsCount = credentials.length;
		if (credentialsCount === 0) {
			type = "missing";
		} else if (skipExpiredCount === credentialsCount) {
			type = "expired";
		}
		throw new Error("401 Unauthorized", { cause: { type } });
	}
	return { ...credential, ...valid };
};

const failedAttempt = async (credentialOptions, sub, { id, attempts }) => {
	attempts = (attempts ?? 0) + 1;
	if (attempts >= options.otpMaxAttempts) {
		await remove(credentialOptions, sub, id);
		return;
	}
	await options.store.update(options.table, { sub, id }, { attempts });
};

export const expire = async (_credentialOptions, sub, id, values = {}) => {
	assertSub(sub, { id });
	assertId(id, { sub });
	await options.store.update(
		options.table,
		{ sub, id },
		{ ...values, expire: nowInSeconds() - 1 },
	);
};

export const remove = async (credentialOptions, sub, id) => {
	assertSub(sub, { id });
	assertId(id, { sub });
	const type = makeType(credentialOptions);
	return await options.store.remove(options.table, { id, type, sub });
};

export const removeList = async (credentialOptions, sub, id) => {
	assertSub(sub, { id });
	if (!id || !Array.isArray(id) || !id.length) {
		throw new Error("404 Not Found", { cause: { sub, id } });
	}
	const type = makeType(credentialOptions);
	await options.store.removeList(options.table, { id, type, sub });
};

export const select = async (credentialOptions, sub, id) => {
	assertSub(sub, { id });
	assertId(id, { sub });
	const type = makeType(credentialOptions);
	const item = await options.store.select(options.table, { id, type, sub });
	if (!item) return item;
	const { encryptionKey: encryptedKey } = item;
	item.encryptionKey = undefined;
	const decryptedItem = symmetricDecryptFields(
		item,
		{ encryptedKey, sub },
		options.encryptedFields,
	);
	return decryptedItem;
};

export const makeType = (credentialOptions) =>
	`${credentialOptions.id}-${credentialOptions.type}`;
