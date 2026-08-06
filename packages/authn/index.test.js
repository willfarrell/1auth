import { deepEqual, equal, notEqual, ok } from "node:assert/strict";
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
	nowInSeconds,
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
	createList as authnCreateList,
	expire as authnExpire,
	getOptions as authnGetOptions,
	list as authnList,
	makeType as authnMakeType,
	randomId as authnRandomId,
	remove as authnRemove,
	removeList as authnRemoveList,
	select as authnSelect,
	subject as authnSubject,
	update as authnUpdate,
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

const table = mockAuthnSQLTable.name;
const configure = (params = {}) =>
	authn({
		store: storeSQLite,
		notify,
		usernameExists: [accountUsernameExists],
		// keep the timing floor short; it is awaited on every exit
		authenticationDuration: 10,
		log: (...args) => mocks.log(...args),
		...params,
	});

let sub;
let subOther;
const username = "username";
const usernameOther = "username-other";

describe("authn", () => {
	test.before(async () => {
		await mockAccountSQLTable.create(mocks.storeClient);
		await mockAuthnSQLTable.create(mocks.storeClient);

		account({ store: storeSQLite, notify });
		accountUsername();
		configure();
	});

	test.beforeEach(async (t) => {
		sub = await accountCreate();
		await accountUsernameCreate(sub, username);
		// A second account holding a verified credential of the same type, plus a
		// credential of another type on `sub`: every filter below must be narrow
		// enough to ignore both. Widening one (dropping `sub` or `type`) changes a
		// count, a list length, or which row comes back.
		subOther = await accountCreate();
		await accountUsernameCreate(subOther, usernameOther);
		await authnCreate(plain(), subOther, { value: "other", verify: 1 });
		await authnCreate(plain({ type: "other" }), sub, {
			value: "other-type",
			verify: 1,
		});
		t.mock.method(mocks, "log");
		t.mock.method(mocks, "notifyClient");
	});

	test.afterEach(async (t) => {
		t.mock.reset();
		await accountRemove(sub);
		await accountRemove(subOther);
		await mockAuthnSQLTable.truncate(mocks.storeClient);
		await mockAccountSQLTable.truncate(mocks.storeClient);
		configure();
	});

	test.after(async () => {
		await mockAuthnSQLTable.drop(mocks.storeClient);
		await mockAccountSQLTable.drop(mocks.storeClient);
		mocks.storeClient.after?.();
	});

	describe("config", () => {
		it("Uses the package id for its table, type and generated ids", async () => {
			const options = authnGetOptions();
			equal(options.id, "authn");
			equal(options.table, "authentications");
			deepEqual(options.encryptedFields, ["value"]);
			equal(options.idGenerate, true);

			const config = authnRandomId();
			equal(config.id, "authn");
			equal(config.type, "id");
			ok(config.create().startsWith("authn_"));

			// the credential's own id/type, not authn's, name the stored row
			equal(authnMakeType(plain()), "test-secret");
			equal(authnMakeType(plain({ type: "other" })), "test-other");
		});
		it("Will leave the id to the store when idGenerate is off", async () => {
			// what reaches the store is the contract here, so watch the insert
			// rather than the row: sqlite would reject a missing id outright
			const inserts = [];
			const recording = {
				...storeSQLite,
				insert: async (_table, params) => {
					inserts.push(params);
					return "store_generated";
				},
			};
			let generated = 0;
			const randomId = {
				...authnRandomId(),
				create: () => {
					generated += 1;
					return "authn_counted";
				},
			};
			configure({ store: recording, idGenerate: false, randomId });
			const off = await authnCreate(plain(), sub, { value: "a" });
			// with generation off authn names no id at all, and never asks the
			// generator for one
			equal("id" in inserts[0], false);
			equal(generated, 0);
			equal(off.id, "store_generated");
			// and no expiry key is written when the credential has none
			equal("expire" in inserts[0], false);

			configure({ store: recording, randomId });
			await authnCreate(plain(), sub, { value: "a" });
			equal(inserts[1].id, "authn_counted");
			equal(generated, 1);
			configure();
		});
		it("Will read only the fields it needs", async () => {
			// projections are part of the store contract: a credential row holds
			// more than these calls are allowed to pull back
			const calls = [];
			const recording = {
				...storeSQLite,
				selectList: async (t, filters, fields) => {
					calls.push(fields);
					return await storeSQLite.selectList(t, filters, fields);
				},
			};
			configure({ store: recording });
			await authnCreate(plain(), sub, { value: "a", verify: 1 });
			await authnCount(plain(), sub);
			deepEqual(calls[0], ["verify", "expire"]);
			await authnAuthenticate(plain(), username, "a");
			deepEqual(calls[1], [
				"id",
				"encryptionKey",
				"value",
				"otp",
				"verify",
				"expire",
				"sourceId",
			]);
			configure();
		});
		it("Defaults to no username hooks and no logger", async () => {
			authn({ store: storeSQLite, notify, authenticationDuration: 10 });
			const options = authnGetOptions();
			deepEqual(options.usernameExists, []);
			equal(options.log, false);
			// with no hook registered nothing can resolve to a subject
			equal(await authnSubject(username), undefined);
			configure();
		});
		it("Will swallow a throwing verify with no logger configured", async () => {
			// `log: false` is not callable: the guard, not a try/catch, is what
			// keeps a throwing credential from taking the request down
			configure({ log: false });
			const config = plain({
				verify: () => {
					throw new Error("boom");
				},
			});
			await authnCreate(plain(), sub, { value: "a", verify: 1 });
			await rejects(() => authnAuthenticate(config, username, "a"), {
				cause: { type: "invalid" },
			});
			await authnCreate(plain(), sub, { value: "b" });
			await rejects(() => authnVerify(config, sub, "b"), {
				cause: { type: "invalid" },
			});
			configure();
		});
	});

	describe("`subject`", () => {
		it("Can resolve a username to its account", async () => {
			equal(await authnSubject(username), sub);
			equal(await authnSubject(usernameOther), subOther);
		});
		it("Will resolve an unknown username to nothing", async () => {
			equal(await authnSubject("nobody"), undefined);
		});
		it("Will skip hooks that find nothing", async () => {
			configure({
				usernameExists: [async () => undefined, accountUsernameExists],
			});
			equal(await authnSubject(username), sub);
			configure();
		});
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
			// one for `sub` of this type only: not the other account's, not the
			// other type's
			equal(await authnCount(plain(), sub), 1);
			equal(await authnCount(plain(), subOther), 1);
			equal(await authnCount(plain({ type: "other" }), sub), 1);
		});
		it("Can count several credentials of the same type", async () => {
			await authnCreate(plain(), sub, { value: "a", verify: 1 });
			await authnCreate(plain(), sub, { value: "b", verify: 1 });
			equal(await authnCount(plain(), sub), 2);
		});
		it("Will throw without a sub", async () => {
			await rejects(() => authnCount(plain(), undefined), {
				cause: { sub: undefined },
			});
		});
		it("Will count a credential expiring exactly now", async (t) => {
			const { id } = await authnCreate(plain(), sub, {
				value: "a",
				verify: 1,
			});
			// `expire < now` is exclusive: a credential dying this very second is
			// still live. Freeze the clock so the boundary is exact.
			const now = nowInSeconds();
			await storeSQLite.update(table, { sub, id }, { expire: now });
			t.mock.timers.enable({ apis: ["Date"], now: now * 1000 });
			equal(await authnCount(plain(), sub), 1);
			t.mock.timers.reset();
		});
	});

	describe("`list`", () => {
		it("Will not list an expired credential", async () => {
			await authnCreate(plain({ expire: -1 }), sub, { value: "a" });
			equal((await authnList(plain({ expire: -1 }), sub)).length, 0);
		});
		it("Can list decrypted credentials for one sub and type", async () => {
			await authnCreate(plain(), sub, { value: "a", verify: 1 });
			await authnCreate(plain(), sub, { value: "b", verify: 1 });
			const list = await authnList(plain(), sub);
			equal(list.length, 2);
			// iteration walks backwards, so insertion order is reversed
			deepEqual(
				list.map(({ value }) => value),
				["b", "a"],
			);
			// the encryption key is stripped from every item handed back
			deepEqual(
				list.map(({ encryptionKey }) => encryptionKey),
				[undefined, undefined],
			);
			equal((await authnList(plain(), subOther)).length, 1);
			equal((await authnList(plain({ type: "other" }), sub)).length, 1);
		});
		it("Can narrow a list with extra params and fields", async () => {
			await authnCreate(plain(), sub, { value: "a", verify: 1, name: "one" });
			await authnCreate(plain(), sub, { value: "b", verify: 1, name: "two" });
			const list = await authnList(plain(), sub, { name: "two" }, [
				"id",
				"name",
				"value",
				"encryptionKey",
			]);
			equal(list.length, 1);
			equal(list[0].name, "two");
			equal(list[0].value, "b");
		});
		it("Will list a credential expiring exactly now", async (t) => {
			const { id } = await authnCreate(plain(), sub, { value: "a" });
			const now = nowInSeconds();
			await storeSQLite.update(table, { sub, id }, { expire: now });
			t.mock.timers.enable({ apis: ["Date"], now: now * 1000 });
			equal((await authnList(plain(), sub)).length, 1);
			t.mock.timers.reset();
		});
		it("Will throw without a sub", async () => {
			await rejects(() => authnList(plain(), undefined), {
				cause: { sub: undefined },
			});
		});
	});

	describe("`create`", () => {
		it("Can create an encrypted credential", async () => {
			const { id, value, encryptionKey, create, update, otp, type } =
				await authnCreate(plain(), sub, { value: "a" });
			ok(id.startsWith("authn_"));
			equal(type, "test-secret");
			equal(otp, false);
			ok(create);
			equal(update, create);
			// what `create` returns is already encrypted, and matches the row
			notEqual(value, "a");
			ok(encryptionKey);
			const row = await storeSQLite.select(table, { sub, id });
			equal(row.value, value);
			notEqual(row.value, "a");
			equal(row.type, "test-secret");
			// and it round-trips back to the plaintext
			equal((await authnSelect(plain(), sub, id)).value, "a");
		});
		it("Can create with a generated secret when none is given", async () => {
			const { id } = await authnCreate(plain(), sub, {});
			equal((await authnSelect(plain(), sub, id)).value, "s3cret");
		});
		it("Can create a one-time credential with an expiry", async () => {
			const { id, expire, otp } = await authnCreate(
				plain({ otp: true, expire: 600 }),
				sub,
				{ value: "a" },
			);
			equal(otp, true);
			ok(expire > nowInSeconds());
			ok(expire <= nowInSeconds() + 600);
			const row = await storeSQLite.select(table, { sub, id });
			equal(row.expire, expire);
		});
		it("Will not set an expiry when the credential has none", async () => {
			const { id, expire } = await authnCreate(plain(), sub, { value: "a" });
			equal(expire, undefined);
			const row = await storeSQLite.select(table, { sub, id });
			ok(!row.expire);
		});
		it("Will throw without a sub", async () => {
			await rejects(() => authnCreate(plain(), undefined, { value: "a" }), {
				cause: { sub: undefined },
			});
		});
	});

	describe("`createList`", () => {
		it("Can create several credentials at once", async () => {
			const res = await authnCreateList(plain(), sub, [
				{ value: "a" },
				{ value: "b" },
			]);
			ok(res.id);
			// the first row's fields are echoed back alongside the insert result
			equal(res.type, "test-secret");
			notEqual(res.value, "a");
			const list = await authnList(plain(), sub);
			deepEqual(list.map(({ value }) => value).sort(), ["a", "b"]);
			// each row got its own encryption key
			const [first, second] = list;
			notEqual(first.id, second.id);
		});
		it("Will throw without a sub", async () => {
			await rejects(
				() => authnCreateList(plain(), undefined, [{ value: "a" }]),
				{
					cause: { sub: undefined },
				},
			);
		});
	});

	describe("`update`", () => {
		it("Can re-encrypt a value against the existing key", async () => {
			const { id, encryptionKey: encryptedKey } = await authnCreate(
				plain(),
				sub,
				{ value: "a", verify: 1 },
			);
			const before = await storeSQLite.select(table, { sub, id });
			await authnUpdate(plain(), {
				id,
				sub,
				encryptedKey,
				value: "b",
				name: "renamed",
			});
			const after = await storeSQLite.select(table, { sub, id });
			equal((await authnSelect(plain(), sub, id)).value, "b");
			equal(after.name, "renamed");
			notEqual(after.value, before.value);
			notEqual(after.value, "b");
			// the key is reused, only the payload and the update stamp move
			equal(after.encryptionKey, before.encryptionKey);
			ok(after.update >= before.update);
			// an unfiltered update would rewrite every row with this sub's
			// ciphertext, so read the neighbours back through their own keys
			const [other] = await authnList(plain(), subOther);
			equal(other.value, "other");
			const [otherType] = await authnList(plain({ type: "other" }), sub);
			equal(otherType.value, "other-type");
		});
	});

	describe("`verifySecret`", () => {
		it("Can mark a credential verified", async () => {
			const { id } = await authnCreate(plain(), sub, { value: "a" });
			equal(await authnCount(plain(), sub), 0);
			await authnVerifySecret(plain(), sub, id);
			equal(await authnCount(plain(), sub), 1);
			const item = await authnSelect(plain(), sub, id);
			ok(item.verify);
			equal(item.update, item.verify);
			// only that one row: an unfiltered update would verify the lot
			const { id: unverified } = await authnCreate(plain(), subOther, {
				value: "b",
			});
			await authnVerifySecret(plain(), sub, id);
			equal((await authnSelect(plain(), subOther, unverified)).verify, null);
		});
		it("Will throw without a sub or an id", async () => {
			await rejects(() => authnVerifySecret(plain(), undefined, "authn_1"), {
				cause: { sub: undefined, id: "authn_1" },
			});
			await rejects(
				() => authnVerifySecret(plain(), sub, undefined),
				{ cause: { id: undefined, sub } },
				"404 Not Found",
			);
		});
	});

	describe("`authenticate`", () => {
		it("Will skip an unverified credential", async () => {
			await authnCreate(plain(), sub, { value: "a" });
			// present but never verified, so it is not a candidate at all
			await rejects(() => authnAuthenticate(plain(), username, "a"), {
				cause: { type: "missing" },
			});
		});
		it("Will skip an expired credential", async () => {
			await authnCreate(plain({ expire: -1 }), sub, {
				value: "a",
				verify: 1,
			});
			await rejects(
				() => authnAuthenticate(plain({ expire: -1 }), username, "a"),
				{ cause: { type: "expired" } },
			);
		});
		it("Will report a wrong secret as invalid", async () => {
			const { id } = await authnCreate(plain(), sub, {
				value: "a",
				verify: 1,
			});
			await rejects(() => authnAuthenticate(plain(), username, "wrong"), {
				cause: { type: "invalid" },
			});
			// nothing matched, so nothing was used
			equal((await authnSelect(plain(), sub, id)).lastused, null);
		});
		it("Will report an unknown username with the username as cause", async () => {
			await rejects(() => authnAuthenticate(plain(), "nobody", "a"), {
				cause: { username: "nobody" },
			});
		});
		it("Will continue past a credential whose verify throws", async () => {
			await authnCreate(plain(), sub, { value: "a", verify: 1 });
			const config = plain({
				verify: () => {
					throw new Error("boom");
				},
			});
			await rejects(() => authnAuthenticate(config, username, "a"), {
				cause: { type: "invalid" },
			});
			// the throw is swallowed as "not this one" and logged, not propagated
			ok(
				mocks.log.mock.calls.some(
					({ arguments: [first] }) => first?.message === "boom",
				),
			);
		});
		it("Can authenticate and stamp lastused", async () => {
			const { id } = await authnCreate(plain(), sub, {
				value: "a",
				verify: 1,
			});
			equal(await authnAuthenticate(plain(), username, "a"), sub);
			const item = await authnSelect(plain(), sub, id);
			ok(item.lastused);
			// a plain credential survives use, unexpired
			equal(item.expire, null);
			equal(await authnCount(plain(), sub), 1);
			// and only the credential that matched was stamped
			const [other] = await authnList(plain(), subOther);
			equal(other.lastused, null);
			// the wrong account's secret was never a candidate here
			await rejects(() => authnAuthenticate(plain(), username, "other"), {
				cause: { type: "invalid" },
			});
		});
		it("Can authenticate a one-time credential and expire it", async () => {
			const config = plain({ otp: true });
			const { id } = await authnCreate(config, sub, { value: "a" });
			equal(await authnAuthenticate(config, username, "a"), sub);
			// consumed: expired in place, with lastused recorded
			const item = await authnSelect(config, sub, id);
			equal(typeof item.expire, "number");
			ok(item.expire < nowInSeconds());
			ok(item.lastused);
			equal(await authnCount(config, sub), 0);
		});
		it("Can run a cleanup hook after a successful authentication", async () => {
			const seen = [];
			const config = plain({
				cleanup: async (cleanupSub, value) => {
					seen.push([cleanupSub, value]);
				},
			});
			await authnCreate(config, sub, { value: "a", verify: 1 });
			equal(await authnAuthenticate(config, username, "a"), sub);
			deepEqual(seen, [[sub, "a"]]);
		});
		it("Will take at least the configured duration", async () => {
			await authnCreate(plain(), sub, { value: "a", verify: 1 });
			configure({ authenticationDuration: 100 });
			const start = Date.now();
			await authnAuthenticate(plain(), username, "a");
			ok(Date.now() - start >= 100);
			configure();
		});
		it("Will authenticate a credential expiring exactly now", async (t) => {
			const { id } = await authnCreate(plain(), sub, {
				value: "a",
				verify: 1,
			});
			const now = nowInSeconds();
			await storeSQLite.update(table, { sub, id }, { expire: now });
			t.mock.timers.enable({ apis: ["Date"], now: now * 1000 });
			try {
				equal(await authnAuthenticate(plain(), username, "a"), sub);
			} finally {
				t.mock.timers.reset();
			}
		});
	});

	describe("`verify`", () => {
		it("Will skip an expired credential", async () => {
			await authnCreate(plain({ expire: -1 }), sub, { value: "a" });
			await rejects(() => authnVerify(plain({ expire: -1 }), sub, "a"), {
				cause: { type: "expired" },
			});
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
				await rejects(() => authnVerify(config, sub, "a"), {
					cause: { type: "invalid" },
				});
			} finally {
				options.store = original;
			}
		});
		it("Can verify and consume a one-time credential", async () => {
			const config = plain({ otp: true });
			await authnCreate(config, sub, { value: "a" });
			const verified = await authnVerify(config, sub, "a");
			// the stored row comes back, so callers can read its metadata
			ok(verified.id);
			equal(verified.type, "test-secret");
			// consumed: the same secret cannot be replayed
			await rejects(() => authnVerify(config, sub, "a"), {
				cause: { type: "missing" },
			});
		});
		it("Can merge an object returned by verify into the credential", async () => {
			const config = plain({
				verify: (input, value) => input === value && { extra: "merged" },
			});
			await authnCreate(config, sub, { value: "a" });
			const verified = await authnVerify(config, sub, "a");
			equal(verified.extra, "merged");
		});
		it("Will not verify a credential belonging to another sub", async () => {
			const { id } = await authnCreate(plain(), sub, { value: "a" });
			// `other` is subOther's secret, and must not match here
			await rejects(() => authnVerify(plain(), sub, "other"), {
				cause: { type: "invalid" },
			});
			// a failed verify consumes nothing, not even the last row it looked at
			ok(await authnSelect(plain(), sub, id));
		});
		it("Can verify a reusable credential more than once", async () => {
			await authnCreate(plain(), sub, { value: "a" });
			ok(await authnVerify(plain(), sub, "a"));
			// not one-time, so it survives to be verified again
			ok(await authnVerify(plain(), sub, "a"));
		});
		it("Can narrow candidates by sourceId", async () => {
			await authnCreate(plain(), sub, { value: "a", sourceId: "source_1" });
			await rejects(
				() => authnVerify(plain({ sourceId: "source_2" }), sub, "a"),
				{ cause: { type: "missing" } },
			);
			ok(await authnVerify(plain({ sourceId: "source_1" }), sub, "a"));

			// with no sourceId asked for the key is left off the filter entirely,
			// rather than sent as undefined for each store to interpret
			const filters = [];
			configure({
				store: {
					...storeSQLite,
					selectList: async (t, f, fields) => {
						filters.push(f);
						return await storeSQLite.selectList(t, f, fields);
					},
				},
			});
			ok(await authnVerify(plain(), sub, "a"));
			equal("sourceId" in filters[0], false);
			configure();
		});
		it("Will not consume a one-time credential that did not match", async () => {
			const config = plain({ otp: true });
			const { id } = await authnCreate(config, sub, { value: "a" });
			await rejects(() => authnVerify(config, sub, "wrong"), {
				cause: { type: "invalid" },
			});
			// still there to be tried again
			ok(await authnSelect(config, sub, id));
			ok(await authnVerify(config, sub, "a"));
		});
		it("Will continue past a credential whose verify throws", async () => {
			await authnCreate(plain(), sub, { value: "a" });
			const config = plain({
				verify: () => {
					throw new Error("boom");
				},
			});
			await rejects(() => authnVerify(config, sub, "a"), {
				cause: { type: "invalid" },
			});
			// the store shares this logger, so look for the credential's own error
			ok(
				mocks.log.mock.calls.some(
					({ arguments: [first] }) => first?.message === "boom",
				),
			);
		});
		it("Will throw without a sub or an input", async () => {
			await rejects(() => authnVerify(plain(), undefined, "a"), {
				cause: { sub: undefined },
			});
			await rejects(() => authnVerify(plain(), 1, "a"), { cause: { sub: 1 } });
			await rejects(() => authnVerify(plain(), sub, undefined), {
				cause: { sub, input: undefined },
			});
		});
		it("Will take at least the configured duration", async () => {
			configure({ authenticationDuration: 100 });
			const start = Date.now();
			await rejects(() => authnVerify(plain(), sub, "a"));
			ok(Date.now() - start >= 100);
			configure();
		});
		it("Will verify a credential expiring exactly now", async (t) => {
			const { id } = await authnCreate(plain(), sub, { value: "a" });
			const now = nowInSeconds();
			await storeSQLite.update(table, { sub, id }, { expire: now });
			t.mock.timers.enable({ apis: ["Date"], now: now * 1000 });
			try {
				ok(await authnVerify(plain(), sub, "a"));
			} finally {
				t.mock.timers.reset();
			}
		});
	});

	describe("`select`", () => {
		it("Can select and decrypt one credential", async () => {
			const { id } = await authnCreate(plain(), sub, { value: "a" });
			const item = await authnSelect(plain(), sub, id);
			equal(item.value, "a");
			equal(item.id, id);
			// the wrapped key never leaves the package
			equal(item.encryptionKey, undefined);
		});
		it("Will not select another sub's or another type's credential", async () => {
			const { id } = await authnCreate(plain(), subOther, { value: "a" });
			equal(await authnSelect(plain(), sub, id), undefined);
			equal(
				await authnSelect(plain({ type: "other" }), subOther, id),
				undefined,
			);
		});
		it("Will return nothing for an unknown id", async () => {
			equal(await authnSelect(plain(), sub, "authn_unknown"), undefined);
		});
		it("Will throw without a sub or an id", async () => {
			await rejects(() => authnSelect(plain(), undefined, "authn_1"), {
				cause: { sub: undefined, id: "authn_1" },
			});
			await rejects(
				() => authnSelect(plain(), sub, undefined),
				{ cause: { id: undefined, sub } },
				"404 Not Found",
			);
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
			const item = await authnSelect(plain(), sub, id);
			// expired strictly in the past, so it can never be a candidate again
			equal(typeof item.expire, "number");
			ok(item.expire < nowInSeconds());
			// and only this credential was touched
			equal(await authnCount(plain(), subOther), 1);
			const [other] = await authnList(plain(), subOther);
			equal(other.expire, null);
		});
		it("Can expire with extra values", async () => {
			const { id } = await authnCreate(plain(), sub, { value: "a" });
			await authnExpire(plain(), sub, id, { lastused: 1234 });
			equal((await authnSelect(plain(), sub, id)).lastused, 1234);
		});
		it("Will throw to expire without a sub or an id", async () => {
			await rejects(() => authnExpire(plain(), undefined, "authn_1"), {
				cause: { sub: undefined, id: "authn_1" },
			});
			await rejects(
				() => authnExpire(plain(), sub, undefined),
				{ cause: { id: undefined, sub } },
				"404 Not Found",
			);
		});
		it("Can remove a credential", async () => {
			const { id } = await authnCreate(plain(), sub, {
				value: "a",
				verify: 1,
			});
			ok(await authnRemove(plain(), sub, id));
			equal(await authnCount(plain(), sub), 0);
			// the other account and the other type kept theirs
			equal(await authnCount(plain(), subOther), 1);
			equal(await authnCount(plain({ type: "other" }), sub), 1);
		});
		it("Will not remove another sub's credential", async () => {
			const { id } = await authnCreate(plain(), subOther, { value: "a" });
			equal(await authnRemove(plain(), sub, id), false);
			equal(await authnCount(plain(), subOther), 1);
		});
		it("Will throw to remove without a sub or an id", async () => {
			await rejects(() => authnRemove(plain(), undefined, "authn_1"), {
				cause: { sub: undefined, id: "authn_1" },
			});
			await rejects(
				() => authnRemove(plain(), sub, undefined),
				{ cause: { id: undefined, sub } },
				"404 Not Found",
			);
		});
	});

	describe("`removeList`", () => {
		it("Can remove several credentials at once", async () => {
			const first = await authnCreate(plain(), sub, { value: "a", verify: 1 });
			const second = await authnCreate(plain(), sub, { value: "b", verify: 1 });
			await authnRemoveList(plain(), sub, [first.id, second.id]);
			equal(await authnCount(plain(), sub), 0);
			// scoped to this sub and type
			equal(await authnCount(plain(), subOther), 1);
			equal(await authnCount(plain({ type: "other" }), sub), 1);
		});
		it("Will throw without a sub", async () => {
			await rejects(() => authnRemoveList(plain(), undefined, ["authn_1"]), {
				cause: { sub: undefined, id: ["authn_1"] },
			});
		});
		it("Will throw without a non-empty array of ids", async () => {
			for (const id of [undefined, "authn_1", []]) {
				await rejects(
					() => authnRemoveList(plain(), sub, id),
					{ cause: { sub, id } },
					"404 Not Found",
				);
			}
		});
	});
});

const rejects = async (fn, cause, message = "401 Unauthorized") => {
	try {
		await fn();
	} catch (e) {
		equal(e.message, message);
		if (cause) {
			deepEqual(e.cause, cause.cause);
		}
		return;
	}
	throw new Error(`Expected ${message}`);
};
