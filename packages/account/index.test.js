import { deepEqual, equal, notEqual, ok } from "node:assert/strict";
import { describe, it, test } from "node:test";
import crypto, {
	randomChecksumPepper,
	randomChecksumSalt,
	symmetricRandomEncryptionKey,
	symmetricRandomSignatureSecret,
} from "@1auth/crypto";
// *** Setup Start *** //
import * as notify from "@1auth/notify";
import * as storeDynamoDB from "@1auth/store-dynamodb";
import * as storePostgres from "@1auth/store-postgres";
import * as storeSQLite from "@1auth/store-sqlite";
import * as mockNotify from "../notify/mock.js";
// import * as mockDynamoDB from "../store-dynamodb/mock.js";
// import * as mockPostgres from "../store-postgres/mock.js";
import * as mockSQLite from "../store-sqlite/mock.js";
import account, {
	create as accountCreate,
	exists as accountExists,
	expire as accountExpire,
	getOptions as accountGetOptions,
	lookup as accountLookup,
	randomId as accountRandomId,
	randomSubject as accountRandomSubject,
	remove as accountRemove,
	update as accountUpdate,
} from "./index.js";
// import * as mockAccountDynamoDBTable from "./table/dynamodb.js";
import * as mockAccountSQLTable from "./table/sql.js";

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
	// 		...mockNotify,
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
// *** Setup End *** //

let sub;
let subOther;

const tests = (config) => {
	const store = config.store;
	const configure = (params = {}) =>
		account({
			encryptedFields: ["value", "name"],
			store,
			notify,
			log: (...args) => {
				mocks.log(...args);
			},
			...params,
		});
	test.before(async () => {
		mocks = config.mocks;
		await mocks.storeAccount.create(mocks.storeClient);

		configure();
	});
	test.beforeEach(async (t) => {
		sub = await accountCreate();
		// a second account every filter has to leave alone
		subOther = await accountCreate({ name: "other" });
		t.mock.method(mocks, "log");
		t.mock.method(mocks, "notifyClient");
	});

	test.afterEach(async (t) => {
		t.mock.reset();
		await mocks.storeAccount.truncate(mocks.storeClient);
		configure();
	});

	test.after(async () => {
		await mocks.storeAccount.drop(mocks.storeClient);
		mocks.storeClient.after?.();
	});

	describe("`exists`", () => {
		it("Will throw without a string sub", async () => {
			for (const value of [undefined, "", 0, 1234, null, {}]) {
				await rejects(() => accountExists(value), "404 Not Found", {
					sub: value,
				});
			}
		});
		it("Can with { sub }", async () => {
			const user = await accountExists(sub);
			ok(user);
		});
		it("Can check if an account exists using { sub } (not exists)", async () => {
			const user = await accountExists("notfound");
			equal(user, undefined);
		});
	});
	describe("`lookup`", () => {
		it("Will throw without a string sub", async () => {
			for (const value of [undefined, "", 0, 1234, null, {}]) {
				await rejects(() => accountLookup(value), "404 Not Found", {
					sub: value,
				});
			}
		});
		it('Will throw with ({sub:"notfound"})', async () => {
			await rejects(() => accountLookup("notfound"), "404 Not Found", {
				sub: "notfound",
			});
		});
		it("Can lookup an account using { sub }", async () => {
			await accountUpdate(sub, { name: "mine" });
			const user = await accountLookup(sub);
			ok(user.id);
			equal(user.sub, sub);
			equal(user.encryptionKey, undefined);
			// decrypted with this account's own key, so the neighbour's row is
			// neither returned nor readable through it
			equal(user.name, "mine");
			equal((await accountLookup(subOther)).name, "other");
		});
	});

	describe("`create`", () => {
		it("Can create an account", async () => {
			const sub = await accountCreate();
			ok(sub.startsWith("sub_"));
			const db = await store.select(accountGetOptions().table, { sub });
			ok(db.encryptionKey);
			ok(db.id.startsWith("user_"));
			equal(db.update, db.create);
		});
		it("Can create an account with encrypted values", async () => {
			const sub = await accountCreate({ name: "Real name" });
			const db = await store.select(accountGetOptions().table, { sub });
			notEqual(db.name, "Real name");
			equal((await accountLookup(sub)).name, "Real name");
		});
		it("Can leave the id to the store when idGenerate is off", async () => {
			const inserts = [];
			configure({
				idGenerate: false,
				store: {
					...store,
					insert: async (t, params) => {
						inserts.push(params);
						return await store.insert(t, { ...params, id: "user_stored" });
					},
				},
			});
			await accountCreate();
			equal("id" in inserts[0], false);
			configure();
		});
	});

	describe("store contract", () => {
		// The guards exist to keep junk away from the store, not just to shape
		// the error: a bad sub must be rejected before any query is made.
		const selects = [];
		const recording = () =>
			configure({
				store: {
					...store,
					select: async (t, filters, fields) => {
						selects.push({ filters, fields });
						return await store.select(t, filters, fields);
					},
				},
			});
		test.afterEach(() => {
			selects.length = 0;
			configure();
		});
		it("Will not query for a sub that is not a string", async () => {
			recording();
			for (const value of [1234, {}, true]) {
				await rejects(() => accountLookup(value), "404 Not Found", {
					sub: value,
				});
				await rejects(
					() => accountUpdate(value, { name: "x" }),
					"404 Not Found",
					{ sub: value },
				);
			}
			equal(selects.length, 0);
		});
		it("Will read only the encryption key when updating", async () => {
			recording();
			await accountUpdate(sub, { name: "x" });
			deepEqual(selects[0].fields, ["encryptionKey"]);
		});
	});

	describe("`update`", () => {
		it("Can NOT add `name` to account (no string sub)", async () => {
			for (const value of [undefined, "", 0, 1234, null, {}]) {
				await rejects(
					() => accountUpdate(value, { name: "Real name" }),
					"404 Not Found",
					{ sub: value },
				);
			}
		});
		it("Can NOT add `name` to account (missing sub)", async () => {
			await rejects(
				() => accountUpdate("sub_111", { name: "Real name" }),
				"404 Not Found",
				{ sub: "sub_111" },
			);
		});
		it("Can add `name` to account (encrypted)", async () => {
			const name = "Real name";
			const sub = await accountCreate();
			const before = await store.select(accountGetOptions().table, { sub });
			await accountUpdate(sub, { name });
			const user = await accountLookup(sub);
			equal(user.name, name);

			const db = await store.select(accountGetOptions().table, { sub });
			notEqual(db.name, user.name); // encrypted
			// re-encrypted against the row's existing key, and only this row
			equal(db.encryptionKey, before.encryptionKey);
			ok(db.update >= before.update);
			equal((await accountLookup(subOther)).name, "other");
		});
		it("Can add an unencrypted field to account", async () => {
			const unencrypted = "unencrypted";
			const sub = await accountCreate();
			await accountUpdate(sub, { unencrypted });
			const user = await accountLookup(sub);
			equal(user.unencrypted, unencrypted);

			const db = await store.select(accountGetOptions().table, { sub });
			equal(db.unencrypted, user.unencrypted); // unencrypted
		});
	});

	describe("`expire`", () => {
		it("Will throw without a string sub", async () => {
			for (const value of [undefined, "", 0, 1234, null, {}]) {
				await rejects(() => accountExpire(value), "401 Unauthorized", {
					sub: value,
				});
			}
		});
		it("Can expire an account", async () => {
			const sub = await accountCreate();
			await accountExpire(sub);
			const user = await store.select(accountGetOptions().table, { sub });
			equal(user?.sub, sub);
			ok(user.expire);
			// and leaves every other account alone
			const other = await store.select(accountGetOptions().table, {
				sub: subOther,
			});
			equal(other.expire, null);
		});
	});

	describe("`remove`", () => {
		it("Will throw without a string sub", async () => {
			for (const value of [undefined, "", 0, 1234, null, {}]) {
				await rejects(() => accountRemove(value), "404 Not Found", {
					sub: value,
				});
			}
		});
		it("Can remove an account (soft-expire, row persists for cleanup)", async () => {
			const sub = await accountCreate();
			await accountRemove(sub);
			const user = await store.select(accountGetOptions().table, { sub });
			equal(user?.sub, sub);
			ok(user.expire);
			ok(user.remove);
			equal(user.remove, user.expire + accountGetOptions().removeExpireOffset);
			// ten days, in seconds
			equal(accountGetOptions().removeExpireOffset, 864000);
			// and no other account was touched
			const other = await store.select(accountGetOptions().table, {
				sub: subOther,
			});
			equal(other.expire, null);
			equal(other.remove, null);
		});
		it("Can remove without a notifier configured", async () => {
			configure({ notify: undefined });
			const sub = await accountCreate();
			await accountRemove(sub);
			const user = await store.select(accountGetOptions().table, { sub });
			ok(user.expire);
			configure();
		});
		it("Notifies `account-remove` after marking expired", async () => {
			const sub = await accountCreate();
			await accountRemove(sub);
			const calls = mocks.notifyClient.mock.calls;
			const call = calls.find((c) => c.arguments[0]?.id === "account-remove");
			ok(call, "notifyClient was not called with account-remove");
			equal(call.arguments[0].sub, sub);
		});
		it("Honors a custom `removeExpireOffset`", async () => {
			const opts = accountGetOptions();
			const prev = opts.removeExpireOffset;
			opts.removeExpireOffset = 60;
			try {
				const sub = await accountCreate();
				await accountRemove(sub);
				const user = await store.select(opts.table, { sub });
				equal(user.remove, user.expire + 60);
			} finally {
				opts.removeExpireOffset = prev;
			}
		});
	});
};
describe("account", () => {
	describe("config", () => {
		it("Uses the package id and its own prefixes", () => {
			const options = accountGetOptions();
			equal(options.id, "account");
			equal(options.table, "accounts");
			equal(options.idGenerate, true);

			const subject = accountRandomSubject();
			equal(subject.id, "account");
			equal(subject.type, "id");
			ok(subject.create().startsWith("sub_"));

			const rowId = accountRandomId();
			equal(rowId.id, "account");
			ok(rowId.create().startsWith("user_"));
		});
		it("Encrypts nothing until told which fields to encrypt", () => {
			account();
			deepEqual(accountGetOptions().encryptedFields, []);
		});
	});
	for (const storeKey of Object.keys(mockStores)) {
		describe(`using store-${storeKey}`, () => {
			tests(mockStores[storeKey]);
		});
	}
});

const rejects = async (fn, message, cause) => {
	try {
		await fn();
	} catch (e) {
		equal(e.message, message);
		if (cause) {
			deepEqual(e.cause, cause);
		}
		return;
	}
	throw new Error(`Expected ${message}`);
};
