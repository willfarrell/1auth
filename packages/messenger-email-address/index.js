// Copyright 2003 - 2026 will Farrell, and 1Auth contributors.
// SPDX-License-Identifier: MIT
import { createSeasonedDigest } from "@1auth/crypto";
import {
	count as messengerCount,
	create as messengerCreate,
	createToken as messengerCreateToken,
	exists as messengerExists,
	list as messengerList,
	lookup as messengerLookup,
	getOptions as messengerOptions,
	remove as messengerRemove,
	select as messengerSelect,
	token as messengerToken,
	verifyToken as messengerVerifyToken,
} from "@1auth/messenger";

import { toASCII } from "tr46";

const id = "emailAddress";

export const token = ({ ...params } = {}) =>
	messengerToken({
		id,
		...params,
	});

const defaults = {
	id,
	token: token(),

	// sanitize
	optionalDotDomains: [
		"gmail.com",
		"google.com",
		"googlemail.com",
		"yahoodns.net",
	],
	aliasDomains: {
		"protonmail.ch": "protonmail.com",
		"pm.me": "protonmail.com",
		"proton.me": "protonmail.com",
	},
	// validate
	usernameBlacklist: ["admin", "root", "sa"],
};
const options = {};
const optionalDotDomainsMap = {};
export default (opt = {}) => {
	Object.assign(options, messengerOptions(), defaults, opt);
	for (let i = defaults.optionalDotDomains.length; i--; ) {
		optionalDotDomainsMap[options.optionalDotDomains[i]] = true;
	}
};

export const exists = async (value) => {
	const valueSanitized = sanitize(value);
	return await messengerExists(options.id, valueSanitized);
};

export const count = async (sub) => {
	return await messengerCount(options.secret, sub);
};

export const lookup = async (emailAddress) => {
	const emailAddressSanitized = sanitize(emailAddress);
	return await messengerLookup(options.id, emailAddressSanitized);
};

export const list = async (sub) => {
	return messengerList(options.id, sub);
};

export const select = async (sub, id) => {
	return await messengerSelect(options.id, sub, id);
};

export const create = async (sub, value, values = {}) => {
	const valueSanitized = sanitize(value);
	const valueValidate = validate(valueSanitized);
	if (valueValidate !== true) {
		throw new Error(valueValidate, {
			cause: { value, valueSanitized },
		});
	}
	const digest = createSeasonedDigest(valueSanitized);
	return await messengerCreate(options.id, sub, { ...values, value, digest });
};

export const remove = async (sub, id) => {
	await messengerRemove(options.id, sub, id);
};

export const createToken = async (sub, sourceId) => {
	return messengerCreateToken(options.id, sub, sourceId);
};

export const verifyToken = async (sub, token, sourceId) => {
	await messengerVerifyToken(options.id, sub, token, sourceId);
};

export const sanitize = (value) => {
	if (!value || typeof value !== "string") {
		throw new Error("400 Bad Request", { cause: { value } });
	}
	let [username, domain] = value.split("@");

	// not a valid email
	if (!domain) return value;

	username = username.trimStart().split("+")[0].toLowerCase(); // TODO puntycode?
	domain = toASCII(domain).trimEnd().toLowerCase();

	if (optionalDotDomainsMap[domain]) {
		username = username.replaceAll(".", "");
	}
	if (options.aliasDomains[domain]) {
		domain = options.aliasDomains[domain];
	}

	return `${username}@${domain}`;
};

const regexp =
	/^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i;
export const validate = (value) => {
	const [, domain] = value.split("@");
	if (!regexp.test(value)) {
		return "400 Bad Request";
	}
	if (
		options.usernameBlacklist.filter(
			(username) => `${username}@${domain}` === value,
		).length
	) {
		return "409 Conflict";
	}
	return true;
};

export const mask = (value) => {
	const [username, domain] = value.split("@");

	return `${username.substring(0, 1)}...${username.substring(username.length - 1)}@${domain}`;
};
