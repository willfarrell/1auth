import { test } from "node:test";
import fc from "fast-check";

// *** Setup Start *** //
import * as notify from "../notify/index.js";
import * as store from "../store-sqlite/index.js";

import * as mockNotify from "../notify/mock.js";
import * as mockStore from "../store-sqlite/mock.js";

import * as mockAccountSQLTable from "../account/table/sql.js";
import * as mockAuthnSQLTable from "../authn/table/sql.js";
import * as mockSessionSQLTable from "../session/table/sql.js";

import crypto, {
	symmetricRandomEncryptionKey,
	symmetricRandomSignatureSecret,
	randomChecksumSalt,
	randomChecksumPepper,
} from "../crypto/index.js";

import accountUsername, {
	exists as accountUsernameExists,
	create as accountUsernameCreate,
} from "../account-username/index.js";
import account, { create as accountCreate } from "../account/index.js";
import authn from "../authn/index.js";

import session, {
	create as sessionCreate,
	check as sessionCheck,
	lookup as sessionLookup,
	select as sessionSelect,
	list as sessionList,
	expire as sessionExpire,
	remove as sessionRemove,
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
	storeSession: mockSessionSQLTable,
};

let sub;
let testSession;
const username = "username";

test.before(async () => {
	await mocks.storeAccount.create(mocks.storeClient);
	await mocks.storeAuthn.create(mocks.storeClient);
	await mocks.storeSession.create(mocks.storeClient);

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
	session({ store, notify });
});

test.beforeEach(async () => {
	sub = await accountCreate();
	await accountUsernameCreate(sub, username);
	testSession = await sessionCreate(sub, {});
});

test.afterEach(async () => {
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

test("fuzz sessionLookup w/ sid", async () => {
	await fc.assert(
		fc.asyncProperty(fc.anything(), async (sid) => {
			try {
				await sessionLookup(sid, {});
			} catch (e) {
				catchError(sid, e);
			}
		}),
		{
			numRuns: 100_000,
			verbose: 2,
			examples: [],
		},
	);
});
test("fuzz sessionLookup w/ value", async () => {
	await fc.assert(
		fc.asyncProperty(fc.anything(), async (value) => {
			try {
				await sessionLookup(testSession.sid, value);
			} catch (e) {
				catchError(value, e);
			}
		}),
		{
			numRuns: 100_000,
			verbose: 2,
			examples: [],
		},
	);
});

test("fuzz sessionSelect w/ sub", async () => {
	await fc.assert(
		fc.asyncProperty(fc.anything(), async (sub) => {
			try {
				await sessionSelect(sub, testSession.id);
			} catch (e) {
				catchError(sub, e);
			}
		}),
		{
			numRuns: 100_000,
			verbose: 2,
			examples: [],
		},
	);
});
test("fuzz sessionSelect w/ id", async () => {
	await fc.assert(
		fc.asyncProperty(fc.anything(), async (id) => {
			try {
				await sessionSelect(sub, id);
			} catch (e) {
				catchError(id, e);
			}
		}),
		{
			numRuns: 100_000,
			verbose: 2,
			examples: [],
		},
	);
});

test("fuzz sessionList w/ sub", async () => {
	await fc.assert(
		fc.asyncProperty(fc.anything(), async (sub) => {
			try {
				await sessionList(sub);
			} catch (e) {
				catchError(sub, e);
			}
		}),
		{
			numRuns: 100_000,
			verbose: 2,
			examples: [],
		},
	);
});

test("fuzz sessionCreate w/ sub", async () => {
	await fc.assert(
		fc.asyncProperty(fc.anything(), async (sub) => {
			try {
				await sessionCreate(sub, testSession.value, testSession.values);
			} catch (e) {
				catchError(sub, e);
			}
		}),
		{
			numRuns: 100_000,
			verbose: 2,
			examples: [],
		},
	);
});
test("fuzz sessionCreate w/ value", async () => {
	await fc.assert(
		fc.asyncProperty(fc.anything(), async (value) => {
			try {
				await sessionCreate(sub, value, testSession.values);
			} catch (e) {
				catchError(value, e);
			}
		}),
		{
			numRuns: 100_000,
			verbose: 2,
			examples: [],
		},
	);
});
// TODO throws due tp missing columns ..
// test("fuzz sessionCreate w/ values", async () => {
// 	await fc.assert(
// 		fc.asyncProperty(fc.anything(), async (values) => {
//       try {
//   		  await sessionCreate(sub, testSession.value, values);
//   		} catch (e) {
//   			catchError(values, e);
//   		}
// 		}),
// 		{
// 			numRuns: 100_000,
// 			verbose: 2,
// 			examples: [],
// 		},
// 	);
// });

test("fuzz sessionCheck w/ sub", async () => {
	await fc.assert(
		fc.asyncProperty(fc.anything(), async (sub) => {
			try {
				await sessionCheck(sub, testSession.value);
			} catch (e) {
				catchError(sub, e);
			}
		}),
		{
			numRuns: 100_000,
			verbose: 2,
			examples: [],
		},
	);
});
test("fuzz sessionCheck w/ value", async () => {
	await fc.assert(
		fc.asyncProperty(fc.anything(), async (value) => {
			try {
				await sessionCheck(sub, value);
			} catch (e) {
				catchError(value, e);
			}
		}),
		{
			numRuns: 100_000,
			verbose: 2,
			examples: [],
		},
	);
});

test("fuzz sessionExpire w/ sub", async () => {
	await fc.assert(
		fc.asyncProperty(fc.anything(), async (sub) => {
			try {
				await sessionExpire(sub, testSession.id);
			} catch (e) {
				catchError(sub, e);
			}
		}),
		{
			numRuns: 100_000,
			verbose: 2,
			examples: [],
		},
	);
});
test("fuzz sessionExpire w/ id", async () => {
	await fc.assert(
		fc.asyncProperty(fc.anything(), async (id) => {
			try {
				await sessionExpire(sub, id);
			} catch (e) {
				catchError(id, e);
			}
		}),
		{
			numRuns: 100_000,
			verbose: 2,
			examples: [],
		},
	);
});

test("fuzz sessionRemove w/ sub", async () => {
	await fc.assert(
		fc.asyncProperty(fc.anything(), async (sub) => {
			try {
				await sessionRemove(sub, testSession.id);
			} catch (e) {
				catchError(sub, e);
			}
		}),
		{
			numRuns: 100_000,
			verbose: 2,
			examples: [],
		},
	);
});
test("fuzz sessionRemove w/ id", async () => {
	await fc.assert(
		fc.asyncProperty(fc.anything(), async (id) => {
			try {
				await sessionRemove(sub, id);
			} catch (e) {
				catchError(id, e);
			}
		}),
		{
			numRuns: 100_000,
			verbose: 2,
			examples: [],
		},
	);
});
