import {
	makeRandomConfigObject,
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
export default (params) => {
	Object.assign(options, defaults, params);
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
	const sub = await options.randomSubject.create(options.subPrefix);

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
		params.id = await options.randomId.create(options.idPrefix);
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

/* export const expire = async (sub) => {
  const expire = nowInSeconds() + 90 * 24 * 60 * 60
  await options.store.update(options.table, { sub }, { expire })
  await options.notify.trigger('account-expire', sub)
  // TODO clear sessions
}

export const recover = async (sub) => {
  await options.store.update(options.table, { sub }, { expire: null })
  await options.notify.trigger('account-recover', sub)
} */

// TODO manage onboard state

// TODO save notification settings

// TODO authorize management?

const nowInSeconds = () => Math.floor(Date.now() / 1000);
