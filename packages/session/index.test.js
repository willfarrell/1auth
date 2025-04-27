import { deepEqual, equal, ok } from "node:assert/strict";
import { describe, it, test } from "node:test";

// *** Setup Start *** //
import * as notify from "../notify/index.js";
import * as storeDynamoDB from "../store-dynamodb/index.js";
import * as storePostgres from "../store-postgres/index.js";
import * as storeSQLite from "../store-sqlite/index.js";

import * as mockNotify from "../notify/mock.js";

// import * as mockDynamoDB from "../store-dynamodb/mock.js";
// import * as mockPostgres from "../store-postgres/mock.js";
import * as mockSQLite from "../store-sqlite/mock.js";

// import * as mockAccountDynamoDBTable from "../account/table/dynamodb.js";
import * as mockAccountSQLTable from "../account/table/sql.js";

// import * as mockAuthnDynamoDBTable from "../authn/table/dynamodb.js";
import * as mockAuthnSQLTable from "../authn/table/sql.js";

// import * as mockSessionDynamoDBTable from "./table/dynamodb.js";
import * as mockSessionSQLTable from "./table/sql.js";

import crypto, {
	symmetricRandomEncryptionKey,
	symmetricRandomSignatureSecret,
	randomChecksumSalt,
	randomChecksumPepper,
} from "../crypto/index.js";

import accountUsername, {
	create as accountUsernameCreate,
} from "../account-username/index.js";
import account, {
	create as accountCreate,
	remove as accountRemove,
} from "../account/index.js";

import session, {
	create as sessionCreate,
	check as sessionCheck,
	select as sessionSelect,
	lookup as sessionLookup,
	list as sessionList,
	expire as sessionExpire,
	remove as sessionRemove,
	sign as sessionSign,
	verify as sessionVerify,
} from "../session/index.js";

crypto({
	symmetricEncryptionKey: symmetricRandomEncryptionKey(),
	symmetricSignatureSecret: symmetricRandomSignatureSecret(),
	digestChecksumSalt: randomChecksumSalt(),
	digestChecksumPepper: randomChecksumPepper(),
	secretTimeCost: 1,
	secretMemoryCost: 2 ** 3,
	secretParallelism: 1,
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
	// TODO
	// dynamodb: {
	//   store: storeDynamoDB,
	//   mocks :{
	// 		...mockNotify,
	// 	  ...mockDynamoDB,
	// 		storeAccount: mockAccountDynamoDBTable,
	// 		storeAuthn: mockAuthnDynamoDBTable,
	// 		storeSession: mockSessionDynamoDBTable, // is working
	//    }
	// },
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
				data: undefined,
				options: {},
			});
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
				data: undefined,
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

	it("Can `sign`/`verify` a sid", async () => {
		const currentDevice = { os: "MacOS" };
		const { sid } = await sessionCreate(sub, currentDevice);
		const cookie = sessionSign(sid);
		const verify = sessionVerify(cookie);
		ok(verify);
	});
};
describe("session", () => {
	for (const storeKey of Object.keys(mockStores)) {
		describe(`using store-${storeKey}`, () => {
			tests(mockStores[storeKey]);
		});
	}
});
