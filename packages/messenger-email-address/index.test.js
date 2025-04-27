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

// import * as mockMessengerDynamoDBTable from "../messenger/table/dynamodb.js";
import * as mockMessengerSQLTable from "../messenger/table/sql.js";

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

import emailAddress, {
	exists as emailAddressExists,
	lookup as emailAddressLookup,
	select as emailAddressSelect,
	list as emailAddressList,
	create as emailAddressCreate,
	createToken as emailAddressCreateToken,
	verifyToken as emailAddressVerifyToken,
	remove as emailAddressRemove,
} from "../messenger-email-address/index.js";
import messenger, {
	getOptions as messengerGetOptions,
} from "../messenger/index.js";

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
	//   mocks :{
	// 		...mockNotify,
	//     ...mockPostgres,
	// 		storeAccount: mockAccountSQLTable,
	// 		storeAuthn: mockAuthnSQLTable,
	//     storeMessenger: mockMessengerSQLTable,
	//    }
	// },
	sqlite: {
		store: storeSQLite,
		messenger: emailAddress,
		mocks: {
			...mockNotify,
			...mockSQLite,
			storeAccount: mockAccountSQLTable,
			storeAuthn: mockAuthnSQLTable,
			storeMessenger: mockMessengerSQLTable,
		},
	},
	// TODO
	// dynamodb: {
	//   store: storeDynamoDB,
	//   mocks :{
	// 		...mockNotify,
	//     ...mockDynamoDB,
	// 	  storeMessenger: mockMessengerDynamoDBTable,
	//    }
	// },
};

account();
accountUsername();
authn();
messenger();
emailAddress();
// *** Setup End *** //

let sub;
const username = "username";
let messengerValue = "username@example.org";
const messengerType = "emailAddress";

const tests = (config) => {
	const store = config.store;
	test.before(async () => {
		mocks = config.mocks;

		await mocks.storeAccount.create(mocks.storeClient);
		await mocks.storeAuthn.create(mocks.storeClient);
		await mocks.storeMessenger.create(mocks.storeClient);

		account({ store, notify });
		accountUsername();
		authn({
			store,
			notify,
			usernameExists: [accountUsernameExists],
			authenticationDuration: 0,
		});
		messenger({
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
		await accountUsernameCreate(sub, username);
		messengerValue = `${sub}@example.com`;
		t.mock.method(mocks, "log");
		t.mock.method(mocks, "notifyClient");
	});

	test.afterEach(async (t) => {
		t.mock.reset();
		await accountRemove(sub);
		await mocks.storeMessenger.truncate(mocks.storeClient);
		await mocks.storeAuthn.truncate(mocks.storeClient);
		await mocks.storeAccount.truncate(mocks.storeClient);
	});

	test.after(async () => {
		await mocks.storeMessenger.drop(mocks.storeClient);
		await mocks.storeAuthn.drop(mocks.storeClient);
		await mocks.storeAccount.drop(mocks.storeClient);
		mocks.storeClient.after?.();
	});

	it("Can create a messenger on an account", async () => {
		const messengerId = await emailAddressCreate(sub, messengerValue);
		const { token, expire } =
			mocks.notifyClient.mock.calls[0].arguments[0].data;

		// notify
		deepEqual(mocks.notifyClient.mock.calls[0].arguments[0], {
			id: `messenger-${messengerType}-verify`,
			sub,
			data: { token, expire },
			options: {
				messengers: [{ id: messengerId }],
			},
		});

		let messengerDB = await store.select(messengerGetOptions().table, { sub });
		//let authnDB = await store.select(authnGetOptions().table, { sub });

		equal(messengerDB.id, messengerId);
		equal(messengerDB.type, messengerType);
		ok(messengerDB.value);
		ok(messengerDB.digest);
		ok(!messengerDB.verify);

		await emailAddressVerifyToken(sub, token, messengerId);

		// notify
		equal(mocks.notifyClient.mock.calls.length, 1);

		messengerDB = await store.select(messengerGetOptions().table, { sub });
		const authnDB = await store.select(authnGetOptions().table, { sub });
		ok(messengerDB.verify);
		ok(!authnDB);
	});

	it("Can create a messenger on an account with a re-created token", async () => {
		const messengerId = await emailAddressCreate(sub, messengerValue);
		await emailAddressCreateToken(sub, messengerId);
		const { token, expire } =
			mocks.notifyClient.mock.calls[1].arguments[0].data;

		// notify
		deepEqual(mocks.notifyClient.mock.calls[1].arguments[0], {
			id: `messenger-${messengerType}-verify`,
			sub,
			data: { token, expire },
			options: {
				messengers: [{ id: messengerId }],
			},
		});

		let messengerDB = await store.select(messengerGetOptions().table, { sub });
		//let authnDB = await store.select(authnGetOptions().table, { sub });

		equal(messengerDB?.id, messengerId);
		equal(messengerDB.type, messengerType);
		ok(messengerDB.value);
		ok(messengerDB.digest);
		ok(!messengerDB.verify);

		await emailAddressVerifyToken(sub, token, messengerId);

		// notify
		equal(mocks.notifyClient.mock.calls.length, 2);

		messengerDB = await store.select(messengerGetOptions().table, { sub });
		const authnDB = await store.select(authnGetOptions().table, { sub });
		ok(messengerDB.verify);
		ok(!authnDB);
	});

	it("Can create a 2nd messenger on an account, others notified", async () => {
		const messengerId = await emailAddressCreate(sub, messengerValue);
		const notifyCall0 = mocks.notifyClient.mock.calls[0].arguments[0].data;

		await emailAddressVerifyToken(sub, notifyCall0.token, messengerId);

		await emailAddressCreate(sub, messengerValue);
		const notifyCall1 = mocks.notifyClient.mock.calls[1].arguments[0].data;

		await emailAddressVerifyToken(sub, notifyCall1.token, messengerId);

		// notify additional messenger
		const notifyCall2 = mocks.notifyClient.mock.calls[2].arguments[0];
		deepEqual(notifyCall2, {
			data: undefined,
			id: `messenger-${messengerType}-create`,
			options: {
				messengers: [
					{
						id: messengerId,
					},
				],
			},
			sub,
		});
	});
	it("Can create a messenger, on a nth attempt, on an account", async () => {
		const messengerId = await emailAddressCreate(sub, messengerValue);

		let messengerDB = await store.select(messengerGetOptions().table, { sub });
		//let authnDB = await store.select(authnGetOptions().table, { sub });

		equal(messengerDB?.id, messengerId);
		equal(messengerDB.type, messengerType);
		ok(messengerDB.value);
		ok(messengerDB.digest);
		ok(!messengerDB.verify);

		await emailAddressCreate(sub, messengerValue);

		const { token } = mocks.notifyClient.mock.calls[1].arguments[0].data;

		await emailAddressVerifyToken(sub, token, messengerId);

		// notify
		equal(mocks.notifyClient.mock.calls.length, 2);

		messengerDB = await store.select(messengerGetOptions().table, { sub });
		const authnDB = await store.select(authnGetOptions().table, { sub });
		ok(messengerDB.verify);
		ok(!authnDB);
	});

	it("Can create a messenger on an account when already attempted by anther account", async () => {
		const subOther = "sub_111111";
		await emailAddressCreate(subOther, messengerValue);

		const messengerId = await emailAddressCreate(sub, messengerValue);
		const { token } = mocks.notifyClient.mock.calls[1].arguments[0].data;
		await emailAddressVerifyToken(sub, token, messengerId);

		const messengerDB = await store.select(messengerGetOptions().table, {
			sub,
		});
		equal(messengerDB?.id, messengerId);
		ok(messengerDB.verify);
	});
	it("Can NOT create ({sub:undefined})", async () => {
		try {
			await emailAddressCreate(undefined, messengerValue);
		} catch (e) {
			equal(e.message, "401 Unauthorized");
		}
	});
	it("Can NOT create ({value:undefined})", async () => {
		try {
			await emailAddressCreate(sub, undefined);
		} catch (e) {
			equal(e.message, "400 Bad Request");
		}
	});
	it("Can NOT createToken ({sub:undefined})", async () => {
		const messengerId = await emailAddressCreate(sub, messengerValue);
		try {
			await emailAddressCreateToken(undefined, messengerId);
		} catch (e) {
			equal(e.message, "401 Unauthorized");
		}
	});
	it("Can NOT createToken ({sourceId:undefined})", async () => {
		try {
			await emailAddressCreateToken(sub, undefined);
		} catch (e) {
			equal(e.message, "404 Not Found");
		}
	});
	it("Can NOT verifyToken ({sub:undefined})", async () => {
		const messengerId = await emailAddressCreate(sub, messengerValue);
		const { token } = mocks.notifyClient.mock.calls[0].arguments[0].data;
		try {
			await emailAddressVerifyToken(undefined, token, messengerId);
		} catch (e) {
			equal(e.message, "401 Unauthorized");
		}
	});
	it("Can NOT verifyToken ({token:undefined})", async () => {
		const messengerId = await emailAddressCreate(sub, messengerValue);
		try {
			await emailAddressVerifyToken(sub, undefined, messengerId);
		} catch (e) {
			equal(e.message, "401 Unauthorized");
		}
	});
	it("Can NOT verifyToken ({sourceId:undefined})", async () => {
		try {
			await emailAddressVerifyToken(sub, "token", undefined);
		} catch (e) {
			equal(e.message, "404 Not Found");
		}
	});

	it("Can NOT remove ({sub:undefined})", async () => {
		try {
			await emailAddressRemove(undefined, messengerValue);
		} catch (e) {
			equal(e.message, "401 Unauthorized");
		}
	});
	it("Can NOT remove ({id:undefined})", async () => {
		try {
			await emailAddressRemove(sub, undefined);
		} catch (e) {
			equal(e.message, "404 Not Found");
		}
	});
	it("Can remove a verified messenger on an account", async () => {
		const messengerId = await emailAddressCreate(sub, messengerValue);
		const { token } = mocks.notifyClient.mock.calls[0].arguments[0].data;
		await emailAddressVerifyToken(sub, token, messengerId);
		await emailAddressRemove(sub, messengerId);

		// notify
		deepEqual(mocks.notifyClient.mock.calls[1].arguments[0], {
			id: `messenger-${messengerType}-remove-self`,
			sub,
			data: undefined,
			options: {
				messengers: [
					{
						type: messengerType,
						value: messengerValue,
					},
				],
			},
		});
		deepEqual(mocks.notifyClient.mock.calls[2].arguments[0], {
			id: `messenger-${messengerType}-remove`,
			sub,
			data: undefined,
			options: {},
		});

		const messengerDB = await store.select(messengerGetOptions().table, {
			sub,
		});

		ok(!messengerDB);
	});
	it("Can remove an unverified messenger on an account", async () => {
		const messengerId = await emailAddressCreate(sub, messengerValue);
		await emailAddressRemove(sub, messengerId);

		// notify
		equal(mocks.notifyClient.mock.calls.length, 1);

		const messengerDB = await store.select(messengerGetOptions().table, {
			sub,
		});

		ok(!messengerDB);
	});
	it("Can NOT remove a messenger of someone elses account", async () => {
		const messengerId = await emailAddressCreate(sub, messengerValue);
		try {
			await emailAddressRemove("sub_111111", messengerId);
		} catch (e) {
			equal(e.message, "401 Unauthorized");
		}
	});

	it("Can NOT check if a messenger exists ({value:undefined})", async () => {
		try {
			await emailAddressExists(undefined);
		} catch (e) {
			equal(e.message, "400 Bad Request");
		}
	});
	it("Can check is a messenger exists (exists)", async () => {
		const messengerId = await emailAddressCreate(sub, messengerValue);
		const { token } = mocks.notifyClient.mock.calls[0].arguments[0].data;
		await emailAddressVerifyToken(sub, token, messengerId);
		const userSub = await emailAddressExists(messengerValue);
		equal(userSub, sub);
	});
	it("Can check is a messenger exists (not exists)", async () => {
		const user = await emailAddressExists("notfound");
		equal(user, undefined);
	});

	it("Can NOT lookup a messenger ({value:undefined})", async () => {
		try {
			await emailAddressLookup(undefined);
		} catch (e) {
			equal(e.message, "400 Bad Request");
		}
	});
	it("Can lookup a messenger { value } (exists)", async () => {
		const messengerId = await emailAddressCreate(sub, messengerValue);
		const { token } = mocks.notifyClient.mock.calls[0].arguments[0].data;
		await emailAddressVerifyToken(sub, token, messengerId);
		const messenger = await emailAddressLookup(messengerValue);

		equal(messenger?.value, messengerValue); // unencrypted
	});
	it("Can lookup a messenger (unverified) { value } (exists)", async () => {
		await emailAddressCreate(sub, messengerValue);
		const messenger = await emailAddressLookup(messengerValue);
		equal(messenger, undefined);
	});
	it("Can lookup a messenger { value } (not exists)", async () => {
		const messenger = await emailAddressLookup(messengerValue);
		equal(messenger, undefined);
	});
	it("Can NOT select ({sub:undefined})", async () => {
		try {
			await emailAddressSelect(undefined, messengerValue);
		} catch (e) {
			equal(e.message, "401 Unauthorized");
		}
	});
	it("Can NOT select ({id:undefined})", async () => {
		try {
			await emailAddressSelect(sub, undefined);
		} catch (e) {
			equal(e.message, "404 Not Found");
		}
	});
	it("Can select a messenger { id } (unverified)", async () => {
		const messengerId = await emailAddressCreate(sub, messengerValue);
		const messenger = await emailAddressSelect(sub, messengerId);
		equal(messenger, undefined);
	});
	it("Can select a messenger { id } (exists)", async () => {
		const messengerId = await emailAddressCreate(sub, messengerValue);
		const { token } = mocks.notifyClient.mock.calls[0].arguments[0].data;
		await emailAddressVerifyToken(sub, token, messengerId);
		const messenger = await emailAddressSelect(sub, messengerId);
		equal(messenger?.value, messengerValue);
	});
	it("Can select a messenger { value } (not exists)", async () => {
		const messengerId = "unknown";
		const messenger = await emailAddressSelect(sub, messengerId);
		equal(messenger, undefined);
	});
	it("Can NOT list messengers with { sub } ({sub:undefined})", async () => {
		try {
			await emailAddressList(undefined);
		} catch (e) {
			equal(e.message, "401 Unauthorized");
		}
	});
	it("Can list messengers with { sub }", async () => {
		await emailAddressCreate(sub, messengerValue);
		const messenger = await emailAddressList(sub);
		ok(messenger);
		equal(messenger?.[0]?.value, messengerValue); // unencrypted
	});

	// TODO sanitize, validate testings
	it("Can create a messenger on an account w/ optionalDotDomains", async () => {
		await emailAddressCreate(sub, "user.name@gmail.com");
		const exists = emailAddressExists("username@gmail.com");
		ok(exists);
	});
	it("Can create a messenger on an account w/ aliasDomains", async () => {
		await emailAddressCreate(sub, "username@proton.me");
		const exists = emailAddressExists("username@protonmail.com");
		ok(exists);
	});
	it("Can NOT create a messenger on an account when already connected to anther account", async () => {
		const subOther = "sub_111111";
		const messengerIdOther = await emailAddressCreate(subOther, messengerValue);
		const { token } = mocks.notifyClient.mock.calls[0].arguments[0].data;
		await emailAddressVerifyToken(subOther, token, messengerIdOther);

		const messengerIdNew = await emailAddressCreate(sub, messengerValue);

		equal(messengerIdNew, undefined);
		const notify = mocks.notifyClient.mock.calls[1].arguments[0];
		deepEqual(notify, {
			data: {},
			id: `messenger-${messengerType}-exists`,
			options: {
				messengers: [
					{
						id: messengerIdOther,
					},
				],
			},
			sub: subOther,
		});
	});
	it("Can NOT create a messenger on an account w/ invalid email", async () => {
		try {
			await emailAddressCreate(sub, "username[at]example.org");
		} catch (e) {
			equal(e.message, "400 Bad Request");
		}
	});
	it("Can NOT create a messenger on an account w/ blacklisted email", async () => {
		try {
			await emailAddressCreate(sub, "admin@example.org");
		} catch (e) {
			equal(e.message, "409 Conflict");
		}
	});
};
describe("messenger-email-address", () => {
	for (const storeKey of Object.keys(mockStores)) {
		describe(`using store-${storeKey}`, () => {
			tests(mockStores[storeKey]);
		});
	}
});
