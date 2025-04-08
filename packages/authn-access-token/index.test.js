import { deepEqual, equal, ok } from "node:assert/strict";
import { describe, it, test } from "node:test";

import crypto, {
	symmetricRandomEncryptionKey,
	symmetricRandomSignatureSecret,
	randomChecksumSalt,
	randomChecksumPepper,
} from "../crypto/index.js";
// *** Setup Start *** //
import * as notify from "../notify-console/index.js";
import * as store from "../store-memory/index.js";

import account, {
	create as accountCreate,
	remove as accountRemove,
	getOptions as accountGetOptions,
} from "../account/index.js";

import accountUsername, {
	create as accountUsernameCreate,
	exists as accountUsernameExists,
} from "../account-username/index.js";

import authn, { getOptions as authnGetOptions } from "../authn/index.js";

import accessToken, {
	authenticate as accessTokenAuthenticate,
	create as accessTokenCreate,
	exists as accessTokenExists,
	count as accessTokenCount,
	lookup as accessTokenLookup,
	select as accessTokenSelect,
	list as accessTokenList,
	expire as accessTokenExpire,
	remove as accessTokenRemove,
} from "../authn-access-token/index.js";

crypto({
	symmetricEncryptionKey: symmetricRandomEncryptionKey(),
	symmetricSignatureSecret: symmetricRandomSignatureSecret(),
	digestChecksumSalt: randomChecksumSalt(),
	digestChecksumPepper: randomChecksumPepper(),
});
store.default({ log: false });
notify.default({
	client: (id, sub, params) => {
		mocks.notifyClient(id, sub, params);
	},
});

account({ store, notify, encryptedFields: ["name", "username", "privateKey"] });
accountUsername();

authn({
	store,
	notify,
	usernameExists: [accountUsernameExists, accessTokenExists],
	encryptedFields: ["value", "name"],
	authenticationDuration: 0,
	log: (...args) => {
		mocks.log(...args);
	},
});
accessToken({
	log: (...args) => {
		mocks.log(...args);
	},
});
// *** Setup End *** //

const mocks = {
	log: () => {},
	notifyClient: () => {},
};
let sub;
const username = "username";
test.beforeEach(async (t) => {
	sub = await accountCreate();
	await accountUsernameCreate(sub, username);
	t.mock.method(mocks, "notifyClient");
});

test.afterEach(async (t) => {
	t.mock.reset();
	await accountRemove(sub);
	await store.__clear(accountGetOptions().table);
	await store.__clear(authnGetOptions().table);
});

describe("authn-access-token", () => {
	it("Can create an access token on an account", async () => {
		const { secret } = await accessTokenCreate(sub);
		const db = await store.select(authnGetOptions().table, { sub });

		equal(db.type, "accessToken-secret");
		equal(db.otp, false);
		ok(db.value);
		ok(db.digest);
		ok(db.verify);
		ok(db.expire);

		const count = await accessTokenCount(sub);
		equal(count, 1);

		// notify
		const { expire } = mocks.notifyClient.mock.calls[0].arguments[0].data;
		deepEqual(mocks.notifyClient.mock.calls[0].arguments[0], {
			id: "authn-access-token-create",
			sub,
			data: { expire },
			options: {},
		});

		const userSub = await accessTokenAuthenticate(secret, secret);
		equal(userSub, sub);
	});
	it("Can remove an access token on an account", async () => {
		const { secret } = await accessTokenCreate(sub);
		const row = await accessTokenLookup(secret);
		await accessTokenRemove(sub, row.id);
		const authDB = await store.select(authnGetOptions().table, { sub });

		ok(!authDB);

		// notify
		deepEqual(mocks.notifyClient.mock.calls[1].arguments[0], {
			id: "authn-access-token-remove",
			sub,
			data: undefined,
			options: {},
		});

		try {
			await accessTokenAuthenticate(username, secret);
		} catch (e) {
			equal(e.message, "401 Unauthorized");
		}
	});
	it("Can NOT remove an access token from someone elses account", async () => {
		const { secret } = await accessTokenCreate(sub);
		const row = await accessTokenLookup(secret);
		await accessTokenRemove("sub_111111", row.id);
		const authDB = await store.select(authnGetOptions().table, { sub });

		ok(authDB);
	});

	it("Can check is an access token exists (exists)", async () => {
		const { secret } = await accessTokenCreate(sub);
		const row = await accessTokenExists(secret);
		ok(row);
	});
	it("Can check is an access token exists (not exists)", async () => {
		const row = await accessTokenExists("pat-notfound");
		equal(row, undefined);
	});
	it("Can lookup an access token with { secret } (exists)", async () => {
		const { secret } = await accessTokenCreate(sub);
		const row = await accessTokenLookup(secret);
		ok(row);
	});
	it("Can lookup an access token with { secret } (expired)", async () => {
		const { id, secret } = await accessTokenCreate(sub);
		await accessTokenExpire(sub, id);
		const row = await accessTokenLookup(secret);
		ok(!row);
	});
	it("Can lookup an access token with { secret } (not exists)", async () => {
		const row = await accessTokenLookup("pat-notfound");
		equal(row, undefined);
	});
	it("Can select an access token with { id } (exists)", async () => {
		const { id } = await accessTokenCreate(sub); // TODO id is undefined
		const row = await accessTokenSelect(sub, id);
		ok(row);
	});
	it("Can select an access token with { id } (not exists)", async () => {
		const row = await accessTokenSelect(sub, "authn_000");
		equal(row, undefined);
	});
	it("Can list an access token with { sub } (exists)", async () => {
		await accessTokenCreate(sub);
		await accessTokenCreate(sub);
		const row = await accessTokenList(sub);
		equal(row.length, 2);
	});
	it("Can list an access token with { sub } (not exists)", async () => {
		const row = await accessTokenList(sub);
		equal(row.length, 0);
	});
});
