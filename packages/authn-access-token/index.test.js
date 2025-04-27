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

import crypto, {
	symmetricRandomEncryptionKey,
	symmetricRandomSignatureSecret,
	randomChecksumSalt,
	randomChecksumPepper,
} from "../crypto/index.js";

import accountUsername, {
	create as accountUsernameCreate,
	exists as accountUsernameExists,
} from "../account-username/index.js";
import account, {
	create as accountCreate,
	remove as accountRemove,
} from "../account/index.js";
import authn, { getOptions as authnGetOptions } from "../authn/index.js";

import accessToken, {
	authenticate as accessTokenAuthenticate,
	create as accessTokenCreate,
	exists as accessTokenExists,
	count as accessTokenCount,
	lookup as accessTokenLookup,
	select as accessTokenSelect,
	list as accessTokenList,
	expire as accessTokenExpire,
	remove as accessTokenRemove,
} from "../authn-access-token/index.js";

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
	// TODO
	// dynamodb: {
	//   store: storeDynamoDB,
	//   mocks :{
	// 		...mockNotify,
	// 	  ...mockDynamoDB,
	// 		storeAccount: mockAccountDynamoDBTable,
	// 		storeAuthn: mockAuthnDynamoDBTable,
	//   }
	// },
};

account();
accountUsername();
authn();
accessToken();
// *** Setup End *** //

let sub;
const username = "username";

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
			usernameExists: [accountUsernameExists, accessTokenExists],
			authenticationDuration: 0,
			// log: (...args) => {
			// mocks.log(...args);
			// },
		});
		accessToken({
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

	describe("`exists`", () => {
		it("Will throw with ({username:undefined})", async () => {
			try {
				await accessTokenExists(undefined);
			} catch (e) {
				equal(e.message, "404 Not Found");
			}
		});
	});

	describe("`lookup`", () => {
		it("Will throw with ({sub:undefined})", async () => {
			try {
				await accessTokenLookup(undefined);
			} catch (e) {
				equal(e.message, "404 Not Found");
			}
		});
	});

	describe("`remove`", () => {
		it("Will throw with ({sub:undefined})", async () => {
			try {
				await accessTokenRemove(undefined);
			} catch (e) {
				equal(e.message, "401 Unauthorized");
			}
		});
	});

	it("Can create an access token on an account", async () => {
		const { username, secret } = await accessTokenCreate(sub);
		const db = await store.select(authnGetOptions().table, { sub });

		equal(db.type, "accessToken-secret");
		equal(db.otp, false);
		ok(db.value);
		ok(db.digest);
		ok(db.verify);
		ok(db.expire);

		const count = await accessTokenCount(sub);
		equal(count, 1);

		// notify
		const { expire } = mocks.notifyClient.mock.calls[0].arguments[0].data;
		deepEqual(mocks.notifyClient.mock.calls[0].arguments[0], {
			id: "authn-access-token-create",
			sub,
			data: { expire },
			options: {},
		});

		const userSub = await accessTokenAuthenticate(username, secret);
		equal(userSub, sub);
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
			data: undefined,
			options: {},
		});

		try {
			await accessTokenAuthenticate(username, secret);
		} catch (e) {
			equal(e.message, "401 Unauthorized");
		}
	});
	it("Can NOT remove an access token from someone elses account", async () => {
		const { username } = await accessTokenCreate(sub);
		const row = await accessTokenLookup(username);
		await accessTokenRemove("sub_111111", row.id);
		const authDB = await store.select(authnGetOptions().table, { sub });

		ok(authDB);
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
	});
	it("Can lookup an access token with { secret } (not exists)", async () => {
		const row = await accessTokenLookup("pat-notfound");
		equal(row, undefined);
	});
	it("Can select an access token with { id } (exists)", async () => {
		const { id } = await accessTokenCreate(sub); // TODO id is undefined
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
	});
};
describe("authn-access-token", () => {
	for (const storeKey of Object.keys(mockStores)) {
		describe(`using store-${storeKey}`, () => {
			tests(mockStores[storeKey]);
		});
	}
});
