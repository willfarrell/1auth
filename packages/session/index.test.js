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
} from "@1auth/account-username";
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
import session, {
	check as sessionCheck,
	create as sessionCreate,
	expire as sessionExpire,
	getOptions as sessionGetOptions,
	list as sessionList,
	lookup as sessionLookup,
	randomId as sessionRandomId,
	randomSessionId as sessionRandomSessionId,
	remove as sessionRemove,
	rotate as sessionRotate,
	select as sessionSelect,
	selectBinding as sessionSelectBinding,
	sign as sessionSign,
	verify as sessionVerify,
} from "./index.js";
import * as mockSessionDynamoDBTable from "./table/dynamodb.js";
import * as mockSessionSQLTable from "./table/sql.js";

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
	//   mocks : {
	// 		...mockNotify,
	//     ...mockPostgres,
	// 		storeAccount: mockAccountSQLTable,
	// 		storeAuthn: mockAuthnSQLTable,
	// 	  storeSession: mockSessionSQLTable,
	//    }
	// },
	sqlite: {
		store: storeSQLite,
		mocks: {
			...mockNotify,
			...mockSQLite,
			storeAccount: mockAccountSQLTable,
			storeAuthn: mockAuthnSQLTable,
			storeSession: mockSessionSQLTable,
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
						storeSession: mockSessionDynamoDBTable,
					},
				},
			}
		: {}),
};

account();
accountUsername();
session();
// *** Setup End *** //

let sub;
let subOther;
let otherSession;
const username = "username";
const usernameOther = "username-other";

const tests = (config) => {
	const store = config.store;
	// Every test that reconfigures has to land back on this baseline.
	// `Object.assign(options, defaults, opt)` re-applies the defaults on each
	// call, so `configure()` with no argument is a full reset.
	const configure = (opt = {}) =>
		session({
			encryptedFields: ["value", "metadata"],
			store,
			notify,
			log: (...args) => {
				mocks.log(...args);
			},
			...opt,
		});

	// `create` is stored in whole seconds, so sessions made in the same second are
	// the same age and which one is "oldest" is arbitrary. Backdating is how a
	// test names an oldest that no store can disagree with.
	const backdate = async (session, seconds) =>
		await store.update(
			sessionGetOptions().table,
			{ sub: session.sub, id: session.id },
			{ create: session.create - seconds },
		);

	const liveSessions = async (sub) => {
		const now = nowInSeconds();
		return (await sessionList(sub)).filter((session) => now <= session.expire);
	};

	test.before(async () => {
		mocks = config.mocks;

		await mocks.storeAccount.create(mocks.storeClient);
		await mocks.storeAuthn.create(mocks.storeClient);
		await mocks.storeSession.create(mocks.storeClient);

		account({ store, notify });
		accountUsername();
		configure();
	});

	test.beforeEach(async (t) => {
		sub = await accountCreate();
		await accountUsernameCreate(sub, username);
		// A second account holding its own session: every filter below has to be
		// narrow enough to ignore it. A widened one returns this row instead of
		// nothing, or counts it into a list.
		subOther = await accountCreate();
		await accountUsernameCreate(subOther, usernameOther);
		otherSession = await sessionCreate(subOther, { os: "Linux" });

		t.mock.method(mocks, "log");
		t.mock.method(mocks, "notifyClient");
	});

	test.afterEach(async (t) => {
		t.mock.reset();
		await accountRemove(sub);
		await accountRemove(subOther);
		await mocks.storeSession.truncate(mocks.storeClient);
		await mocks.storeAuthn.truncate(mocks.storeClient);
		await mocks.storeAccount.truncate(mocks.storeClient);
		configure();
	});

	test.after(async () => {
		await mocks.storeSession.drop(mocks.storeClient);
		await mocks.storeAuthn.drop(mocks.storeClient);
		await mocks.storeAccount.drop(mocks.storeClient);
		mocks.storeClient.after?.();
	});

	describe("config", () => {
		it("Names its table and generated ids after the package id", () => {
			// the shipped defaults, not the ones this suite configures over them
			session({ store, notify });
			const options = sessionGetOptions();
			equal(options.id, "session");
			equal(options.notifyId, "authn-session");
			equal(options.table, "sessions");
			equal(options.idGenerate, true);
			equal(options.log, false);
			equal(options.expire, 12 * 60 * 60);
			equal(options.limit, 10);
			deepEqual(options.encryptedFields, ["value"]);

			const generator = sessionRandomId();
			equal(generator.id, "session");
			equal(generator.type, "id");
			ok(generator.create().startsWith("session_"));

			// the sid is the bearer credential, so it carries more entropy: 128
			// bits over the 62 alphanumerics needs 22 characters
			const sidGenerator = sessionRandomSessionId();
			equal(sidGenerator.id, "session");
			const sid = sidGenerator.create();
			ok(sid.startsWith("sid_"));
			equal(sid.length, "sid_".length + 22);
		});
		it("Encrypts only `value` by default", async () => {
			session({ store, notify });
			const { id, sid } = await sessionCreate(sub, { os: "MacOS" });
			const row = await store.select(sessionGetOptions().table, { sub, id });
			ok(row.value);
			notEqual(row.value, '{"os":"MacOS"}');
			// the digest is what `lookup` matches on, and it is not the sid
			notEqual(row.digest, sid);
			equal(row.digest, createSeasonedDigest(sid));
			// and it still round-trips
			deepEqual((await sessionSelect(sub, id)).value, { os: "MacOS" });
		});
		it("Expires a session 12 hours out", async () => {
			const before = nowInSeconds();
			const { id } = await sessionCreate(sub, { os: "MacOS" });
			const after = nowInSeconds();
			const row = await sessionSelect(sub, id);
			equal(typeof row.expire, "number");
			ok(row.expire >= before + 12 * 60 * 60);
			ok(row.expire <= after + 12 * 60 * 60);
		});
		it("Can decode what it encoded", () => {
			const { encode, decode } = sessionGetOptions();
			deepEqual(decode(encode({ os: "MacOS", ip: "1.2.3.4" })), {
				ip: "1.2.3.4",
				os: "MacOS",
			});
		});
		it("Will leave the id to the store when idGenerate is off", async () => {
			// what reaches the store is the contract: the table would reject a
			// missing id outright, so watch the insert rather than the row
			const inserts = [];
			let generated = 0;
			const recording = {
				...store,
				insert: async (table, params) => {
					// snapshot: `create` overwrites `params.id` with what the store
					// returns, so the live object would not show what was sent
					inserts.push({ ...params });
					return await store.insert(table, {
						...params,
						id: params.id ?? "session_stored",
					});
				},
			};
			const randomId = {
				...sessionRandomId(),
				create: () => {
					generated += 1;
					return "session_counted";
				},
			};
			configure({ store: recording, idGenerate: false, randomId });
			const off = await sessionCreate(sub, { os: "MacOS" });
			// with generation off session names no id, and never asks for one
			equal("id" in inserts[0], false);
			equal(generated, 0);
			equal(off.id, "session_stored");

			configure({ store: recording, randomId });
			await sessionCreate(sub, { os: "iOS" });
			equal(inserts[1].id, "session_counted");
			equal(generated, 1);
		});
		it("Will treat a session as new when `checkMetadata` says so", async () => {
			// the default compares the encoded metadata; swapping it out has to
			// change what counts as a known device, in both directions
			await sessionCreate(sub, { os: "MacOS" });

			// metadata that does not match, but the hook calls it known
			configure({ checkMetadata: () => true });
			await sessionCheck(sub, { os: "Windows" });
			equal(mocks.notifyClient.mock.calls.length, 0);

			// metadata that does match, but the hook calls it new
			configure({ checkMetadata: () => false });
			await sessionCheck(sub, { os: "MacOS" });
			equal(mocks.notifyClient.mock.calls.length, 1);
			equal(
				mocks.notifyClient.mock.calls[0].arguments[0].id,
				"authn-session-new-device",
			);
		});
	});

	describe("`encode`", () => {
		it("Can encode the same value to the same string, at any depth", () => {
			const { encode } = sessionGetOptions();
			equal(
				encode({ os: { version: "15", name: "MacOS" }, ip: "1.2.3.4" }),
				encode({ ip: "1.2.3.4", os: { name: "MacOS", version: "15" } }),
			);
		});
		it("Can encode nested values without dropping them", () => {
			const { encode } = sessionGetOptions();
			equal(
				encode({ os: { name: "MacOS", version: "15" }, ip: "1.2.3.4" }),
				'{"ip":"1.2.3.4","os":{"name":"MacOS","version":"15"}}',
			);
		});
		it("Can encode arrays as arrays, order preserved", () => {
			const { encode } = sessionGetOptions();
			equal(
				encode({ plugins: [{ b: 2, a: 1 }, "z", 1, null] }),
				'{"plugins":[{"a":1,"b":2},"z",1,null]}',
			);
		});
		it("Can encode with ({value:undefined})", () => {
			const { encode } = sessionGetOptions();
			equal(encode(undefined), "{}");
		});
	});

	describe("`lookup`", () => {
		it("Will throw with an invalid sid", async () => {
			for (const sid of badValues) {
				await rejects(() => sessionLookup(sid), "401 Unauthorized", { sid });
			}
		});
		it("Will not answer with another account's session", async () => {
			// the digest filter is the only thing keeping `subOther` out
			equal(await sessionLookup("sid_notfound", { os: "Linux" }), undefined);
			const found = await sessionLookup(otherSession.sid, { os: "Linux" });
			equal(found.sub, subOther);
		});
		it("Will return a session expiring on the current second", async () => {
			// `expire < now` and `expire <= now` differ only when the two are equal.
			// `lookup` reads the clock immediately after the store call, so only a
			// tick landing in between could break the tie: step over the boundary
			// first when one is close.
			const currentDevice = { os: "MacOS" };
			const { id, sid } = await sessionCreate(sub, currentDevice);
			const real = await store.select(sessionGetOptions().table, { sub, id });
			configure({
				store: {
					...store,
					select: async (...args) => {
						const ms = Date.now() % 1000;
						if (ms > 700) await setTimeout(1000 - ms);
						return { ...real, expire: nowInSeconds() };
					},
				},
			});
			ok(await sessionLookup(sid, currentDevice));
		});

		it("Can with { sid, value }", async () => {
			const currentDevice = { os: "MacOS" };
			const { id, sid, expire } = await sessionCreate(sub, currentDevice);
			const session = await sessionLookup(sid, currentDevice);
			ok(session);
			equal(session.id, id);
			equal(session.expire, expire);
		});

		it("Can NOT lookup a session by { sid, value } when different device", async () => {
			const currentDevice = { os: "MacOS" };
			const attackerDevice = { os: "Windows" };
			const { sid } = await sessionCreate(sub, currentDevice);
			const session = await sessionLookup(sid, attackerDevice);
			equal(session, undefined);
		});

		it("Can NOT lookup a session by { sid, value } when the device differs only in a nested value", async () => {
			const currentDevice = {
				os: { name: "MacOS", version: "15" },
				ip: "1.2.3.4",
			};
			const attackerDevice = {
				os: { name: "Windows", version: "11" },
				ip: "1.2.3.4",
			};
			const { sid } = await sessionCreate(sub, currentDevice);
			const session = await sessionLookup(sid, attackerDevice);
			equal(session, undefined);
		});

		it("Can NOT lookup a session by { sid, value } when expired", async () => {
			const currentDevice = { os: "MacOS" };
			const { id, sid } = await sessionCreate(sub, currentDevice);
			await sessionExpire(sub, id);
			const session = await sessionLookup(sid, currentDevice);
			equal(session, undefined);
		});

		it("Can NOT lookup a session by { sid, value } when removed", async () => {
			const currentDevice = { os: "MacOS" };
			const { id, sid } = await sessionCreate(sub, currentDevice);
			await sessionRemove(sub, id);
			const session = await sessionLookup(sid, currentDevice);
			equal(session, undefined);
		});
	});

	describe("`select`", () => {
		it("Will return nothing for an unknown id", async () => {
			equal(await sessionSelect(sub, "session_doesnotexist"), undefined);
		});
		it("Will throw with an invalid sub", async () => {
			const { id } = await sessionCreate(sub, {});
			for (const badSub of badValues) {
				await rejects(() => sessionSelect(badSub, id), "401 Unauthorized", {
					sub: badSub,
					id,
				});
			}
		});
		it("Will throw with an invalid id", async () => {
			for (const badId of badValues) {
				await rejects(() => sessionSelect(sub, badId), "404 Not Found", {
					id: badId,
					sub,
				});
			}
		});
		it("Can with { sub, id }", async () => {
			const { id } = await sessionCreate(sub, {});
			const session = await sessionSelect(sub, id);
			equal(session.id, id);
			ok(session.expire);
		});
		it("Will not reach across accounts", async () => {
			const { id } = await sessionCreate(sub, {});
			equal(await sessionSelect(subOther, id), undefined);
			equal(await sessionSelect(sub, otherSession.id), undefined);
		});
	});

	describe("`list`", () => {
		it("Will throw with an invalid sub", async () => {
			for (const badSub of badValues) {
				await rejects(() => sessionList(badSub), "401 Unauthorized", {
					sub: badSub,
				});
			}
		});

		it("Can list sessions for an account, additional fields", async () => {
			const currentDevice = { os: "MacOS" };
			const currentFields = { metadata: "Toronto, Ontario, Canada" };
			await sessionCreate(sub, currentDevice, currentFields);

			const sessions = await sessionList(sub);
			deepEqual(sessions[0].metadata, currentFields.metadata);
		});
		it("Can list sessions for an account, including expired", async () => {
			const currentDevice = { os: "MacOS" };
			const otherDevice = { os: "iOS" };
			await sessionCreate(sub, currentDevice);
			const { id } = await sessionCreate(sub, otherDevice);
			await sessionExpire(sub, id);

			const sessions = await sessionList(sub);
			equal(sessions.length, 2);
			// the neighbouring account is not swept in
			equal((await sessionList(subOther)).length, 1);
		});

		it("Can list sessions for an account, excluding removed", async () => {
			const currentDevice = { os: "MacOS" };
			const otherDevice = { os: "iOS" };
			await sessionCreate(sub, currentDevice);
			const { id } = await sessionCreate(sub, otherDevice);
			await sessionRemove(sub, id);

			const sessions = await sessionList(sub);
			equal(sessions.length, 1);
		});
	});

	describe("`create`", () => {
		it("Will throw with an invalid sub", async () => {
			for (const badSub of badValues) {
				await rejects(() => sessionCreate(badSub, {}), "401 Unauthorized", {
					sub: badSub,
				});
			}
		});
		it("Will throw without a value", async () => {
			for (const value of [undefined, "", 0, null]) {
				await rejects(() => sessionCreate(sub, value), "400 Bad Request", {
					sub,
				});
			}
			// nothing was written for a call that never got past the guard
			equal((await sessionList(sub)).length, 0);
		});
		it("Can with { sub, value }", async () => {
			const currentDevice = { os: "MacOS" };
			const { id, expire } = await sessionCreate(sub, currentDevice);
			const session = await sessionSelect(sub, id);
			ok(session);
			equal(session.id, id);
			equal(session.expire, expire);
		});
		it("Can with { sub, value, values }", async () => {
			const currentDevice = { os: "MacOS" };
			const currentFields = { metadata: "Toronto, Ontario, Canada" };
			const { id, expire } = await sessionCreate(
				sub,
				currentDevice,
				currentFields,
			);
			const session = await sessionSelect(sub, id);
			ok(session);
			equal(session.id, id);
			equal(session.expire, expire);
			equal(session.metadata, currentFields.metadata);
		});

		it("Can create session on an account", async () => {
			const currentDevice = { os: "MacOS" };

			await sessionCheck(sub, currentDevice);
			await sessionCreate(sub, currentDevice);
			// notify
			equal(mocks.notifyClient.mock.calls.length, 1);
			deepEqual(mocks.notifyClient.mock.calls[0].arguments[0], {
				id: "authn-session-new-device",
				sub,
				data: {},
				options: {},
			});
		});
		it("Can notify with a custom template id prefix", async () => {
			configure({ notifyId: "authn-web-session" });
			await sessionCheck(sub, { os: "MacOS" });
			equal(
				mocks.notifyClient.mock.calls[0].arguments[0].id,
				"authn-web-session-new-device",
			);
		});
		it("Can create session on an account from same device", async () => {
			const pastDevice = { os: "MacOS" };
			const currentDevice = { os: "MacOS" };
			await sessionCreate(sub, pastDevice);

			await sessionCheck(sub, currentDevice);
			await sessionCreate(sub, currentDevice);
			// notify
			equal(mocks.notifyClient.mock.calls.length, 0);
		});
		it("Can create session on an account from a new device", async () => {
			const pastDevice = { os: "Windows" };
			const currentDevice = { os: "MacOS" };
			await sessionCreate(sub, pastDevice);

			await sessionCheck(sub, currentDevice);
			await sessionCreate(sub, currentDevice);

			// notify
			equal(mocks.notifyClient.mock.calls.length, 1);
			deepEqual(mocks.notifyClient.mock.calls[0].arguments[0], {
				id: "authn-session-new-device",
				sub,
				data: {},
				options: {},
			});
		});
		it("Can create session on an account from a new device that differs only in a nested value", async () => {
			const pastDevice = { os: { name: "Windows", version: "11" } };
			const currentDevice = { os: { name: "MacOS", version: "15" } };
			await sessionCreate(sub, pastDevice);

			await sessionCheck(sub, currentDevice);
			await sessionCreate(sub, currentDevice);

			// notify
			equal(mocks.notifyClient.mock.calls.length, 1);
			deepEqual(mocks.notifyClient.mock.calls[0].arguments[0], {
				id: "authn-session-new-device",
				sub,
				data: {},
				options: {},
			});
		});
	});

	describe("`limit`", () => {
		it("Will cap an account at ten live sessions by default", async () => {
			const currentDevice = { os: "MacOS" };
			const first = await sessionCreate(sub, currentDevice);
			await backdate(first, 60);
			for (let i = 0; i < 9; i++) {
				await sessionCreate(sub, currentDevice);
			}
			const eleventh = await sessionCreate(sub, currentDevice);

			equal((await liveSessions(sub)).length, 10);
			equal(await sessionLookup(first.sid, currentDevice), undefined);
			ok(await sessionLookup(eleventh.sid, currentDevice));
		});
		it("Will keep every session live below the limit", async () => {
			configure({ limit: 3 });
			const currentDevice = { os: "MacOS" };
			const first = await sessionCreate(sub, currentDevice);
			const second = await sessionCreate(sub, currentDevice);

			ok(await sessionLookup(first.sid, currentDevice));
			ok(await sessionLookup(second.sid, currentDevice));
		});
		it("Will not count an already expired session toward the limit", async () => {
			configure({ limit: 3 });
			const currentDevice = { os: "MacOS" };
			const first = await sessionCreate(sub, currentDevice);
			const second = await sessionCreate(sub, currentDevice);
			const third = await sessionCreate(sub, currentDevice);
			// the dead row stays in the table, so a count of rows is not a count of
			// live sessions
			await sessionExpire(sub, third.id);

			const fourth = await sessionCreate(sub, currentDevice);
			ok(await sessionLookup(first.sid, currentDevice));
			ok(await sessionLookup(second.sid, currentDevice));
			ok(await sessionLookup(fourth.sid, currentDevice));
		});
		it("Will expire the oldest session once the limit is reached", async () => {
			configure({ limit: 2 });
			const currentDevice = { os: "MacOS" };
			const first = await sessionCreate(sub, currentDevice);
			await backdate(first, 60);
			const second = await sessionCreate(sub, currentDevice);
			const third = await sessionCreate(sub, currentDevice);

			equal(await sessionLookup(first.sid, currentDevice), undefined);
			ok(await sessionLookup(second.sid, currentDevice));
			ok(await sessionLookup(third.sid, currentDevice));
			equal((await liveSessions(sub)).length, 2);
		});
		it("Will expire down to the limit when the limit is lowered", async () => {
			const currentDevice = { os: "MacOS" };
			// four sessions predate the cap, so one eviction is not enough to get
			// back under it
			const first = await sessionCreate(sub, currentDevice);
			const second = await sessionCreate(sub, currentDevice);
			const third = await sessionCreate(sub, currentDevice);
			const fourth = await sessionCreate(sub, currentDevice);
			await backdate(first, 40);
			await backdate(second, 30);
			await backdate(third, 20);
			await backdate(fourth, 10);

			configure({ limit: 2 });
			const fifth = await sessionCreate(sub, currentDevice);
			equal((await liveSessions(sub)).length, 2);
			equal(await sessionLookup(first.sid, currentDevice), undefined);
			ok(await sessionLookup(fourth.sid, currentDevice));
			ok(await sessionLookup(fifth.sid, currentDevice));
		});
		it("Will soft expire the evicted session, leaving the row in place", async () => {
			configure({ limit: 2 });
			const currentDevice = { os: "MacOS" };
			const first = await sessionCreate(sub, currentDevice);
			await backdate(first, 60);
			await sessionCreate(sub, currentDevice);
			await sessionCreate(sub, currentDevice);

			// an eviction has to read like any other expiry, so the DBSC binding on
			// the row and everything downstream behaves the way it already does
			const evicted = await sessionSelect(sub, first.id);
			ok(evicted);
			ok(evicted.expire < nowInSeconds());
			equal(await sessionLookup(first.sid, currentDevice), undefined);
		});
		it("Will not cap anything when the limit is falsy", async () => {
			// a limit of nothing has to read as no enforcement, never as a cap of
			// zero that expires a session the moment it is made
			configure({ limit: 0 });
			const currentDevice = { os: "MacOS" };
			const first = await sessionCreate(sub, currentDevice);
			await backdate(first, 60);
			const second = await sessionCreate(sub, currentDevice);
			const third = await sessionCreate(sub, currentDevice);

			equal((await liveSessions(sub)).length, 3);
			ok(await sessionLookup(first.sid, currentDevice));
			ok(await sessionLookup(second.sid, currentDevice));
			ok(await sessionLookup(third.sid, currentDevice));
		});
		it("Will read only the fields the count needs", async () => {
			// the cap costs one extra read on every create, so it must not drag an
			// account's encrypted values and keys back for rows it only counts
			const selects = [];
			configure({
				limit: 2,
				store: {
					...store,
					selectList: async (table, filters, fields) => {
						selects.push({ filters, fields });
						return await store.selectList(table, filters, fields);
					},
				},
			});
			await sessionCreate(sub, { os: "MacOS" });
			deepEqual(selects[0], {
				filters: { sub },
				fields: ["id", "create", "expire"],
			});
		});
		it("Will expire by oldest `create`, not by the order the store lists", async () => {
			configure({ limit: 2 });
			const currentDevice = { os: "MacOS" };
			const first = await sessionCreate(sub, currentDevice);
			const second = await sessionCreate(sub, currentDevice);
			// backdating the newer row makes `create` disagree with both the list
			// order and the id order, which is the only way to tell them apart
			await backdate(second, 60);

			await sessionCreate(sub, currentDevice);
			ok(await sessionLookup(first.sid, currentDevice));
			equal(await sessionLookup(second.sid, currentDevice), undefined);
		});
	});

	describe("`check`", () => {
		it("Will throw with an invalid sub", async () => {
			for (const badSub of badValues) {
				await rejects(() => sessionCheck(badSub), "401 Unauthorized", {
					sub: badSub,
				});
			}
		});
		it("Will not match against another account's session", async () => {
			// `subOther` already holds a Linux session; matching on it would
			// silently skip the new-device notice
			await sessionCheck(sub, { os: "Linux" });
			equal(mocks.notifyClient.mock.calls.length, 1);
		});
	});

	describe("`expire`", () => {
		it("Will throw with an invalid sub", async () => {
			const { id } = await sessionCreate(sub, {});
			for (const badSub of badValues) {
				await rejects(() => sessionExpire(badSub, id), "401 Unauthorized", {
					sub: badSub,
					id,
				});
			}
		});
		it("Will throw with an invalid id", async () => {
			for (const badId of badValues) {
				await rejects(() => sessionExpire(sub, badId), "404 Not Found", {
					id: badId,
					sub,
				});
			}
		});
		it("Will put `expire` behind the clock and leave the neighbour alone", async () => {
			const { id, sid } = await sessionCreate(sub, { os: "MacOS" });
			await sessionExpire(sub, id);
			const row = await sessionSelect(sub, id);
			equal(typeof row.expire, "number");
			ok(row.expire < nowInSeconds());
			equal(await sessionLookup(sid, { os: "MacOS" }), undefined);
			ok(await sessionLookup(otherSession.sid, { os: "Linux" }));
		});
	});

	describe("`remove`", () => {
		it("Will throw with an invalid sub", async () => {
			const { id } = await sessionCreate(sub, {});
			for (const badSub of badValues) {
				await rejects(() => sessionRemove(badSub, id), "401 Unauthorized", {
					sub: badSub,
					id,
				});
			}
		});
		it("Will throw with an invalid id", async () => {
			for (const badId of badValues) {
				await rejects(() => sessionRemove(sub, badId), "404 Not Found", {
					id: badId,
					sub,
				});
			}
		});
		it("Will remove only the named session", async () => {
			const { id } = await sessionCreate(sub, { os: "MacOS" });
			await sessionCreate(sub, { os: "iOS" });
			await sessionRemove(sub, id);
			equal((await sessionList(sub)).length, 1);
			equal((await sessionList(subOther)).length, 1);
		});
	});

	// A device key rides on the session row, `@1auth/session-dbsc` puts it there
	const publicKey = JSON.stringify({
		kty: "EC",
		crv: "P-256",
		x: "GsDdKsF5LFYNoT4CxIz5eXRIzUXWJ_yzHmQQZFvGHDo",
		y: "u5MFPFpHKtLGjnRJZ0aKvJZOsBnhLYnMDhAWJHiOFVQ",
	});

	describe("`selectBinding`", () => {
		it("Will throw with an invalid id", async () => {
			for (const id of badValues) {
				await rejects(() => sessionSelectBinding(id), "404 Not Found", { id });
			}
		});
		it("Will read back a fixed, narrow field list", async () => {
			// `id` travels in a plaintext header, so this projection is the thing
			// keeping the encrypted value and its key out of the response
			const selects = [];
			configure({
				store: {
					...store,
					select: async (table, filters, fields) => {
						selects.push({ filters, fields });
						return await store.select(table, filters, fields);
					},
				},
			});
			const { id } = await sessionCreate(sub, { os: "MacOS" }, { publicKey });
			await sessionSelectBinding(id);
			deepEqual(selects[0], {
				filters: { id },
				fields: ["id", "sub", "publicKey", "create", "expire"],
			});
		});
		it("Can with { id }, without a sub", async () => {
			const { id } = await sessionCreate(sub, { os: "MacOS" }, { publicKey });
			const binding = await sessionSelectBinding(id);
			equal(binding.id, id);
			equal(binding.sub, sub);
			equal(binding.publicKey, publicKey);
			ok(binding.create);
			ok(binding.expire);
		});
		// `id` travels in the plaintext Sec-Session-Id header, unlike `sid`
		it("Can NOT leak `value`, `digest` or `encryptionKey`", async () => {
			const { id } = await sessionCreate(sub, { os: "MacOS" }, { publicKey });
			const binding = await sessionSelectBinding(id);
			equal(binding.value, undefined);
			equal(binding.digest, undefined);
			equal(binding.encryptionKey, undefined);
		});
		it("Can return undefined for an unknown id", async () => {
			equal(await sessionSelectBinding("session_unknown"), undefined);
		});
		it("Can read an unbound session, with no publicKey", async () => {
			const { id } = await sessionCreate(sub, { os: "MacOS" });
			const binding = await sessionSelectBinding(id);
			equal(binding.id, id);
			ok(!binding.publicKey);
		});
	});

	describe("`rotate`", () => {
		it("Will throw with an invalid sub", async () => {
			for (const badSub of badValues) {
				await rejects(
					() => sessionRotate(badSub, "session_1", {}),
					"401 Unauthorized",
					{ sub: badSub, id: "session_1" },
				);
			}
		});
		it("Will throw with an invalid id", async () => {
			for (const badId of badValues) {
				await rejects(() => sessionRotate(sub, badId, {}), "404 Not Found", {
					id: badId,
					sub,
				});
			}
		});
		it("Can keep { id, publicKey, create } and replace { sid, digest, expire }", async () => {
			const currentDevice = { os: "MacOS" };
			const { id, sid, digest } = await sessionCreate(sub, currentDevice, {
				publicKey,
			});
			const before = await sessionSelectBinding(id);

			const rotated = await sessionRotate(sub, id, currentDevice);
			equal(rotated.id, id);
			ok(rotated.sid);
			notEqual(rotated.sid, sid);
			notEqual(rotated.digest, digest);

			const after = await sessionSelectBinding(id);
			equal(after.id, id);
			equal(after.publicKey, publicKey);
			equal(after.create, before.create);
		});
		it("Can invalidate the previous sid", async () => {
			const currentDevice = { os: "MacOS" };
			const { id, sid } = await sessionCreate(sub, currentDevice, {
				publicKey,
			});
			const rotated = await sessionRotate(sub, id, currentDevice);
			ok(await sessionLookup(rotated.sid, currentDevice));
			equal(await sessionLookup(sid, currentDevice), undefined);
		});
		// The refresh case: the cookie is meant to be dead by the time this runs
		it("Will NOT rotate an expired session back into use", async () => {
			const currentDevice = { os: "MacOS" };
			const { id, sid } = await sessionCreate(sub, currentDevice, {
				publicKey,
			});
			await sessionExpire(sub, id);
			equal(await sessionLookup(sid, currentDevice), undefined);

			// `expire` is the absolute cap, so rotate mints a fresh `sid` but must
			// leave the session dead. Resurrecting here would mean a session that
			// keeps refreshing never ends.
			const rotated = await sessionRotate(sub, id, currentDevice);
			equal(await sessionLookup(rotated.sid, currentDevice), undefined);
			equal((await sessionList(sub)).length, 1);
		});
		it("Will not extend `expire` on rotate", async () => {
			const currentDevice = { os: "MacOS" };
			const { id } = await sessionCreate(sub, currentDevice, { publicKey });
			const before = await sessionSelect(sub, id);
			const rotated = await sessionRotate(sub, id, currentDevice);
			const after = await sessionSelect(sub, id);
			equal(after.expire, before.expire);
			// the cookie rotated even though the cap did not move
			ok(await sessionLookup(rotated.sid, currentDevice));
		});
		it("Can carry additional values", async () => {
			const currentDevice = { os: "MacOS" };
			const { id } = await sessionCreate(sub, currentDevice, { publicKey });
			await sessionRotate(sub, id, currentDevice, {
				metadata: "Toronto, Ontario, Canada",
			});
			const session = await sessionSelect(sub, id);
			equal(session.metadata, "Toronto, Ontario, Canada");
		});
	});

	it("Can `sign`/`verify` a sid", async () => {
		const currentDevice = { os: "MacOS" };
		const { sid } = await sessionCreate(sub, currentDevice);
		const cookie = sessionSign(sid);
		const verify = sessionVerify(cookie);
		ok(verify);
	});
};

// A falsy case alone leaves `typeof value !== "string"` untested, and a
// wrong-type case alone leaves the falsy half untested
const badValues = [undefined, "", 0, 1234, null, {}];

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

describe("session", { concurrency: 1 }, () => {
	for (const storeKey of Object.keys(mockStores)) {
		describe(`using store-${storeKey}`, () => {
			tests(mockStores[storeKey]);
		});
	}
});
