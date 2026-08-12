// Copyright 2003 - 2026 will Farrell, and 1Auth contributors.
// SPDX-License-Identifier: MIT
import { verify as asymmetricVerify, createPublicKey } from "node:crypto";
import {
	assertSub,
	nowInSeconds,
	safeEqual,
	symmetricSignatureSign,
	symmetricSignatureVerify,
} from "@1auth/crypto";
import * as session from "@1auth/session";

const id = "session-dbsc";

// https://www.w3.org/TR/dbsc/ defines these two, and only these two
const algorithms = {
	ES256: {
		kty: "EC",
		members: ["kty", "crv", "x", "y"],
		hashAlgorithm: "sha256",
		verifyOptions: { dsaEncoding: "ieee-p1363" }, // JWS uses raw r||s, not DER
		check: ({ namedCurve }) => namedCurve === "prime256v1",
	},
	RS256: {
		kty: "RSA",
		members: ["kty", "n", "e"],
		hashAlgorithm: "sha256",
		verifyOptions: {},
		check: ({ modulusLength }) => modulusLength >= 2048,
	},
};

const defaults = {
	id,
	log: false,
	challengeExpire: 1 * 60,
	registerPath: "/dbsc/register",
	refreshPath: "/dbsc/refresh",
	sidCookieName: "__Host-Http-sid",
	sidCookieAttributes: "Path=/; Secure; HttpOnly; SameSite=Strict",
	dbscCookieName: "__Host-Http-dbsc",
	dbscCookieAttributes: "Path=/; Secure; HttpOnly; SameSite=Strict",
	dbscCookieExpire: 5 * 60,
	scope: { include_site: false },
};

// Longest prefix first, `__Host-Http-` is a superset of `__Host-`
const cookiePrefixes = [
	["__Host-Http-", { secure: true, hostOnly: true, httpOnly: true }],
	["__Host-", { secure: true, hostOnly: true }],
	["__Http-", { secure: true, httpOnly: true }],
	["__Secure-", { secure: true }],
];

// Reads the prefix table rather than matching `__Host-` by hand, so
// `__Host-Http-` counts too and there is one place that says what a prefix means
const hostOnlyCookie = (cookieName) =>
	cookiePrefixes.find(([prefix]) => cookieName.startsWith(prefix))?.[1]
		?.hostOnly === true;

// Whole-attribute match, not a substring: `Path=/foo` does not satisfy `Path=/`,
// and `Domain=secure.example.com` does not satisfy `Secure`. Those are the two
// misconfigurations this check exists to catch, and `includes()` passes both.
const attributeSet = (attributes, name) =>
	attributes
		.split(";")
		.some((attribute) => attribute.trim().toLowerCase() === name.toLowerCase());

// Everything else passed to default() belongs to @1auth/session, so an app
// configures one module rather than wiring two together
const ownKeys = new Set([
	"id",
	"log",
	"challengeExpire",
	"registerPath",
	"refreshPath",
	"sidCookieName",
	"sidCookieAttributes",
	"dbscCookieName",
	"dbscCookieAttributes",
	"dbscCookieExpire",
	"scope",
]);

const options = {};
// Accumulated, because session.default() replaces rather than merges: forwarding
// only the newest call would wipe `store` the moment anyone reconfigured a
// cookie option
const forwardedOptions = {};
export default (opt = {}) => {
	const own = {};
	const forwarded = {};
	for (const [key, value] of Object.entries(opt)) {
		if (ownKeys.has(key)) own[key] = value;
		// `log` is meaningful to both, so it goes to both rather than either
		if (!ownKeys.has(key) || key === "log") forwarded[key] = value;
	}
	Object.assign(forwardedOptions, forwarded);
	session.default(forwardedOptions);
	Object.assign(options, defaults, own);
	assertCookie("sidCookieName", "sidCookieAttributes");
	assertCookie("dbscCookieName", "dbscCookieAttributes");
	if (options.scope?.include_site && hostOnlyCookie(options.dbscCookieName)) {
		throw new Error("500 Internal Server Error", {
			cause: {
				dbscCookieName: options.dbscCookieName,
				scope: options.scope,
			},
		});
	}
	// The bound cookie has to die before the session does, or the browser never
	// reaches an expiry to refresh on and the binding is never exercised: a green
	// looking deployment where DBSC does nothing at all.
	const sessionExpire = session.getOptions().expire;
	if (!(options.dbscCookieExpire < sessionExpire)) {
		throw new Error("500 Internal Server Error", {
			cause: {
				dbscCookieExpire: options.dbscCookieExpire,
				expire: sessionExpire,
			},
		});
	}
};

// Takes the option KEYS, not their values, so a failure names the pair that is
// actually wrong rather than a generic `cookieName`
const assertCookie = (nameKey, attributesKey) => {
	const cookieName = options[nameKey];
	const cookieAttributes = options[attributesKey];
	const rules = cookiePrefixes.find(([prefix]) =>
		cookieName.startsWith(prefix),
	)?.[1];
	const valid =
		!rules ||
		((!rules.secure || attributeSet(cookieAttributes, "Secure")) &&
			(!rules.httpOnly || attributeSet(cookieAttributes, "HttpOnly")) &&
			(!rules.hostOnly ||
				(attributeSet(cookieAttributes, "Path=/") &&
					!/(^|;)\s*Domain=/i.test(cookieAttributes))));
	if (!valid) {
		throw new Error("500 Internal Server Error", {
			cause: { cookieName, cookieAttributes },
		});
	}
};
export const getOptions = () => options;

const signedToken = (domain, sessionId) =>
	symmetricSignatureSign(`${domain}:${nowInSeconds()}:${sessionId}`);

const signedTokenVerify = (domain, value, sessionId, expire) => {
	if (typeof value !== "string" || typeof sessionId !== "string") return false;
	const data = symmetricSignatureVerify(value);
	if (!data) return false;
	const prefix = `${domain}:`;
	if (!data.startsWith(prefix)) return false;
	const rest = data.substring(prefix.length);
	const separator = rest.indexOf(":");
	if (separator < 0) return false;
	if (!safeEqual(rest.substring(separator + 1), sessionId)) return false;
	const created = Number(rest.substring(0, separator));
	const now = nowInSeconds();
	return created <= now && now < created + expire;
};

export const challenge = (sessionId = "") =>
	signedToken("challenge", sessionId);

const challengeVerify = (value, sessionId = "") =>
	signedTokenVerify("challenge", value, sessionId, options.challengeExpire);

export const boundToken = (sessionId) => signedToken("dbsc", sessionId);

export const boundTokenVerify = (value, sessionId) =>
	signedTokenVerify("dbsc", value, sessionId, options.dbscCookieExpire);

// Response header that tells the browser to start a bound session
export const registrationHeader = ({ authorization } = {}) => {
	let header = `(${Object.keys(algorithms).join(" ")});path="${options.registerPath}";challenge="${challenge()}"`;
	if (authorization) {
		header += `;authorization="${authorization}"`;
	}
	return header;
};

// Response header that hands the browser a fresh challenge to cache
export const challengeHeader = (sessionId) =>
	`"${challenge(sessionId)}";id="${sessionId}"`;

// Response body of both the registration and refresh endpoints
const sessionConfig = (sessionId) => ({
	session_identifier: sessionId,
	refresh_url: options.refreshPath,
	scope: options.scope,
	credentials: [
		{
			type: "cookie",
			name: options.dbscCookieName,
			attributes: dbscAttributes(),
		},
	],
});

const dbscAttributes = () =>
	`${options.dbscCookieAttributes}; Max-Age=${options.dbscCookieExpire}`;

// The session cookie. Lives as long as the row, and is not the bound credential.
export const sidCookieHeader = (sid) =>
	`${options.sidCookieName}=${sid}; ${options.sidCookieAttributes}; Max-Age=${session.getOptions().expire}`;

// The bound credential, set on registration and replaced on every refresh.
export const dbscCookieHeader = (token) =>
	`${options.dbscCookieName}=${token}; ${dbscAttributes()}`;

// Response body that tells the browser to stop maintaining the session
export const terminate = (sessionId) => ({
	session_identifier: sessionId,
	continue: false,
});

// Drops private members (`d`, ...) and fixes member order, so the string
// stored at registration compares byte for byte on every refresh
const publicJwk = (jwk, members) =>
	Object.fromEntries(
		members
			.filter((member) => jwk[member] !== undefined)
			.map((member) => [member, jwk[member]]),
	);

export const verifyProof = async (
	proof,
	{ aud, sessionId = "", publicKey } = {},
) => {
	const unauthorized = () =>
		new Error("401 Unauthorized", { cause: { aud, sessionId } });
	if (typeof proof !== "string" || typeof aud !== "string") {
		throw unauthorized();
	}
	const parts = proof.split(".");
	if (parts.length !== 3) throw unauthorized();
	const [encodedHeader, encodedPayload, encodedSignature] = parts;

	let header;
	let payload;
	try {
		header = JSON.parse(Buffer.from(encodedHeader, "base64url"));
		payload = JSON.parse(Buffer.from(encodedPayload, "base64url"));
	} catch {
		throw unauthorized();
	}
	const algorithm = algorithms[header?.alg];
	if (header?.typ !== "dbsc+jwt" || !algorithm) throw unauthorized();
	if (payload?.aud !== undefined) {
		if (typeof payload.aud !== "string" || !safeEqual(payload.aud, aud)) {
			throw unauthorized();
		}
	}
	// `sub` only exists on refresh, where it must name the session being refreshed
	if (sessionId && payload.sub !== sessionId) throw unauthorized();
	// Fail closed on the refresh path. A refresh names a session, so a stored key
	// MUST exist to verify against -- without this, an absent `publicKey` reads as
	// "no binding to enforce" and any self-signed proof is accepted. Registration
	// is the one case with legitimately no prior key.
	if (sessionId && !publicKey) throw unauthorized();

	if (!sessionId && header.jwk === undefined) throw unauthorized();
	if (sessionId && header.jwk !== undefined) throw unauthorized();

	let jwk;
	try {
		jwk = publicJwk(
			sessionId ? JSON.parse(publicKey) : header.jwk,
			algorithm.members,
		);
	} catch {
		throw unauthorized();
	}
	// On refresh this pins the stored key's type to the claimed `alg`, so a session
	// bound to an EC key cannot be refreshed by an RS256 proof.
	if (jwk.kty !== algorithm.kty) throw unauthorized();

	let key;
	try {
		key = createPublicKey({ key: jwk, format: "jwk" });
	} catch {
		throw unauthorized();
	}
	if (!algorithm.check(key.asymmetricKeyDetails)) throw unauthorized();

	const verified = asymmetricVerify(
		algorithm.hashAlgorithm,
		Buffer.from(`${encodedHeader}.${encodedPayload}`),
		{ key, ...algorithm.verifyOptions },
		Buffer.from(encodedSignature, "base64url"),
	);
	if (!verified) throw unauthorized();

	if (!challengeVerify(payload.jti, sessionId)) {
		throw new Error("403 Forbidden", { cause: { aud, sessionId } });
	}
	return { publicKey: JSON.stringify(jwk), payload };
};

// A binding is a session row, so these are @1auth/session verbatim. `list`
// returns every session on the account, bound and unbound alike.
/**
 * Resolve a request's cookies to a session.
 * @param sid the `sidCookieName` cookie
 * @param bound the `dbscCookieName` cookie, absent until registration
 * @param value device metadata, compared as @1auth/session does
 */
export const lookup = async (sid, bound, value = {}) => {
	const found = await session.lookup(sid, value);
	if (!found) return;
	// An unbound row is `sid` alone: either registration has not happened yet, or
	// the browser does not do DBSC at all. Once a key IS bound the bound cookie is
	// required, so registering retroactively locks out a `sid` stolen beforehand.
	if (!found.publicKey) return found;
	if (!boundTokenVerify(bound, found.id)) return;
	return found;
};

export const select = async (sub, id) => await session.select(sub, id);

export const list = async (sub) => await session.list(sub);

/**
 * Bind a new device key, then open the first session on it
 * @param sub
 * @param proof Secure-Session-Response header (DBSC proof JWT)
 * @param aud URL the proof was sent to
 * @param value {os, browser, ip, ...} passed to session create
 */
export const register = async (
	sub,
	proof,
	{ aud, value = {}, values = {} } = {},
) => {
	// Fail before spending a signature verification on a request that cannot work
	assertSub(sub);
	const { publicKey } = await verifyProof(proof, { aud });
	// The session row IS the binding, so its id is the `session_identifier` the
	// browser caches and sends back as Sec-Session-Id
	const created = await session.create(sub, value, {
		...values,
		publicKey,
	});
	// The bound cookie is issued HERE, not on the login response: it proves
	// possession of a key that does not exist until this exchange registers it.
	return {
		id: created.id,
		session: created,
		bound: boundToken(created.id),
		config: sessionConfig(created.id),
	};
};

/**
 * Prove possession of the bound key, get a new short lived session cookie
 * @param sessionId Sec-Secure-Session-Id header
 * @param proof Secure-Session-Response header (DBSC proof JWT)
 * @param aud URL the proof was sent to
 */
export const refresh = async (
	sessionId,
	proof,
	{ aud, value = {}, values = {} } = {},
) => {
	if (!sessionId || typeof sessionId !== "string") {
		throw new Error("401 Unauthorized", { cause: { sessionId } });
	}
	const binding = await session.selectBinding(sessionId);
	// An unbound session has no key to compare the proof against, and
	// `verifyProof` skips that comparison when there is nothing to compare, so
	// refusing here is what stops any well formed proof from taking it over.
	if (!binding?.publicKey) {
		throw new Error("401 Unauthorized", { cause: { sessionId } });
	}
	// `expire` on the row IS the absolute cap now, set once at create and never
	// moved by rotate(), so checking it here is the whole termination rule. The
	// dead COOKIE is not this check: that is the browser's Max-Age, and it being
	// dead is precisely why the browser is here.
	if (binding.expire && binding.expire < nowInSeconds()) {
		throw new Error("401 Unauthorized", { cause: { sessionId } });
	}
	await verifyProof(proof, {
		aud,
		sessionId,
		publicKey: binding.publicKey,
	});
	// In place, so `sessionId` stays the identifier the browser already holds
	return {
		id: sessionId,
		bound: boundToken(sessionId),
		config: sessionConfig(sessionId),
	};
};

// Ends the cookie, NOT the binding: a bound session can still be refreshed
// until the absolute cap. Use `remove` to revoke a device.
export const expire = async (sub, id) => await session.expire(sub, id);

export const remove = async (sub, id) => await session.remove(sub, id);
