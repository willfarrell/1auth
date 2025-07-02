import { test } from "node:test";
import fc from "fast-check";
import account, { create as accountCreate } from "../account/index.js";
import * as mockAccountSQLTable from "../account/table/sql.js";
import accountUsername, {
	create as accountUsernameCreate,
	exists as accountUsernameExists,
} from "../account-username/index.js";
import authn from "../authn/index.js";
import * as mockAuthnSQLTable from "../authn/table/sql.js";
import crypto, {
	randomChecksumPepper,
	randomChecksumSalt,
	symmetricRandomEncryptionKey,
	symmetricRandomSignatureSecret,
} from "../crypto/index.js";
import messenger from "../messenger/index.js";
import * as mockMessengerSQLTable from "../messenger/table/sql.js";
import emailAddress, {
	create as emailAddressCreate,
	exists as emailAddressExists,
	list as emailAddressList,
	lookup as emailAddressLookup,
	remove as emailAddressRemove,
	select as emailAddressSelect,
} from "../messenger-email-address/index.js";
// *** Setup Start *** //
import * as notify from "../notify/index.js";
import * as mockNotify from "../notify/mock.js";
import * as store from "../store-sqlite/index.js";
import * as mockStore from "../store-sqlite/mock.js";

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
store.default({
	client: {
		query: (...args) => mocks.storeClient.query(...args),
	},
});
// *** Setup End *** //

const mocks = {
	...mockNotify,
	...mockStore,
	storeAccount: mockAccountSQLTable,
	storeAuthn: mockAuthnSQLTable,
	storeMessenger: mockMessengerSQLTable,
};

let sub;
let testMessenger;
const username = "username";

test.before(async () => {
	await mocks.storeAccount.create(mocks.storeClient);
	await mocks.storeAuthn.create(mocks.storeClient);
	await mocks.storeMessenger.create(mocks.storeClient);

	account({
		store,
		notify,
	});
	accountUsername();
	authn({
		store,
		notify,
		usernameExists: [accountUsernameExists],
		encryptedFields: ["value", "name"],
		authenticationDuration: 0,
	});
	messenger({ store, notify });
	emailAddress();
});

test.beforeEach(async () => {
	sub = await accountCreate();
	await accountUsernameCreate(sub, username);
	testMessenger = await emailAddressCreate(sub, `${sub}@example.com`);
});

test.afterEach(async () => {
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

const catchError = (input, e) => {
	const expectedErrors = [
		"400 Bad Request",
		"401 Unauthorized",
		"404 Not Found",
		"409 Conflict",
	];
	if (expectedErrors.includes(e.message)) {
		return;
	}
	console.error(input, e);
	throw e;
};

test("fuzz emailAddressExists w/ `username`", async () => {
	await fc.assert(
		fc.asyncProperty(fc.anything(), async (username) => {
			try {
				await emailAddressExists(username);
			} catch (e) {
				catchError(username, e);
			}
		}),
		{
			numRuns: 10,
			verbose: 2,
			examples: [],
		},
	);
});

test("fuzz emailAddressLookup w/ `username`", async () => {
	await fc.assert(
		fc.asyncProperty(fc.anything(), async (username) => {
			try {
				await emailAddressLookup(username);
			} catch (e) {
				catchError(username, e);
			}
		}),
		{
			numRuns: 10,
			verbose: 2,
			examples: [],
		},
	);
});

test("fuzz emailAddressList w/ `sub`", async () => {
	await fc.assert(
		fc.asyncProperty(fc.anything(), async (sub) => {
			try {
				await emailAddressList(sub);
			} catch (e) {
				catchError(sub, e);
			}
		}),
		{
			numRuns: 10,
			verbose: 2,
			examples: [],
		},
	);
});

test("fuzz emailAddressSelect w/ `sub`", async () => {
	await fc.assert(
		fc.asyncProperty(fc.anything(), async (sub) => {
			try {
				await emailAddressSelect(sub, testMessenger.id);
			} catch (e) {
				catchError(sub, e);
			}
		}),
		{
			numRuns: 10,
			verbose: 2,
			examples: [],
		},
	);
});

test("fuzz emailAddressSelect w/ `id`", async () => {
	await fc.assert(
		fc.asyncProperty(fc.anything(), async (id) => {
			try {
				await emailAddressSelect(sub, id);
			} catch (e) {
				catchError(id, e);
			}
		}),
		{
			numRuns: 10,
			verbose: 2,
			examples: [],
		},
	);
});

test("fuzz emailAddressCreate w/ `sub`", async () => {
	await fc.assert(
		fc.asyncProperty(fc.anything(), async (sub) => {
			try {
				await emailAddressCreate(sub, emailAddress);
			} catch (e) {
				catchError(sub, e);
			}
		}),
		{
			numRuns: 10,
			verbose: 2,
			examples: [],
		},
	);
});

test("fuzz emailAddressCreate w/ `username`", async () => {
	await fc.assert(
		fc.asyncProperty(fc.anything(), async (username) => {
			try {
				await emailAddressCreate(sub, username);
			} catch (e) {
				catchError(username, e);
			}
		}),
		{
			numRuns: 10,
			verbose: 2,
			examples: [],
		},
	);
});

test("fuzz emailAddressCreate w/ `emailAddress`", async () => {
	await fc.assert(
		fc.asyncProperty(fc.emailAddress(), async (emailAddress) => {
			try {
				await emailAddressCreate(sub, emailAddress);
			} catch (e) {
				catchError(emailAddress, e);
			}
		}),
		{
			numRuns: 10,
			verbose: 2,
			examples: [],
		},
	);
});

// test("fuzz emailAddressCreate w/ `values`", async () => {
// 	await fc.assert(
// 		fc.asyncProperty(fc.anything(), async (values) => {
// 			try {
// 				await emailAddressCreate(sub, testMessenger.value, values);
// 			} catch (e) {
// 				catchError(values, e);
// 			}
// 		}),
// 		{
// 			numRuns: 10,
// 			verbose: 2,
// 			examples: [],
// 		},
// 	);
// });

test("fuzz emailAddressCreate w/ `values`", async () => {
	await fc.assert(
		fc.asyncProperty(fc.anything(), async (values) => {
			try {
				await emailAddressCreate(sub, testMessenger.value, { name: values });
			} catch (e) {
				catchError(values, e);
			}
		}),
		{
			numRuns: 10,
			verbose: 2,
			examples: [],
		},
	);
});

test("fuzz emailAddressRemove w/ `sub`", async () => {
	await fc.assert(
		fc.asyncProperty(fc.anything(), async (sub) => {
			try {
				await emailAddressRemove(sub, testMessenger.id);
			} catch (e) {
				catchError(sub, e);
			}
		}),
		{
			numRuns: 10,
			verbose: 2,
			examples: [],
		},
	);
});

test("fuzz emailAddressRemove w/ `id`", async () => {
	await fc.assert(
		fc.asyncProperty(fc.anything(), async (id) => {
			try {
				await emailAddressRemove(sub, id);
			} catch (e) {
				catchError(id, e);
			}
		}),
		{
			numRuns: 10,
			verbose: 2,
			examples: [],
		},
	);
});
