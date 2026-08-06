import { deepEqual, equal, notEqual, ok } from "node:assert/strict";
import { describe, it, test } from "node:test";
import { setTimeout } from "node:timers/promises";
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
import authn, {
	getOptions as authnGetOptions,
	makeType as authnMakeType,
} from "@1auth/authn";
import * as mockAuthnDynamoDBTable from "@1auth/authn/table/dynamodb.js";
import * as mockAuthnSQLTable from "@1auth/authn/table/sql.js";
import crypto, {
	createDigest,
	nowInSeconds,
	randomChecksumPepper,
	randomChecksumSalt,
	symmetricRandomEncryptionKey,
	symmetricRandomSignatureSecret,
} from "@1auth/crypto";
// *** Setup Start *** //
import * as notify from "@1auth/notify";
import * as storeDynamoDB from "@1auth/store-dynamodb";
import * as storePostgres from "@1auth/store-postgres";
import * as storeSQLite from "@1auth/store-sqlite";
import * as mockNotify from "../notify/mock.js";
import * as mockDynamoDB from "../store-dynamodb/mock.js";
// import * as mockPostgres from "../store-postgres/mock.js";
import * as mockSQLite from "../store-sqlite/mock.js";
import accessToken, {
	authenticate as accessTokenAuthenticate,
	count as accessTokenCount,
	create as accessTokenCreate,
	exists as accessTokenExists,
	expire as accessTokenExpire,
	list as accessTokenList,
	lookup as accessTokenLookup,
	remove as accessTokenRemove,
	secret as accessTokenSecret,
	select as accessTokenSelect,
	username as accessTokenUsername,
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
accessToken();
// *** Setup End *** //

let sub;
let subOther;
let otherToken;
const username = "username";
const usernameOther = "username-other";

const tests = (config) => {
	const store = config.store;
	// Every test that reconfigures has to land back on this baseline.
	// `Object.assign(options, authnGetOptions(), defaults, opt)` re-applies the
	// defaults on each call, so `configure()` with no argument is a full reset.
	const configure = (opt = {}) =>
		accessToken({
			log: (...args) => {
				mocks.log(...args);
			},
			...opt,
		});

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
			usernameExists: [accountUsernameExists, accessTokenExists],
			authenticationDuration: 0,
			// log: (...args) => {
			// mocks.log(...args);
			// },
		});
		configure();
	});

	test.beforeEach(async (t) => {
		sub = await accountCreate();
		await accountUsernameCreate(sub, username);
		// A second account holding its own access token: every lookup below is
		// keyed on a digest, and a filter wide enough to ignore it would return
		// this row instead of nothing.
		subOther = await accountCreate();
		await accountUsernameCreate(subOther, usernameOther);
		otherToken = await accessTokenCreate(subOther);

		t.mock.method(mocks, "log");
		t.mock.method(mocks, "notifyClient");
	});

	test.afterEach(async (t) => {
		t.mock.reset();
		await accountRemove(sub);
		await accountRemove(subOther);
		await mocks.storeAuthn.truncate(mocks.storeClient);
		await mocks.storeAccount.truncate(mocks.storeClient);
		configure();
	});

	test.after(async () => {
		await mocks.storeAuthn.drop(mocks.storeClient);
		await mocks.storeAccount.drop(mocks.storeClient);
		mocks.storeClient.after?.();
	});

	describe("config", () => {
		it("Names its credentials after the package id", () => {
			const usernameConfig = accessTokenUsername();
			equal(usernameConfig.id, "accessToken");
			equal(usernameConfig.type, "username");

			const secretConfig = accessTokenSecret();
			equal(secretConfig.id, "accessToken");
			equal(secretConfig.type, "secret");
			equal(secretConfig.otp, false);
			equal(secretConfig.expire, 30 * 24 * 60 * 60);

			// the credential's id and type together name the stored row
			equal(authnMakeType(secretConfig), "accessToken-secret");
		});
		it("Generates 112 bits of prefixed username and secret", () => {
			// 112 bits over the 62 alphanumerics needs 19 characters
			for (const config of [accessTokenUsername(), accessTokenSecret()]) {
				const value = config.create();
				ok(value.startsWith("pat-"));
				equal(value.length, "pat-".length + 19);
				notEqual(value, config.create());
			}
		});
		it("Hashes a secret on the way in and verifies it on the way back", async () => {
			const { encode, decode, verify } = accessTokenSecret();
			const hash = await encode("secret-value");
			ok(hash);
			notEqual(hash, "secret-value");
			// stored as-is, so decode has to hand the hash straight back
			equal(await decode(hash), hash);
			equal(await verify("secret-value", hash), true);
			equal(await verify("wrong-value", hash), false);
		});
	});

	describe("`exists`", () => {
		it("Will throw with an invalid username", async () => {
			for (const badUsername of [undefined, "", 0, 1234, null, {}]) {
				await rejects(() => accessTokenExists(badUsername), "404 Not Found", {
					username: badUsername,
				});
			}
		});
		it("Will not answer with another account's token", async () => {
			// the digest filter is the only thing keeping `subOther` out
			equal(await accessTokenExists("pat-notfound"), undefined);
			equal(await accessTokenExists(otherToken.username), subOther);
		});
	});

	describe("`lookup`", () => {
		it("Will throw with an invalid username", async () => {
			for (const badUsername of [undefined, "", 0, 1234, null, {}]) {
				await rejects(() => accessTokenLookup(badUsername), "404 Not Found", {
					username: badUsername,
				});
			}
		});
		it("Will look up by digest, not by whatever comes first", async () => {
			const { username } = await accessTokenCreate(sub);
			const row = await accessTokenLookup(username);
			equal(row.sub, sub);
			const otherRow = await accessTokenLookup(otherToken.username);
			equal(otherRow.sub, subOther);
			notEqual(row.id, otherRow.id);
		});
		it("Will return a token expiring on the current second", async () => {
			// `expire < now` and `expire <= now` differ only when the two are
			// equal. `lookup` reads the clock immediately after the store call, so
			// only a tick landing in between could break the tie: step over the
			// boundary first when one is close.
			const calls = [];
			configure({
				store: {
					...store,
					select: async (table, filters, fields) => {
						calls.push({ filters, fields });
						const ms = Date.now() % 1000;
						if (ms > 700) await setTimeout(1000 - ms);
						return { id: "authn_boundary", expire: nowInSeconds() };
					},
				},
			});
			const row = await accessTokenLookup("pat-boundary");
			equal(row.id, "authn_boundary");
			deepEqual(calls[0].filters, { digest: createDigest("pat-boundary") });
		});
	});

	describe("`count`", () => {
		it("Will throw with an invalid sub", async () => {
			for (const badSub of [undefined, "", 0, 1234, null, {}]) {
				await rejects(() => accessTokenCount(badSub), "401 Unauthorized", {
					sub: badSub,
				});
			}
		});
		it("Will not count another account's tokens", async () => {
			equal(await accessTokenCount(sub), 0);
			equal(await accessTokenCount(subOther), 1);
		});
	});

	describe("`remove`", () => {
		it("Will throw with an invalid sub", async () => {
			for (const badSub of [undefined, "", 0, 1234, null, {}]) {
				await rejects(() => accessTokenRemove(badSub), "401 Unauthorized", {
					sub: badSub,
					id: undefined,
				});
			}
		});
		it("Will throw with an invalid id", async () => {
			for (const badId of [undefined, "", 0, 1234, null, {}]) {
				await rejects(() => accessTokenRemove(sub, badId), "404 Not Found", {
					id: badId,
					sub,
				});
			}
			// nothing was notified for a call that never reached the store
			equal(mocks.notifyClient.mock.calls.length, 0);
		});
	});

	describe("`notifyId`", () => {
		it("Can notify with a custom template id prefix", async () => {
			configure({ notifyId: "authn-api-key" });
			const { id } = await accessTokenCreate(sub);
			await accessTokenExpire(sub, id);
			await accessTokenRemove(sub, id);

			deepEqual(
				mocks.notifyClient.mock.calls.map((call) => call.arguments[0].id),
				[
					"authn-api-key-create",
					"authn-api-key-expire",
					"authn-api-key-remove",
				],
			);
		});
	});

	it("Can create an access token on an account", async () => {
		const before = nowInSeconds();
		const { username, secret } = await accessTokenCreate(sub);
		const after = nowInSeconds();
		const db = await store.select(authnGetOptions().table, { sub });

		equal(db.type, "accessToken-secret");
		equal(db.otp, false);
		ok(db.value);
		notEqual(db.value, secret); // stored hashed, never in the clear
		ok(db.digest);
		equal(db.digest, createDigest(username));
		// `null < now` is `0 < now`, so a bare comparison would not prove these
		// were written at all
		equal(typeof db.verify, "number");
		ok(db.verify >= before);
		ok(db.verify <= after);
		equal(typeof db.expire, "number");
		ok(db.expire >= before + 30 * 24 * 60 * 60);
		ok(db.expire <= after + 30 * 24 * 60 * 60);

		const count = await accessTokenCount(sub);
		equal(count, 1);

		// notify
		const { expire } = mocks.notifyClient.mock.calls[0].arguments[0].data;
		equal(expire, db.expire);
		deepEqual(mocks.notifyClient.mock.calls[0].arguments[0], {
			id: "authn-access-token-create",
			sub,
			data: { expire },
			options: {},
		});

		const userSub = await accessTokenAuthenticate(username, secret);
		equal(userSub, sub);
	});
	it("Can carry extra values onto the created token", async () => {
		const { id } = await accessTokenCreate(sub, { name: "ci-deploy" });
		const row = await accessTokenSelect(sub, id);
		equal(row.name, "ci-deploy");
	});
	it("Can remove an access token on an account", async () => {
		const { username, secret } = await accessTokenCreate(sub);
		const row = await accessTokenLookup(username);
		await accessTokenRemove(sub, row.id);
		const authDB = await store.select(authnGetOptions().table, { sub });

		ok(!authDB);

		// notify
		deepEqual(mocks.notifyClient.mock.calls[1].arguments[0], {
			id: "authn-access-token-remove",
			sub,
			data: {},
			options: {},
		});

		await rejects(
			() => accessTokenAuthenticate(username, secret),
			"401 Unauthorized",
			{ username },
		);
	});
	it("Can NOT remove an access token from someone elses account", async () => {
		const { username } = await accessTokenCreate(sub);
		const row = await accessTokenLookup(username);
		await accessTokenRemove(subOther, row.id);
		const authDB = await store.select(authnGetOptions().table, { sub });

		ok(authDB);
		equal(authDB.id, row.id);
		// and the caller's own token is untouched too
		equal(await accessTokenCount(subOther), 1);
	});

	it("Can check is an access token exists (exists)", async () => {
		const { username } = await accessTokenCreate(sub);
		const row = await accessTokenExists(username);
		ok(row);
	});
	it("Can check is an access token exists (not exists)", async () => {
		const row = await accessTokenExists("pat-notfound");
		equal(row, undefined);
	});
	it("Can lookup an access token with { secret } (exists)", async () => {
		const { username } = await accessTokenCreate(sub);
		const row = await accessTokenLookup(username);
		ok(row);
	});
	it("Can lookup an access token with { secret } (expired)", async () => {
		const { id, username } = await accessTokenCreate(sub);
		await accessTokenExpire(sub, id);
		const row = await accessTokenLookup(username);
		ok(!row);

		// notify
		deepEqual(mocks.notifyClient.mock.calls[1].arguments[0], {
			id: "authn-access-token-expire",
			sub,
			data: {},
			options: {},
		});
		// expiring is not removing: the row is still there, just past its date
		const db = await store.select(authnGetOptions().table, { sub });
		equal(db.id, id);
		equal(typeof db.expire, "number");
		ok(db.expire < nowInSeconds());
		equal(await accessTokenCount(sub), 0);
	});
	it("Can lookup an access token with { secret } (not exists)", async () => {
		const row = await accessTokenLookup("pat-notfound");
		equal(row, undefined);
	});
	it("Can select an access token with { id } (exists)", async () => {
		const { id } = await accessTokenCreate(sub);
		const row = await accessTokenSelect(sub, id);
		ok(row);
	});
	it("Can select an access token with { id } (not exists)", async () => {
		const row = await accessTokenSelect(sub, "authn_000");
		equal(row, undefined);
	});
	it("Can list an access token with { sub } (exists)", async () => {
		await accessTokenCreate(sub);
		await accessTokenCreate(sub);
		const row = await accessTokenList(sub);
		equal(row.length, 2);
	});
	it("Can list an access token with { sub } (not exists)", async () => {
		const row = await accessTokenList(sub);
		equal(row.length, 0);
		// `subOther` still holds one, so an empty list is a filter, not an empty
		// table
		equal((await accessTokenList(subOther)).length, 1);
	});
};

// `try { await fn() } catch (e) { equal(e.message, ...) }` passes silently when
// nothing is thrown, which leaves every throw path untested.
const rejects = async (fn, message, cause) => {
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

describe("authn-access-token", { concurrency: 1 }, () => {
	for (const storeKey of Object.keys(mockStores)) {
		describe(`using store-${storeKey}`, () => {
			tests(mockStores[storeKey]);
		});
	}
});
