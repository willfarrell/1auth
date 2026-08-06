import { deepEqual, equal, notEqual, ok } from "node:assert/strict";
import { describe, it, test } from "node:test";
import { setTimeout } from "node:timers/promises";
import account, {
	create as accountCreate,
	remove as accountRemove,
} from "@1auth/account";
import * as mockAccountDynamoDBTable from "@1auth/account/table/dynamodb.js";
import * as mockAccountSQLTable from "@1auth/account/table/sql.js";
import accountUsername, {
	create as accountUsernameCreate,
	exists as accountUsernameExists,
} from "@1auth/account-username";
import authn, { getOptions as authnGetOptions } from "@1auth/authn";
import * as mockAuthnDynamoDBTable from "@1auth/authn/table/dynamodb.js";
import * as mockAuthnSQLTable from "@1auth/authn/table/sql.js";
import crypto, {
	createSeasonedDigest,
	nowInSeconds,
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
import * as mockDynamoDB from "../store-dynamodb/mock.js";
// import * as mockPostgres from "../store-postgres/mock.js";
import * as mockSQLite from "../store-sqlite/mock.js";
import messenger, {
	count as messengerCount,
	create as messengerCreate,
	createToken as messengerCreateToken,
	exists as messengerExists,
	getOptions as messengerGetOptions,
	list as messengerList,
	lookup as messengerLookup,
	randomId as messengerRandomId,
	remove as messengerRemove,
	select as messengerSelect,
	token as messengerToken,
	verifyToken as messengerVerifyToken,
} from "./index.js";
import * as mockMessengerDynamoDBTable from "./table/dynamodb.js";
import * as mockMessengerSQLTable from "./table/sql.js";

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
	// 		storeAuthn: mockAuthnSQLTable,
	//     storeMessenger: mockMessengerSQLTable,
	//    }
	// },
	sqlite: {
		store: storeSQLite,
		mocks: {
			...mockNotify,
			...mockSQLite,
			storeAccount: mockAccountSQLTable,
			storeAuthn: mockAuthnSQLTable,
			storeMessenger: mockMessengerSQLTable,
		},
	},
	...(mockDynamoDB.isReady()
		? {
				dynamodb: {
					store: storeDynamoDB,
					mocks: {
						...mockNotify,
						...mockDynamoDB,
						storeAccount: mockAccountDynamoDBTable,
						storeAuthn: mockAuthnDynamoDBTable,
						storeMessenger: mockMessengerDynamoDBTable,
					},
				},
			}
		: {}),
};

account();
accountUsername();
authn();
messenger();
// *** Setup End *** //

let sub;
const username = "username";
const messengerType = "signal";
let messengerValue = "@username.00";

const tests = (config) => {
	const store = config.store;
	// Every test that reconfigures has to land back on this baseline.
	// `Object.assign(options, defaults, opt)` re-applies the defaults on each
	// call, so `configure()` with no argument is a full reset.
	const configure = (opt = {}) =>
		messenger({
			encryptedFields: ["value", "name"],
			store,
			notify,
			log: (...args) => {
				mocks.log(...args);
			},
			...opt,
		});
	test.before(async () => {
		mocks = config.mocks;

		await mocks.storeAccount.create(mocks.storeClient);
		await mocks.storeAuthn.create(mocks.storeClient);
		await mocks.storeMessenger.create(mocks.storeClient);

		account({ store, notify });
		accountUsername();
		authn({
			store,
			notify,
			usernameExists: [accountUsernameExists],
			authenticationDuration: 0,
		});
		configure();
	});
	test.beforeEach(async (t) => {
		sub = await accountCreate();
		await accountUsernameCreate(sub, username);
		messengerValue = `@${sub}.00`;

		t.mock.method(mocks, "log");
		t.mock.method(mocks, "notifyClient");
	});

	test.afterEach(async (t) => {
		t.mock.reset();
		await accountRemove(sub);
		await mocks.storeMessenger.truncate(mocks.storeClient);
		await mocks.storeAuthn.truncate(mocks.storeClient);
		await mocks.storeAccount.truncate(mocks.storeClient);
		configure();
	});

	test.after(async () => {
		await mocks.storeMessenger.drop(mocks.storeClient);
		await mocks.storeAuthn.drop(mocks.storeClient);
		await mocks.storeAccount.drop(mocks.storeClient);
		mocks.storeClient.after?.();
	});

	it("Can NOT count messengers with ({sub:undefined})", async () => {
		for (const badSub of [undefined, "", 0, 1234, null, {}]) {
			await rejects(
				() => messengerCount(messengerType, badSub),
				"401 Unauthorized",
				{ sub: badSub },
			);
		}
	});

	describe("config", () => {
		it("Names its table, ids and token type after the package id", async () => {
			// the shipped defaults, not the ones this suite configures over them
			messenger({ store, notify });
			const options = messengerGetOptions();
			equal(options.id, "messenger");
			equal(options.notifyId, "messenger");
			equal(options.table, "messengers");
			equal(options.idGenerate, true);
			deepEqual(options.encryptedFields, ["value"]);

			const generator = messengerRandomId();
			equal(generator.id, "messenger");
			equal(generator.type, "id");
			ok(generator.create().startsWith("messenger_"));

			const tokenConfig = messengerToken();
			equal(tokenConfig.id, "messenger");
			equal(tokenConfig.type, "token");
			equal(tokenConfig.otp, true);
			equal(tokenConfig.expire, 10 * 60);
			equal(tokenConfig.create().length, 6);

			// the id and type together name the authn row the token is stored in
			const messengerId = await messengerCreate(messengerType, sub, {
				value: messengerValue,
				digest: createSeasonedDigest(messengerValue),
			});
			ok(messengerId.startsWith("messenger_"));
			const authnDB = await store.select(authnGetOptions().table, { sub });
			equal(authnDB.type, "messenger-token");
		});
		it("Encrypts only `value` by default", async () => {
			// with the default field list the stored value must not be readable,
			// and must still decrypt back through `select`
			messenger({ store, notify });
			const messengerId = await messengerCreate(messengerType, sub, {
				value: messengerValue,
				digest: createSeasonedDigest(messengerValue),
			});
			const row = await store.select(messengerGetOptions().table, {
				sub,
				id: messengerId,
			});
			ok(row.value);
			notEqual(row.value, messengerValue);

			const { token } = mocks.notifyClient.mock.calls[0].arguments[0].data;
			await messengerVerifyToken(messengerType, sub, token, messengerId);
			const decrypted = await messengerSelect(messengerType, sub, messengerId);
			equal(decrypted.value, messengerValue);
		});
		it("Expires a token 10 minutes out", async () => {
			const before = nowInSeconds();
			await messengerCreate(messengerType, sub, {
				value: messengerValue,
				digest: createSeasonedDigest(messengerValue),
			});
			const after = nowInSeconds();
			const { expire } = mocks.notifyClient.mock.calls[0].arguments[0].data;
			equal(typeof expire, "number");
			ok(expire >= before + 10 * 60);
			ok(expire <= after + 10 * 60);
		});
		it("Will leave the id to the store when idGenerate is off", async () => {
			// what reaches the store is the contract: the table would reject a
			// missing id outright, so watch the insert rather than the row
			const inserts = [];
			let generated = 0;
			const recording = {
				...store,
				insert: async (table, params) => {
					inserts.push(params);
					return await store.insert(table, {
						...params,
						id: params.id ?? "messenger_stored",
					});
				},
			};
			const randomId = {
				...messengerRandomId(),
				create: () => {
					generated += 1;
					return "messenger_counted";
				},
			};
			configure({ store: recording, idGenerate: false, randomId });
			await messengerCreate(messengerType, sub, {
				value: messengerValue,
				digest: createSeasonedDigest(messengerValue),
			});
			// with generation off messenger names no id, and never asks for one
			equal("id" in inserts[0], false);
			equal(generated, 0);

			configure({ store: recording, randomId });
			await messengerCreate(messengerType, "sub_222222", {
				value: "@other.00",
				digest: createSeasonedDigest("@other.00"),
			});
			equal(inserts[1].id, "messenger_counted");
			equal(generated, 1);
		});
		it("Will read only the fields it needs", async () => {
			// a messenger row carries the encrypted value and its key; these calls
			// are not allowed to pull those back
			const selects = [];
			const recording = {
				...store,
				select: async (table, filters, fields) => {
					selects.push({ filters, fields });
					return await store.select(table, filters, fields);
				},
			};
			configure({ store: recording });
			const messengerId = await messengerCreate(messengerType, sub, {
				value: messengerValue,
				digest: createSeasonedDigest(messengerValue),
			});
			deepEqual(selects[0], {
				filters: { digest: createSeasonedDigest(messengerValue) },
				fields: ["id", "sub", "verify"],
			});
			await messengerRemove(messengerType, sub, messengerId);
			deepEqual(selects[1], {
				filters: { id: messengerId, sub, type: messengerType },
				fields: ["encryptionKey", "value", "verify"],
			});
		});
	});

	describe("`notifyId`", () => {
		it("Can notify with a custom template id prefix", async () => {
			configure({ notifyId: "contact" });
			const messengerId = await messengerCreate(messengerType, sub, {
				value: messengerValue,
				digest: createSeasonedDigest(messengerValue),
			});
			const { token } = mocks.notifyClient.mock.calls[0].arguments[0].data;
			await messengerVerifyToken(messengerType, sub, token, messengerId);
			await messengerRemove(messengerType, sub, messengerId);

			// no `-create`, it only notifies the account's other verified messengers
			deepEqual(
				mocks.notifyClient.mock.calls.map((call) => call.arguments[0].id),
				[
					`contact-${messengerType}-verify`,
					`contact-${messengerType}-remove-self`,
					`contact-${messengerType}-remove`,
				],
			);
		});
	});

	it("Will not count an expired messenger", async () => {
		const messengerId = await messengerCreate(messengerType, sub, {
			value: messengerValue,
			digest: createSeasonedDigest(messengerValue),
		});
		// verified, so the only thing that can exclude it is the expiry
		await store.update(
			messengerGetOptions().table,
			{ sub, id: messengerId },
			{ verify: nowInSeconds(), expire: nowInSeconds() - 1 },
		);
		equal(await messengerCount(messengerType, sub), 0);
	});

	it("Will count a messenger that has not expired yet", async () => {
		const messengerId = await messengerCreate(messengerType, sub, {
			value: messengerValue,
			digest: createSeasonedDigest(messengerValue),
		});
		await store.update(
			messengerGetOptions().table,
			{ sub, id: messengerId },
			{ verify: nowInSeconds(), expire: nowInSeconds() + 60 },
		);
		const rows = await store.selectList(messengerGetOptions().table, { sub });
		equal(typeof rows[0].expire, "number");
		equal(await messengerCount(messengerType, sub), 1);
	});

	it("Will count a messenger expiring on the current second", async () => {
		// `expire < now` and `expire <= now` differ only when the two are equal,
		// so hand `count` a row whose expiry is the very second it will read.
		// `count` reads the clock immediately after this call returns, so only a
		// tick landing in between could break the tie: step over the boundary
		// first when one is close.
		const calls = [];
		configure({
			store: {
				...store,
				selectList: async (table, filters, fields) => {
					calls.push({ filters, fields });
					const ms = Date.now() % 1000;
					if (ms > 700) await setTimeout(1000 - ms);
					return [{ verify: nowInSeconds(), expire: nowInSeconds() }];
				},
			},
		});
		equal(await messengerCount(messengerType, sub), 1);
		deepEqual(calls[0], {
			filters: { sub, type: messengerType },
			fields: ["verify", "expire"],
		});
	});

	it("Can create a messenger on an account", async () => {
		const messengerId = await messengerCreate(messengerType, sub, {
			value: messengerValue,
			digest: createSeasonedDigest(messengerValue),
		});

		let count = await messengerCount(messengerType, sub);
		equal(count, 0); // unverified

		const { token, expire } =
			mocks.notifyClient.mock.calls[0].arguments[0].data;

		// notify
		deepEqual(mocks.notifyClient.mock.calls[0].arguments[0], {
			id: `messenger-${messengerType}-verify`,
			sub,
			data: { token, expire },
			options: {
				messengers: [{ id: messengerId }],
			},
		});

		let messengerDB = await store.select(messengerGetOptions().table, { sub });
		//let authnDB = await store.select(authnGetOptions().table, { sub });

		equal(messengerDB?.id, messengerId);
		equal(messengerDB.type, messengerType);
		ok(messengerDB.value);
		ok(messengerDB.digest);
		ok(!messengerDB.verify);

		await messengerVerifyToken(messengerType, sub, token, messengerId);

		count = await messengerCount(messengerType, sub);
		equal(count, 1); // verified

		// notify
		equal(mocks.notifyClient.mock.calls.length, 1);

		messengerDB = await store.select(messengerGetOptions().table, { sub });
		equal(messengerDB?.id, messengerId);
		ok(messengerDB.verify);
		const authnDB = await store.select(authnGetOptions().table, { sub });
		ok(!authnDB);
	});

	it("Can create a messenger on an account after re-creating a token", async () => {
		const messengerId = await messengerCreate(messengerType, sub, {
			value: messengerValue,
			digest: createSeasonedDigest(messengerValue),
		});
		await messengerCreateToken(messengerType, sub, messengerId);
		const { token, expire } =
			mocks.notifyClient.mock.calls[1].arguments[0].data;

		// notify
		deepEqual(mocks.notifyClient.mock.calls[1].arguments[0], {
			id: `messenger-${messengerType}-verify`,
			sub,
			data: { token, expire },
			options: {
				messengers: [{ id: messengerId }],
			},
		});

		let messengerDB = await store.select(messengerGetOptions().table, { sub });
		//let authnDB = await store.select(authnGetOptions().table, { sub });

		equal(messengerDB?.id, messengerId);
		equal(messengerDB.type, messengerType);
		ok(messengerDB.value);
		ok(messengerDB.digest);
		ok(!messengerDB.verify);

		await messengerVerifyToken(messengerType, sub, token, messengerId);

		// notify
		equal(mocks.notifyClient.mock.calls.length, 2);

		messengerDB = await store.select(messengerGetOptions().table, { sub });

		equal(messengerDB?.id, messengerId);
		ok(messengerDB.verify);
		const authnDB = await store.select(authnGetOptions().table, { sub });
		ok(!authnDB);
	});
	it("Can create a 2nd messenger on an account, others notified", async () => {
		const messengerId = await messengerCreate(messengerType, sub, {
			value: messengerValue,
			digest: createSeasonedDigest(messengerValue),
		});
		const notifyCall0 = mocks.notifyClient.mock.calls[0].arguments[0].data;

		await messengerVerifyToken(
			messengerType,
			sub,
			notifyCall0.token,
			messengerId,
		);

		await messengerCreate(messengerType, sub, {
			value: messengerValue,
			digest: createSeasonedDigest(messengerValue),
		});
		const notifyCall1 = mocks.notifyClient.mock.calls[1].arguments[0].data;

		await messengerVerifyToken(
			messengerType,
			sub,
			notifyCall1.token,
			messengerId,
		);

		// notify additional messenger
		const notifyCall2 = mocks.notifyClient.mock.calls[2].arguments[0];
		deepEqual(notifyCall2, {
			data: {},
			id: `messenger-${messengerType}-create`,
			options: {
				messengers: [
					{
						id: messengerId,
					},
				],
			},
			sub,
		});
	});
	it("Can create a messenger, on a nth attempt, on an account", async () => {
		const messengerId = await messengerCreate(messengerType, sub, {
			value: messengerValue,
			digest: createSeasonedDigest(messengerValue),
		});

		let messengerDB = await store.select(messengerGetOptions().table, { sub });
		//let authnDB = await store.select(authnGetOptions().table, { sub });

		equal(messengerDB?.id, messengerId);
		equal(messengerDB.type, messengerType);
		ok(messengerDB.value);
		ok(messengerDB.digest);
		ok(!messengerDB.verify);

		await messengerCreate(messengerType, sub, {
			value: messengerValue,
			digest: createSeasonedDigest(messengerValue),
		});

		const { token } = mocks.notifyClient.mock.calls[1].arguments[0].data;

		await messengerVerifyToken(messengerType, sub, token, messengerId);

		// notify
		equal(mocks.notifyClient.mock.calls.length, 2);

		messengerDB = await store.select(messengerGetOptions().table, { sub });
		const authnDB = await store.select(authnGetOptions().table, { sub });
		ok(messengerDB.verify);
		ok(!authnDB);
	});

	it("Can create a messenger on an account when already attempted by anther account", async () => {
		const subOther = "sub_111111";
		await messengerCreate(messengerType, subOther, {
			value: messengerValue,
			digest: createSeasonedDigest(messengerValue),
		});

		const messengerId = await messengerCreate(messengerType, sub, {
			value: messengerValue,
			digest: createSeasonedDigest(messengerValue),
		});
		const { token } = mocks.notifyClient.mock.calls[1].arguments[0].data;
		await messengerVerifyToken(messengerType, sub, token, messengerId);

		const messengerDB = await store.select(messengerGetOptions().table, {
			sub,
		});
		equal(messengerDB?.id, messengerId);
		ok(messengerDB.verify);
	});

	it("Can NOT create a messenger already verified by another account", async () => {
		const subOther = "sub_111111";
		const otherId = await messengerCreate(messengerType, subOther, {
			value: messengerValue,
			digest: createSeasonedDigest(messengerValue),
		});
		const { token } = mocks.notifyClient.mock.calls[0].arguments[0].data;
		await messengerVerifyToken(messengerType, subOther, token, otherId);

		equal(
			await messengerCreate(messengerType, sub, {
				value: messengerValue,
				digest: createSeasonedDigest(messengerValue),
			}),
			undefined,
		);

		// the account that holds the value is told, the one claiming it is not
		equal(mocks.notifyClient.mock.calls.length, 2);
		deepEqual(mocks.notifyClient.mock.calls[1].arguments[0], {
			id: `messenger-${messengerType}-exists`,
			sub: subOther,
			data: {},
			options: { messengers: [{ id: otherId }] },
		});

		// and nothing was stored against the claiming account
		ok(!(await store.select(messengerGetOptions().table, { sub })));
		equal(await messengerCount(messengerType, sub), 0);
		equal(await messengerCount(messengerType, subOther), 1);
	});

	it("Can remove a verified messenger on an account", async () => {
		const messengerId = await messengerCreate(messengerType, sub, {
			value: messengerValue,
			digest: createSeasonedDigest(messengerValue),
		});
		const { token } = mocks.notifyClient.mock.calls[0].arguments[0].data;
		await messengerVerifyToken(messengerType, sub, token, messengerId);
		await messengerRemove(messengerType, sub, messengerId);

		// notify
		deepEqual(mocks.notifyClient.mock.calls[1].arguments[0], {
			id: `messenger-${messengerType}-remove-self`,
			sub,
			data: {},
			options: {
				messengers: [
					{
						type: messengerType,
						value: messengerValue,
					},
				],
			},
		});
		deepEqual(mocks.notifyClient.mock.calls[2].arguments[0], {
			id: `messenger-${messengerType}-remove`,
			sub,
			data: {},
			options: {},
		});

		const messengerDB = await store.select(messengerGetOptions().table, {
			sub,
		});
		ok(!messengerDB);
	});
	it("Can remove an unverified messenger on an account", async () => {
		const messengerId = await messengerCreate(messengerType, sub, {
			value: messengerValue,
			digest: createSeasonedDigest(messengerValue),
		});
		await messengerRemove(messengerType, sub, messengerId);

		// notify
		equal(mocks.notifyClient.mock.calls.length, 1);

		const messengerDB = await store.select(messengerGetOptions().table, {
			sub,
		});

		ok(!messengerDB);
	});
	it("Can NOT remove a messenger of someone elses account", async () => {
		const messengerId = await messengerCreate(messengerType, sub, {
			value: messengerValue,
			digest: createSeasonedDigest(messengerValue),
		});
		await rejects(
			() => messengerRemove(messengerType, "sub_notfound", messengerId),
			"401 Unauthorized",
			{ sub: "sub_notfound", id: messengerId },
		);
		// the owner still has it
		ok(await store.select(messengerGetOptions().table, { sub }));
	});

	it("Can NOT select or remove a messenger with an invalid id", async () => {
		for (const badId of [undefined, "", 0, 1234, null, {}]) {
			await rejects(
				() => messengerSelect(messengerType, sub, badId),
				"404 Not Found",
				{ id: badId, sub },
			);
			await rejects(
				() => messengerRemove(messengerType, sub, badId),
				"404 Not Found",
				{ id: badId, sub },
			);
		}
	});

	describe("`createToken`", () => {
		it("Can NOT create a token without a messenger to send it to", async () => {
			for (const sourceId of [undefined, "", 0, 1234, null, {}]) {
				await rejects(
					() => messengerCreateToken(messengerType, sub, sourceId),
					"404 Not Found",
					{ sub, sourceId },
				);
			}
			// rejected before anything was written or sent
			equal(mocks.notifyClient.mock.calls.length, 0);
			ok(!(await store.select(authnGetOptions().table, { sub })));
		});
	});

	describe("`verifyToken`", () => {
		it("Can NOT verify a token without a messenger to verify", async () => {
			const messengerId = await messengerCreate(messengerType, sub, {
				value: messengerValue,
				digest: createSeasonedDigest(messengerValue),
			});
			const { token } = mocks.notifyClient.mock.calls[0].arguments[0].data;
			for (const sourceId of [undefined, "", 0, 1234, null, {}]) {
				await rejects(
					() => messengerVerifyToken(messengerType, sub, token, sourceId),
					"404 Not Found",
					{ sub, sourceId },
				);
			}
			// the messenger is still unverified and the token still usable
			equal(await messengerCount(messengerType, sub), 0);
			await messengerVerifyToken(messengerType, sub, token, messengerId);
			equal(await messengerCount(messengerType, sub), 1);
		});
	});

	it("Can check is a messenger exists (exists)", async () => {
		const messengerId = await messengerCreate(messengerType, sub, {
			value: messengerValue,
			digest: createSeasonedDigest(messengerValue),
		});
		const { token } = mocks.notifyClient.mock.calls[0].arguments[0].data;
		await messengerVerifyToken(messengerType, sub, token, messengerId);
		const userSub = await messengerExists(messengerType, messengerValue);
		equal(userSub, sub);
	});
	it("Can check is a messenger exists (not exists)", async () => {
		const user = await messengerExists(messengerType, "notfound");
		equal(user, undefined);
	});

	it("Can lookup a messenger { value } (exists)", async () => {
		const messengerId = await messengerCreate(messengerType, sub, {
			value: messengerValue,
			digest: createSeasonedDigest(messengerValue),
		});
		const { token } = mocks.notifyClient.mock.calls[0].arguments[0].data;
		await messengerVerifyToken(messengerType, sub, token, messengerId);
		const messenger = await messengerLookup(messengerType, messengerValue);

		equal(messenger?.value, messengerValue); // unencrypted
	});
	it("Can lookup a messenger (unverified) { value } (exists)", async () => {
		await messengerCreate(messengerType, sub, {
			value: messengerValue,
			digest: createSeasonedDigest(messengerValue),
		});
		const messenger = await messengerLookup(messengerType, messengerValue);
		equal(messenger, undefined);
	});
	it("Can lookup a messenger { value } (not exists)", async () => {
		const messenger = await messengerLookup(messengerType, messengerValue);
		equal(messenger, undefined);
	});
	it("Can select a messenger { id } (unverified)", async () => {
		const messengerId = await messengerCreate(messengerType, sub, {
			value: messengerValue,
			digest: createSeasonedDigest(messengerValue),
		});
		const messenger = await messengerSelect(messengerType, sub, messengerId);
		equal(messenger, undefined);
	});
	it("Can select a messenger { id } (exists)", async () => {
		const messengerId = await messengerCreate(messengerType, sub, {
			value: messengerValue,
			digest: createSeasonedDigest(messengerValue),
		});
		const { token } = mocks.notifyClient.mock.calls[0].arguments[0].data;
		await messengerVerifyToken(messengerType, sub, token, messengerId);
		const messenger = await messengerSelect(messengerType, sub, messengerId);
		equal(messenger?.value, messengerValue);
	});
	it("Can select a messenger { value } (not exists)", async () => {
		const messengerId = "unknown";
		const messenger = await messengerSelect(messengerType, sub, messengerId);
		equal(messenger, undefined);
	});
	it("Can list messengers with { sub }", async () => {
		await messengerCreate(messengerType, sub, {
			value: messengerValue,
			digest: createSeasonedDigest(messengerValue),
		});
		const messengers = await messengerList(messengerType, sub);

		equal(messengers?.[0]?.value, messengerValue); // unencrypted
	});
};
// `try { await fn() } catch (e) { equal(e.message, ...) }` passes silently when
// nothing is thrown, which leaves every throw path untested.
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

describe("messenger", { concurrency: 1 }, () => {
	for (const storeKey of Object.keys(mockStores)) {
		describe(`using store-${storeKey}`, () => {
			tests(mockStores[storeKey]);
		});
	}
});
