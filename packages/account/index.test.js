import { equal, notEqual, ok } from "node:assert/strict";
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

import crypto, {
	symmetricRandomEncryptionKey,
	symmetricRandomSignatureSecret,
	randomChecksumSalt,
	randomChecksumPepper,
} from "../crypto/index.js";

import account, {
	create as accountCreate,
	exists as accountExists,
	lookup as accountLookup,
	update as accountUpdate,
	expire as accountExpire,
	remove as accountRemove,
	getOptions as accountGetOptions,
} from "../account/index.js";

crypto({
	symmetricEncryptionKey: symmetricRandomEncryptionKey(),
	symmetricSignatureSecret: symmetricRandomSignatureSecret(),
	digestChecksumSalt: randomChecksumSalt(),
	digestChecksumPepper: randomChecksumPepper(),
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
	//   mocks :{
	// 		...mockNotify,
	//     ...mockPostgres,
	// 		storeAccount: mockAccountSQLTable,
	//    }
	// },
	sqlite: {
		store: storeSQLite,
		mocks: {
			...mockNotify,
			...mockSQLite,
			storeAccount: mockAccountSQLTable,
		},
	},
	// dynamodb: {
	// 	store: storeDynamoDB,
	// 	mocks: {
	// 		...mockNotify,
	// 		...mockDynamoDB,
	// 		storeAccount: mockAccountDynamoDBTable,
	// 	},
	// },
};

account();
// *** Setup End *** //

let sub;

const tests = (config) => {
	const store = config.store;
	test.before(async () => {
		mocks = config.mocks;
		await mocks.storeAccount.create(mocks.storeClient);

		account({
			encryptedFields: ["value", "name"],
			store,
			notify,
			log: (...args) => {
				mocks.log(...args);
			},
		});
	});
	test.beforeEach(async (t) => {
		sub = await accountCreate();
		t.mock.method(mocks, "log");
		t.mock.method(mocks, "notifyClient");
	});

	test.afterEach(async (t) => {
		t.mock.reset();
		await mocks.storeAccount.truncate(mocks.storeClient);
	});

	test.after(async () => {
		await mocks.storeAccount.drop(mocks.storeClient);
		mocks.storeClient.after?.();
	});

	describe("`exists`", () => {
		it("Will throw with ({sub:undefined})", async () => {
			try {
				await accountExists(undefined);
			} catch (e) {
				equal(e.message, "404 Not Found");
			}
		});
		it("Can with { sub }", async () => {
			const user = await accountExists(sub);
			ok(user);
		});
		it("Can check if an account exists using { sub } (not exists)", async () => {
			const user = await accountExists("notfound");
			equal(user, undefined);
		});
	});
	describe("`lookup`", () => {
		it("Will throw with ({sub:undefined})", async () => {
			try {
				await accountLookup(undefined);
			} catch (e) {
				equal(e.message, "404 Not Found");
			}
		});
		it('Will throw with ({sub:"notfound"})', async () => {
			try {
				await accountLookup("notfound");
			} catch (e) {
				equal(e.message, "404 Not Found");
			}
		});
		it("Can lookup an account using { sub }", async () => {
			const user = await accountLookup(sub);
			ok(user.id);
			equal(user.encryptionKey, undefined);
		});
	});

	describe("`create`", () => {
		it("Can create an account", async () => {
			const sub = await accountCreate();
			ok(sub);
			const db = await store.select(accountGetOptions().table, { sub });
			ok(db.encryptionKey);
		});
	});

	describe("`update`", () => {
		it("Can NOT add `name` to account ({sub:undefined})", async () => {
			const sub = undefined;
			const name = "Real name";
			try {
				await accountUpdate(sub, { name });
			} catch (e) {
				equal(e.message, "404 Not Found");
			}
		});
		it("Can NOT add `name` to account (missing sub)", async () => {
			const name = "Real name";
			const missingSub = "sub_111";
			try {
				await accountUpdate(missingSub, { name });
			} catch (e) {
				equal(e.message, "404 Not Found");
			}
		});
		it("Can add `name` to account (encrypted)", async () => {
			const name = "Real name";
			const sub = await accountCreate();
			await accountUpdate(sub, { name });
			const user = await accountLookup(sub);
			equal(user.name, name);

			const db = await store.select(accountGetOptions().table, { sub });
			notEqual(db.name, user.name); // encrypted
		});
		it("Can add an unencrypted field to account", async () => {
			const unencrypted = "unencrypted";
			const sub = await accountCreate();
			await accountUpdate(sub, { unencrypted });
			const user = await accountLookup(sub);
			equal(user.unencrypted, unencrypted);

			const db = await store.select(accountGetOptions().table, { sub });
			equal(db.unencrypted, user.unencrypted); // unencrypted
		});
	});

	describe("`expire`", () => {
		it("Will throw with ({sub:undefined})", async () => {
			try {
				await accountExpire(undefined);
			} catch (e) {
				equal(e.message, "401 Unauthorized");
			}
		});
		it("Can expire an account", async () => {
			const sub = await accountCreate();
			await accountExpire(sub);
			const user = await store.select(accountGetOptions().table, { sub });
			equal(user?.sub, sub);
			ok(user.expire);
		});
	});

	describe("`remove`", () => {
		it("Will throw with ({sub:undefined})", async () => {
			try {
				await accountRemove(undefined);
			} catch (e) {
				equal(e.message, "404 Not Found");
			}
		});
		it("Can remove an account", async () => {
			const sub = await accountCreate();
			await accountRemove(sub);
			const user = await store.select(accountGetOptions().table, { sub });
			equal(user, undefined);
		});
	});
};
describe("account", () => {
	for (const storeKey of Object.keys(mockStores)) {
		describe(`using store-${storeKey}`, () => {
			tests(mockStores[storeKey]);
		});
	}
});
