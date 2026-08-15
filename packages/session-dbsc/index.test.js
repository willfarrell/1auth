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
	nowInSeconds,
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
		sendJwk,
		// `aud: undefined` cannot express "leave it out" -- the default parameter
		// puts registerUrl back -- and leaving it out is the shape a real browser
		// sends, so it needs its own flag.
		omitAud = false,
		tamper = false,
	} = {},
) => {
	// The key rides in the JOSE header, and only at registration. A refresh names
	// the session it is refreshing (`sub`), so the server already holds the key and
	// the spec forbids sending it again. `sendJwk` overrides that to build the
	// proofs a browser would never send.
	const header = base64url(
		(sendJwk ?? !sub)
			? { typ, alg, jwk: key ?? device.publicKey.export({ format: "jwk" }) }
			: { typ, alg },
	);
	const challenge = jti ?? dbscChallenge(sub ?? "");
	// JSON.stringify drops undefined values, which is how `sub` stays off a
	// registration proof and how `omitAud` drops the audience.
	const claims = (iat) =>
		base64url({ aud: omitAud ? undefined : aud, jti: challenge, iat, sub });
	const payload = claims(Math.floor(Date.now() / 1000));
	const signature = asymmetricSign(
		"sha256",
		Buffer.from(`${header}.${payload}`),
		alg === "ES256"
			? { key: device.privateKey, dsaEncoding: "ieee-p1363" }
			: { key: device.privateKey },
	).toString("base64url");
	if (tamper) {
		return `${header}.${claims(0)}.${signature}`;
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
			equal(options.challengeExpire, 1 * 60);
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
			equal(options.dbscCookieExpire, 5 * 60);
			deepEqual(options.scope, { include_site: false });
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

	describe("scope", () => {
		// A host-only cookie cannot reach a sibling host, so a site scoped session
		// puts those requests in scope of a credential that can never be attached:
		// they defer into a refresh that cannot satisfy them. Unshippable rather
		// than slow, because the only symptom is latency on another host.
		it("Will throw when a site scope rides a `__Host-` bound cookie", () => {
			throwsConfig(() => dbsc({ scope: { include_site: true } }), {
				dbscCookieName: "__Host-Http-dbsc",
				scope: { include_site: true },
			});
			dbsc({});
		});
		it("Will throw for the shorter `__Host-` prefix too", () => {
			throwsConfig(() =>
				dbsc({
					dbscCookieName: "__Host-dbsc",
					dbscCookieAttributes: "Path=/; Secure",
					scope: { include_site: true },
				}),
			);
			dbsc({});
		});
		it("Can scope to the site with a cookie that can reach it", () => {
			dbsc({
				dbscCookieName: "__Secure-dbsc",
				dbscCookieAttributes: "Domain=example.com; Path=/; Secure; HttpOnly",
				scope: { include_site: true },
			});
			deepEqual(dbscGetOptions().scope, { include_site: true });
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
		it("Can take a challenge shorter lived than the bound cookie", () => {
			// The default pairing. A challenge that dies first is stale by the time
			// the cookie expires, and that is answered with 403 and a fresh one
			// rather than a logout -- so shorter is just a smaller replay window.
			const { challengeExpire, dbscCookieExpire } = dbscGetOptions();
			ok(challengeExpire < dbscCookieExpire);
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
			await rejects(
				() =>
					dbscRegister(sub, makeProof(device, { jti: dbscBoundToken("") }), {
						aud: registerUrl,
					}),
				"403 Forbidden",
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
		it("Will refuse a proof whose `aud` is present but not a string", async () => {
			for (const aud of [1234, null, {}, ["a"]]) {
				await rejects(
					() =>
						dbscVerifyProof(
							`${base64url({ typ: "dbsc+jwt", alg: "ES256" })}.${base64url({ aud })}.signature`,
							{ aud: registerUrl },
						),
					"401 Unauthorized",
					{ aud: registerUrl, sessionId: "" },
				);
			}
		});
		// Spec 9.10 requires only `jti` in the payload; `aud` is in the example, not
		// the normative list, and Chrome sends `{jti}` alone at registration. Refusing
		// those proofs meant no browser could ever bind a session, so an omitted `aud`
		// has to reach the signature check rather than being rejected outright.
		//
		// It reaches the challenge check too, which is where the endpoint binding an
		// `aud` would have given us actually comes from: `jti` is this server's own
		// single-use token, issued per endpoint.
		it("Will accept a registration proof that omits `aud` entirely", async () => {
			const device = makeDevice();
			const { publicKey } = await dbscVerifyProof(
				makeProof(device, { omitAud: true }),
				{ aud: registerUrl },
			);
			const { kty, crv, x, y } = device.publicKey.export({ format: "jwk" });
			equal(publicKey, JSON.stringify({ kty, crv, x, y }));
		});
		it("Will still refuse an `aud`-less proof carrying another endpoint's challenge", async () => {
			const device = makeDevice();
			await rejects(
				() =>
					dbscVerifyProof(
						// A refresh challenge names its session; registration signs the
						// session-less one, so this is the cross-endpoint replay that `aud`
						// would have caught -- and `jti` still does.
						makeProof(device, {
							omitAud: true,
							jti: dbscChallenge("session_other"),
						}),
						{ aud: registerUrl },
					),
				"403 Forbidden",
				{ aud: registerUrl, sessionId: "" },
			);
		});
		it("Will refuse a proof whose payload is not an object", async () => {
			// `JSON.parse("null")` succeeds, so the payload survives the decode and
			// only the optional chain keeps the property read from throwing
			await rejects(
				() =>
					dbscVerifyProof(
						`${base64url({ typ: "dbsc+jwt", alg: "ES256" })}.${base64url(null)}.signature`,
						{ aud: registerUrl },
					),
				"401 Unauthorized",
				{ aud: registerUrl, sessionId: "" },
			);
		});
		// The key crosses the wire once, in the JOSE header at registration. A
		// refresh that carried its own key would certify itself, so the spec forbids
		// `jwk` there and the server verifies against what it already stored.
		it("Will throw on a registration proof with no `jwk` header", async () => {
			const device = makeDevice();
			await rejects(
				() =>
					dbscVerifyProof(makeProof(device, { sendJwk: false }), {
						aud: registerUrl,
					}),
				"401 Unauthorized",
				{ aud: registerUrl, sessionId: "" },
			);
		});
		it("Will throw on a refresh proof carrying its own `jwk`", async () => {
			const attacker = makeDevice();
			const sessionId = "session_selfsigned";
			await rejects(
				() =>
					dbscVerifyProof(
						makeProof(attacker, {
							aud: refreshUrl,
							sub: sessionId,
							sendJwk: true,
						}),
						{
							aud: refreshUrl,
							sessionId,
							publicKey: JSON.stringify(
								makeDevice().publicKey.export({ format: "jwk" }),
							),
						},
					),
				"401 Unauthorized",
				{ aud: refreshUrl, sessionId },
			);
		});
		it("Will throw when the stored key is not readable", async () => {
			// A corrupt binding fails closed rather than reading as "no key to check"
			const device = makeDevice();
			const sessionId = "session_corrupt";
			for (const publicKey of ["{", "null", '{"kty":"EC"}']) {
				await rejects(
					() =>
						dbscVerifyProof(
							makeProof(device, { aud: refreshUrl, sub: sessionId }),
							{
								aud: refreshUrl,
								sessionId,
								publicKey,
							},
						),
					"401 Unauthorized",
					{ aud: refreshUrl, sessionId },
				);
			}
		});
		it("Will throw when the stored key is a different type than `alg`", async () => {
			// a session bound to an EC key cannot be refreshed by an RS256 proof
			const device = makeDevice("rsa");
			const sessionId = "session_swapped";
			await rejects(
				() =>
					dbscVerifyProof(
						makeProof(device, {
							alg: "RS256",
							aud: refreshUrl,
							sub: sessionId,
						}),
						{
							aud: refreshUrl,
							sessionId,
							publicKey: JSON.stringify(
								makeDevice().publicKey.export({ format: "jwk" }),
							),
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

		it("Will throw on an ES256 proof from the wrong curve", async () => {
			// DBSC names exactly one curve for ES256. The proof below is internally
			// consistent -- P-384 key, P-384 signature -- so only the curve check
			// stands between it and a binding.
			const device = generateKeyPairSync("ec", { namedCurve: "secp384r1" });
			await rejects(
				() => dbscRegister(sub, makeProof(device), { aud: registerUrl }),
				"401 Unauthorized",
			);
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
			// A craving permits only domain/path/secure/httponly/samesite. Anything
			// else makes Chromium drop the session, so it never refreshes.
			for (const attribute of config.credentials[0].attributes.split(";")) {
				ok(
					["domain", "path", "secure", "httponly", "samesite"].includes(
						attribute.split("=")[0].trim().toLowerCase(),
					),
					`unpermitted craving attribute: ${attribute}`,
				);
			}
			// ... while the Set-Cookie still has to expire, or nothing triggers one
			ok(dbscBoundCookieHeader("token").includes("Max-Age="));

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

		// Both of these are retriable: the signature already proved the device, so a
		// challenge that doesn't line up is a stale one, not an attacker. 403 is the
		// only status the browser retries -- 401 would log the person out.
		it("Will throw with an unsigned challenge", async () => {
			await rejects(
				() =>
					dbscRegister(sub, makeProof(makeDevice(), { jti: randomUUID() }), {
						aud: registerUrl,
					}),
				"403 Forbidden",
			);
		});

		it("Will throw with an expired challenge", async () => {
			// Mutate the live option rather than reconfiguring: default() now refuses
			// a challenge shorter than the bound cookie, which is the whole point of
			// the guard, so this is the only way to reach an expired one.
			const dbscOptions = dbscGetOptions();
			const original = dbscOptions.challengeExpire;
			dbscOptions.challengeExpire = -1;
			try {
				await rejects(
					() =>
						dbscRegister(sub, makeProof(makeDevice()), { aud: registerUrl }),
					"403 Forbidden",
				);
			} finally {
				dbscOptions.challengeExpire = original;
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
		// Every other refresh test here hands in `sub: id`, which is OUR shape, not
		// the browser's. Chromium's CreateKeyRefreshHeaderAndPayload sets exactly
		// one claim -- `payload.Set("jti", *challenge)` -- so a real refresh proof
		// carries no `sub` and no `aud`. Requiring `sub` 401s every refresh Chrome
		// ever sends, and a 401 tears the session down.
		it("Can refresh with a Chrome-shaped proof: `jti` and nothing else", async () => {
			const device = makeDevice();
			const { id } = await dbscRegister(sub, makeProof(device), {
				aud: registerUrl,
			});
			const refreshed = await dbscRefresh(
				id,
				makeProof(device, {
					omitAud: true,
					sendJwk: false,
					jti: dbscChallenge(id),
				}),
				{ aud: refreshUrl },
			);
			equal(refreshed.id, id);
			ok(refreshed.bound);
		});

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

		it("Will throw once the binding's absolute lifetime has passed", async () => {
			const device = makeDevice();
			const { id } = await dbscRegister(sub, makeProof(device), {
				aud: registerUrl,
			});
			// `expire` on the row is the absolute cap, so age it past now
			await store.update(
				session.getOptions().table,
				{ sub, id },
				{ expire: nowInSeconds() - 1 },
			);
			await rejects(
				() =>
					dbscRefresh(id, makeProof(device, { aud: refreshUrl, sub: id }), {
						aud: refreshUrl,
					}),
				"401 Unauthorized",
				{ sessionId: id },
			);
		});

		it("Can refresh a binding expiring on the current second", async (t) => {
			const device = makeDevice();
			const { id } = await dbscRegister(sub, makeProof(device), {
				aud: registerUrl,
			});
			// the cap is exclusive: a binding dying this very second is still live
			const now = nowInSeconds();
			await store.update(
				session.getOptions().table,
				{ sub, id },
				{ expire: now },
			);
			t.mock.timers.enable({ apis: ["Date"], now: now * 1000 });
			try {
				const { id: refreshedId } = await dbscRefresh(
					id,
					makeProof(device, { aud: refreshUrl, sub: id }),
					{ aud: refreshUrl },
				);
				equal(refreshedId, id);
			} finally {
				t.mock.timers.reset();
			}
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
			await rejects(
				() =>
					dbscRefresh(
						id,
						makeProof(device, {
							aud: refreshUrl,
							sub: id,
							jti: dbscChallenge("session_other"),
						}),
						{ aud: refreshUrl },
					),
				"403 Forbidden",
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
