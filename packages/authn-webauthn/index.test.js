import { deepEqual, equal, notEqual, ok, throws } from "node:assert/strict";
import { sign as asymmetricSign, generateKeyPairSync } from "node:crypto";
import { describe, it, test } from "node:test";
import account, {
	create as accountCreate,
	remove as accountRemove,
} from "@1auth/account";
import * as mockAccountDynamoDBTable from "@1auth/account/table/dynamodb.js";
import * as mockAccountSQLTable from "@1auth/account/table/sql.js";
import accountUsername, {
	create as accountUsernameCreate,
	exists as accountUsernameExists,
} from "@1auth/account-username";
import authn, { getOptions as authnGetOptions } from "@1auth/authn";
import * as mockAuthnDynamoDBTable from "@1auth/authn/table/dynamodb.js";
import * as mockAuthnSQLTable from "@1auth/authn/table/sql.js";
import crypto, {
	nowInSeconds,
	randomChecksumPepper,
	randomChecksumSalt,
	symmetricDecrypt,
	symmetricEncrypt,
	symmetricRandomEncryptionKey,
	symmetricRandomSignatureSecret,
} from "@1auth/crypto";
// *** Setup Start *** //
import * as notify from "@1auth/notify";
import * as storeDynamoDB from "@1auth/store-dynamodb";
import * as storePostgres from "@1auth/store-postgres";
import * as storeSQLite from "@1auth/store-sqlite";
import { isoBase64URL, isoCBOR } from "@simplewebauthn/server/helpers";
import * as mockNotify from "../notify/mock.js";
import * as mockDynamoDB from "../store-dynamodb/mock.js";
// import * as mockPostgres from "../store-postgres/mock.js";
import * as mockSQLite from "../store-sqlite/mock.js";
import webauthn, {
	formInputName,
	makeRequestHash,
	authenticate as webauthnAuthenticate,
	challenge as webauthnChallenge,
	count as webauthnCount,
	create as webauthnCreate,
	createChallenge as webauthnCreateChallenge,
	createInstance as webauthnCreateInstance,
	expire as webauthnExpire,
	getOptions as webauthnGetOptions,
	list as webauthnList,
	remove as webauthnRemove,
	secret as webauthnSecret,
	select as webauthnSelect,
	token as webauthnToken,
	verify as webauthnVerify,
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

storePostgres.default({
	log: (...args) => mocks.log(...args),
	client: {
		query: (...args) => mocks.storeClient.query(...args),
	},
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
	// postgres: {
	//   store: storePostgres,
	//   mocks : {
	// 		...mockNotify,
	//     ...mockPostgres,
	// 		storeAccount: mockAccountSQLTable,
	// 		storeAuthn: mockAuthnSQLTable,
	//    }
	// },
	sqlite: {
		store: storeSQLite,
		mocks: {
			...mockNotify,
			...mockSQLite,
			storeAccount: mockAccountSQLTable,
			storeAuthn: mockAuthnSQLTable,
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
					},
				},
			}
		: {}),
};

account();
accountUsername();
authn();
webauthn();

// Two isolated instances, each with its own `options`
const passkey = webauthnCreateInstance();
const securitykey = webauthnCreateInstance();
// *** Setup End *** //

let sub;
// Must not be "username": that is the userName fallback, so it hid the bug
const username = "testuser";
const webauthnName = "1Auth";
const webauthnOrigin = "http://localhost";
const passkeyId = "WebAuthnPassKey";
const securityKeyId = "WebAuthnSecurityKey";
const passkeyNotifyId = "authn-webauthn-passkey";
const securityKeyNotifyId = "authn-webauthn-securitykey";

const tests = (config) => {
	const store = config.store;

	test.before(async () => {
		mocks = config.mocks;

		await mocks.storeAccount.create(mocks.storeClient);
		await mocks.storeAuthn.create(mocks.storeClient);

		account({ store, notify });
		accountUsername();
		authn({
			store,
			notify,
			encryptedFields: ["value", "name"],
			usernameExists: [accountUsernameExists],
			authenticationDuration: 0,
			// log: (...args) => {
			// mocks.log(...args);
			// },
		});
		webauthn({
			name: webauthnName,
			origin: webauthnOrigin,
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
		await mocks.storeAuthn.truncate(mocks.storeClient);
		await mocks.storeAccount.truncate(mocks.storeClient);
	});

	test.after(async () => {
		await mocks.storeAuthn.drop(mocks.storeClient);
		await mocks.storeAccount.drop(mocks.storeClient);
		mocks.storeClient.after?.();
	});

	// The recipe for naming a request, and the exclusion that goes with it. Both
	// live here rather than in the app because the other half of the mechanism,
	// the composite challenge in `verify`, is in this file: split them and they
	// drift, and a drifted pair fails as an unexplained 401.
	describe("`makeRequestHash`", () => {
		const url = new URL("https://app.example.com/settings/billing?/refund");

		it("Is stable regardless of field order", () => {
			const a = makeRequestHash({ url, body: new URLSearchParams("b=2&a=1") });
			const b = makeRequestHash({ url, body: new URLSearchParams("a=1&b=2") });
			equal(a, b);
		});

		it("Covers the query string, so sibling actions on one path differ", () => {
			const other = new URL("https://app.example.com/settings/billing?/cancel");
			notEqual(
				makeRequestHash({ url, body: new URLSearchParams() }),
				makeRequestHash({ url: other, body: new URLSearchParams() }),
			);
		});

		it("Ignores the origin, which a CDN can rewrite to an internal host", () => {
			const internal = new URL("https://10.0.0.1/settings/billing?/refund");
			equal(
				makeRequestHash({ url, body: new URLSearchParams() }),
				makeRequestHash({ url: internal, body: new URLSearchParams() }),
			);
		});

		it("Skips the credential field, which only exists on the second post", () => {
			const before = new URLSearchParams("orderId=in_1");
			const after = new URLSearchParams("orderId=in_1");
			after.set(formInputName, '{"id":"credential"}');
			equal(
				makeRequestHash({ url, body: before }),
				makeRequestHash({ url, body: after }),
			);
		});

		it("Refuses anything it cannot hash the same way twice", () => {
			throws(() => makeRequestHash({ url: "/a", body: new URLSearchParams() }));
			// A plain object stringifies an array to "x,y", which collides with the
			// literal string "x,y".
			throws(() => makeRequestHash({ url, body: { a: ["x", "y"] } }));
		});
	});

	describe("`count`", () => {
		it("Will throw with ({sub:undefined})", async () => {
			try {
				await webauthnCount(undefined);
			} catch (e) {
				equal(e.message, "401 Unauthorized");
			}
		});
		it("Can count with { sub }", async () => {
			await webauthnCreate(sub);
			const [token] = await store.selectList(authnGetOptions().table, { sub });
			await overrideCreateChallenge(sub, token);
			await webauthnVerify(
				sub,
				registrationResponse,
				{ name: "PassKey" },
				false,
			);
			const count = await webauthnCount(sub);
			equal(count, 1);
		});
		it("Will keep more than one live challenge for one account", async () => {
			// Two tabs each need their own. Evicting across them is what made the
			// second page load silently break the tap in the first.
			await webauthnCreate(sub);
			const [token] = await store.selectList(authnGetOptions().table, { sub });
			await overrideCreateChallenge(sub, token);
			await webauthnVerify(
				sub,
				registrationResponse,
				{ name: "PassKey" },
				false,
			);
			const live = async () =>
				(await store.selectList(authnGetOptions().table, { sub })).filter(
					(row) => row.type === "WebAuthn-challenge",
				);

			await webauthnCreateChallenge(sub);
			const afterOne = await live();
			await webauthnCreateChallenge(sub);
			equal((await live()).length, afterOne.length * 2);

			// ...but not without bound. Past the cap the oldest go, so a loop cannot
			// write rows for free behind nothing but a username cookie.
			for (let i = 0; i < 5; i++) await webauthnCreateChallenge(sub);
			equal(
				(await live()).length,
				webauthnGetOptions().challengeKeep + afterOne.length,
			);
		});

		it("Can encode an absent secret without throwing", async () => {
			// `encode` is handed whatever the credential config produced; a falsy
			// value has to pass straight through rather than be dereferenced
			equal(webauthnSecret().encode(undefined), undefined);
		});
		it("Can count with { sub } (unverified)", async () => {
			await webauthnCreate(sub);
			const count = await webauthnCount(sub);
			equal(count, 0);
		});
	});

	describe("`list`", () => {
		it("Will throw with ({sub:undefined})", async () => {
			try {
				await webauthnList(undefined);
			} catch (e) {
				equal(e.message, "401 Unauthorized");
			}
		});
		it("Can list an WebAuthn with { sub } (exists)", async () => {
			await webauthnCreate(sub);
			const [token] = await store.selectList(authnGetOptions().table, { sub });
			await overrideCreateChallenge(sub, token);
			await webauthnVerify(
				sub,
				registrationResponse,
				{ name: "PassKey" },
				false,
			);
			const row = await webauthnList(sub);
			equal(row.length, 1);
		});
		it("Can list an WebAuthn with { sub } (not exists)", async () => {
			const row = await webauthnList(sub);
			equal(row.length, 0);
		});
	});

	describe("`select`", () => {
		it("Will throw with ({sub:undefined})", async () => {
			try {
				await webauthnSelect(undefined, "id");
			} catch (e) {
				equal(e.message, "401 Unauthorized");
			}
		});
		it("Will throw with ({id:undefined})", async () => {
			try {
				await webauthnSelect(sub, undefined);
			} catch (e) {
				equal(e.message, "404 Not Found");
			}
		});
		it("Can select an WebAuthn with { id } (exists)", async () => {
			await webauthnCreate(sub);
			const [token] = await store.selectList(authnGetOptions().table, { sub });
			await overrideCreateChallenge(sub, token);
			const { id } = await webauthnVerify(
				sub,
				registrationResponse,
				{ name: "PassKey" },
				false,
			);

			const row = await webauthnSelect(sub, id);
			ok(row);
		});
		it("Can select an WebAuthn with { id } (not exists)", async () => {
			const row = await webauthnSelect(sub, "authn_000");
			equal(row, undefined);
		});
	});

	describe("`create`", () => {
		it("Will throw with ({sub:undefined})", async () => {
			try {
				await webauthnCreate(undefined);
			} catch (e) {
				equal(e.message, "401 Unauthorized");
			}
		});
	});

	describe("`verify`", () => {
		it("Will throw with ({sub:undefined})", async () => {
			try {
				await webauthnVerify(undefined);
			} catch (e) {
				equal(e.message, "401 Unauthorized");
			}
		});
	});

	describe("`authenticate`", () => {
		it("Will throw when no credentials", async () => {
			try {
				await webauthnAuthenticate(username, {});
			} catch (e) {
				equal(e.message, "401 Unauthorized");
				equal(e.cause.type, "missing");
			}
		});
		// it("Will throw when unverfied credentials", async () => {
		// 	await webauthnCreate(sub);
		//    try {
		//      await webauthnAuthenticate(username, {});
		//    } catch(e) {
		//      equal(e.message, '401 Unauthorized')
		//      equal(e.cause, 'missing')
		//    }
		// });
		// it("Will throw when expired credentials", async () => {
		//    const { id } = await webauthnCreate(sub);
		//    await store.update(authnGetOptions().table, { sub, id }, {verify:1})
		//    await webauthnExpire(sub, id);
		//    try {
		//      await webauthnAuthenticate(username, {});
		//    } catch(e) {
		//      equal(e.message, '401 Unauthorized')
		//      equal(e.cause, 'expired')
		//    }
		//  });
	});

	describe("`expire`", () => {
		it("Will throw with ({sub:undefined})", async () => {
			try {
				await webauthnExpire(undefined, "id");
			} catch (e) {
				equal(e.message, "401 Unauthorized");
			}
		});
		it("Will throw with ({id:undefined})", async () => {
			try {
				await webauthnExpire(sub, undefined);
			} catch (e) {
				equal(e.message, "404 Not Found");
			}
		});
	});

	describe("`remove`", () => {
		it("Will throw with ({sub:undefined})", async () => {
			try {
				await webauthnRemove(undefined, "id");
			} catch (e) {
				equal(e.message, "401 Unauthorized");
			}
		});
		it("Will throw with ({id:undefined})", async () => {
			try {
				await webauthnRemove(sub, undefined);
			} catch (e) {
				equal(e.message, "404 Not Found");
			}
		});
	});

	it("Can create WebAuthn on an account", async () => {
		// Registration
		const { secret: registrationOptions } = await webauthnCreate(sub);

		equal(registrationOptions.challenge.length, 43);
		equal(registrationOptions.rp.name, webauthnName);
		equal(registrationOptions.rp.id, webauthnOrigin.substring(7));
		ok(registrationOptions.user.id);
		equal(registrationOptions.user.name, username);
		deepEqual(registrationOptions.authenticatorSelection, {
			residentKey: "discouraged",
			userVerification: "preferred",
			requireResidentKey: false,
		});
		deepEqual(registrationOptions.excludeCredentials, []);

		let authnDB = await store.selectList(authnGetOptions().table, { sub });
		equal(authnDB.length, 1);
		const token = authnDB[0];
		equal(token.type, "WebAuthn-token");
		equal(token.otp, true);
		equal(token.value.length, 321);
		ok(token.expire);

		await overrideCreateChallenge(sub, token);
		let count = await webauthnCount(sub);
		equal(count, 0);

		await webauthnVerify(sub, registrationResponse, { name: "PassKey" });

		deepEqual(mocks.notifyClient.mock.calls[0].arguments[0], {
			id: "authn-webauthn-create",
			sub,
			data: { name: "PassKey" },
			options: {},
		});

		authnDB = await store.selectList(authnGetOptions().table, { sub });
		equal(authnDB.length, 1);
		const secret = authnDB[0];
		equal(secret.type, "WebAuthn-secret");
		equal(secret.otp, false);
		equal(secret.value.length, 1741);
		ok(!secret.expire);

		count = await webauthnCount(sub);
		equal(count, 1);

		// Authentication
		const { secret: authenticationOptions } =
			await webauthnCreateChallenge(sub);
		equal(authenticationOptions.challenge.length, 43);
		equal(authenticationOptions.rpId, webauthnOrigin.substring(7));
		deepEqual(authenticationOptions.userVerification, "preferred");
		deepEqual(authenticationOptions.allowCredentials, [
			{
				id: registrationResponse.id,
				type: "public-key",
			},
		]);

		authnDB = await store.selectList(authnGetOptions().table, { sub });
		equal(authnDB.length, 2);
		const challenge = authnDB[1];
		equal(challenge.type, "WebAuthn-challenge");
		equal(challenge.otp, true);
		equal(challenge.value.length, 1977);
		ok(challenge.expire);

		// Override authentication challenge
		await overrideGetChallenge(sub, challenge);

		const userSub = await webauthnAuthenticate(
			username,
			authenticationResponse,
		);
		equal(userSub, sub);

		authnDB = await store.selectList(authnGetOptions().table, { sub });
		equal(authnDB.length, 2);
		authnDB = authnDB.filter((item) => !item.expire);
		equal(authnDB.length, 1);
	});

	// The fixture assertion signed one 32 byte challenge. Split those bytes and
	// the front half stands in for the stored nonce, the back half for the request
	// hash. If `verify` rebuilds the composite correctly the same recorded
	// assertion still verifies, and if it does not, nothing else could make it.
	const splitChallenge = () => {
		const full = Buffer.from(
			authenticationOptionsOverride.challenge,
			"base64url",
		);
		return {
			nonce: full.subarray(0, 16).toString("base64url"),
			requestHash: full.subarray(16).toString("base64url"),
		};
	};

	const registeredChallenge = async () => {
		await webauthnCreate(sub);
		const [token] = await store.selectList(authnGetOptions().table, { sub });
		await overrideCreateChallenge(sub, token);
		await webauthnVerify(sub, registrationResponse, { name: "PassKey" });
		await webauthnCreateChallenge(sub);
		const rows = await store.selectList(authnGetOptions().table, { sub });
		return rows.find((row) => row.type === "WebAuthn-challenge");
	};

	it("Can authenticate against a challenge bound to the request", async () => {
		const { nonce, requestHash } = splitChallenge();
		await overrideGetChallenge(sub, await registeredChallenge(), nonce);
		equal(
			await webauthnAuthenticate(username, authenticationResponse, {
				requestHash,
			}),
			sub,
		);
	});

	it("Will refuse an assertion approved for a different request", async () => {
		const { nonce } = splitChallenge();
		await overrideGetChallenge(sub, await registeredChallenge(), nonce);
		try {
			await webauthnAuthenticate(username, authenticationResponse, {
				requestHash: Buffer.alloc(16, 1).toString("base64url"),
			});
			ok(false, "a mismatched request must not authenticate");
		} catch (e) {
			equal(e.message, "401 Unauthorized");
		}
	});

	it("Will refuse a bound challenge answered with no request at all", async () => {
		// The downgrade path: minting bound then verifying unbound leaves the
		// stored nonce as the whole expected challenge, which the assertion never
		// signed. It has to fail rather than fall back to the nonce.
		const { nonce } = splitChallenge();
		await overrideGetChallenge(sub, await registeredChallenge(), nonce);
		try {
			await webauthnAuthenticate(username, authenticationResponse);
			ok(false, "an unbound verify must not clear a bound challenge");
		} catch (e) {
			equal(e.message, "401 Unauthorized");
		}
	});

	it("Can create WebAuthn on an account without a username", async () => {
		const subWithoutUsername = await accountCreate();

		const { secret: registrationOptions } =
			await webauthnCreate(subWithoutUsername);

		equal(registrationOptions.user.name, "username");
	});
	it("Will reject a registration whose attestation does not verify", async () => {
		await webauthnCreate(sub);
		const [token] = await store.selectList(authnGetOptions().table, { sub });
		await overrideCreateChallenge(sub, token);

		// `fmt: "none"` can only throw or succeed, so it never reaches the
		// "returned false" branch. A `packed` self-attestation with a signature from
		// an unrelated key parses cleanly and simply fails to verify.
		const attestation = isoCBOR.decodeFirst(
			isoBase64URL.toBuffer(registrationResponse.response.attestationObject),
		);
		const { privateKey } = generateKeyPairSync("ec", {
			namedCurve: "prime256v1",
		});
		attestation.set("fmt", "packed");
		attestation.set(
			"attStmt",
			new Map([
				["alg", -7],
				[
					"sig",
					new Uint8Array(
						asymmetricSign("sha256", Buffer.from("wrong"), privateKey),
					),
				],
			]),
		);

		const tampered = {
			...registrationResponse,
			response: {
				...registrationResponse.response,
				attestationObject: isoBase64URL.fromBuffer(isoCBOR.encode(attestation)),
			},
		};

		try {
			await webauthnVerify(sub, tampered, { name: "PassKey" }, false);
			throw new Error("expected 401 Unauthorized");
		} catch (e) {
			equal(e.message, "401 Unauthorized");
		}

		// `authn.verify` swallows the credential's own error and reports 401, so
		// ask the token config directly for the reason behind it
		const stored = await store.select(authnGetOptions().table, {
			sub,
			id: token.id,
		});
		const challengeValue = JSON.parse(
			symmetricDecrypt(stored.value, {
				sub,
				encryptedKey: stored.encryptionKey,
			}),
		);
		try {
			await webauthnToken().verify(tampered, challengeValue);
			throw new Error("expected Failed verifyRegistrationResponse");
		} catch (e) {
			equal(e.message, "Failed verifyRegistrationResponse");
			deepEqual(e.cause, { response: tampered });
		}
	});
	it("Will reject an assertion whose signature does not verify", async () => {
		await webauthnCreate(sub);
		const [token] = await store.selectList(authnGetOptions().table, { sub });
		await overrideCreateChallenge(sub, token);
		await webauthnVerify(sub, registrationResponse, { name: "PassKey" }, false);
		await webauthnCreateChallenge(sub);
		const [challengeRow] = await store.selectList(authnGetOptions().table, {
			sub,
			type: "WebAuthn-challenge",
		});
		await overrideGetChallenge(sub, challengeRow);

		// A structurally valid DER ES256 signature from an unrelated key: it parses,
		// so verification returns false rather than throwing, which is the path that
		// has to become a 401 rather than an unhandled error.
		const { privateKey } = generateKeyPairSync("ec", {
			namedCurve: "prime256v1",
		});
		const bogus = asymmetricSign(
			"sha256",
			Buffer.from("not the data that was signed"),
			privateKey,
		);
		const tampered = {
			...authenticationResponse,
			response: {
				...authenticationResponse.response,
				signature: bogus.toString("base64url"),
			},
		};
		try {
			await webauthnAuthenticate(username, tampered);
			throw new Error("expected 401 Unauthorized");
		} catch (e) {
			equal(e.message, "401 Unauthorized");
		}

		// `authn.authenticate` swallows the credential's own error and reports
		// 401, so ask the challenge config directly for the reason behind it
		const storedChallenge = await store.select(authnGetOptions().table, {
			sub,
			id: challengeRow.id,
		});
		const challengeValue = webauthnChallenge().decode(
			symmetricDecrypt(storedChallenge.value, {
				sub,
				encryptedKey: storedChallenge.encryptionKey,
			}),
		);
		try {
			await webauthnChallenge().verify(tampered, challengeValue);
			throw new Error("expected Failed verifyAuthenticationResponse");
		} catch (e) {
			equal(e.message, "Failed verifyAuthenticationResponse");
			deepEqual(e.cause, { response: tampered });
		}
	});
	it("Will report an empty credential list, with or without a logger", async () => {
		// a fresh account has no registered secret, so there is nothing to allow
		deepEqual(await webauthnCreateChallenge(sub), {});
		ok(
			mocks.log.mock.calls.some(
				({ arguments: [first] }) =>
					first === "@1auth/authn-webauthn allowCredentials is empty",
			),
		);

		// `log: false` is not callable, so the guard around it is what keeps an
		// account with no credentials from taking the request down
		webauthn({ name: webauthnName, origin: webauthnOrigin, log: false });
		deepEqual(await webauthnCreateChallenge(sub), {});
		webauthn({
			name: webauthnName,
			origin: webauthnOrigin,
			log: (...args) => mocks.log(...args),
		});
	});
	it("Can expire a challenge ten minutes out", async () => {
		await webauthnCreate(sub);
		const [token] = await store.selectList(authnGetOptions().table, { sub });
		await overrideCreateChallenge(sub, token);
		await webauthnVerify(sub, registrationResponse, { name: "PassKey" }, false);

		const before = nowInSeconds();
		await webauthnCreateChallenge(sub);
		const [challengeRow] = await store.selectList(authnGetOptions().table, {
			sub,
			type: "WebAuthn-challenge",
		});
		// ten minutes, in seconds, not some fraction of one
		ok(challengeRow.expire >= before + 10 * 60);
		ok(challengeRow.expire <= nowInSeconds() + 10 * 60);
	});
	it("Can create a 2nd WebAuthn on an account", async () => {
		await webauthnCreate(sub);
		const db0 = await store.selectList(authnGetOptions().table, { sub });
		await overrideCreateChallenge(sub, db0[0]);
		await webauthnVerify(sub, registrationResponse, { name: "PassKey" });

		await webauthnCreate(sub);
		const [token] = await store.selectList(authnGetOptions().table, {
			sub,
			type: "WebAuthn-token",
		});
		await overrideCreateChallenge(sub, token);
		await webauthnVerify(sub, registrationResponse, { name: "Yubikey" }, false);

		const count = await webauthnCount(sub);
		equal(count, 2);
	});
	it("Can remove WebAuthn on an account", async () => {
		await webauthnCreate(sub);
		const [token] = await store.selectList(authnGetOptions().table, { sub });
		await overrideCreateChallenge(sub, token);
		await webauthnVerify(sub, registrationResponse, { name: "PassKey" });

		await webauthnRemove(sub, token.id);
		let authnDB = await store.selectList(authnGetOptions().table, { sub });
		equal(authnDB.length, 1);
		authnDB = authnDB.filter((item) => !!item.expire);
		equal(authnDB.length, 0);

		// notify
		deepEqual(mocks.notifyClient.mock.calls[1].arguments[0], {
			id: "authn-webauthn-remove",
			sub,
			data: {},
			options: {},
		});

		try {
			await webauthnAuthenticate(username, authenticationResponse);
		} catch (e) {
			equal(e.message, "401 Unauthorized");
			deepEqual(e.message, "401 Unauthorized", { cause: "missing" });
		}
	});

	it("Can NOT create a challenge before a credential is verified", async () => {
		await webauthnCreate(sub);
		const { secret } = await webauthnCreateChallenge(sub);

		equal(secret, undefined);
	});
	describe("decoy challenge", () => {
		it("Can return a challenge for an unknown account", async () => {
			const { secret } = await webauthnCreateChallenge(undefined, {
				username: "nobody",
			});

			ok(secret.challenge);
			equal(secret.userVerification, webauthnGetOptions().userVerification);
			equal(secret.allowCredentials.length, 1);
			equal(secret.allowCredentials[0].type, "public-key");
			ok(/^[a-zA-Z0-9_-]+$/.test(secret.allowCredentials[0].id));
		});

		// The whole point: anything the client can see has to match, or the shape
		// of the response is the oracle the error message used to be.
		it("Can NOT be told apart from a real account's challenge", async () => {
			await webauthnCreate(sub);
			const [token] = await store.selectList(authnGetOptions().table, { sub });
			await overrideCreateChallenge(sub, token);
			await webauthnVerify(
				sub,
				registrationResponse,
				{ name: "PassKey" },
				false,
			);

			const { secret: real } = await webauthnCreateChallenge(sub);
			const { secret: decoy } = await webauthnCreateChallenge(undefined, {
				username: "nobody",
			});

			deepEqual(Object.keys(real).sort(), Object.keys(decoy).sort());
			deepEqual(
				Object.keys(real.allowCredentials[0]).sort(),
				Object.keys(decoy.allowCredentials[0]).sort(),
			);
			equal(real.rpId, decoy.rpId);
			equal(real.userVerification, decoy.userVerification);
			equal(real.timeout, decoy.timeout);
			equal(real.challenge.length, decoy.challenge.length);
		});

		it("Can return the same credential id for the same username", async () => {
			const a = await webauthnCreateChallenge(undefined, { username: "same" });
			const b = await webauthnCreateChallenge(undefined, { username: "same" });

			equal(a.secret.allowCredentials[0].id, b.secret.allowCredentials[0].id);
			// The challenge itself must still be fresh, or a decoy would replay.
			notEqual(a.secret.challenge, b.secret.challenge);
		});

		// A single length across every decoy would distinguish them as a set, even
		// though no one of them looks wrong on its own.
		it("Can vary the credential id length across usernames", async () => {
			const lengths = new Set();
			for (let i = 0; i < 24; i++) {
				const { secret } = await webauthnCreateChallenge(undefined, {
					username: `probe-${i}`,
				});
				lengths.add(secret.allowCredentials[0].id.length);
			}

			deepEqual(
				[...lengths].sort((a, b) => a - b),
				[27, 43],
			);
		});

		it("Can return a different credential id per username", async () => {
			const a = await webauthnCreateChallenge(undefined, { username: "one" });
			const b = await webauthnCreateChallenge(undefined, { username: "two" });

			notEqual(
				a.secret.allowCredentials[0].id,
				b.secret.allowCredentials[0].id,
			);
		});

		// The real path returns the id authnCreateList wrote; a decoy has no account
		// to write against, so no id is the proof nothing was stored.
		it("Will NOT persist anything for a decoy", async () => {
			const decoy = await webauthnCreateChallenge(undefined, {
				username: "nobody",
			});

			equal(decoy.id, undefined);
		});

		// Without a username the caller is an authenticated path that lost its sub,
		// which is a bug worth hearing about rather than silently masking.
		it("Will still throw on a missing sub with no username", async () => {
			try {
				await webauthnCreateChallenge(undefined);
				throw new Error("expected a throw");
			} catch (e) {
				notEqual(e.message, "expected a throw");
			}
		});
	});

	it("Can NOT remove WebAuthn from someone elses account", async () => {
		const secret = await webauthnCreate(sub);
		const [token] = await store.selectList(authnGetOptions().table, { sub });
		await overrideCreateChallenge(sub, token);
		await webauthnVerify(sub, registrationResponse, { name: "PassKey" }, false);

		await webauthnRemove("sub_1111111", secret.id);
		const authnDB = await store.selectList(authnGetOptions().table, { sub });

		ok(authnDB);
		equal(authnDB.length, 1);
	});

	describe("with custom options", () => {
		let originalOptions;

		test.before(() => {
			originalOptions = { ...webauthnGetOptions() };
		});

		test.afterEach(() => {
			webauthn(originalOptions);
		});

		it("Can create WebAuthn with residentKey and userVerification options", async () => {
			webauthn({
				...originalOptions,
				residentKey: "preferred",
				userVerification: "required",
			});

			const { secret: registrationOptions } = await webauthnCreate(sub);

			deepEqual(registrationOptions.authenticatorSelection, {
				residentKey: "preferred",
				userVerification: "required",
				requireResidentKey: false,
			});
		});

		it("Can create WebAuthn with userName option", async () => {
			webauthn({
				...originalOptions,
				userName: (account) => `${account.value}@example.com`,
			});

			const { secret: registrationOptions } = await webauthnCreate(sub);

			equal(registrationOptions.user.name, `${username}@example.com`);
		});

		it("Can create WebAuthn with preferredAuthenticatorType option", async () => {
			webauthn({
				...originalOptions,
				preferredAuthenticatorType: "localDevice",
			});

			const { secret: registrationOptions } = await webauthnCreate(sub);

			deepEqual(registrationOptions.hints, ["client-device"]);
			deepEqual(registrationOptions.authenticatorSelection, {
				residentKey: "discouraged",
				userVerification: "preferred",
				requireResidentKey: false,
				authenticatorAttachment: "platform",
			});
		});
	});

	describe("with preferredAuthenticatorType per registration", () => {
		const registerAs = async (preferredAuthenticatorType, response) => {
			await webauthnCreate(sub, { preferredAuthenticatorType });
			const [token] = await store.selectList(authnGetOptions().table, {
				sub,
				type: "WebAuthn-token",
			});
			await overrideCreateChallenge(sub, token);
			return await webauthnVerify(sub, response, { name: "Device" }, false);
		};

		it("Will throw with an unknown type", async () => {
			try {
				await webauthnCreate(sub, { preferredAuthenticatorType: "phone" });
				throw new Error("expected 400 Bad Request");
			} catch (e) {
				equal(e.message, "400 Bad Request");
			}
		});

		it("Will name the mismatch it refused on", async () => {
			// `authn.verify` reports 401 for any credential error, so go at the
			// token config directly for which type was asked for and what arrived
			await webauthnCreate(sub, { preferredAuthenticatorType: "securityKey" });
			const [token] = await store.selectList(authnGetOptions().table, {
				sub,
				type: "WebAuthn-token",
			});
			await overrideCreateChallenge(sub, token);
			const stored = await store.select(authnGetOptions().table, {
				sub,
				id: token.id,
			});
			const value = JSON.parse(
				symmetricDecrypt(stored.value, {
					sub,
					encryptedKey: stored.encryptionKey,
				}),
			);
			try {
				// a syncable passkey answering a securityKey request
				await webauthnToken().verify(registrationResponse, {
					...value,
					authenticatorType: "securityKey",
				});
				throw new Error("expected Failed authenticatorType");
			} catch (e) {
				equal(e.message, "Failed authenticatorType");
				deepEqual(e.cause, {
					authenticatorType: "securityKey",
					credentialDeviceType: "multiDevice",
				});
			}
		});

		it("Can register with no type asked for", async () => {
			// Dropping the hint is how a caller gets the browser's own store chooser
			ok(await registerAs(null, registrationResponse));
			equal(await webauthnCount(sub), 1);
		});

		it("Will still refuse a hardware bound key when no type was asked for", async () => {
			// With no hint there is no attachment to check, so the instance's
			// `credentialDeviceType` is all that stands between a security key and a
			// passkey
			await webauthnCreate(sub, { preferredAuthenticatorType: null });
			const [token] = await store.selectList(authnGetOptions().table, {
				sub,
				type: "WebAuthn-token",
			});
			await overrideCreateChallenge(sub, token);
			const stored = await store.select(authnGetOptions().table, {
				sub,
				id: token.id,
			});
			const value = JSON.parse(
				symmetricDecrypt(stored.value, {
					sub,
					encryptedKey: stored.encryptionKey,
				}),
			);
			try {
				await webauthnToken().verify(registrationResponseSecurityKey, {
					...value,
					credentialDeviceType: "multiDevice",
				});
				throw new Error("expected Failed authenticatorType");
			} catch (e) {
				equal(e.message, "Failed authenticatorType");
				deepEqual(e.cause, {
					authenticatorType: null,
					credentialDeviceType: "singleDevice",
				});
			}
		});

		it("Can choose the type without reconfiguring the instance", async () => {
			const { secret: registrationOptions } = await webauthnCreate(sub, {
				preferredAuthenticatorType: "remoteDevice",
			});

			deepEqual(registrationOptions.hints, ["hybrid"]);
			equal(webauthnGetOptions().preferredAuthenticatorType, undefined);
		});

		it("Can register a localDevice PassKey", async () => {
			ok(await registerAs("localDevice", registrationResponse));
			equal(await webauthnCount(sub), 1);
		});

		it("Can register a securityKey", async () => {
			ok(await registerAs("securityKey", registrationResponseSecurityKey));
			equal(await webauthnCount(sub), 1);
		});

		it("Can NOT register a PassKey when a securityKey was asked for", async () => {
			try {
				await registerAs("securityKey", registrationResponse);
				throw new Error("should not reach");
			} catch (e) {
				equal(e.message, "401 Unauthorized");
			}
			equal(await webauthnCount(sub), 0);
		});

		it("Can NOT register a securityKey when a PassKey was asked for", async () => {
			try {
				await registerAs("localDevice", registrationResponseSecurityKey);
				throw new Error("should not reach");
			} catch (e) {
				equal(e.message, "401 Unauthorized");
			}
			equal(await webauthnCount(sub), 0);
		});

		it("Can NOT register a local PassKey when a remote one was asked for", async () => {
			try {
				await registerAs("remoteDevice", registrationResponse);
				throw new Error("should not reach");
			} catch (e) {
				equal(e.message, "401 Unauthorized");
			}
			equal(await webauthnCount(sub), 0);
		});
	});

	describe("with PassKey and SecurityKey instances", () => {
		test.before(() => {
			// PassKey: discoverable credential, usable as the only factor
			passkey.configure({
				name: webauthnName,
				origin: webauthnOrigin,
				notifyId: passkeyNotifyId,
				residentKey: "required",
				userVerification: "required",
				preferredAuthenticatorType: "localDevice",
				secret: passkey.secret({ id: passkeyId }),
				token: passkey.token({ id: passkeyId, expire: 5 * 60 }),
				challenge: passkey.challenge({ id: passkeyId, expire: 2 * 60 }),
			});
			// SecurityKey: roaming authenticator used as a second factor
			securitykey.configure({
				name: webauthnName,
				origin: webauthnOrigin,
				notifyId: securityKeyNotifyId,
				residentKey: "discouraged",
				userVerification: "required",
				preferredAuthenticatorType: "securityKey",
				secret: securitykey.secret({ id: securityKeyId }),
				token: securitykey.token({ id: securityKeyId, expire: 5 * 60 }),
				challenge: securitykey.challenge({
					id: securityKeyId,
					expire: 2 * 60,
				}),
			});
		});

		it("Can hold three independent configs", () => {
			notEqual(passkey.getOptions(), securitykey.getOptions());
			notEqual(passkey.getOptions(), webauthnGetOptions());
			equal(passkey.getOptions().residentKey, "required");
			equal(securitykey.getOptions().residentKey, "discouraged");
			equal(webauthnGetOptions().residentKey, "discouraged");
			equal(webauthnGetOptions().userVerification, "preferred");
		});

		it("Can create a PassKey only registration", async () => {
			const { secret: registrationOptions } = await passkey.create(sub);

			deepEqual(registrationOptions.hints, ["client-device"]);
			deepEqual(registrationOptions.authenticatorSelection, {
				residentKey: "required",
				requireResidentKey: true,
				userVerification: "required",
				authenticatorAttachment: "platform",
			});

			const [token] = await store.selectList(authnGetOptions().table, { sub });
			equal(token.type, `${passkeyId}-token`);
			ok(token.expire - nowInSeconds() <= 5 * 60);
		});

		it("Can create a SecurityKey only registration", async () => {
			const { secret: registrationOptions } = await securitykey.create(sub);

			deepEqual(registrationOptions.hints, ["security-key"]);
			deepEqual(registrationOptions.authenticatorSelection, {
				residentKey: "discouraged",
				requireResidentKey: false,
				userVerification: "required",
				authenticatorAttachment: "cross-platform",
			});

			const [token] = await store.selectList(authnGetOptions().table, { sub });
			equal(token.type, `${securityKeyId}-token`);
			ok(token.expire - nowInSeconds() <= 5 * 60);
		});

		it("Can NOT resolve a PassKey from the SecurityKey instance", async () => {
			await register(passkey, passkeyId, "PassKey");

			equal(await passkey.count(sub), 1);
			equal(await securitykey.count(sub), 0);
			equal(await webauthnCount(sub), 0);

			deepEqual(await securitykey.createChallenge(sub), {});
			const { secret: authenticationOptions } =
				await passkey.createChallenge(sub);
			deepEqual(authenticationOptions.allowCredentials, [
				{ id: registrationResponse.id, type: "public-key" },
			]);
			equal(authenticationOptions.userVerification, "required");
		});

		it("Can NOT resolve a SecurityKey from the PassKey instance", async () => {
			await register(securitykey, securityKeyId, "Yubikey");

			equal(await securitykey.count(sub), 1);
			equal(await passkey.count(sub), 0);
			equal(await webauthnCount(sub), 0);

			deepEqual(await passkey.createChallenge(sub), {});
			ok((await securitykey.createChallenge(sub)).secret);
		});

		it("Can notify with the PassKey instance template ids", async () => {
			const id = await register(passkey, passkeyId, "PassKey", true);
			await passkey.expire(sub, id);

			deepEqual(
				mocks.notifyClient.mock.calls.map((call) => call.arguments[0].id),
				[`${passkeyNotifyId}-create`, `${passkeyNotifyId}-expire`],
			);
		});

		it("Can notify with the SecurityKey instance template ids", async () => {
			const id = await register(securitykey, securityKeyId, "Yubikey", true);
			await securitykey.remove(sub, id);

			deepEqual(
				mocks.notifyClient.mock.calls.map((call) => call.arguments[0].id),
				[`${securityKeyNotifyId}-create`, `${securityKeyNotifyId}-remove`],
			);
		});

		const register = async (instance, id, name, notify = false) => {
			await instance.create(sub);
			const [token] = await store.selectList(authnGetOptions().table, {
				sub,
				type: `${id}-token`,
			});
			await overrideCreateChallenge(sub, token);
			const secret = await instance.verify(
				sub,
				id === securityKeyId
					? registrationResponseSecurityKey
					: registrationResponse,
				{ name },
				notify,
			);
			return secret.id;
		};
	});

	const overrideCreateChallenge = async (sub, token) => {
		await store.update(
			authnGetOptions().table,
			{ sub, id: token.id },
			{
				value: symmetricEncrypt(
					JSON.stringify({
						...JSON.parse(
							symmetricDecrypt(token.value, {
								sub,
								encryptedKey: token.encryptionKey,
							}),
						),
						expectedChallenge: registrationOptionsOverride.challenge,
						expectedOrigin: webauthnOrigin,
						expectedRPID: registrationOptionsOverride.rp.id,
						requireUserVerification: true,
					}),
					{
						sub,
						encryptedKey: token.encryptionKey,
					},
				),
			},
		);
	};

	// `expectedChallenge` defaults to the fixture's own, so the recorded assertion
	// verifies. A caller can pass a shorter one to stand in for the stored NONCE,
	// which is what the composite tests need: nonce plus request must rebuild
	// exactly the value the fixture signed.
	const overrideGetChallenge = async (
		sub,
		challenge,
		expected = authenticationOptionsOverride.challenge,
	) => {
		await store.update(
			authnGetOptions().table,
			{ sub, id: challenge.id },
			{
				value: symmetricEncrypt(
					JSON.stringify({
						...JSON.parse(
							symmetricDecrypt(challenge.value, {
								sub,
								encryptedKey: challenge.encryptionKey,
							}),
						),
						expectedChallenge: expected,
						expectedOrigin: webauthnOrigin,
						expectedRPID: authenticationOptionsOverride.rpId,
						requireUserVerification: true,
					}),
					{
						sub,
						encryptedKey: challenge.encryptionKey,
					},
				),
			},
		);
	};
};
describe("authn-webauthn", { concurrency: 1 }, () => {
	for (const storeKey of Object.keys(mockStores)) {
		describe(`using store-${storeKey}`, () => {
			tests(mockStores[storeKey]);
		});
	}
});

const registrationOptionsOverride = {
	challenge: "Jl-QJo7l9_InkLl52RE0DLbc3I7sU4IuVJHV1EyHYY4",
	rp: {
		name: webauthnName,
		id: "localhost",
	},
	user: {
		id: "c3ViX0lLN21mb0lMOGJD",
		name: username,
		displayName: "",
	},
	pubKeyCredParams: [
		{
			alg: -8,
			type: "public-key",
		},
		{
			alg: -7,
			type: "public-key",
		},
		{
			alg: -257,
			type: "public-key",
		},
	],
	timeout: 60000,
	attestation: "none",
	excludeCredentials: [],
	authenticatorSelection: {
		residentKey: "discouraged",
		userVerification: "preferred",
		requireResidentKey: false,
	},
	extensions: {
		credProps: true,
	},
};
const registrationResponse = {
	id: "9ikDMG-fNBIGo7Ez7_Xx1PGizlo",
	rawId: "9ikDMG-fNBIGo7Ez7_Xx1PGizlo",
	response: {
		attestationObject:
			"o2NmbXRkbm9uZWdhdHRTdG10oGhhdXRoRGF0YViYSZYN5YgOjGh0NBcPZHZgW4_krrmihjLHmVzzuoMdl2NdAAAAAAAAAAAAAAAAAAAAAAAAAAAAFPYpAzBvnzQSBqOxM-_18dTxos5apQECAyYgASFYIHvLwmeIblhH_Tpm7WYjlhnrA3OnL_GL5crvjQI7mjozIlgguEqNjVVHwqmD-QVmXu5ffyvtwhL4-gvD67AtxpjWhlc",
		clientDataJSON:
			"eyJjaGFsbGVuZ2UiOiJKbC1RSm83bDlfSW5rTGw1MlJFMERMYmMzSTdzVTRJdVZKSFYxRXlIWVk0Iiwib3JpZ2luIjoiaHR0cDovL2xvY2FsaG9zdCIsInR5cGUiOiJ3ZWJhdXRobi5jcmVhdGUifQ",
		transports: ["internal"],
		publicKeyAlgorithm: -7,
		publicKey:
			"MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEe8vCZ4huWEf9OmbtZiOWGesDc6cv8Yvlyu-NAjuaOjO4So2NVUfCqYP5BWZe7l9_K-3CEvj6C8PrsC3GmNaGVw",
		authenticatorData:
			"SZYN5YgOjGh0NBcPZHZgW4_krrmihjLHmVzzuoMdl2NdAAAAAAAAAAAAAAAAAAAAAAAAAAAAFPYpAzBvnzQSBqOxM-_18dTxos5apQECAyYgASFYIHvLwmeIblhH_Tpm7WYjlhnrA3OnL_GL5crvjQI7mjozIlgguEqNjVVHwqmD-QVmXu5ffyvtwhL4-gvD67AtxpjWhlc",
	},
	type: "public-key",
	clientExtensionResults: {},
	authenticatorAttachment: "platform",
};

// Same credential with the BE/BS flags cleared, so it reads as hardware bound
// rather than a synced passkey. `fmt: none` carries no attestation signature,
// so flipping those two bits leaves the response verifiable.
const registrationResponseSecurityKey = {
	...registrationResponse,
	response: {
		...registrationResponse.response,
		attestationObject:
			"o2NmbXRkbm9uZWdhdHRTdG10oGhhdXRoRGF0YViYSZYN5YgOjGh0NBcPZHZgW4_krrmihjLHmVzzuoMdl2NFAAAAAAAAAAAAAAAAAAAAAAAAAAAAFPYpAzBvnzQSBqOxM-_18dTxos5apQECAyYgASFYIHvLwmeIblhH_Tpm7WYjlhnrA3OnL_GL5crvjQI7mjozIlgguEqNjVVHwqmD-QVmXu5ffyvtwhL4-gvD67AtxpjWhlc",
		authenticatorData:
			"SZYN5YgOjGh0NBcPZHZgW4_krrmihjLHmVzzuoMdl2NFAAAAAAAAAAAAAAAAAAAAAAAAAAAAFPYpAzBvnzQSBqOxM-_18dTxos5apQECAyYgASFYIHvLwmeIblhH_Tpm7WYjlhnrA3OnL_GL5crvjQI7mjozIlgguEqNjVVHwqmD-QVmXu5ffyvtwhL4-gvD67AtxpjWhlc",
		transports: ["usb"],
	},
	authenticatorAttachment: "cross-platform",
};

const authenticationOptionsOverride = {
	rpId: "localhost",
	challenge: "53kCzYApTbJ5vZnkBYMKMYl76mVfWHL18mSj9cfzjT4",
	allowCredentials: [{ id: registrationResponse.id, type: "public-key" }],
	timeout: 60000,
	userVerification: "preferred",
	extensions: undefined,
};
const authenticationResponse = {
	id: registrationResponse.id,
	rawId: registrationResponse.id,
	response: {
		authenticatorData: "SZYN5YgOjGh0NBcPZHZgW4_krrmihjLHmVzzuoMdl2MdAAAAAA",
		clientDataJSON:
			"eyJjaGFsbGVuZ2UiOiI1M2tDellBcFRiSjV2Wm5rQllNS01ZbDc2bVZmV0hMMThtU2o5Y2Z6alQ0Iiwib3JpZ2luIjoiaHR0cDovL2xvY2FsaG9zdCIsInR5cGUiOiJ3ZWJhdXRobi5nZXQifQ",
		signature:
			"MEYCIQDo7IiSTivehu1vilbW7HpcN3qTVMmBrhuDRmn0apmrswIhAJoJgD-l8QxyeS_ZrlqeagMJO6AFeC6wGdV_r00aZTmm",
		userHandle: "c3ViX0lLN21mb0lMOGJD",
	},
	type: "public-key",
	clientExtensionResults: {},
	authenticatorAttachment: "platform",
};
