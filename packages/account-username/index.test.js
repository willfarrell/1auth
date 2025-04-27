import { deepEqual, equal, notEqual, ok } from "node:assert/strict";
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
	remove as accountRemove,
	getOptions as accountGetOptions,
} from "../account/index.js";

import accountUsername, {
	create as accountUsernameCreate,
	exists as accountUsernameExists,
	lookup as accountUsernameLookup,
	update as accountUsernameUpdate,
	recover as accountUsernameRecover,
} from "../account-username/index.js";

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
	//      ...mockNotify,
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
accountUsername();
// *** Setup End *** //

let sub;
const username = "username";

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
		accountUsername({
			maxLength: 100,
			usernameBlacklist: ["admin"],
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
		await accountRemove(sub);
		await mocks.storeAccount.truncate(mocks.storeClient);
	});

	test.after(async () => {
		await mocks.storeAccount.drop(mocks.storeClient);
		mocks.storeClient.after?.();
	});

	describe("`create`", () => {
		it("Will throw with ({sub:undefined})", async () => {
			try {
				await accountUsernameCreate(undefined, username);
			} catch (e) {
				equal(e.message, "401 Unauthorized");
			}
		});
		it("Can create a username on an account", async () => {
			await accountUsernameCreate(sub, username);
			const db = await store.select(accountGetOptions().table, { sub });
			ok(db.value);
			notEqual(db.value, username); // encrypted
		});
	});

	describe("`exists`", () => {
		it("Can check is a username exists (exists)", async () => {
			await accountUsernameCreate(sub, username);
			const user = await accountUsernameExists(username);
			ok(user);
		});
		it("Can check is a username exists (not exists)", async () => {
			const user = await accountUsernameExists("notfound");
			equal(user, undefined);
		});
	});

	describe("`lookup`", () => {
		it("Can lookup an account { username } (exists)", async () => {
			await accountUsernameCreate(sub, username);
			const user = await accountUsernameLookup(username);
			ok(user);
			equal(user.value, username); // unencrypted
		});
		it("Can lookup an account { username } (not exists)", async () => {
			const user = await accountUsernameLookup(username);
			equal(user, undefined);
		});
	});

	describe("`update`", () => {
		it("Can update username", async () => {
			const usernameValue = "username";
			await accountUsernameCreate(sub, usernameValue);
			const newUsernameValue = "nameuser";
			await accountUsernameUpdate(sub, newUsernameValue);

			let user = await accountUsernameLookup(usernameValue);
			equal(user, undefined);

			user = await accountUsernameLookup(newUsernameValue);
			ok(user);

			// notify
			deepEqual(mocks.notifyClient.mock.calls[0].arguments[0], {
				id: "account-username-change",
				sub,
				data: undefined,
				options: {},
			});
		});
	});

	describe("`recover`", () => {
		it("Can recover a useranme using { sub }", async () => {
			// You would lookup sub using an email first
			const usernameValue = "username";
			await accountUsernameCreate(sub, usernameValue);
			await accountUsernameRecover(sub);

			// notify
			deepEqual(mocks.notifyClient.mock.calls[0].arguments[0], {
				id: "account-username-recover",
				sub,
				data: { username: usernameValue },
				options: {},
			});
		});
	});

	it("Should allow username with number charaters", async () => {
		const usernameValue = "number_1234567890";
		await accountUsernameCreate(sub, usernameValue);
		const user = await accountUsernameExists(usernameValue);
		ok(user);
	});
	it("Should allow username with lower case charaters", async () => {
		const usernameValue = "lower_username";
		await accountUsernameCreate(sub, usernameValue);
		const user = await accountUsernameExists(usernameValue);
		ok(user);
	});
	it("Should allow username with upper case charaters", async () => {
		const usernameValue = "UPPER_USERNAME";
		await accountUsernameCreate(sub, usernameValue);
		const user = await accountUsernameExists(usernameValue);
		ok(user);
	});
	it("Should allow username with lower case accented charaters", async () => {
		const usernameValue =
			"lower_accented_ŵèéêëěẽēėęřțťýŷÿùúûüǔũūűůìíîïǐĩīįòóôöǒõōàáâäǎãåāşșśšďğġķļľźžżçćčċñńņň";
		await accountUsernameCreate(sub, usernameValue);
		const user = await accountUsernameExists(usernameValue);
		ok(user);
	});
	it("Should allow username with upper case accented charaters", async () => {
		const usernameValue =
			"UPPER_ACCENTED_ŴÈÉÊËĚẼĒĖĘŘȚŤÝŶŸÙÚÛÜǓŨŪŰŮÌÍÎÏǏĨĪİĮÒÓÔÖǑÕŌÀÁÂÄǍÃÅĀŚŠŞȘĎĞĠĻĽŹŽŻÇĆČĊÑŃŅŇ";
		await accountUsernameCreate(sub, usernameValue);
		const user = await accountUsernameExists(usernameValue);
		ok(user);
	});
	it("Should throw when username has ligature charaters", async () => {
		const usernameValue = "þœøæßdðħł";
		try {
			await accountUsernameCreate(sub, usernameValue);
		} catch (e) {
			equal(e.message, "400 Bad Request");
		}
	});

	it("Should throw when username has `@` from email", async () => {
		const usernameValue = "username@domain.tld";
		try {
			await accountUsernameCreate(sub, usernameValue);
		} catch (e) {
			equal(e.message, "400 Bad Request");
		}
	});
	it("Should throw when username has ` `", async () => {
		const usernameValue = "user name";
		try {
			await accountUsernameCreate(sub, usernameValue);
		} catch (e) {
			equal(e.message, "400 Bad Request");
		}
	});
	it("Should throw when username is too short", async () => {
		const usernameValue = "";
		try {
			await accountUsernameCreate(sub, usernameValue);
		} catch (e) {
			equal(e.message, "400 Bad Request");
		}
	});
	it("Should throw when username is too long", async () => {
		const usernameValue =
			"0000000001111111111222222222211111111112222222222111111111122222222221111111111222222222211111111112222222222";
		try {
			await accountUsernameCreate(sub, usernameValue);
		} catch (e) {
			equal(e.message, "400 Bad Request");
		}
	});
	it("Should throw when username contains invalid chars", async () => {
		const usernameValue = "username*";
		try {
			await accountUsernameCreate(sub, usernameValue);
		} catch (e) {
			equal(e.message, "400 Bad Request");
		}
	});
	it("Should throw when username contains a black listed word", async () => {
		const usernameValue = "user_admin_name";
		try {
			await accountUsernameCreate(sub, usernameValue);
		} catch (e) {
			equal(e.message, "409 Conflict");
		}
	});
	it("Should throw when username already exists", async () => {
		const usernameValue = "username";
		await accountUsernameCreate(sub, usernameValue);
		sub = await accountCreate();
		try {
			await accountUsernameCreate(sub, usernameValue);
		} catch (e) {
			equal(e.message, "409 Conflict");
		}
	});
};
describe("account-username", () => {
	for (const storeKey of Object.keys(mockStores)) {
		describe(`using store-${storeKey}`, () => {
			tests(mockStores[storeKey]);
		});
	}
});
