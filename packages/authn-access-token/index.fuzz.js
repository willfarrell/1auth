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
import accessToken, {
	authenticate as accessTokenAuthenticate,
	count as accessTokenCount,
	create as accessTokenCreate,
	exists as accessTokenExists,
	expire as accessTokenExpire,
	list as accessTokenList,
	lookup as accessTokenLookup,
	remove as accessTokenRemove,
	select as accessTokenSelect,
} from "../authn-access-token/index.js";

import crypto, {
	randomChecksumPepper,
	randomChecksumSalt,
	symmetricRandomEncryptionKey,
	symmetricRandomSignatureSecret,
} from "../crypto/index.js";
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
};

let sub;
let testSecret;
const username = "username";

test.before(async () => {
	await mocks.storeAccount.create(mocks.storeClient);
	await mocks.storeAuthn.create(mocks.storeClient);

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
});

test.beforeEach(async () => {
	sub = await accountCreate();
	await accountUsernameCreate(sub, username);
	accessToken();
	testSecret = await accessTokenCreate(sub);
});

test.afterEach(async () => {
	await mocks.storeAuthn.truncate(mocks.storeClient);
	await mocks.storeAccount.truncate(mocks.storeClient);
});

test.after(async () => {
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

test("fuzz accessTokenAuthenticate w/ username", async () => {
	await fc.assert(
		fc.asyncProperty(fc.anything(), async (username) => {
			try {
				await accessTokenAuthenticate(username, testSecret.value);
			} catch (e) {
				catchError(username, e);
			}
		}),
		{
			numRuns: 100_000,
			verbose: 2,
			examples: [],
		},
	);
});
test("fuzz accessTokenAuthenticate w/ secret", async () => {
	await fc.assert(
		fc.asyncProperty(fc.anything(), async (secret) => {
			try {
				await accessTokenAuthenticate(username, secret);
			} catch (e) {
				catchError(secret, e);
			}
		}),
		{
			numRuns: 1_000,
			verbose: 2,
			examples: [],
		},
	);
});

test("fuzz accessTokenExists w/ username", async () => {
	await fc.assert(
		fc.asyncProperty(fc.anything(), async (username) => {
			try {
				await accessTokenExists(username);
			} catch (e) {
				catchError(username, e);
			}
		}),
		{
			numRuns: 100_000,
			verbose: 2,
			examples: [],
		},
	);
});

test("fuzz accessTokenCount w/ sub", async () => {
	await fc.assert(
		fc.asyncProperty(fc.anything(), async (sub) => {
			try {
				await accessTokenCount(sub);
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

test("fuzz accessTokenLookup w/ username", async () => {
	await fc.assert(
		fc.asyncProperty(fc.anything(), async (username) => {
			try {
				await accessTokenLookup(username);
			} catch (e) {
				catchError(username, e);
			}
		}),
		{
			numRuns: 100_000,
			verbose: 2,
			examples: [],
		},
	);
});

test("fuzz accessTokenSelect w/ sub", async () => {
	await fc.assert(
		fc.asyncProperty(fc.anything(), async (sub) => {
			try {
				await accessTokenSelect(sub, testSecret.id);
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
test("fuzz accessTokenSelect w/ id", async () => {
	await fc.assert(
		fc.asyncProperty(fc.anything(), async (id) => {
			try {
				await accessTokenSelect(sub, id);
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

test("fuzz accessTokenList w/ sub", async () => {
	await fc.assert(
		fc.asyncProperty(fc.anything(), async (sub) => {
			try {
				await accessTokenList(sub);
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

test("fuzz accessTokenCreate w/ sub", async () => {
	await fc.assert(
		fc.asyncProperty(fc.anything(), async (sub) => {
			try {
				await accessTokenCreate(sub);
			} catch (e) {
				catchError(sub, e);
			}
		}),
		{
			numRuns: 1_000,
			verbose: 2,
			examples: [],
		},
	);
});
// test("fuzz accessTokenCreate w/ values", async () => {
// 	await fc.assert(
// 		fc.asyncProperty(fc.anything(), async (values) => {
//       try {
//   		  await accessTokenCreate(sub, values);
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
test("fuzz accessTokenCreate w/ values", async () => {
	await fc.assert(
		fc.asyncProperty(fc.string(), async (values) => {
			try {
				await accessTokenCreate(sub, { name: values });
			} catch (e) {
				catchError(values, e);
			}
		}),
		{
			numRuns: 1_000,
			verbose: 2,
			examples: [],
		},
	);
});

test("fuzz accessTokenExpire w/ sub", async () => {
	await fc.assert(
		fc.asyncProperty(fc.anything(), async (sub) => {
			try {
				await accessTokenExpire(sub, testSecret.id);
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
test("fuzz accessTokenExpire w/ id", async () => {
	await fc.assert(
		fc.asyncProperty(fc.anything(), async (id) => {
			try {
				await accessTokenExpire(sub, id);
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

test("fuzz accessTokenRemove w/ sub", async () => {
	await fc.assert(
		fc.asyncProperty(fc.anything(), async (sub) => {
			try {
				await accessTokenRemove(sub, testSecret.id);
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
test("fuzz accessTokenRemove w/ id", async () => {
	await fc.assert(
		fc.asyncProperty(fc.anything(), async (id) => {
			try {
				await accessTokenRemove(sub, id);
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
