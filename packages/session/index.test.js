import { deepEqual, equal, notEqual, ok } from "node:assert/strict";
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
import * as storeDynamoDB from "@1auth/store-dynamodb";
import * as storePostgres from "@1auth/store-postgres";
import * as storeSQLite from "@1auth/store-sqlite";
import * as mockNotify from "../notify/mock.js";
import * as mockDynamoDB from "../store-dynamodb/mock.js";
// import * as mockPostgres from "../store-postgres/mock.js";
import * as mockSQLite from "../store-sqlite/mock.js";
import session, {
	check as sessionCheck,
	create as sessionCreate,
	expire as sessionExpire,
	getOptions as sessionGetOptions,
	list as sessionList,
	lookup as sessionLookup,
	remove as sessionRemove,
	rotate as sessionRotate,
	select as sessionSelect,
	selectBinding as sessionSelectBinding,
	sign as sessionSign,
	verify as sessionVerify,
} from "./index.js";
import * as mockSessionDynamoDBTable from "./table/dynamodb.js";
import * as mockSessionSQLTable from "./table/sql.js";

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
	// 	  storeSession: mockSessionSQLTable,
	//    }
	// },
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
session();
// *** Setup End *** //

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
		session({
			encryptedFields: ["value", "metadata"],
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

	describe("`encode`", () => {
		it("Can encode the same value to the same string, at any depth", () => {
			const { encode } = sessionGetOptions();
			equal(
				encode({ os: { version: "15", name: "MacOS" }, ip: "1.2.3.4" }),
				encode({ ip: "1.2.3.4", os: { name: "MacOS", version: "15" } }),
			);
		});
		it("Can encode nested values without dropping them", () => {
			const { encode } = sessionGetOptions();
			equal(
				encode({ os: { name: "MacOS", version: "15" }, ip: "1.2.3.4" }),
				'{"ip":"1.2.3.4","os":{"name":"MacOS","version":"15"}}',
			);
		});
		it("Can encode arrays as arrays, order preserved", () => {
			const { encode } = sessionGetOptions();
			equal(
				encode({ plugins: [{ b: 2, a: 1 }, "z", 1, null] }),
				'{"plugins":[{"a":1,"b":2},"z",1,null]}',
			);
		});
		it("Can encode with ({value:undefined})", () => {
			const { encode } = sessionGetOptions();
			equal(encode(undefined), "{}");
		});
	});

	describe("`lookup`", () => {
		it("Will throw with ({sid:undefined})", async () => {
			try {
				await sessionLookup(undefined);
			} catch (e) {
				equal(e.message, "401 Unauthorized");
			}
		});
		it("Will throw with ({sid:number})", async () => {
			try {
				await sessionLookup(1);
			} catch (e) {
				equal(e.message, "401 Unauthorized");
			}
		});

		it("Can with { sid, value }", async () => {
			const currentDevice = { os: "MacOS" };
			const { id, sid, expire } = await sessionCreate(sub, currentDevice);
			const session = await sessionLookup(sid, currentDevice);
			ok(session);
			equal(session.id, id);
			equal(session.expire, expire);
		});

		it("Can NOT lookup a session by { sid, value } when different device", async () => {
			const currentDevice = { os: "MacOS" };
			const attackerDevice = { os: "Windows" };
			const { sid } = await sessionCreate(sub, currentDevice);
			const session = await sessionLookup(sid, attackerDevice);
			equal(session, undefined);
		});

		it("Can NOT lookup a session by { sid, value } when the device differs only in a nested value", async () => {
			const currentDevice = {
				os: { name: "MacOS", version: "15" },
				ip: "1.2.3.4",
			};
			const attackerDevice = {
				os: { name: "Windows", version: "11" },
				ip: "1.2.3.4",
			};
			const { sid } = await sessionCreate(sub, currentDevice);
			const session = await sessionLookup(sid, attackerDevice);
			equal(session, undefined);
		});

		it("Can NOT lookup a session by { sid, value } when expired", async () => {
			const currentDevice = { os: "MacOS" };
			const { id, sid } = await sessionCreate(sub, currentDevice);
			await sessionExpire(sub, id);
			const session = await sessionLookup(sid, currentDevice);
			equal(session, undefined);
		});

		it("Can NOT lookup a session by { sid, value } when removed", async () => {
			const currentDevice = { os: "MacOS" };
			const { id, sid } = await sessionCreate(sub, currentDevice);
			await sessionRemove(sub, id);
			const session = await sessionLookup(sid, currentDevice);
			equal(session, undefined);
		});
	});

	describe("`select`", () => {
		it("Will return nothing for an unknown id", async () => {
			equal(await sessionSelect(sub, "session_doesnotexist"), undefined);
		});
		it("Will throw with ({sub:undefined})", async () => {
			const sessionId = await sessionCreate(sub, {});
			try {
				await sessionSelect(undefined, sessionId);
			} catch (e) {
				equal(e.message, "401 Unauthorized");
			}
		});
		it("Will throw with ({sub:number})", async () => {
			const sessionId = await sessionCreate(sub, {});
			try {
				await sessionSelect(undefined, sessionId);
			} catch (e) {
				equal(e.message, "401 Unauthorized");
			}
		});
		it("Will throw with ({id:undefined})", async () => {
			try {
				await sessionSelect(sub, undefined);
			} catch (e) {
				equal(e.message, "404 Not Found");
			}
		});
		it("Will throw with ({id:number})", async () => {
			try {
				await sessionSelect(sub, 1);
			} catch (e) {
				equal(e.message, "404 Not Found");
			}
		});
		it("Can with { sub, id }", async () => {
			const { id } = await sessionCreate(sub, {});
			const session = await sessionSelect(sub, id);
			equal(session.id, id);
			ok(session.expire);
		});
	});

	describe("`list`", () => {
		it("Will throw with ({sub:undefined})", async () => {
			try {
				await sessionList(undefined);
			} catch (e) {
				equal(e.message, "401 Unauthorized");
			}
		});
		it("Will throw with ({sub:number})", async () => {
			try {
				await sessionList(1);
			} catch (e) {
				equal(e.message, "401 Unauthorized");
			}
		});

		it("Can list sessions for an account, additional fields", async () => {
			const currentDevice = { os: "MacOS" };
			const currentFields = { metadata: "Toronto, Ontario, Canada" };
			await sessionCreate(sub, currentDevice, currentFields);

			const sessions = await sessionList(sub);
			deepEqual(sessions[0].metadata, currentFields.metadata);
		});
		it("Can list sessions for an account, including expired", async () => {
			const currentDevice = { os: "MacOS" };
			const otherDevice = { os: "iOS" };
			await sessionCreate(sub, currentDevice);
			const { id } = await sessionCreate(sub, otherDevice);
			await sessionExpire(sub, id);

			const sessions = await sessionList(sub);
			equal(sessions.length, 2);
		});

		it("Can list sessions for an account, excluding removed", async () => {
			const currentDevice = { os: "MacOS" };
			const otherDevice = { os: "iOS" };
			await sessionCreate(sub, currentDevice);
			const { id } = await sessionCreate(sub, otherDevice);
			await sessionRemove(sub, id);

			const sessions = await sessionList(sub);
			equal(sessions.length, 1);
		});
	});

	describe("`create`", () => {
		it("Will throw with ({sub:undefined})", async () => {
			try {
				await sessionCreate(undefined, {});
			} catch (e) {
				equal(e.message, "401 Unauthorized");
			}
		});
		it("Will throw with ({sub:number})", async () => {
			try {
				await sessionCreate(1, {});
			} catch (e) {
				equal(e.message, "401 Unauthorized");
			}
		});
		it("Will throw with ({value:undefined})", async () => {
			try {
				await sessionCreate(sub, undefined);
			} catch (e) {
				equal(e.message, "400 Bad Request");
			}
		});
		it("Can with { sub, value }", async () => {
			const currentDevice = { os: "MacOS" };
			const { id, expire } = await sessionCreate(sub, currentDevice);
			const session = await sessionSelect(sub, id);
			ok(session);
			equal(session.id, id);
			equal(session.expire, expire);
		});
		it("Can with { sub, value, values }", async () => {
			const currentDevice = { os: "MacOS" };
			const currentFields = { metadata: "Toronto, Ontario, Canada" };
			const { id, expire } = await sessionCreate(
				sub,
				currentDevice,
				currentFields,
			);
			const session = await sessionSelect(sub, id);
			ok(session);
			equal(session.id, id);
			equal(session.expire, expire);
			equal(session.metadata, currentFields.metadata);
		});

		it("Can create session on an account", async () => {
			const currentDevice = { os: "MacOS" };

			await sessionCheck(sub, currentDevice);
			await sessionCreate(sub, currentDevice);
			// notify
			equal(mocks.notifyClient.mock.calls.length, 1);
			deepEqual(mocks.notifyClient.mock.calls[0].arguments[0], {
				id: "authn-session-new-device",
				sub,
				data: {},
				options: {},
			});
		});
		it("Can notify with a custom template id prefix", async () => {
			const originalOptions = { ...sessionGetOptions() };
			session({ ...originalOptions, notifyId: "authn-web-session" });
			try {
				await sessionCheck(sub, { os: "MacOS" });
				equal(
					mocks.notifyClient.mock.calls[0].arguments[0].id,
					"authn-web-session-new-device",
				);
			} finally {
				session(originalOptions);
			}
		});
		it("Can create session on an account from same device", async () => {
			const pastDevice = { os: "MacOS" };
			const currentDevice = { os: "MacOS" };
			await sessionCreate(sub, pastDevice);

			await sessionCheck(sub, currentDevice);
			await sessionCreate(sub, currentDevice);
			// notify
			equal(mocks.notifyClient.mock.calls.length, 0);
		});
		it("Can create session on an account from a new device", async () => {
			const pastDevice = { os: "Windows" };
			const currentDevice = { os: "MacOS" };
			await sessionCreate(sub, pastDevice);

			await sessionCheck(sub, currentDevice);
			await sessionCreate(sub, currentDevice);

			// notify
			equal(mocks.notifyClient.mock.calls.length, 1);
			deepEqual(mocks.notifyClient.mock.calls[0].arguments[0], {
				id: "authn-session-new-device",
				sub,
				data: {},
				options: {},
			});
		});
		it("Can create session on an account from a new device that differs only in a nested value", async () => {
			const pastDevice = { os: { name: "Windows", version: "11" } };
			const currentDevice = { os: { name: "MacOS", version: "15" } };
			await sessionCreate(sub, pastDevice);

			await sessionCheck(sub, currentDevice);
			await sessionCreate(sub, currentDevice);

			// notify
			equal(mocks.notifyClient.mock.calls.length, 1);
			deepEqual(mocks.notifyClient.mock.calls[0].arguments[0], {
				id: "authn-session-new-device",
				sub,
				data: {},
				options: {},
			});
		});
	});

	describe("`check`", () => {
		it("Will throw with ({sub:undefined})", async () => {
			try {
				await sessionCheck(undefined);
			} catch (e) {
				equal(e.message, "401 Unauthorized");
			}
		});
		it("Will throw with ({sub:number})", async () => {
			try {
				await sessionCheck(1);
			} catch (e) {
				equal(e.message, "401 Unauthorized");
			}
		});
	});

	describe("`expire`", () => {
		it("Will throw with ({sub:undefined})", async () => {
			const sessionId = await sessionCreate(sub, {});
			try {
				await sessionExpire(undefined, sessionId);
			} catch (e) {
				equal(e.message, "401 Unauthorized");
			}
		});
		it("Will throw with ({sub:number})", async () => {
			const sessionId = await sessionCreate(sub, {});
			try {
				await sessionExpire(1, sessionId);
			} catch (e) {
				equal(e.message, "401 Unauthorized");
			}
		});
		it("Will throw with ({id:undefined})", async () => {
			try {
				await sessionExpire(sub, undefined);
			} catch (e) {
				equal(e.message, "404 Not Found");
			}
		});
		it("Will throw with ({id:number})", async () => {
			try {
				await sessionExpire(sub, 1);
			} catch (e) {
				equal(e.message, "404 Not Found");
			}
		});
	});

	describe("`remove`", () => {
		it("Will throw with ({sub:undefined})", async () => {
			const sessionId = await sessionCreate(sub, {});
			try {
				await sessionRemove(undefined, sessionId);
			} catch (e) {
				equal(e.message, "401 Unauthorized");
			}
		});
		it("Will throw with ({sub:number})", async () => {
			const sessionId = await sessionCreate(sub, {});
			try {
				await sessionRemove(1, sessionId);
			} catch (e) {
				equal(e.message, "401 Unauthorized");
			}
		});
		it("Will throw with ({id:undefined})", async () => {
			try {
				await sessionRemove(sub, undefined);
			} catch (e) {
				equal(e.message, "404 Not Found");
			}
		});
		it("Will throw with ({id:number})", async () => {
			try {
				await sessionRemove(sub, 1);
			} catch (e) {
				equal(e.message, "404 Not Found");
			}
		});
	});

	// A device key rides on the session row, `@1auth/session-dbsc` puts it there
	const publicKey = JSON.stringify({
		kty: "EC",
		crv: "P-256",
		x: "GsDdKsF5LFYNoT4CxIz5eXRIzUXWJ_yzHmQQZFvGHDo",
		y: "u5MFPFpHKtLGjnRJZ0aKvJZOsBnhLYnMDhAWJHiOFVQ",
	});

	describe("`selectBinding`", () => {
		it("Will throw with ({id:undefined})", async () => {
			try {
				await sessionSelectBinding(undefined);
			} catch (e) {
				equal(e.message, "404 Not Found");
			}
		});
		it("Will throw with ({id:number})", async () => {
			try {
				await sessionSelectBinding(1);
			} catch (e) {
				equal(e.message, "404 Not Found");
			}
		});
		it("Can with { id }, without a sub", async () => {
			const { id } = await sessionCreate(sub, { os: "MacOS" }, { publicKey });
			const binding = await sessionSelectBinding(id);
			equal(binding.id, id);
			equal(binding.sub, sub);
			equal(binding.publicKey, publicKey);
			ok(binding.create);
			ok(binding.expire);
		});
		// `id` travels in the plaintext Sec-Session-Id header, unlike `sid`
		it("Can NOT leak `value`, `digest` or `encryptionKey`", async () => {
			const { id } = await sessionCreate(sub, { os: "MacOS" }, { publicKey });
			const binding = await sessionSelectBinding(id);
			equal(binding.value, undefined);
			equal(binding.digest, undefined);
			equal(binding.encryptionKey, undefined);
		});
		it("Can return undefined for an unknown id", async () => {
			equal(await sessionSelectBinding("session_unknown"), undefined);
		});
		it("Can read an unbound session, with no publicKey", async () => {
			const { id } = await sessionCreate(sub, { os: "MacOS" });
			const binding = await sessionSelectBinding(id);
			equal(binding.id, id);
			ok(!binding.publicKey);
		});
	});

	describe("`rotate`", () => {
		it("Will throw with ({sub:undefined})", async () => {
			try {
				await sessionRotate(undefined, "session_1", {});
			} catch (e) {
				equal(e.message, "401 Unauthorized");
			}
		});
		it("Will throw with ({id:undefined})", async () => {
			try {
				await sessionRotate(sub, undefined, {});
			} catch (e) {
				equal(e.message, "404 Not Found");
			}
		});
		it("Can keep { id, publicKey, create } and replace { sid, digest, expire }", async () => {
			const currentDevice = { os: "MacOS" };
			const { id, sid, digest } = await sessionCreate(sub, currentDevice, {
				publicKey,
			});
			const before = await sessionSelectBinding(id);

			const rotated = await sessionRotate(sub, id, currentDevice);
			equal(rotated.id, id);
			ok(rotated.sid);
			notEqual(rotated.sid, sid);
			notEqual(rotated.digest, digest);

			const after = await sessionSelectBinding(id);
			equal(after.id, id);
			equal(after.publicKey, publicKey);
			equal(after.create, before.create);
		});
		it("Can invalidate the previous sid", async () => {
			const currentDevice = { os: "MacOS" };
			const { id, sid } = await sessionCreate(sub, currentDevice, {
				publicKey,
			});
			const rotated = await sessionRotate(sub, id, currentDevice);
			ok(await sessionLookup(rotated.sid, currentDevice));
			equal(await sessionLookup(sid, currentDevice), undefined);
		});
		// The refresh case: the cookie is meant to be dead by the time this runs
		it("Will NOT rotate an expired session back into use", async () => {
			const currentDevice = { os: "MacOS" };
			const { id, sid } = await sessionCreate(sub, currentDevice, {
				publicKey,
			});
			await sessionExpire(sub, id);
			equal(await sessionLookup(sid, currentDevice), undefined);

			// `expire` is the absolute cap, so rotate mints a fresh `sid` but must
			// leave the session dead. Resurrecting here would mean a session that
			// keeps refreshing never ends.
			const rotated = await sessionRotate(sub, id, currentDevice);
			equal(await sessionLookup(rotated.sid, currentDevice), undefined);
			equal((await sessionList(sub)).length, 1);
		});
		it("Will not extend `expire` on rotate", async () => {
			const currentDevice = { os: "MacOS" };
			const { id } = await sessionCreate(sub, currentDevice, { publicKey });
			const before = await sessionSelect(sub, id);
			const rotated = await sessionRotate(sub, id, currentDevice);
			const after = await sessionSelect(sub, id);
			equal(after.expire, before.expire);
			// the cookie rotated even though the cap did not move
			ok(await sessionLookup(rotated.sid, currentDevice));
		});
		it("Can carry additional values", async () => {
			const currentDevice = { os: "MacOS" };
			const { id } = await sessionCreate(sub, currentDevice, { publicKey });
			await sessionRotate(sub, id, currentDevice, {
				metadata: "Toronto, Ontario, Canada",
			});
			const session = await sessionSelect(sub, id);
			equal(session.metadata, "Toronto, Ontario, Canada");
		});
	});

	it("Can `sign`/`verify` a sid", async () => {
		const currentDevice = { os: "MacOS" };
		const { sid } = await sessionCreate(sub, currentDevice);
		const cookie = sessionSign(sid);
		const verify = sessionVerify(cookie);
		ok(verify);
	});
};
describe("session", { concurrency: 1 }, () => {
	for (const storeKey of Object.keys(mockStores)) {
		describe(`using store-${storeKey}`, () => {
			tests(mockStores[storeKey]);
		});
	}
});
