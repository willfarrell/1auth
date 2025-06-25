import { test } from "node:test";
import fc from "fast-check";
import account, {
	create as accountCreate,
	remove as accountRemove,
} from "../account/index.js";
import * as mockAccountSQLTable from "../account/table/sql.js";
import accountUsername, {
	create as accountUsernameCreate,
	exists as accountUsernameExists,
	lookup as accountUsernameLookup,
	recover as accountUsernameRecover,
	update as accountUsernameUpdate,
} from "../account-username/index.js";
import crypto, {
	randomChecksumPepper,
	randomChecksumSalt,
	symmetricRandomEncryptionKey,
	symmetricRandomSignatureSecret,
} from "../crypto/index.js";
// ** Setup Start *** //
import * as notify from "../notify/index.js";
import * as mockNotify from "../notify/mock.js";
import * as store from "../store-sqlite/index.js";
import * as mockStore from "../store-sqlite/mock.js";

crypto({
	symmetricEncryptionKey: symmetricRandomEncryptionKey(),
	symmetricSignatureSecret: symmetricRandomSignatureSecret(),
	digestChecksumSalt: randomChecksumSalt(),
	digestChecksumPepper: randomChecksumPepper(),
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
};

let sub;
const username = "username";

test.before(async () => {
	await mocks.storeAccount.create(mocks.storeClient);

	account({
		store,
		notify,
	});
	accountUsername({
		usernameBlacklist: ["admin"],
	});
});

test.beforeEach(async () => {
	sub = await accountCreate();
});

test.afterEach(async () => {
	await accountRemove(sub);
	await mocks.storeAccount.truncate(mocks.storeClient);
});

test.after(async () => {
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

test("fuzz accountUsernameExists w/ username", async () => {
	await fc.assert(
		fc.asyncProperty(fc.anything(), async (username) => {
			try {
				await accountUsernameExists(username);
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

test("fuzz accountUsernameLookup w/ username", async () => {
	await fc.assert(
		fc.asyncProperty(fc.anything(), async (username) => {
			try {
				await accountUsernameLookup(username);
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

test("fuzz accountUsernameCreate w/ sub", async () => {
	await fc.assert(
		fc.asyncProperty(fc.anything(), async (sub) => {
			try {
				await accountUsernameCreate(sub, username);
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
test("fuzz accountUsernameCreate w/ username", async () => {
	await fc.assert(
		fc.asyncProperty(fc.anything(), async (username) => {
			try {
				await accountUsernameCreate(sub, username);
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

test("fuzz accountUsernameUpdate w/ sub", async () => {
	await fc.assert(
		fc.asyncProperty(fc.anything(), async (sub) => {
			try {
				await accountUsernameUpdate(sub, username);
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
test("fuzz accountUsernameUpdate w/ username", async () => {
	await fc.assert(
		fc.asyncProperty(fc.anything(), async (username) => {
			try {
				await accountUsernameUpdate(sub, username);
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

test("fuzz accountUsernameRecover w/ sub", async () => {
	await fc.assert(
		fc.asyncProperty(fc.anything(), async (sub) => {
			try {
				await accountUsernameRecover(sub);
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
