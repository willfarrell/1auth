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

export const exists = async (secret) => {
	const digest = createDigest(secret);
	if (options.log) {
		options.log("@1auth/authn-access-token exists(", digest, ")");
	}
	return options.store.exists(options.table, { digest });
};

export const count = async (sub) => {
	if (options.log) {
		options.log("@1auth/authn-access-token count(", sub, ")");
	}
	return await authnCount(options.secret, sub);
};

export const lookup = async (secret) => {
	const digest = createDigest(secret);
	if (options.log) {
		options.log("@1auth/authn-access-token lookup(", digest, ")");
	}
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
	if (options.log) {
		options.log("@1auth/authn-access-token select(", sub, id, ")");
	}
	return await authnSelect(options.secret, sub, id);
};

export const list = async (sub) => {
	if (options.log) {
		options.log("@1auth/authn-access-token list(", sub, ")");
	}
	return await authnList(options.secret, sub);
};

// expire: expire duration (s)
export const create = async (sub, values = {}) => {
	if (options.log) {
		options.log("@1auth/authn-access-token create(", sub, values, ")");
	}
	const secret = await options.secret.create();
	const digest = createDigest(secret);
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

	return { id, secret };
};

export const expire = async (sub, id) => {
	if (options.log) {
		options.log("@1auth/authn-access-token expire(", sub, id, ")");
	}
	await authnExpire(options.secret, sub, id);
	await options.notify.trigger("authn-access-token-expire", sub);
};

export const remove = async (sub, id) => {
	if (options.log) {
		options.log("@1auth/authn-access-token remove(", sub, id, ")");
	}
	await authnRemove(options.secret, sub, id);
	await options.notify.trigger("authn-access-token-remove", sub);
};

const nowInSeconds = () => Math.floor(Date.now() / 1000);
