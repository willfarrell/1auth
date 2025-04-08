import { deepEqual, equal, notEqual, ok } from "node:assert/strict";
import { describe, it, test } from "node:test";

import crypto, {
	symmetricRandomEncryptionKey,
	symmetricRandomSignatureSecret,
	randomChecksumSalt,
	randomChecksumPepper,
} from "../crypto/index.js";
// ** Setup Start *** //
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
	lookup as accountUsernameLookup,
	update as accountUsernameUpdate,
	recover as accountUsernameRecover,
} from "../account-username/index.js";

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
accountUsername({
	maxLength: 100,
	usernameBlacklist: ["admin"],
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
test.beforeEach(async (t) => {
	sub = await accountCreate();
	t.mock.method(mocks, "notifyClient");
});

test.afterEach(async (t) => {
	t.mock.reset();
	await accountRemove(sub);
	await store.__clear(accountGetOptions().table);
});

describe("account-username", () => {
	it("Can create a username on an account", async () => {
		const usernameValue = "username";
		await accountUsernameCreate(sub, usernameValue);
		const db = await store.select(accountGetOptions().table, { sub });
		ok(db.username);
		notEqual(db.username, usernameValue); // encrypted
	});
	it("Can check is a username exists (exists)", async () => {
		const usernameValue = "username";
		await accountUsernameCreate(sub, usernameValue);
		const user = await accountUsernameExists(usernameValue);
		ok(user);
	});
	it("Can check is a username exists (not exists)", async () => {
		const user = await accountUsernameExists("notfound");
		equal(user, undefined);
	});
	it("Can lookup an account { username } (exists)", async () => {
		const usernameValue = "username";
		await accountUsernameCreate(sub, usernameValue);
		const user = await accountUsernameLookup(usernameValue);
		ok(user);
		equal(user.username, usernameValue); // unencrypted
	});
	it("Can lookup an account { username } (not exists)", async () => {
		const usernameValue = "username";
		const user = await accountUsernameLookup(usernameValue);
		equal(user, undefined);
	});
	it("Can update username", async () => {
		const usernameValue = "username";
		await accountUsernameCreate(sub, usernameValue);
		const newUsernameValue = "nameuser";
		await accountUsernameUpdate(sub, newUsernameValue);

		let user = await accountUsernameLookup(usernameValue);
		equal(user, undefined);

		user = await accountUsernameLookup(newUsernameValue);
		ok(user);

		// notify
		deepEqual(mocks.notifyClient.mock.calls[0].arguments[0], {
			id: "account-username-change",
			sub,
			data: undefined,
			options: {},
		});
	});
	it("Can recover a useranme using { sub }", async () => {
		// You would lookup sub using an email first
		const usernameValue = "username";
		await accountUsernameCreate(sub, usernameValue);
		await accountUsernameRecover(sub);

		// notify
		deepEqual(mocks.notifyClient.mock.calls[0].arguments[0], {
			id: "account-username-recover",
			sub,
			data: { username: usernameValue },
			options: {},
		});
	});

	it("Should allow username with number charaters", async () => {
		const usernameValue = "number_1234567890";
		await accountUsernameCreate(sub, usernameValue);
		const user = await accountUsernameExists(usernameValue);
		ok(user);
	});
	it("Should allow username with lower case charaters", async () => {
		const usernameValue = "lower_username";
		await accountUsernameCreate(sub, usernameValue);
		const user = await accountUsernameExists(usernameValue);
		ok(user);
	});
	it("Should allow username with upper case charaters", async () => {
		const usernameValue = "UPPER_USERNAME";
		await accountUsernameCreate(sub, usernameValue);
		const user = await accountUsernameExists(usernameValue);
		ok(user);
	});
	it("Should allow username with lower case accented charaters", async () => {
		const usernameValue =
			"lower_accented_ŵèéêëěẽēėęřțťýŷÿùúûüǔũūűůìíîïǐĩīįòóôöǒõōàáâäǎãåāşșśšďğġķļľźžżçćčċñńņň";
		await accountUsernameCreate(sub, usernameValue);
		const user = await accountUsernameExists(usernameValue);
		ok(user);
	});
	it("Should allow username with upper case accented charaters", async () => {
		const usernameValue =
			"UPPER_ACCENTED_ŴÈÉÊËĚẼĒĖĘŘȚŤÝŶŸÙÚÛÜǓŨŪŰŮÌÍÎÏǏĨĪİĮÒÓÔÖǑÕŌÀÁÂÄǍÃÅĀŚŠŞȘĎĞĠĻĽŹŽŻÇĆČĊÑŃŅŇ";
		await accountUsernameCreate(sub, usernameValue);
		const user = await accountUsernameExists(usernameValue);
		ok(user);
	});
	it("Should throw when username has ligature charaters", async () => {
		const usernameValue = "þœøæßdðħł";
		try {
			await accountUsernameCreate(sub, usernameValue);
		} catch (e) {
			equal(e.message, "400 Bad Request");
		}
	});

	it("Should throw when username has `@` from email", async () => {
		const usernameValue = "username@domain.tld";
		try {
			await accountUsernameCreate(sub, usernameValue);
		} catch (e) {
			equal(e.message, "400 Bad Request");
		}
	});
	it("Should throw when username has ` `", async () => {
		const usernameValue = "user name";
		try {
			await accountUsernameCreate(sub, usernameValue);
		} catch (e) {
			equal(e.message, "400 Bad Request");
		}
	});
	it("Should throw when username is too short", async () => {
		const usernameValue = "";
		try {
			await accountUsernameCreate(sub, usernameValue);
		} catch (e) {
			equal(e.message, "400 Bad Request");
		}
	});
	it("Should throw when username is too long", async () => {
		const usernameValue =
			"0000000001111111111222222222211111111112222222222111111111122222222221111111111222222222211111111112222222222";
		try {
			await accountUsernameCreate(sub, usernameValue);
		} catch (e) {
			equal(e.message, "400 Bad Request");
		}
	});
	it("Should throw when username contains invalid chars", async () => {
		const usernameValue = "username*";
		try {
			await accountUsernameCreate(sub, usernameValue);
		} catch (e) {
			equal(e.message, "400 Bad Request");
		}
	});
	it("Should throw when username contains a black listed word", async () => {
		const usernameValue = "user_admin_name";
		try {
			await accountUsernameCreate(sub, usernameValue);
		} catch (e) {
			equal(e.message, "409 Conflict");
		}
	});
	it("Should throw when username already exists", async () => {
		const usernameValue = "username";
		await accountUsernameCreate(sub, usernameValue);
		sub = await accountCreate();
		try {
			await accountUsernameCreate(sub, usernameValue);
		} catch (e) {
			equal(e.message, "409 Conflict");
		}
	});
});
