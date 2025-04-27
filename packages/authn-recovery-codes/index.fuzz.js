import { test } from "node:test";
import fc from "fast-check";

// *** Setup Start *** //
import * as notify from "../notify/index.js";
import * as store from "../store-sqlite/index.js";

import * as mockNotify from "../notify/mock.js";
import * as mockStore from "../store-sqlite/mock.js";

import * as mockAccountSQLTable from "../account/table/sql.js";
import * as mockAuthnSQLTable from "../authn/table/sql.js";

import crypto, {
	symmetricRandomEncryptionKey,
	symmetricRandomSignatureSecret,
	randomChecksumSalt,
	randomChecksumPepper,
} from "../crypto/index.js";

import account, { create as accountCreate } from "../account/index.js";

import accountUsername, {
	create as accountUsernameCreate,
	exists as accountUsernameExists,
} from "../account-username/index.js";
import authn from "../authn/index.js";

import recoveryCodes, {
	authenticate as recoveryCodesAuthenticate,
	count as recoveryCodesCount,
	list as recoveryCodesList,
	create as recoveryCodesCreate,
	update as recoveryCodesUpdate,
	remove as recoveryCodesRemove,
} from "../authn-recovery-codes/index.js";

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
	recoveryCodes({ count: 1 });
	testSecret = await recoveryCodesCreate(sub).then((res) => res[0]);
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

test("fuzz recoveryCodesAuthenticate w/ username", async () => {
	await fc.assert(
		fc.asyncProperty(fc.anything(), async (username) => {
			try {
				await recoveryCodesAuthenticate(username, testSecret.value);
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
test("fuzz recoveryCodesAuthenticate w/ secret", async () => {
	await fc.assert(
		fc.asyncProperty(fc.anything(), async (secret) => {
			try {
				await recoveryCodesAuthenticate(username, secret);
			} catch (e) {
				catchError(secret, e);
			}
		}),
		{
			numRuns: 100_000,
			verbose: 2,
			examples: [],
		},
	);
});

test("fuzz recoveryCodesCount w/ sub", async () => {
	await fc.assert(
		fc.asyncProperty(fc.anything(), async (sub) => {
			try {
				await recoveryCodesCount(sub);
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

test("fuzz recoveryCodesList w/ sub", async () => {
	await fc.assert(
		fc.asyncProperty(fc.anything(), async (sub) => {
			try {
				await recoveryCodesList(sub);
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

test("fuzz recoveryCodesCreate w/ sub", async () => {
	await fc.assert(
		fc.asyncProperty(fc.anything(), async (sub) => {
			try {
				await recoveryCodesCreate(sub);
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

test("fuzz recoveryCodesUpate w/ sub", async () => {
	await fc.assert(
		fc.asyncProperty(fc.anything(), async (sub) => {
			try {
				await recoveryCodesUpdate(sub);
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

test("fuzz recoveryCodesRemove w/ sub", async () => {
	await fc.assert(
		fc.asyncProperty(fc.anything(), async (sub) => {
			try {
				await recoveryCodesRemove(sub, testSecret.id);
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
test("fuzz recoveryCodesRemove w/ id", async () => {
	await fc.assert(
		fc.asyncProperty(fc.anything(), async (id) => {
			try {
				await recoveryCodesRemove(sub, id);
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
