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

import recoveryCodes, {
	authenticate as recoveryCodesAuthenticate,
	create as recoveryCodesCreate,
	count as recoveryCodesCount,
	// exists as recoveryCodesExists,
	// lookup as recoveryCodesLookup,
	// select as recoveryCodesSelect,
	list as recoveryCodesList,
	update as recoveryCodesUpdate,
	remove as recoveryCodesRemove,
} from "../authn-recovery-codes/index.js";

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
	usernameExists: [accountUsernameExists],
	encryptedFields: ["value", "name"],
	authenticationDuration: 0,
	log: (...args) => {
		mocks.log(...args);
	},
});
recoveryCodes({
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

describe("authn-recovery-codes", () => {
	it("Can create recovery codes on an account", async () => {
		const secrets = await recoveryCodesCreate(sub);
		const authnDB = await store.select(authnGetOptions().table, { sub });

		equal(authnDB.type, "recoveryCodes-secret");
		equal(authnDB.otp, true);
		ok(authnDB.value);
		ok(authnDB.verify);
		ok(!authnDB.digest);
		ok(!authnDB.expire);

		let count = await recoveryCodesCount(sub);
		equal(count, 5);
		// notify
		deepEqual(mocks.notifyClient.mock.calls[0].arguments[0], {
			id: "authn-recovery-codes-create",
			sub,
			data: undefined,
			options: {},
		});
		const userSub = await recoveryCodesAuthenticate(username, secrets[0].value);
		equal(userSub, sub);
		count = await recoveryCodesCount(sub);
		equal(count, 4);
	});
	it("Can update recovery codes on an account", async () => {
		const secrets = await recoveryCodesCreate(sub);

		await recoveryCodesAuthenticate(username, secrets[0].value);

		let authnDB = await store.selectList(authnGetOptions().table, { sub });
		equal(authnDB.length, 5);
		authnDB = authnDB.filter((item) => item.expire === undefined);
		equal(authnDB.length, 4);

		await recoveryCodesUpdate(sub);

		// notify
		deepEqual(mocks.notifyClient.mock.calls[1].arguments[0], {
			id: "authn-recovery-codes-update",
			sub,
			data: undefined,
			options: {},
		});
		authnDB = await store.selectList(authnGetOptions().table, { sub });
		equal(authnDB.length, 5);
	});
	it("Can remove recovery codes on an account", async () => {
		const secrets = await recoveryCodesCreate(sub);
		await recoveryCodesRemove(sub);
		const authDB = await store.select(authnGetOptions().table, { sub });

		ok(!authDB);

		// notify
		deepEqual(mocks.notifyClient.mock.calls[1].arguments[0], {
			id: "authn-recovery-codes-remove",
			sub,
			data: undefined,
			options: {},
		});

		try {
			await recoveryCodesAuthenticate(username, secrets[0].value);
		} catch (e) {
			equal(e.message, "401 Unauthorized");
		}
	});
	it("Can remove single recovery code on an account", async () => {
		const secrets = await recoveryCodesCreate(sub);
		let authDB = await store.select(authnGetOptions().table, { sub });
		await recoveryCodesRemove(sub, authDB.id);
		authDB = await store.selectList(authnGetOptions().table, { sub });

		equal(authDB.length, 4);

		// notify
		deepEqual(mocks.notifyClient.mock.calls[1].arguments[0], {
			id: "authn-recovery-codes-remove",
			sub,
			data: undefined,
			options: {},
		});

		try {
			await recoveryCodesAuthenticate(username, secrets[0].value);
		} catch (e) {
			equal(e.message, "401 Unauthorized");
		}
	});
	it("Can NOT remove recovery codes from someone elses account", async () => {
		await recoveryCodesCreate(sub);
		await recoveryCodesRemove("sub_1111111");
		const authDB = await store.selectList(authnGetOptions().table, { sub });

		ok(authDB);
		equal(authDB.length, 5);
	});

	/* it("Can check is an recovery codes exists (exists)", async () => {
    const secrets = await recoveryCodesCreate(sub);
    const row = await recoveryCodesExists(secrets[0].secret);
    ok(row);
  });
  it("Can check is an recovery codes exists (not exists)", async () => {
    const row = await recoveryCodesExists("pat-notfound");
    equal(row, undefined);
  });
  it("Can lookup an recovery codes with { secret } (exists)", async () => {
    const secrets = await recoveryCodesCreate(sub);
    const row = await recoveryCodesLookup(secrets[0].secret);
    ok(row);
  });
  it("Can lookup an recovery codes with { secret } (not exists)", async () => {
    const row = await recoveryCodesLookup("pat-notfound");
    equal(row, undefined);
  });*/
	// it("Can select an recovery codes with { id } (exists)", async () => {
	//   const {id} = await recoveryCodesCreate(sub);
	//   const row = await recoveryCodesSelect(sub, id);
	//   ok(row);
	// });
	// it("Can select an recovery codes with { id } (not exists)", async () => {
	//   const row = await recoveryCodesSelect(sub, "session_000");
	//   equal(row, undefined);
	// });
	it("Can list an recovery codes with { sub } (exists)", async () => {
		const secrets = await recoveryCodesCreate(sub);
		const row = await recoveryCodesList(sub);
		equal(row.length, secrets.length);
	});
	it("Can list an recovery codes with { sub } (not exists)", async () => {
		const row = await recoveryCodesList(sub);
		equal(row.length, 0);
	});
});
