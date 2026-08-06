import { deepEqual, equal, notEqual, ok, throws } from "node:assert/strict";
import { describe, it, test } from "node:test";
import account, {
	create as accountCreate,
	getOptions as accountGetOptions,
	remove as accountRemove,
} from "@1auth/account";
// import * as mockAccountDynamoDBTable from "@1auth/account/table/dynamodb.js";
import * as mockAccountSQLTable from "@1auth/account/table/sql.js";
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
import accountUsername, {
	create as accountUsernameCreate,
	exists as accountUsernameExists,
	getOptions as accountUsernameGetOptions,
	lookup as accountUsernameLookup,
	recover as accountUsernameRecover,
	sanitize as accountUsernameSanitize,
	update as accountUsernameUpdate,
	validate as accountUsernameValidate,
	validateAllowedChar as accountUsernameValidateAllowedChar,
	validateBlacklist as accountUsernameValidateBlacklist,
	validateLength as accountUsernameValidateLength,
} from "./index.js";

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
	//      ...mockNotify,
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
accountUsername();
// *** Setup End *** //

let sub;
const username = "username";

// Every option not named here falls back to its default, so restoring the
// suite's configuration means re-stating all of it
const configure = (params = {}) =>
	accountUsername({
		maxLength: 100,
		usernameBlacklist: ["admin"],
		log: (...args) => {
			mocks.log(...args);
		},
		...params,
	});

const tests = (config) => {
	const store = config.store;
	test.before(async () => {
		mocks = config.mocks;

		await mocks.storeAccount.create(mocks.storeClient);

		account({
			encryptedFields: ["value", "name"],
			store,
			notify,
			log: (...args) => {
				mocks.log(...args);
			},
		});
		configure();
	});

	test.beforeEach(async (t) => {
		sub = await accountCreate();

		t.mock.method(mocks, "log");
		t.mock.method(mocks, "notifyClient");
	});

	test.afterEach(async (t) => {
		t.mock.reset();
		await accountRemove(sub);
		await mocks.storeAccount.truncate(mocks.storeClient);
	});

	test.after(async () => {
		await mocks.storeAccount.drop(mocks.storeClient);
		mocks.storeClient.after?.();
	});

	describe("`create`", () => {
		it("Will throw with ({sub:undefined})", async () => {
			await rejects(
				() => accountUsernameCreate(undefined, username),
				"401 Unauthorized",
				{ sub: undefined },
			);
		});
		it("Can create a username on an account", async () => {
			await accountUsernameCreate(sub, username);
			const db = await store.select(accountGetOptions().table, { sub });
			ok(db.value);
			notEqual(db.value, username); // encrypted
			// the digest is what makes the row findable, and it is not the username
			ok(db.digest);
			notEqual(db.digest, username);
		});
	});

	describe("`exists`", () => {
		it("Can check is a username exists (exists)", async () => {
			await accountUsernameCreate(sub, username);
			const user = await accountUsernameExists(username);
			ok(user);
		});
		it("Can check is a username exists (not exists)", async () => {
			const user = await accountUsernameExists("notfound");
			equal(user, undefined);
		});
	});

	describe("`lookup`", () => {
		it("Can lookup an account { username } (exists)", async () => {
			await accountUsernameCreate(sub, username);
			const user = await accountUsernameLookup(username);
			ok(user);
			equal(user.value, username); // unencrypted
		});
		it("Can lookup an account { username } (not exists)", async () => {
			const user = await accountUsernameLookup(username);
			equal(user, undefined);
		});
	});

	describe("`update`", () => {
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
				data: {},
				options: {},
			});
		});
	});

	describe("`recover`", () => {
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
	});

	describe("`notifyId`", () => {
		test.afterEach(() => {
			configure();
		});
		it("Can notify with a custom template id prefix", async () => {
			configure({ notifyId: "account-handle" });
			await accountUsernameCreate(sub, "username");
			await accountUsernameRecover(sub);

			equal(
				mocks.notifyClient.mock.calls[0].arguments[0].id,
				"account-handle-recover",
			);
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
	it("Should trim surrounding whitespace", async () => {
		await accountUsernameCreate(sub, " username ");
		ok(await accountUsernameExists("username"));
	});
	it("Should throw when username has ligature charaters", async () => {
		const usernameValue = "þœøæßdðħł";
		await rejectsCreate(usernameValue, "400 Bad Request");
	});

	it("Should throw when username has `@` from email", async () => {
		await rejectsCreate("username@domain.tld", "400 Bad Request");
	});
	it("Should throw when username has ` `", async () => {
		await rejectsCreate("user name", "400 Bad Request");
	});
	it("Should throw when username is empty", async () => {
		// sanitize rejects it before validation ever sees a length
		await rejects(() => accountUsernameCreate(sub, ""), "400 Bad Request", {
			value: "",
		});
	});
	it("Should throw when username is not a string", async () => {
		for (const value of [1234, {}, null, undefined]) {
			await rejects(
				() => accountUsernameCreate(sub, value),
				"400 Bad Request",
				{ value },
			);
		}
	});
	it("Should throw when username is too long", async () => {
		await rejectsCreate("0".repeat(101), "400 Bad Request");
	});
	it("Should throw when username contains invalid chars", async () => {
		await rejectsCreate("username*", "400 Bad Request");
	});
	it("Should throw when username starts with an invalid char", async () => {
		// the pattern is anchored at both ends, so a valid tail is not enough
		await rejectsCreate("*username", "400 Bad Request");
	});
	it("Should throw when username contains a black listed word", async () => {
		await rejectsCreate("user_admin_name", "409 Conflict");
	});
	it("Should throw when username already exists", async () => {
		const usernameValue = "username";
		await accountUsernameCreate(sub, usernameValue);
		sub = await accountCreate();
		await rejects(
			() => accountUsernameCreate(sub, usernameValue),
			"409 Conflict",
			{ username: usernameValue, usernameSanitized: usernameValue },
		);
	});

	describe("`sanitize`", () => {
		it("Can fold case, whitespace and diacritics", () => {
			equal(accountUsernameSanitize("  ÜserNamé  "), "username");
		});
		it("Will throw on anything that is not a non-empty string", () => {
			for (const value of ["", 0, 1234, null, undefined, {}]) {
				throws(() => accountUsernameSanitize(value), {
					message: "400 Bad Request",
				});
			}
		});
	});

	describe("`validate`", () => {
		it("Can accept a username at both length bounds", () => {
			// minLength 1 and the configured maxLength 100 are both inclusive
			equal(accountUsernameValidateLength("a"), true);
			equal(accountUsernameValidateLength("a".repeat(100)), true);
		});
		it("Will reject a username outside the length bounds", () => {
			equal(accountUsernameValidateLength(""), "400 Bad Request");
			equal(accountUsernameValidateLength("a".repeat(101)), "400 Bad Request");
		});
		it("Will report the first failing rule only", () => {
			// too long *and* blacklisted: length is checked first and wins
			equal(
				accountUsernameValidate(`admin${"0".repeat(200)}`),
				"400 Bad Request",
			);
			// allowed chars are checked before the blacklist
			equal(accountUsernameValidate("admin*"), "400 Bad Request");
			equal(accountUsernameValidate("user_admin_name"), "409 Conflict");
			equal(accountUsernameValidate("username"), true);
		});
		it("Will not let a later rule clear an earlier failure", () => {
			// "0"x101 is otherwise perfectly valid: allowed chars, not blacklisted
			equal(accountUsernameValidateAllowedChar("0".repeat(101)), true);
			equal(accountUsernameValidateBlacklist("0".repeat(101)), true);
			equal(accountUsernameValidate("0".repeat(101)), "400 Bad Request");
		});
	});

	describe("`usernameBlacklist`", () => {
		test.afterEach(() => {
			configure();
		});
		it("Can clear the blacklist by reconfiguring with an empty one", () => {
			configure({ usernameBlacklist: [] });
			equal(accountUsernameValidateBlacklist("user_admin_name"), true);
		});
		it("Will hold no blacklist until one is configured", () => {
			// the default is empty: nothing is reserved unless an app says so
			accountUsername();
			deepEqual(accountUsernameGetOptions().usernameBlacklist, []);
			equal(accountUsernameValidateBlacklist("user_admin_name"), true);
			equal(accountUsernameValidateBlacklist("root"), true);
		});
		it("Can blacklist several words", () => {
			configure({ usernameBlacklist: ["admin", "root"] });
			equal(accountUsernameValidateBlacklist("an_admin"), "409 Conflict");
			equal(accountUsernameValidateBlacklist("a_root_user"), "409 Conflict");
			equal(accountUsernameValidateBlacklist("regular"), true);
		});
		it("Will treat a blacklisted word as literal text, not a pattern", () => {
			// `.` and `+` are regex metacharacters; escaped, they match themselves
			configure({ usernameBlacklist: ["a.c", "x+y"] });
			equal(accountUsernameValidateBlacklist("a.c"), "409 Conflict");
			equal(accountUsernameValidateBlacklist("x+y"), "409 Conflict");
			// unescaped, `a.c` would match `abc` and `x+y` would match `xy`
			equal(accountUsernameValidateBlacklist("abc"), true);
			equal(accountUsernameValidateBlacklist("xy"), true);
		});
	});
};
describe("account-username", () => {
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

const rejectsCreate = async (value, message) =>
	await rejects(() => accountUsernameCreate(sub, value), message, {
		username: value,
		usernameSanitized: accountUsernameSanitize(value),
	});
