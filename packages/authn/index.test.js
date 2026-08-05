import { equal, ok } from "node:assert/strict";
import { describe, it, test } from "node:test";
import account, {
	create as accountCreate,
	remove as accountRemove,
} from "@1auth/account";
import * as mockAccountSQLTable from "@1auth/account/table/sql.js";
import accountUsername, {
	create as accountUsernameCreate,
	exists as accountUsernameExists,
} from "@1auth/account-username";
import crypto, {
	randomChecksumPepper,
	randomChecksumSalt,
	symmetricRandomEncryptionKey,
	symmetricRandomSignatureSecret,
} from "@1auth/crypto";
// *** Setup Start *** //
import * as notify from "@1auth/notify";
import * as storeSQLite from "@1auth/store-sqlite";
import * as mockNotify from "../notify/mock.js";
import * as mockSQLite from "../store-sqlite/mock.js";
import authn, {
	authenticate as authnAuthenticate,
	count as authnCount,
	create as authnCreate,
	expire as authnExpire,
	getOptions as authnGetOptions,
	list as authnList,
	remove as authnRemove,
	select as authnSelect,
	verify as authnVerify,
	verifySecret as authnVerifySecret,
} from "./index.js";
import * as mockAuthnSQLTable from "./table/sql.js";

crypto({
	symmetricEncryptionKey: symmetricRandomEncryptionKey(),
	symmetricSignatureSecret: symmetricRandomSignatureSecret(),
	digestChecksumSalt: randomChecksumSalt(),
	digestChecksumPepper: randomChecksumPepper(),
	secretArgon2TimeCost: 1,
	secretArgon2MemoryCost: 2 ** 3,
	secretArgon2Parallelism: 1,
});
notify.default({
	client: (...args) => mocks.notifyClient(...args),
});
storeSQLite.default({
	log: (...args) => mocks.log(...args),
	client: {
		query: (...args) => mocks.storeClient.query(...args),
	},
});

const mocks = {
	...mockNotify,
	...mockSQLite,
};
// *** Setup End *** //

// A credential type reduced to nothing: the secret is stored as-is and matched
// by equality, so every test below is about `authn`'s own control flow rather
// than a hashing or encoding detail.
const plain = ({ type = "secret", ...params } = {}) => ({
	id: "test",
	type,
	otp: false,
	encode: (value) => value,
	decode: (value) => value,
	verify: (input, value) => input === value,
	create: () => "s3cret",
	...params,
});

let sub;
const username = "username";

describe("authn", () => {
	test.before(async () => {
		await mockAccountSQLTable.create(mocks.storeClient);
		await mockAuthnSQLTable.create(mocks.storeClient);

		account({ store: storeSQLite, notify });
		accountUsername();
		authn({
			store: storeSQLite,
			notify,
			usernameExists: [accountUsernameExists],
			// keep the timing floor short; it is awaited on every exit
			authenticationDuration: 10,
			log: (...args) => mocks.log(...args),
		});
	});

	test.beforeEach(async (t) => {
		sub = await accountCreate();
		await accountUsernameCreate(sub, username);
		t.mock.method(mocks, "log");
		t.mock.method(mocks, "notifyClient");
	});

	test.afterEach(async (t) => {
		t.mock.reset();
		await accountRemove(sub);
		await mockAuthnSQLTable.truncate(mocks.storeClient);
		await mockAccountSQLTable.truncate(mocks.storeClient);
	});

	test.after(async () => {
		await mockAuthnSQLTable.drop(mocks.storeClient);
		await mockAccountSQLTable.drop(mocks.storeClient);
		mocks.storeClient.after?.();
	});

	describe("`count`", () => {
		it("Will not count an unverified credential", async () => {
			await authnCreate(plain(), sub, { value: "a" });
			equal(await authnCount(plain(), sub), 0);
		});
		it("Will not count an expired credential", async () => {
			await authnCreate(plain({ expire: -1 }), sub, {
				value: "a",
				verify: 1,
			});
			equal(await authnCount(plain({ expire: -1 }), sub), 0);
		});
		it("Can count a verified, unexpired credential", async () => {
			await authnCreate(plain(), sub, { value: "a", verify: 1 });
			equal(await authnCount(plain(), sub), 1);
		});
	});

	describe("`list`", () => {
		it("Will not list an expired credential", async () => {
			await authnCreate(plain({ expire: -1 }), sub, { value: "a" });
			equal((await authnList(plain({ expire: -1 }), sub)).length, 0);
		});
	});

	describe("`verifySecret`", () => {
		it("Can mark a credential verified", async () => {
			const { id } = await authnCreate(plain(), sub, { value: "a" });
			equal(await authnCount(plain(), sub), 0);
			await authnVerifySecret(plain(), sub, id);
			equal(await authnCount(plain(), sub), 1);
			ok((await authnSelect(plain(), sub, id)).verify);
		});
	});

	describe("`authenticate`", () => {
		it("Will skip an unverified credential", async () => {
			await authnCreate(plain(), sub, { value: "a" });
			// present but never verified, so it is not a candidate at all
			await rejects(() => authnAuthenticate(plain(), username, "a"));
		});
		it("Will skip an expired credential", async () => {
			await authnCreate(plain({ expire: -1 }), sub, {
				value: "a",
				verify: 1,
			});
			await rejects(() =>
				authnAuthenticate(plain({ expire: -1 }), username, "a"),
			);
		});
		it("Will continue past a credential whose verify throws", async () => {
			await authnCreate(plain(), sub, { value: "a", verify: 1 });
			const config = plain({
				verify: () => {
					throw new Error("boom");
				},
			});
			await rejects(() => authnAuthenticate(config, username, "a"));
			// the throw is swallowed as "not this one" and logged, not propagated
			ok(mocks.log.mock.callCount() > 0);
		});
		it("Can authenticate and stamp lastused", async () => {
			const { id } = await authnCreate(plain(), sub, {
				value: "a",
				verify: 1,
			});
			equal(await authnAuthenticate(plain(), username, "a"), sub);
			ok((await authnSelect(plain(), sub, id)).lastused);
		});
	});

	describe("`verify`", () => {
		it("Will skip an expired credential", async () => {
			await authnCreate(plain({ expire: -1 }), sub, { value: "a" });
			await rejects(() => authnVerify(plain({ expire: -1 }), sub, "a"));
		});
		it("Will treat a one-time credential consumed elsewhere as invalid", async () => {
			const config = plain({ otp: true });
			await authnCreate(config, sub, { value: "a" });
			// a concurrent request got there first: the row is already gone, so
			// `remove` reports nothing deleted and this caller must not win
			const options = authnGetOptions();
			const original = options.store;
			options.store = { ...storeSQLite, remove: async () => false };
			try {
				await rejects(() => authnVerify(config, sub, "a"));
			} finally {
				options.store = original;
			}
		});
		it("Can verify and consume a one-time credential", async () => {
			const config = plain({ otp: true });
			await authnCreate(config, sub, { value: "a" });
			ok(await authnVerify(config, sub, "a"));
			// consumed: the same secret cannot be replayed
			await rejects(() => authnVerify(config, sub, "a"));
		});
	});

	describe("`expire` / `remove`", () => {
		it("Can expire a credential out of the candidate set", async () => {
			const { id } = await authnCreate(plain(), sub, {
				value: "a",
				verify: 1,
			});
			await authnExpire(plain(), sub, id);
			equal(await authnCount(plain(), sub), 0);
		});
		it("Can remove a credential", async () => {
			const { id } = await authnCreate(plain(), sub, {
				value: "a",
				verify: 1,
			});
			ok(await authnRemove(plain(), sub, id));
			equal(await authnCount(plain(), sub), 0);
		});
	});
});

const rejects = async (fn, message = "401 Unauthorized") => {
	try {
		await fn();
	} catch (e) {
		equal(e.message, message);
		return;
	}
	throw new Error(`Expected ${message}`);
};
