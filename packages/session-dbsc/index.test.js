import { deepEqual, equal, match, ok, throws } from "node:assert/strict";
import {
	sign as asymmetricSign,
	generateKeyPairSync,
	randomUUID,
} from "node:crypto";
import { describe, it, test } from "node:test";
import account, {
	create as accountCreate,
	remove as accountRemove,
} from "@1auth/account";
import * as mockAccountDynamoDBTable from "@1auth/account/table/dynamodb.js";
import * as mockAccountSQLTable from "@1auth/account/table/sql.js";
import accountUsername, {
	create as accountUsernameCreate,
} from "@1auth/account-username";
import * as mockAuthnDynamoDBTable from "@1auth/authn/table/dynamodb.js";
import * as mockAuthnSQLTable from "@1auth/authn/table/sql.js";
import crypto, {
	randomChecksumPepper,
	randomChecksumSalt,
	symmetricRandomEncryptionKey,
	symmetricRandomSignatureSecret,
} from "@1auth/crypto";
// *** Setup Start *** //
import * as notify from "@1auth/notify";
import * as session from "@1auth/session";
import * as mockSessionDynamoDBTable from "@1auth/session/table/dynamodb.js";
import * as mockSessionSQLTable from "@1auth/session/table/sql.js";
import * as storeDynamoDB from "@1auth/store-dynamodb";
import * as storeSQLite from "@1auth/store-sqlite";
import * as mockNotify from "../notify/mock.js";
import * as mockDynamoDB from "../store-dynamodb/mock.js";
import * as mockSQLite from "../store-sqlite/mock.js";
import dbsc, {
	dbscCookieHeader as dbscBoundCookieHeader,
	boundToken as dbscBoundToken,
	boundTokenVerify as dbscBoundTokenVerify,
	challenge as dbscChallenge,
	challengeHeader as dbscChallengeHeader,
	expire as dbscExpire,
	getOptions as dbscGetOptions,
	list as dbscList,
	lookup as dbscLookup,
	refresh as dbscRefresh,
	register as dbscRegister,
	registrationHeader as dbscRegistrationHeader,
	remove as dbscRemove,
	select as dbscSelect,
	sidCookieHeader as dbscSidCookieHeader,
	terminate as dbscTerminate,
	verifyProof as dbscVerifyProof,
} from "./index.js";

crypto({
	symmetricEncryptionKey: symmetricRandomEncryptionKey(),
	symmetricSignatureSecret: symmetricRandomSignatureSecret(),
	digestChecksumSalt: randomChecksumSalt(),
	digestChecksumPepper: randomChecksumPepper(),
	secretArgon2TimeCost: 1,
	secretArgon2MemoryCost: 2 ** 3,
	secretArgon2Parallelism: 1,
});
notify.default({
	client: (...args) => mocks.notifyClient(...args),
});

storeSQLite.default({
	log: (...args) => mocks.log(...args),
	client: {
		query: (...args) => mocks.storeClient.query(...args),
	},
});
storeDynamoDB.default({
	log: (...args) => mocks.log(...args),
	client: {
		send: (...args) => mocks.storeClient.send(...args),
	},
});

let mocks = {};

const mockStores = {
	sqlite: {
		store: storeSQLite,
		mocks: {
			...mockNotify,
			...mockSQLite,
			storeAccount: mockAccountSQLTable,
			storeAuthn: mockAuthnSQLTable,
			storeSession: mockSessionSQLTable,
		},
	},
	...(mockDynamoDB.isReady()
		? {
				dynamodb: {
					store: storeDynamoDB,
					mocks: {
						...mockNotify,
						...mockDynamoDB,
						storeAccount: mockAccountDynamoDBTable,
						storeAuthn: mockAuthnDynamoDBTable,
						storeSession: mockSessionDynamoDBTable,
					},
				},
			}
		: {}),
};

account();
accountUsername();
dbsc();
// *** Setup End *** //

// *** DBSC client, the part the browser would do *** //
const registerUrl = "https://example.com/auth/dbsc/register";
const refreshUrl = "https://example.com/auth/dbsc/refresh";

const makeDevice = (type = "ec") =>
	type === "ec"
		? generateKeyPairSync("ec", { namedCurve: "prime256v1" })
		: generateKeyPairSync("rsa", { modulusLength: 2048 });

const base64url = (value) =>
	Buffer.from(JSON.stringify(value)).toString("base64url");

const makeProof = (
	device,
	{
		alg = "ES256",
		typ = "dbsc+jwt",
		aud = registerUrl,
		jti,
		key,
		sub,
		tamper = false,
	} = {},
) => {
	const header = base64url({ typ, alg });
	const payload = base64url({
		aud,
		jti: jti ?? dbscChallenge(sub ?? ""),
		iat: Math.floor(Date.now() / 1000),
		key: key ?? device.publicKey.export({ format: "jwk" }),
		sub,
	});
	const signature = asymmetricSign(
		"sha256",
		Buffer.from(`${header}.${payload}`),
		alg === "ES256"
			? { key: device.privateKey, dsaEncoding: "ieee-p1363" }
			: { key: device.privateKey },
	).toString("base64url");
	if (tamper) {
		const swapped = base64url({
			aud,
			jti: jti ?? dbscChallenge(sub ?? ""),
			iat: 0,
			key: key ?? device.publicKey.export({ format: "jwk" }),
			sub,
		});
		return `${header}.${swapped}.${signature}`;
	}
	return `${header}.${payload}.${signature}`;
};

// Bare `throws()` passes on ANY error, including a ReferenceError thrown while
// building the error itself. Pin the message so only the real guard counts.
const throwsConfig = (fn, cause) =>
	throws(fn, (e) => {
		equal(e.message, "500 Internal Server Error");
		if (cause) {
			deepEqual(e.cause, cause);
		}
		return true;
	});

const rejects = async (fn, message = "401 Unauthorized", cause) => {
	try {
		await fn();
	} catch (e) {
		equal(e.message, message);
		if (cause) {
			deepEqual(e.cause, cause);
		}
		return;
	}
	throw new Error(`Expected ${message}`);
};

let sub;
const username = "username";

const tests = (config) => {
	const store = config.store;

	test.before(async () => {
		mocks = config.mocks;

		await mocks.storeAccount.create(mocks.storeClient);
		await mocks.storeAuthn.create(mocks.storeClient);
		await mocks.storeSession.create(mocks.storeClient);

		account({ store, notify });
		accountUsername();
		dbsc({
			store,
			notify,
			log: (...args) => {
				mocks.log(...args);
			},
		});
	});

	test.beforeEach(async (t) => {
		sub = await accountCreate();
		await accountUsernameCreate(sub, username);

		t.mock.method(mocks, "log");
		t.mock.method(mocks, "notifyClient");
	});

	test.afterEach(async (t) => {
		t.mock.reset();
		await accountRemove(sub);
		await mocks.storeSession.truncate(mocks.storeClient);
		await mocks.storeAuthn.truncate(mocks.storeClient);
		await mocks.storeAccount.truncate(mocks.storeClient);
	});

	test.after(async () => {
		await mocks.storeSession.drop(mocks.storeClient);
		await mocks.storeAuthn.drop(mocks.storeClient);
		await mocks.storeAccount.drop(mocks.storeClient);
		mocks.storeClient.after?.();
	});

	describe("config", () => {
		it("Ships the spec's defaults", () => {
			dbsc({});
			const options = dbscGetOptions();
			equal(options.id, "session-dbsc");
			equal(options.log, false);
			equal(options.challengeExpire, 5 * 60);
			equal(options.registerPath, "/dbsc/register");
			equal(options.refreshPath, "/dbsc/refresh");
			equal(options.sidCookieName, "__Host-Http-sid");
			equal(
				options.sidCookieAttributes,
				"Path=/; Secure; HttpOnly; SameSite=Strict",
			);
			equal(options.dbscCookieName, "__Host-Http-dbsc");
			equal(
				options.dbscCookieAttributes,
				"Path=/; Secure; HttpOnly; SameSite=Strict",
			);
			equal(options.dbscCookieExpire, 15 * 60);
			deepEqual(options.scope, { include_site: true });
		});
		it("Names the pair that is actually misconfigured", () => {
			throwsConfig(() => dbsc({ sidCookieAttributes: "Path=/; HttpOnly" }), {
				cookieName: "__Host-Http-sid",
				cookieAttributes: "Path=/; HttpOnly",
			});
			dbsc({});
			throwsConfig(() => dbsc({ dbscCookieAttributes: "Path=/; HttpOnly" }), {
				cookieName: "__Host-Http-dbsc",
				cookieAttributes: "Path=/; HttpOnly",
			});
			dbsc({});
		});
		it("Names both lifetimes when the bound cookie outlives the session", () => {
			const expire = session.getOptions().expire;
			throwsConfig(() => dbsc({ dbscCookieExpire: expire }), {
				dbscCookieExpire: expire,
				expire,
			});
			dbsc({});
		});
		it("Forwards everything it does not own to @1auth/session", () => {
			// an app configures one module, not two
			dbsc({ expire: 60 * 60 });
			try {
				equal(session.getOptions().expire, 60 * 60);
				// and keeps the store wiring from earlier calls rather than
				// replacing it
				ok(session.getOptions().store);
			} finally {
				dbsc({ expire: 12 * 60 * 60 });
			}
		});
		it("Sends `log` to both, since it means something to both", () => {
			const log = () => {};
			dbsc({ log });
			try {
				equal(dbscGetOptions().log, log);
				equal(session.getOptions().log, log);
			} finally {
				dbsc({ log: (...args) => mocks.log(...args) });
			}
		});
	});

	describe("`registrationHeader`", () => {
		it("Can offer both spec algorithms with a challenge", () => {
			const header = dbscRegistrationHeader();
			match(header, /^\(ES256 RS256\);path="[^"]+";challenge="[^"]+"$/);
		});
		it("Can name the configured register path", () => {
			match(
				dbscRegistrationHeader(),
				new RegExp(`;path="${dbscGetOptions().registerPath}";`),
			);
		});
		it("Can carry an authorization value", () => {
			match(
				dbscRegistrationHeader({ authorization: "abc" }),
				/;authorization="abc"$/,
			);
		});
	});

	describe("bound cookie prefix", () => {
		// The bound cookie is the credential, so its prefix rules matter more than
		// the session cookie's -- but both are validated and only one was covered
		it("Will throw when the bound cookie breaks its own prefix", () => {
			throwsConfig(() => dbsc({ dbscCookieAttributes: "Path=/; HttpOnly" }));
			dbsc({});
		});
		it("Will throw when `__Host-Http-` bound cookie sets a Domain", () => {
			throwsConfig(() =>
				dbsc({
					dbscCookieAttributes: "Domain=example.com; Path=/; Secure; HttpOnly",
				}),
			);
			dbsc({});
		});
		it("Can use a bound cookie with no prefix", () => {
			dbsc({ dbscCookieName: "dbsc", dbscCookieAttributes: "Path=/" });
			dbsc({});
		});
	});

	describe("lifetime ordering", () => {
		it("Will throw when the bound cookie outlives the session", () => {
			// Equal lifetimes mean the bound cookie never expires first, so the
			// browser never refreshes and the binding is never exercised
			throwsConfig(() =>
				dbsc({ dbscCookieExpire: session.getOptions().expire }),
			);
			dbsc({});
		});
		it("Will throw when the bound cookie outlasts the session", () => {
			throwsConfig(() =>
				dbsc({ dbscCookieExpire: session.getOptions().expire + 1 }),
			);
			dbsc({});
		});
	});

	describe("`boundTokenVerify` rejects malformed input", () => {
		it("Will reject a non-string token or session id", () => {
			equal(dbscBoundTokenVerify(undefined, "session_1"), false);
			equal(dbscBoundTokenVerify(1, "session_1"), false);
			equal(
				dbscBoundTokenVerify(dbscBoundToken("session_1"), undefined),
				false,
			);
		});
		it("Will reject a correctly signed payload with no separator", () => {
			// signed by us, so the signature checks out -- it is the shape that is
			// wrong, and that has to be caught rather than parsed optimistically
			equal(
				dbscBoundTokenVerify(session.sign("dbsc:nocolon"), "session_1"),
				false,
			);
		});
	});

	describe("token domain separation", () => {
		// A challenge and a bound token are the same shape over the same secret, so
		// without a domain tag each is accepted as the other. That matters because
		// they travel very differently: the bound cookie is HttpOnly so script
		// cannot read it, while the challenge is handed out in a response header
		// that script, proxies and logs can all see.
		it("Will NOT accept a challenge as a bound cookie", () => {
			const sessionId = "session_victim";
			const leaked = dbscChallengeHeader(sessionId).match(/^"([^"]+)"/)[1];
			equal(dbscBoundTokenVerify(leaked, sessionId), false);
		});
		it("Will NOT accept a bound cookie as a challenge", async () => {
			const device = makeDevice();
			// a registration proof whose `jti` is a bound token rather than a challenge
			await rejects(() =>
				dbscRegister(sub, makeProof(device, { jti: dbscBoundToken("") }), {
					aud: registerUrl,
				}),
			);
		});
	});

	describe("`challengeHeader`", () => {
		it("Can name the session the challenge is bound to", () => {
			match(dbscChallengeHeader("session_1"), /^"[^"]+";id="session_1"$/);
		});
	});

	describe("`terminate`", () => {
		it("Can tell the browser to stop", () => {
			equal(dbscTerminate("session_1").continue, false);
		});
	});

	describe("`cookieHeader` / `boundCookieHeader`", () => {
		it("Can build the session cookie with the row's lifetime", () => {
			const { sidCookieName, sidCookieAttributes } = dbscGetOptions();
			equal(
				dbscSidCookieHeader("sid_000"),
				`${sidCookieName}=sid_000; ${sidCookieAttributes}; Max-Age=${session.getOptions().expire}`,
			);
		});
		it("Can build the bound cookie with the bound lifetime", () => {
			const { dbscCookieName, dbscCookieAttributes, dbscCookieExpire } =
				dbscGetOptions();
			equal(
				dbscBoundCookieHeader("tok"),
				`${dbscCookieName}=tok; ${dbscCookieAttributes}; Max-Age=${dbscCookieExpire}`,
			);
		});
		it("Can not outlive the session it belongs to", () => {
			// The bound cookie is the short one. Equal lifetimes would mean nothing
			// ever expires early, so the browser would never refresh.
			ok(dbscGetOptions().dbscCookieExpire < session.getOptions().expire);
		});
		it("Can follow a reconfigured cookie", () => {
			dbsc({ sidCookieName: "sid", sidCookieAttributes: "Path=/" });
			try {
				equal(
					dbscSidCookieHeader("sid_000"),
					`sid=sid_000; Path=/; Max-Age=${session.getOptions().expire}`,
				);
			} finally {
				dbsc({});
			}
		});
	});

	describe("cookie prefix", () => {
		const reconfigure = (opt) => {
			try {
				dbsc({ ...opt });
			} finally {
				dbsc({});
			}
		};
		it("Can use the defaults", () => {
			reconfigure({});
			equal(dbscGetOptions().sidCookieName, "__Host-Http-sid");
		});
		it("Can use a cookie with no prefix", () => {
			reconfigure({ sidCookieName: "sid", sidCookieAttributes: "Path=/" });
		});
		it("Will throw when `__Host-Http-` sets a Domain", () => {
			throwsConfig(() =>
				reconfigure({
					sidCookieAttributes: "Domain=example.com; Path=/; Secure; HttpOnly",
				}),
			);
		});
		it("Will throw when `__Host-Http-` is not Secure", () => {
			throwsConfig(() =>
				reconfigure({ sidCookieAttributes: "Path=/; HttpOnly" }),
			);
		});
		it("Will throw when `__Host-Http-` is not Path=/", () => {
			throwsConfig(() =>
				reconfigure({ sidCookieAttributes: "Path=/auth; Secure; HttpOnly" }),
			);
		});
		it("Will throw when `__Host-Http-` is not HttpOnly", () => {
			throwsConfig(() =>
				reconfigure({ sidCookieAttributes: "Path=/; Secure; SameSite=Lax" }),
			);
		});
		it("Can use `__Host-` without HttpOnly", () => {
			reconfigure({
				sidCookieName: "__Host-sid",
				sidCookieAttributes: "Path=/; Secure; SameSite=Lax",
			});
		});
		it("Will throw when `__Http-` is not HttpOnly", () => {
			throwsConfig(() =>
				reconfigure({
					sidCookieName: "__Http-sid",
					sidCookieAttributes: "Domain=example.com; Path=/; Secure",
				}),
			);
		});
		it("Can use `__Http-` with a Domain", () => {
			reconfigure({
				sidCookieName: "__Http-sid",
				sidCookieAttributes: "Domain=example.com; Path=/; Secure; HttpOnly",
			});
		});
		it("Will throw when `__Secure-` is not Secure", () => {
			throwsConfig(() =>
				reconfigure({
					sidCookieName: "__Secure-sid",
					sidCookieAttributes: "Path=/; HttpOnly",
				}),
			);
		});
		it("Can use `__Secure-` with a Domain", () => {
			reconfigure({
				sidCookieName: "__Secure-sid",
				sidCookieAttributes: "Domain=example.com; Path=/; Secure; HttpOnly",
			});
		});
	});

	describe("`verifyProof`", () => {
		// Registration is the only case where there is legitimately no prior key
		it("Can verify a registration proof, which has no prior key", async () => {
			const device = makeDevice();
			const { publicKey } = await dbscVerifyProof(makeProof(device), {
				aud: registerUrl,
			});
			const { kty, crv, x, y } = device.publicKey.export({ format: "jwk" });
			equal(publicKey, JSON.stringify({ kty, crv, x, y }));
		});

		// A refresh names a session, so there MUST be a stored key to compare
		// against. Treating absent as "nothing to enforce" would accept a proof
		// signed by any key at all.
		it("Will throw on a refresh proof with no key to compare against", async () => {
			const device = makeDevice();
			const sessionId = "session_probe";
			await rejects(
				() =>
					dbscVerifyProof(
						makeProof(device, { aud: refreshUrl, sub: sessionId }),
						{
							aud: refreshUrl,
							sessionId,
						},
					),
				"401 Unauthorized",
				{ aud: refreshUrl, sessionId },
			);
		});
		it("Will name what it was checking when it refuses", async () => {
			// `cause` is developer-facing only, but it is the only thing that says
			// which endpoint and session a refusal was about
			await rejects(
				() => dbscVerifyProof("nope", { aud: registerUrl }),
				"401 Unauthorized",
				{ aud: registerUrl, sessionId: "" },
			);
		});
	});

	describe("`register`", () => {
		it("Will throw with an invalid sub", async () => {
			for (const badSub of [undefined, "", 0, 1234, null, {}]) {
				await rejects(
					() =>
						dbscRegister(badSub, makeProof(makeDevice()), {
							aud: registerUrl,
						}),
					"401 Unauthorized",
					{ sub: badSub },
				);
			}
		});

		it("Can bind a device key and open a session", async () => {
			const device = makeDevice();
			const {
				id,
				session: opened,
				config,
			} = await dbscRegister(sub, makeProof(device), {
				aud: registerUrl,
				value: { os: "MacOS" },
			});
			ok(id);
			ok(opened.sid);
			equal(config.session_identifier, id);
			equal(config.credentials[0].type, "cookie");
			equal(config.credentials[0].name, dbscGetOptions().dbscCookieName);

			const binding = await dbscSelect(sub, id);
			equal(binding.sub, sub);
			// stored in a fixed member order, whatever order the browser sent
			const { kty, crv, x, y } = device.publicKey.export({ format: "jwk" });
			equal(binding.publicKey, JSON.stringify({ kty, crv, x, y }));
		});

		it("Can bind an RS256 device key", async () => {
			const device = makeDevice("rsa");
			const { id } = await dbscRegister(
				sub,
				makeProof(device, { alg: "RS256" }),
				{
					aud: registerUrl,
				},
			);
			ok(id);
		});

		it("Will NOT store private key members sent in the proof", async () => {
			const device = makeDevice();
			const key = device.privateKey.export({ format: "jwk" }); // has `d`
			const { id } = await dbscRegister(sub, makeProof(device, { key }), {
				aud: registerUrl,
			});
			const binding = await dbscSelect(sub, id);
			equal(binding.publicKey.includes('"d"'), false);
			// and the public-only proof still matches on refresh
			const { bound } = await dbscRefresh(
				id,
				makeProof(device, { aud: refreshUrl, sub: id }),
				{ aud: refreshUrl },
			);
			ok(dbscBoundTokenVerify(bound, id));
		});

		it("Will throw when the proof is not a JWT", async () => {
			await rejects(() => dbscRegister(sub, "nope", { aud: registerUrl }));
			await rejects(() => dbscRegister(sub, undefined, { aud: registerUrl }));
			await rejects(() => dbscRegister(sub, "a.b.c", { aud: registerUrl }));
		});

		it("Will throw with the wrong `typ`", async () => {
			await rejects(() =>
				dbscRegister(sub, makeProof(makeDevice(), { typ: "JWT" }), {
					aud: registerUrl,
				}),
			);
		});

		it("Will throw with an unsupported `alg`", async () => {
			await rejects(() =>
				dbscRegister(sub, makeProof(makeDevice(), { alg: "none" }), {
					aud: registerUrl,
				}),
			);
		});

		it("Will throw when `aud` does not match the endpoint", async () => {
			await rejects(() =>
				dbscRegister(
					sub,
					makeProof(makeDevice(), { aud: "https://evil.test/" }),
					{
						aud: registerUrl,
					},
				),
			);
			await rejects(() => dbscRegister(sub, makeProof(makeDevice()), {}));
		});

		it("Will throw with an unsigned challenge", async () => {
			await rejects(() =>
				dbscRegister(sub, makeProof(makeDevice(), { jti: randomUUID() }), {
					aud: registerUrl,
				}),
			);
		});

		it("Will throw with an expired challenge", async () => {
			dbsc({ challengeExpire: -1 });
			try {
				await rejects(() =>
					dbscRegister(sub, makeProof(makeDevice()), { aud: registerUrl }),
				);
			} finally {
				dbsc({});
			}
		});

		it("Will throw when the payload is tampered with", async () => {
			await rejects(() =>
				dbscRegister(sub, makeProof(makeDevice(), { tamper: true }), {
					aud: registerUrl,
				}),
			);
		});

		it("Will throw when the key does not match the algorithm", async () => {
			const device = makeDevice();
			const key = makeDevice("rsa").publicKey.export({ format: "jwk" });
			await rejects(() =>
				dbscRegister(sub, makeProof(device, { key }), { aud: registerUrl }),
			);
		});

		it("Will throw with a weak RSA key", async () => {
			const device = generateKeyPairSync("rsa", { modulusLength: 1024 });
			await rejects(() =>
				dbscRegister(sub, makeProof(device, { alg: "RS256" }), {
					aud: registerUrl,
				}),
			);
		});

		it("Will throw with a malformed key", async () => {
			const device = makeDevice();
			await rejects(() =>
				dbscRegister(
					sub,
					makeProof(device, { key: { kty: "EC", crv: "P-256" } }),
					{
						aud: registerUrl,
					},
				),
			);
		});
	});

	describe("`refresh`", () => {
		it("Will throw with an invalid session identifier", async () => {
			for (const sessionId of [undefined, "", 0, 1234, null, {}]) {
				await rejects(
					() => dbscRefresh(sessionId, "", { aud: refreshUrl }),
					"401 Unauthorized",
					{ sessionId },
				);
			}
		});

		it("Will throw for an unknown session identifier", async () => {
			await rejects(
				() =>
					dbscRefresh(
						"session_unknown",
						makeProof(makeDevice(), { aud: refreshUrl }),
						{
							aud: refreshUrl,
						},
					),
				"401 Unauthorized",
				{ sessionId: "session_unknown" },
			);
		});

		it("Can mint a new bound cookie and leave `sid` alone", async () => {
			const device = makeDevice();
			const { id, session: first } = await dbscRegister(
				sub,
				makeProof(device),
				{ aud: registerUrl },
			);
			const {
				id: refreshedId,
				bound,
				config,
			} = await dbscRefresh(
				id,
				makeProof(device, { aud: refreshUrl, sub: id }),
				{ aud: refreshUrl },
			);
			equal(refreshedId, id);
			equal(config.session_identifier, id);
			// the bound credential is reissued...
			ok(dbscBoundTokenVerify(bound, id));
			// ...while `sid` keeps its value, so no row was rewritten
			ok(await dbscLookup(first.sid, bound));
		});

		it("Will throw when `sub` names a different session", async () => {
			const device = makeDevice();
			const { id } = await dbscRegister(sub, makeProof(device), {
				aud: registerUrl,
			});
			await rejects(() =>
				dbscRefresh(
					id,
					// challenge is bound to this session, but the proof claims another
					makeProof(device, {
						aud: refreshUrl,
						sub: "session_someoneelse",
						jti: dbscChallenge(id),
					}),
					{ aud: refreshUrl },
				),
			);
		});
		it("Will throw when a different key signs the proof", async () => {
			const device = makeDevice();
			const attacker = makeDevice();
			const { id } = await dbscRegister(sub, makeProof(device), {
				aud: registerUrl,
			});
			await rejects(() =>
				dbscRefresh(id, makeProof(attacker, { aud: refreshUrl, sub: id }), {
					aud: refreshUrl,
				}),
			);
		});

		it("Will throw when `sub` does not name the session", async () => {
			const device = makeDevice();
			const { id } = await dbscRegister(sub, makeProof(device), {
				aud: registerUrl,
			});
			await rejects(() =>
				dbscRefresh(id, makeProof(device, { aud: refreshUrl }), {
					aud: refreshUrl,
				}),
			);
		});

		it("Will throw when the challenge is bound to another session", async () => {
			const device = makeDevice();
			const { id } = await dbscRegister(sub, makeProof(device), {
				aud: registerUrl,
			});
			await rejects(() =>
				dbscRefresh(
					id,
					makeProof(device, {
						aud: refreshUrl,
						sub: id,
						jti: dbscChallenge("session_other"),
					}),
					{ aud: refreshUrl },
				),
			);
		});

		// The whole point of refresh: the cookie is meant to be dead by now
		it("Can refresh once the cookie has expired", async () => {
			const device = makeDevice();
			const {
				id,
				session: first,
				bound: firstBound,
			} = await dbscRegister(sub, makeProof(device), { aud: registerUrl });
			// A dead bound cookie leaves no trace server side -- Max-Age is the
			// browser's business -- so refresh cannot and does not check for it.
			const { bound } = await dbscRefresh(
				id,
				makeProof(device, { aud: refreshUrl, sub: id }),
				{ aud: refreshUrl },
			);
			ok(dbscBoundTokenVerify(bound, id));
			ok(await dbscLookup(first.sid, bound));
			// The previous token stays valid until its own expiry: it is stateless, so
			// a refresh mints a replacement rather than revoking anything. That costs
			// nothing on revocation, which belongs to `sid` -- expire or remove the row
			// and every outstanding token dies with it, since lookup resolves the row
			// first. What `dbscCookieExpire` caps is the theft case.
			ok(await dbscLookup(first.sid, firstBound));
		});

		// `expire` is set once at create and rotate never moves it, so it is the cap
		// on how long a login may last no matter how often it refreshes
		it("Will throw once past the absolute session cap", async () => {
			const device = makeDevice();
			// The cap is the row's own `expire` now, owned by @1auth/session. Mutate
			// the live options rather than reconfiguring, so the backend's store and
			// notify wiring survives.
			const sessionOptions = session.getOptions();
			const originalExpire = sessionOptions.expire;
			sessionOptions.expire = -1;
			try {
				const { id: expired } = await dbscRegister(sub, makeProof(device), {
					aud: registerUrl,
				});
				await rejects(() =>
					dbscRefresh(
						expired,
						makeProof(device, { aud: refreshUrl, sub: expired }),
						{ aud: refreshUrl },
					),
				);
			} finally {
				sessionOptions.expire = originalExpire;
			}
		});

		// With no key on the row there is nothing to compare against, so
		// `verifyProof` would take any well formed proof from anyone
		it("Will throw when the session carries no device key", async () => {
			const { id } = await session.create(sub, { os: "MacOS" });
			await rejects(() =>
				dbscRefresh(id, makeProof(makeDevice(), { aud: refreshUrl, sub: id }), {
					aud: refreshUrl,
				}),
			);
		});

		it("Will throw once the binding is removed", async () => {
			const device = makeDevice();
			const { id } = await dbscRegister(sub, makeProof(device), {
				aud: registerUrl,
			});
			await dbscRemove(sub, id);
			await rejects(() =>
				dbscRefresh(id, makeProof(device, { aud: refreshUrl, sub: id }), {
					aud: refreshUrl,
				}),
			);
		});
	});

	describe("`lookup`", () => {
		it("Will return nothing for an unknown sid", async () => {
			equal(await dbscLookup("sid_doesnotexist", "tok"), undefined);
		});
		it("Will return nothing for a bound session without a valid bound cookie", async () => {
			const device = makeDevice();
			const { session: opened } = await dbscRegister(sub, makeProof(device), {
				aud: registerUrl,
			});
			// the row carries a publicKey, so `sid` alone is no longer enough
			equal(await dbscLookup(opened.sid, undefined), undefined);
			equal(await dbscLookup(opened.sid, "not-a-token"), undefined);
		});
	});

	describe("unbound sessions", () => {
		it("Can create and look up a session with no device key", async () => {
			const currentDevice = { os: "MacOS" };
			const { id, sid } = await session.create(sub, currentDevice);
			ok(await session.lookup(sid, currentDevice));
			const binding = await session.selectBinding(id);
			equal(binding.id, id);
			ok(!binding.publicKey);
		});
		it("Can resolve an unbound session from `sid` alone", async () => {
			// no publicKey on the row: either registration has not happened yet, or
			// the browser does not do DBSC. Either way `sid` is the whole credential.
			const { sid } = await session.create(sub, {});
			ok(await dbscLookup(sid, undefined));
		});
		it("Can leave an unbound session untouched by a registration", async () => {
			const currentDevice = { os: "MacOS" };
			const { sid } = await session.create(sub, currentDevice);
			await dbscRegister(sub, makeProof(makeDevice()), { aud: registerUrl });
			ok(await session.lookup(sid, currentDevice));
			equal((await session.list(sub)).length, 2);
		});
	});

	describe("`list`/`select`/`expire`/`remove`", () => {
		it("Can list the bindings on an account", async () => {
			await dbscRegister(sub, makeProof(makeDevice()), { aud: registerUrl });
			await dbscRegister(sub, makeProof(makeDevice()), { aud: registerUrl });
			equal((await dbscList(sub)).length, 2);
		});
		it("Will throw with an invalid sub", async () => {
			for (const badSub of [undefined, "", 0, 1234, null, {}]) {
				await rejects(() => dbscList(badSub), "401 Unauthorized", {
					sub: badSub,
				});
				for (const fn of [dbscSelect, dbscExpire, dbscRemove]) {
					await rejects(() => fn(badSub, "session_1"), "401 Unauthorized", {
						sub: badSub,
						id: "session_1",
					});
				}
			}
		});
		it("Will throw with an invalid id", async () => {
			for (const badId of [undefined, "", 0, 1234, null, {}]) {
				for (const fn of [dbscSelect, dbscExpire, dbscRemove]) {
					await rejects(() => fn(sub, badId), "404 Not Found", {
						id: badId,
						sub,
					});
				}
			}
		});
	});
};

for (const store of Object.keys(mockStores)) {
	describe(`session-dbsc using ${store}`, () => tests(mockStores[store]));
}
