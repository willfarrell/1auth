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
import crypto, {
	createSeasonedDigest,
	randomChecksumPepper,
	randomChecksumSalt,
	symmetricRandomEncryptionKey,
	symmetricRandomSignatureSecret,
} from "../crypto/index.js";
import messenger, {
	count as messengerCount,
	create as messengerCreate,
	createToken as messengerCreateToken,
	exists as messengerExists,
	getOptions as messengerGetOptions,
	list as messengerList,
	lookup as messengerLookup,
	remove as messengerRemove,
	select as messengerSelect,
	verifyToken as messengerVerifyToken,
} from "../messenger/index.js";
// *** Setup Start *** //
import * as notify from "../notify/index.js";
import * as mockNotify from "../notify/mock.js";
import * as storeDynamoDB from "../store-dynamodb/index.js";
import * as storePostgres from "../store-postgres/index.js";
import * as storeSQLite from "../store-sqlite/index.js";
// import * as mockDynamoDB from "../store-dynamodb/mock.js";
// import * as mockPostgres from "../store-postgres/mock.js";
import * as mockSQLite from "../store-sqlite/mock.js";
// import * as mockMessengerDynamoDBTable from "./table/dynamodb.js";
import * as mockMessengerSQLTable from "./table/sql.js";

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
	// 	storeAccount: mockAccountDynamoDBTable,
	// storeAuthn: mockAuthnDynamoDBTable,
	//  storeMessenger: mockMessengerDynamoDBTable,
	//    }
	// },
};

account();
accountUsername();
authn();
messenger();
// *** Setup End *** //

let sub;
const username = "username";
const messengerType = "signal";
let messengerValue = "@username.00";

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
		messengerValue = `@${sub}.00`;

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
		const messengerId = await messengerCreate(messengerType, sub, {
			value: messengerValue,
			digest: createSeasonedDigest(messengerValue),
		});

		let count = await messengerCount(messengerType, sub);
		equal(count, 0); // unverified

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

		equal(messengerDB?.id, messengerId);
		equal(messengerDB.type, messengerType);
		ok(messengerDB.value);
		ok(messengerDB.digest);
		ok(!messengerDB.verify);

		await messengerVerifyToken(messengerType, sub, token, messengerId);

		count = await messengerCount(messengerType, sub);
		equal(count, 1); // verified

		// notify
		equal(mocks.notifyClient.mock.calls.length, 1);

		messengerDB = await store.select(messengerGetOptions().table, { sub });
		equal(messengerDB?.id, messengerId);
		ok(messengerDB.verify);
		const authnDB = await store.select(authnGetOptions().table, { sub });
		ok(!authnDB);
	});

	it("Can create a messenger on an account after re-creating a token", async () => {
		const messengerId = await messengerCreate(messengerType, sub, {
			value: messengerValue,
			digest: createSeasonedDigest(messengerValue),
		});
		await messengerCreateToken(messengerType, sub, messengerId);
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

		await messengerVerifyToken(messengerType, sub, token, messengerId);

		// notify
		equal(mocks.notifyClient.mock.calls.length, 2);

		messengerDB = await store.select(messengerGetOptions().table, { sub });

		equal(messengerDB?.id, messengerId);
		ok(messengerDB.verify);
		const authnDB = await store.select(authnGetOptions().table, { sub });
		ok(!authnDB);
	});
	it("Can create a 2nd messenger on an account, others notified", async () => {
		const messengerId = await messengerCreate(messengerType, sub, {
			value: messengerValue,
			digest: createSeasonedDigest(messengerValue),
		});
		const notifyCall0 = mocks.notifyClient.mock.calls[0].arguments[0].data;

		await messengerVerifyToken(
			messengerType,
			sub,
			notifyCall0.token,
			messengerId,
		);

		await messengerCreate(messengerType, sub, {
			value: messengerValue,
			digest: createSeasonedDigest(messengerValue),
		});
		const notifyCall1 = mocks.notifyClient.mock.calls[1].arguments[0].data;

		await messengerVerifyToken(
			messengerType,
			sub,
			notifyCall1.token,
			messengerId,
		);

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
		const messengerId = await messengerCreate(messengerType, sub, {
			value: messengerValue,
			digest: createSeasonedDigest(messengerValue),
		});

		let messengerDB = await store.select(messengerGetOptions().table, { sub });
		//let authnDB = await store.select(authnGetOptions().table, { sub });

		equal(messengerDB?.id, messengerId);
		equal(messengerDB.type, messengerType);
		ok(messengerDB.value);
		ok(messengerDB.digest);
		ok(!messengerDB.verify);

		await messengerCreate(messengerType, sub, {
			value: messengerValue,
			digest: createSeasonedDigest(messengerValue),
		});

		const { token } = mocks.notifyClient.mock.calls[1].arguments[0].data;

		await messengerVerifyToken(messengerType, sub, token, messengerId);

		// notify
		equal(mocks.notifyClient.mock.calls.length, 2);

		messengerDB = await store.select(messengerGetOptions().table, { sub });
		const authnDB = await store.select(authnGetOptions().table, { sub });
		ok(messengerDB.verify);
		ok(!authnDB);
	});

	it("Can create a messenger on an account when already attempted by anther account", async () => {
		const subOther = "sub_111111";
		await messengerCreate(messengerType, subOther, {
			value: messengerValue,
			digest: createSeasonedDigest(messengerValue),
		});

		const messengerId = await messengerCreate(messengerType, sub, {
			value: messengerValue,
			digest: createSeasonedDigest(messengerValue),
		});
		const { token } = mocks.notifyClient.mock.calls[1].arguments[0].data;
		await messengerVerifyToken(messengerType, sub, token, messengerId);

		const messengerDB = await store.select(messengerGetOptions().table, {
			sub,
		});
		equal(messengerDB?.id, messengerId);
		ok(messengerDB.verify);
	});

	it("Can remove a verified messenger on an account", async () => {
		const messengerId = await messengerCreate(messengerType, sub, {
			value: messengerValue,
			digest: createSeasonedDigest(messengerValue),
		});
		const { token } = mocks.notifyClient.mock.calls[0].arguments[0].data;
		await messengerVerifyToken(messengerType, sub, token, messengerId);
		await messengerRemove(messengerType, sub, messengerId);

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
		const messengerId = await messengerCreate(messengerType, sub, {
			value: messengerValue,
			digest: createSeasonedDigest(messengerValue),
		});
		await messengerRemove(messengerType, sub, messengerId);

		// notify
		equal(mocks.notifyClient.mock.calls.length, 1);

		const messengerDB = await store.select(messengerGetOptions().table, {
			sub,
		});

		ok(!messengerDB);
	});
	it("Can NOT remove a messenger of someone elses account", async () => {
		const messengerId = await messengerCreate(messengerType, sub, {
			value: messengerValue,
			digest: createSeasonedDigest(messengerValue),
		});
		try {
			await messengerRemove(messengerType, "sub_notfound", messengerId);
		} catch (e) {
			equal(e.message, "401 Unauthorized");
		}
	});

	it("Can check is a messenger exists (exists)", async () => {
		const messengerId = await messengerCreate(messengerType, sub, {
			value: messengerValue,
			digest: createSeasonedDigest(messengerValue),
		});
		const { token } = mocks.notifyClient.mock.calls[0].arguments[0].data;
		await messengerVerifyToken(messengerType, sub, token, messengerId);
		const userSub = await messengerExists(messengerType, messengerValue);
		equal(userSub, sub);
	});
	it("Can check is a messenger exists (not exists)", async () => {
		const user = await messengerExists(messengerType, "notfound");
		equal(user, undefined);
	});

	it("Can lookup a messenger { value } (exists)", async () => {
		const messengerId = await messengerCreate(messengerType, sub, {
			value: messengerValue,
			digest: createSeasonedDigest(messengerValue),
		});
		const { token } = mocks.notifyClient.mock.calls[0].arguments[0].data;
		await messengerVerifyToken(messengerType, sub, token, messengerId);
		const messenger = await messengerLookup(messengerType, messengerValue);

		equal(messenger?.value, messengerValue); // unencrypted
	});
	it("Can lookup a messenger (unverified) { value } (exists)", async () => {
		await messengerCreate(messengerType, sub, {
			value: messengerValue,
			digest: createSeasonedDigest(messengerValue),
		});
		const messenger = await messengerLookup(messengerType, messengerValue);
		equal(messenger, undefined);
	});
	it("Can lookup a messenger { value } (not exists)", async () => {
		const messenger = await messengerLookup(messengerType, messengerValue);
		equal(messenger, undefined);
	});
	it("Can select a messenger { id } (unverified)", async () => {
		const messengerId = await messengerCreate(messengerType, sub, {
			value: messengerValue,
			digest: createSeasonedDigest(messengerValue),
		});
		const messenger = await messengerSelect(messengerType, sub, messengerId);
		equal(messenger, undefined);
	});
	it("Can select a messenger { id } (exists)", async () => {
		const messengerId = await messengerCreate(messengerType, sub, {
			value: messengerValue,
			digest: createSeasonedDigest(messengerValue),
		});
		const { token } = mocks.notifyClient.mock.calls[0].arguments[0].data;
		await messengerVerifyToken(messengerType, sub, token, messengerId);
		const messenger = await messengerSelect(messengerType, sub, messengerId);
		equal(messenger?.value, messengerValue);
	});
	it("Can select a messenger { value } (not exists)", async () => {
		const messengerId = "unknown";
		const messenger = await messengerSelect(messengerType, sub, messengerId);
		equal(messenger, undefined);
	});
	it("Can list messengers with { sub }", async () => {
		await messengerCreate(messengerType, sub, {
			value: messengerValue,
			digest: createSeasonedDigest(messengerValue),
		});
		const messengers = await messengerList(messengerType, sub);

		equal(messengers?.[0]?.value, messengerValue); // unencrypted
	});
};
describe("messenger", () => {
	for (const storeKey of Object.keys(mockStores)) {
		describe(`using store-${storeKey}`, () => {
			tests(mockStores[storeKey]);
		});
	}
});
