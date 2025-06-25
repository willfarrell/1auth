import { test } from "node:test";
import fc from "fast-check";
import account, {
	create as accountCreate,
	exists as accountExists,
	expire as accountExpire,
	lookup as accountLookup,
	remove as accountRemove,
	update as accountUpdate,
} from "../account/index.js";
import * as mockAccountSQLTable from "../account/table/sql.js";
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
	client: () => {},
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

test.before(async () => {
	await mocks.storeAccount.create(mocks.storeClient);

	account({
		store,
		notify,
	});
});

test.beforeEach(async () => {
	sub = await accountCreate();
});

test.afterEach(async () => {
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

test("fuzz accountExists w/ sub", async () => {
	await fc.assert(
		fc.asyncProperty(fc.anything(), async (sub) => {
			try {
				await accountExists(sub);
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

test("fuzz accountLookup w/ sub", async () => {
	await fc.assert(
		fc.asyncProperty(fc.anything(), async (sub) => {
			try {
				await accountLookup(sub);
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

// test("fuzz accountCreate w/ values", async () => {
// 	await fc.assert(
// 		fc.asyncProperty(fc.anything(), async (values) => {
//       try {
//   		  await accountCreate(values);
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
test("fuzz accountCreate w/ values", async () => {
	await fc.assert(
		fc.asyncProperty(fc.string(), async (values) => {
			try {
				await accountCreate({ name: values });
			} catch (e) {
				catchError(values, e);
			}
		}),
		{
			numRuns: 100_000,
			verbose: 2,
			examples: [],
		},
	);
});

test("fuzz accountUpdate w/ sub", async () => {
	await fc.assert(
		fc.asyncProperty(fc.anything(), async (sub) => {
			try {
				await accountUpdate(sub);
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
// test("fuzz accountUpdate w/ values", async () => {
// 	await fc.assert(
//     fc.asyncProperty(fc.anything(), async (values) => {
//       try {
//   		  await accountUpdate(sub, values);
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
test("fuzz accountUpdate w/ values", async () => {
	await fc.assert(
		fc.asyncProperty(fc.string(), async (values) => {
			try {
				await accountUpdate(sub, { name: values });
			} catch (e) {
				catchError(values, e);
			}
		}),
		{
			numRuns: 100_000,
			verbose: 2,
			examples: [],
		},
	);
});

test("fuzz accountExpire w/ sub", async () => {
	await fc.assert(
		fc.asyncProperty(fc.anything(), async (sub) => {
			try {
				await accountExpire(sub);
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

test("fuzz accountRemove w/ sub", async () => {
	await fc.assert(
		fc.asyncProperty(fc.anything(), async (sub) => {
			try {
				await accountRemove(sub);
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
