import { deepEqual, equal, ok } from "node:assert/strict";
import { describe, it, test } from "node:test";
import account, {
	create as accountCreate,
	remove as accountRemove,
} from "../account/index.js";
// import * as mockAccountDynamoDBTable from "../account/table/dynamodb.js";
import * as mockAccountSQLTable from "../account/table/sql.js";
import accountUsername, {
	create as accountUsernameCreate,
	exists as accountUsernameExists,
} from "../account-username/index.js";
import authn, { getOptions as authnGetOptions } from "../authn/index.js";
// import * as mockAuthnDynamoDBTable from "../authn/table/dynamodb.js";
import * as mockAuthnSQLTable from "../authn/table/sql.js";
import recoveryCodes, {
	authenticate as recoveryCodesAuthenticate,
	count as recoveryCodesCount,
	create as recoveryCodesCreate,
	// exists as recoveryCodesExists,
	// lookup as recoveryCodesLookup,
	// select as recoveryCodesSelect,
	list as recoveryCodesList,
	remove as recoveryCodesRemove,
	update as recoveryCodesUpdate,
} from "../authn-recovery-codes/index.js";
import crypto, {
	randomChecksumPepper,
	randomChecksumSalt,
	symmetricRandomEncryptionKey,
	symmetricRandomSignatureSecret,
} from "../crypto/index.js";
// *** Setup Start *** //
import * as notify from "../notify/index.js";
import * as mockNotify from "../notify/mock.js";
import * as storeDynamoDB from "../store-dynamodb/index.js";
import * as storePostgres from "../store-postgres/index.js";
import * as storeSQLite from "../store-sqlite/index.js";
// import * as mockDynamoDB from "../store-dynamodb/mock.js";
// import * as mockPostgres from "../store-postgres/mock.js";
import * as mockSQLite from "../store-sqlite/mock.js";

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
	//    }
	// },
};

account();
accountUsername();
authn();
recoveryCodes();
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
			usernameExists: [accountUsernameExists],
			authenticationDuration: 0,
			// log: (...args) => {
			// mocks.log(...args);
			// },
		});
		recoveryCodes({
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

	describe("`count`", () => {
		it("Will throw with ({sub:undefined})", async () => {
			try {
				await recoveryCodesCount(undefined);
			} catch (e) {
				equal(e.message, "401 Unauthorized");
			}
		});
	});

	describe("`list`", () => {
		it("Will throw with ({sub:undefined})", async () => {
			try {
				await recoveryCodesList(undefined);
			} catch (e) {
				equal(e.message, "401 Unauthorized");
			}
		});
	});

	describe("`create`", () => {
		it("Will throw with ({sub:undefined})", async () => {
			try {
				await recoveryCodesCreate(undefined);
			} catch (e) {
				equal(e.message, "401 Unauthorized");
			}
		});
	});

	describe("`update`", () => {
		it("Will throw with ({sub:undefined})", async () => {
			try {
				await recoveryCodesUpdate(undefined);
			} catch (e) {
				equal(e.message, "401 Unauthorized");
			}
		});
	});

	describe("`remove`", () => {
		it("Will throw with ({sub:undefined, id:undefined})", async () => {
			try {
				await recoveryCodesRemove(undefined, undefined);
			} catch (e) {
				equal(e.message, "401 Unauthorized");
			}
		});
		it("Will throw with ({sub:undefined})", async () => {
			try {
				await recoveryCodesRemove(undefined, "id");
			} catch (e) {
				equal(e.message, "401 Unauthorized");
			}
		});
		it("Will throw with ({id:undefined})", async () => {
			try {
				await recoveryCodesRemove(sub, undefined);
			} catch (e) {
				equal(e.message, "404 Not Found");
			}
		});
	});

	it("Can create recovery codes on an account", async () => {
		const secrets = await recoveryCodesCreate(sub);
		const authnDB = await store.select(authnGetOptions().table, { sub });

		equal(authnDB.type, "recoveryCodes-secret");
		equal(authnDB.otp, true);
		ok(authnDB.value);
		ok(authnDB.verify);
		ok(!authnDB.digest);
		ok(!authnDB.expire);

		let count = await recoveryCodesCount(sub);
		equal(count, 5);
		// notify
		deepEqual(mocks.notifyClient.mock.calls[0].arguments[0], {
			id: "authn-recovery-codes-create",
			sub,
			data: undefined,
			options: {},
		});
		const userSub = await recoveryCodesAuthenticate(username, secrets[0].value);
		equal(userSub, sub);
		count = await recoveryCodesCount(sub);
		equal(count, 4);
	});
	it("Can update recovery codes on an account", async () => {
		let secrets = await recoveryCodesCreate(sub);
		equal(secrets.length, 5);
		await recoveryCodesAuthenticate(username, secrets[0].value);

		let authnDB = await store.selectList(authnGetOptions().table, { sub });
		equal(authnDB.length, 5);
		authnDB = authnDB.filter((item) => !item.expire);
		equal(authnDB.length, 4);

		secrets = await recoveryCodesUpdate(sub);
		equal(secrets.length, 5);

		// notify
		deepEqual(mocks.notifyClient.mock.calls[1].arguments[0], {
			id: "authn-recovery-codes-update",
			sub,
			data: undefined,
			options: {},
		});
		authnDB = await store.selectList(authnGetOptions().table, { sub });
		equal(authnDB.length, 5);
	});
	it("Can remove recovery codes on an account", async () => {
		const secrets = await recoveryCodesCreate(sub);
		await recoveryCodesRemove(sub);
		const authDB = await store.select(authnGetOptions().table, { sub });

		ok(!authDB);

		// notify
		deepEqual(mocks.notifyClient.mock.calls[1].arguments[0], {
			id: "authn-recovery-codes-remove",
			sub,
			data: undefined,
			options: {},
		});

		try {
			await recoveryCodesAuthenticate(username, secrets[0].value);
		} catch (e) {
			equal(e.message, "401 Unauthorized");
		}
	});
	it("Can remove single recovery code on an account", async () => {
		const secrets = await recoveryCodesCreate(sub);
		let authDB = await store.select(authnGetOptions().table, { sub });
		await recoveryCodesRemove(sub, authDB.id);
		authDB = await store.selectList(authnGetOptions().table, { sub });

		equal(authDB.length, 4);

		// notify
		deepEqual(mocks.notifyClient.mock.calls[1].arguments[0], {
			id: "authn-recovery-codes-remove",
			sub,
			data: undefined,
			options: {},
		});

		try {
			await recoveryCodesAuthenticate(username, secrets[0].value);
		} catch (e) {
			equal(e.message, "401 Unauthorized");
		}
	});
	it("Can NOT remove recovery codes from someone elses account", async () => {
		const secrets = await recoveryCodesCreate(sub);
		try {
			await recoveryCodesRemove("sub_1111111", secrets[0].id);
		} catch (e) {
			equal(e.message, "404 Not Found");
		}
		const authDB = await store.selectList(authnGetOptions().table, { sub });

		ok(authDB);
		equal(authDB.length, 5);
	});

	/* it("Can check is an recovery codes exists (exists)", async () => {
     const secrets = await recoveryCodesCreate(sub);
     const row = await recoveryCodesExists(secrets[0].secret);
     ok(row);
   });
   it("Can check is an recovery codes exists (not exists)", async () => {
     const row = await recoveryCodesExists("pat-notfound");
     equal(row, undefined);
   });
   it("Can lookup an recovery codes with { secret } (exists)", async () => {
     const secrets = await recoveryCodesCreate(sub);
     const row = await recoveryCodesLookup(secrets[0].secret);
     ok(row);
   });
   it("Can lookup an recovery codes with { secret } (not exists)", async () => {
     const row = await recoveryCodesLookup("pat-notfound");
     equal(row, undefined);
   });*/
	// it("Can select an recovery codes with { id } (exists)", async () => {
	//   const {id} = await recoveryCodesCreate(sub);
	//   const row = await recoveryCodesSelect(sub, id);
	//   ok(row);
	// });
	// it("Can select an recovery codes with { id } (not exists)", async () => {
	//   const row = await recoveryCodesSelect(sub, "session_000");
	//   equal(row, undefined);
	// });
	it("Can list an recovery codes with { sub } (exists)", async () => {
		const secrets = await recoveryCodesCreate(sub);
		const row = await recoveryCodesList(sub);
		equal(row.length, secrets.length);
	});
	it("Can list an recovery codes with { sub } (not exists)", async () => {
		const row = await recoveryCodesList(sub);
		equal(row.length, 0);
	});
};
describe("authn-recovery-codes", () => {
	for (const storeKey of Object.keys(mockStores)) {
		describe(`using store-${storeKey}`, () => {
			tests(mockStores[storeKey]);
		});
	}
});
