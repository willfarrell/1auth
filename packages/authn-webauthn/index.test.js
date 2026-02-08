import { deepEqual, equal, ok } from "node:assert/strict";
import { describe, it, test } from "node:test";
import account, {
	create as accountCreate,
	remove as accountRemove,
} from "../account/index.js";
// import * as mockAccountDynamoDBTable from "../account/table/dynamodb.js";
import * as mockAccountSQLTable from "../account/table/sql.js";
import accountUsername, {
	create as accountUsernameCreate,
	exists as accountUsernameExists,
} from "../account-username/index.js";
import authn, { getOptions as authnGetOptions } from "../authn/index.js";
// import * as mockAuthnDynamoDBTable from "../authn/table/dynamodb.js";
import * as mockAuthnSQLTable from "../authn/table/sql.js";
import webauthn, {
	authenticate as webauthnAuthenticate,
	count as webauthnCount,
	create as webauthnCreate,
	createChallenge as webauthnCreateChallenge,
	expire as webauthnExpire,
	getOptions as webauthnGetOptions,
	list as webauthnList,
	remove as webauthnRemove,
	select as webauthnSelect,
	verify as webauthnVerify,
} from "../authn-webauthn/index.js";
import crypto, {
	randomChecksumPepper,
	randomChecksumSalt,
	symmetricDecrypt,
	symmetricEncrypt,
	symmetricRandomEncryptionKey,
	symmetricRandomSignatureSecret,
} from "../crypto/index.js";
// *** Setup Start *** //
import * as notify from "../notify/index.js";
import * as mockNotify from "../notify/mock.js";
import * as storeDynamoDB from "../store-dynamodb/index.js";
import * as storePostgres from "../store-postgres/index.js";
import * as storeSQLite from "../store-sqlite/index.js";
// import * as mockDynamoDB from "../store-dynamodb/mock.js";
// import * as mockPostgres from "../store-postgres/mock.js";
import * as mockSQLite from "../store-sqlite/mock.js";

crypto({
	symmetricEncryptionKey: symmetricRandomEncryptionKey(),
	symmetricSignatureSecret: symmetricRandomSignatureSecret(),
	digestChecksumSalt: randomChecksumSalt(),
	digestChecksumPepper: randomChecksumPepper(),
	secretTimeCost: 1,
	secretMemoryCost: 2 ** 3,
	secretParallelism: 1,
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
	//    }
	// },
	sqlite: {
		store: storeSQLite,
		mocks: {
			...mockNotify,
			...mockSQLite,
			storeAccount: mockAccountSQLTable,
			storeAuthn: mockAuthnSQLTable,
		},
	},
	// TODO
	// dynamodb: {
	//   store: storeDynamoDB,
	//   mocks :{
	// 		...mockNotify,
	// 	  ...mockDynamoDB,
	// 		storeAccount: mockAccountDynamoDBTable,
	// 		storeAuthn: mockAuthnDynamoDBTable,
	//    }
	// },
};

account();
accountUsername();
authn();
webauthn();
// *** Setup End *** //

let sub;
const username = "username";
const webauthnName = "1Auth";
const webauthnOrigin = "http://localhost";

const tests = (config) => {
	const store = config.store;

	test.before(async () => {
		mocks = config.mocks;

		await mocks.storeAccount.create(mocks.storeClient);
		await mocks.storeAuthn.create(mocks.storeClient);

		account({ store, notify });
		accountUsername();
		authn({
			store,
			notify,
			encryptedFields: ["value", "name"],
			usernameExists: [accountUsernameExists],
			authenticationDuration: 0,
			// log: (...args) => {
			// mocks.log(...args);
			// },
		});
		webauthn({
			name: webauthnName,
			origin: webauthnOrigin,
			log: (...args) => {
				mocks.log(...args);
			},
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
		await mocks.storeAuthn.truncate(mocks.storeClient);
		await mocks.storeAccount.truncate(mocks.storeClient);
	});

	test.after(async () => {
		await mocks.storeAuthn.drop(mocks.storeClient);
		await mocks.storeAccount.drop(mocks.storeClient);
		mocks.storeClient.after?.();
	});

	describe("`count`", () => {
		it("Will throw with ({sub:undefined})", async () => {
			try {
				await webauthnCount(undefined);
			} catch (e) {
				equal(e.message, "401 Unauthorized");
			}
		});
		it("Can count with { sub }", async () => {
			await webauthnCreate(sub);
			const [token] = await store.selectList(authnGetOptions().table, { sub });
			await overrideCreateChallenge(sub, token);
			await webauthnVerify(
				sub,
				registrationResponse,
				{ name: "PassKey" },
				false,
			);
			const count = await webauthnCount(sub);
			equal(count, 1);
		});
		it("Can count with { sub } (unverified)", async () => {
			await webauthnCreate(sub);
			const count = await webauthnCount(sub);
			equal(count, 0);
		});
	});

	describe("`list`", () => {
		it("Will throw with ({sub:undefined})", async () => {
			try {
				await webauthnList(undefined);
			} catch (e) {
				equal(e.message, "401 Unauthorized");
			}
		});
		it("Can list an WebAuthn with { sub } (exists)", async () => {
			await webauthnCreate(sub);
			const [token] = await store.selectList(authnGetOptions().table, { sub });
			await overrideCreateChallenge(sub, token);
			await webauthnVerify(
				sub,
				registrationResponse,
				{ name: "PassKey" },
				false,
			);
			const row = await webauthnList(sub);
			equal(row.length, 1);
		});
		it("Can list an WebAuthn with { sub } (not exists)", async () => {
			const row = await webauthnList(sub);
			equal(row.length, 0);
		});
	});

	describe("`select`", () => {
		it("Will throw with ({sub:undefined})", async () => {
			try {
				await webauthnSelect(undefined, "id");
			} catch (e) {
				equal(e.message, "401 Unauthorized");
			}
		});
		it("Will throw with ({id:undefined})", async () => {
			try {
				await webauthnSelect(sub, undefined);
			} catch (e) {
				equal(e.message, "404 Not Found");
			}
		});
		it("Can select an WebAuthn with { id } (exists)", async () => {
			await webauthnCreate(sub); // TODO id is undefined
			const [token] = await store.selectList(authnGetOptions().table, { sub });
			await overrideCreateChallenge(sub, token);
			const { id } = await webauthnVerify(
				sub,
				registrationResponse,
				{ name: "PassKey" },
				false,
			);

			const row = await webauthnSelect(sub, id);
			ok(row);
		});
		it("Can select an WebAuthn with { id } (not exists)", async () => {
			const row = await webauthnSelect(sub, "authn_000");
			equal(row, undefined);
		});
	});

	describe("`create`", () => {
		it("Will throw with ({sub:undefined})", async () => {
			try {
				await webauthnCreate(undefined);
			} catch (e) {
				equal(e.message, "401 Unauthorized");
			}
		});
	});

	describe("`verify`", () => {
		it("Will throw with ({sub:undefined})", async () => {
			try {
				await webauthnVerify(undefined);
			} catch (e) {
				equal(e.message, "401 Unauthorized");
			}
		});
	});

	describe("`authenticate`", () => {
		it("Will throw when no credentials", async () => {
			try {
				await webauthnAuthenticate(username, {});
			} catch (e) {
				equal(e.message, "401 Unauthorized");
				equal(e.cause, "missing");
			}
		});
		// it("Will throw when unverfied credentials", async () => {
		// 	await webauthnCreate(sub);
		//    try {
		//      await webauthnAuthenticate(username, {});
		//    } catch(e) {
		//      equal(e.message, '401 Unauthorized')
		//      equal(e.cause, 'missing')
		//    }
		// });
		// it("Will throw when expired credentials", async () => {
		//    const { id } = await webauthnCreate(sub);
		//    await store.update(authnGetOptions().table, { sub, id }, {verify:1})
		//    await webauthnExpire(sub, id);
		//    try {
		//      await webauthnAuthenticate(username, {});
		//    } catch(e) {
		//      equal(e.message, '401 Unauthorized')
		//      equal(e.cause, 'expired')
		//    }
		//  });
	});

	describe("`expire`", () => {
		it("Will throw with ({sub:undefined})", async () => {
			try {
				await webauthnExpire(undefined, "id");
			} catch (e) {
				equal(e.message, "401 Unauthorized");
			}
		});
		it("Will throw with ({id:undefined})", async () => {
			try {
				await webauthnExpire(sub, undefined);
			} catch (e) {
				equal(e.message, "404 Not Found");
			}
		});
	});

	describe("`remove`", () => {
		it("Will throw with ({sub:undefined})", async () => {
			try {
				await webauthnRemove(undefined, "id");
			} catch (e) {
				equal(e.message, "401 Unauthorized");
			}
		});
		it("Will throw with ({id:undefined})", async () => {
			try {
				await webauthnRemove(sub, undefined);
			} catch (e) {
				equal(e.message, "404 Not Found");
			}
		});
	});

	it("Can create WebAuthn on an account", async () => {
		// Registration
		const { secret: registrationOptions } = await webauthnCreate(sub);

		equal(registrationOptions.challenge.length, 43);
		equal(registrationOptions.rp.name, webauthnName);
		equal(registrationOptions.rp.id, webauthnOrigin.substring(7));
		ok(registrationOptions.user.id);
		equal(registrationOptions.user.name, username);
		deepEqual(registrationOptions.authenticatorSelection, {
			residentKey: "discouraged",
			userVerification: "preferred",
			requireResidentKey: false,
		});
		deepEqual(registrationOptions.excludeCredentials, []);

		let authnDB = await store.selectList(authnGetOptions().table, { sub });
		equal(authnDB.length, 1);
		const token = authnDB[0];
		equal(token.type, "WebAuthn-token");
		equal(token.otp, true);
		equal(token.value.length, 321);
		ok(token.expire);

		await overrideCreateChallenge(sub, token);
		let count = await webauthnCount(sub);
		equal(count, 0);

		await webauthnVerify(sub, registrationResponse, { name: "PassKey" });

		deepEqual(mocks.notifyClient.mock.calls[0].arguments[0], {
			id: "authn-webauthn-create",
			sub,
			data: undefined,
			options: {},
		});

		authnDB = await store.selectList(authnGetOptions().table, { sub });
		equal(authnDB.length, 1);
		const secret = authnDB[0];
		equal(secret.type, "WebAuthn-secret");
		equal(secret.otp, false);
		equal(secret.value.length, 1741);
		equal(secret.expire, null);

		count = await webauthnCount(sub);
		equal(count, 1);

		// Authentication
		const { secret: authenticationOptions } =
			await webauthnCreateChallenge(sub);
		equal(authenticationOptions.challenge.length, 43);
		equal(authenticationOptions.rpId, webauthnOrigin.substring(7));
		deepEqual(authenticationOptions.userVerification, "preferred");
		deepEqual(authenticationOptions.allowCredentials, [
			{
				id: registrationResponse.id,
				type: "public-key",
			},
		]);

		authnDB = await store.selectList(authnGetOptions().table, { sub });
		equal(authnDB.length, 2);
		const challenge = authnDB[1];
		equal(challenge.type, "WebAuthn-challenge");
		equal(challenge.otp, true);
		equal(challenge.value.length, 1977);
		ok(challenge.expire);

		// Override authentication challenge
		await overrideGetChallenge(sub, challenge);

		const userSub = await webauthnAuthenticate(
			username,
			authenticationResponse,
		);
		equal(userSub, sub);

		authnDB = await store.selectList(authnGetOptions().table, { sub });
		equal(authnDB.length, 2);
		authnDB = authnDB.filter((item) => !item.expire);
		equal(authnDB.length, 1);
	});
	it("Can create a 2nd WebAuthn on an account", async () => {
		await webauthnCreate(sub);
		const db0 = await store.selectList(authnGetOptions().table, { sub });
		await overrideCreateChallenge(sub, db0[0]);
		await webauthnVerify(sub, registrationResponse, { name: "PassKey" });

		// TODO finish
		// await webauthnCreate(sub);
		// const [token] = await store.selectList(authnGetOptions().table, { sub });
		// await overrideCreateChallenge(sub, token);
		// await webauthnVerify(sub, registrationResponse, { name: "Yubikey" });

		// let count = await webauthnCount(sub);
		// equal(count, 2);
	});
	it("Can remove WebAuthn on an account", async () => {
		await webauthnCreate(sub);
		const [token] = await store.selectList(authnGetOptions().table, { sub });
		await overrideCreateChallenge(sub, token);
		await webauthnVerify(sub, registrationResponse, { name: "PassKey" });

		await webauthnRemove(sub, token.id);
		let authnDB = await store.selectList(authnGetOptions().table, { sub });
		equal(authnDB.length, 1);
		authnDB = authnDB.filter((item) => !!item.expire);
		equal(authnDB.length, 0);

		// notify
		deepEqual(mocks.notifyClient.mock.calls[1].arguments[0], {
			id: "authn-webauthn-remove",
			sub,
			data: undefined,
			options: {},
		});

		try {
			await webauthnAuthenticate(username, authenticationResponse);
		} catch (e) {
			equal(e.message, "401 Unauthorized");
			deepEqual(e.message, "401 Unauthorized", { cause: "missing" });
		}
	});

	it("Can NOT create a challenge before a credential is verified", async () => {
		await webauthnCreate(sub);
		const { secret } = await webauthnCreateChallenge(sub);

		equal(secret, undefined);
	});
	it("Can NOT remove WebAuthn from someone elses account", async () => {
		const secret = await webauthnCreate(sub);
		const [token] = await store.selectList(authnGetOptions().table, { sub });
		await overrideCreateChallenge(sub, token);
		await webauthnVerify(sub, registrationResponse, { name: "PassKey" }, false);

		await webauthnRemove("sub_1111111", secret.id);
		const authnDB = await store.selectList(authnGetOptions().table, { sub });

		ok(authnDB);
		equal(authnDB.length, 1);
	});

	describe("with custom options", () => {
		let originalOptions;

		test.before(() => {
			originalOptions = { ...webauthnGetOptions() };
		});

		test.afterEach(() => {
			webauthn(originalOptions);
		});

		it("Can create WebAuthn with residentKey and userVerification options", async () => {
			webauthn({
				...originalOptions,
				residentKey: "preferred",
				userVerification: "required",
			});

			const { secret: registrationOptions } = await webauthnCreate(sub);

			deepEqual(registrationOptions.authenticatorSelection, {
				residentKey: "preferred",
				userVerification: "required",
				requireResidentKey: false,
			});
		});

		it("Can create WebAuthn with preferredAuthenticatorType option", async () => {
			webauthn({
				...originalOptions,
				preferredAuthenticatorType: "localDevice",
			});

			const { secret: registrationOptions } = await webauthnCreate(sub);

			deepEqual(registrationOptions.hints, ["client-device"]);
			deepEqual(registrationOptions.authenticatorSelection, {
				residentKey: "discouraged",
				userVerification: "preferred",
				requireResidentKey: false,
				authenticatorAttachment: "platform",
			});
		});
	});

	const overrideCreateChallenge = async (sub, token) => {
		await store.update(
			authnGetOptions().table,
			{ sub, id: token.id },
			{
				value: symmetricEncrypt(
					JSON.stringify({
						expectedChallenge: registrationOptionsOverride.challenge,
						expectedOrigin: webauthnOrigin,
						expectedRPID: registrationOptionsOverride.rp.id,
						requireUserVerification: true,
					}),
					{
						sub,
						encryptedKey: token.encryptionKey,
					},
				),
			},
		);
	};

	const overrideGetChallenge = async (sub, challenge) => {
		await store.update(
			authnGetOptions().table,
			{ sub, id: challenge.id },
			{
				value: symmetricEncrypt(
					JSON.stringify({
						...JSON.parse(
							symmetricDecrypt(challenge.value, {
								sub,
								encryptedKey: challenge.encryptionKey,
							}),
						),
						expectedChallenge: authenticationOptionsOverride.challenge,
						expectedOrigin: webauthnOrigin,
						expectedRPID: authenticationOptionsOverride.rpId,
						requireUserVerification: true,
					}),
					{
						sub,
						encryptedKey: challenge.encryptionKey,
					},
				),
			},
		);
	};
};
describe("authn-webauthn", () => {
	for (const storeKey of Object.keys(mockStores)) {
		describe(`using store-${storeKey}`, () => {
			tests(mockStores[storeKey]);
		});
	}
});

const registrationOptionsOverride = {
	challenge: "Jl-QJo7l9_InkLl52RE0DLbc3I7sU4IuVJHV1EyHYY4",
	rp: {
		name: webauthnName,
		id: "localhost",
	},
	user: {
		id: "c3ViX0lLN21mb0lMOGJD",
		name: username,
		displayName: "",
	},
	pubKeyCredParams: [
		{
			alg: -8,
			type: "public-key",
		},
		{
			alg: -7,
			type: "public-key",
		},
		{
			alg: -257,
			type: "public-key",
		},
	],
	timeout: 60000,
	attestation: "none",
	excludeCredentials: [],
	authenticatorSelection: {
		residentKey: "discouraged",
		userVerification: "preferred",
		requireResidentKey: false,
	},
	extensions: {
		credProps: true,
	},
};
const registrationResponse = {
	id: "9ikDMG-fNBIGo7Ez7_Xx1PGizlo",
	rawId: "9ikDMG-fNBIGo7Ez7_Xx1PGizlo",
	response: {
		attestationObject:
			"o2NmbXRkbm9uZWdhdHRTdG10oGhhdXRoRGF0YViYSZYN5YgOjGh0NBcPZHZgW4_krrmihjLHmVzzuoMdl2NdAAAAAAAAAAAAAAAAAAAAAAAAAAAAFPYpAzBvnzQSBqOxM-_18dTxos5apQECAyYgASFYIHvLwmeIblhH_Tpm7WYjlhnrA3OnL_GL5crvjQI7mjozIlgguEqNjVVHwqmD-QVmXu5ffyvtwhL4-gvD67AtxpjWhlc",
		clientDataJSON:
			"eyJjaGFsbGVuZ2UiOiJKbC1RSm83bDlfSW5rTGw1MlJFMERMYmMzSTdzVTRJdVZKSFYxRXlIWVk0Iiwib3JpZ2luIjoiaHR0cDovL2xvY2FsaG9zdCIsInR5cGUiOiJ3ZWJhdXRobi5jcmVhdGUifQ",
		transports: ["internal"],
		publicKeyAlgorithm: -7,
		publicKey:
			"MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEe8vCZ4huWEf9OmbtZiOWGesDc6cv8Yvlyu-NAjuaOjO4So2NVUfCqYP5BWZe7l9_K-3CEvj6C8PrsC3GmNaGVw",
		authenticatorData:
			"SZYN5YgOjGh0NBcPZHZgW4_krrmihjLHmVzzuoMdl2NdAAAAAAAAAAAAAAAAAAAAAAAAAAAAFPYpAzBvnzQSBqOxM-_18dTxos5apQECAyYgASFYIHvLwmeIblhH_Tpm7WYjlhnrA3OnL_GL5crvjQI7mjozIlgguEqNjVVHwqmD-QVmXu5ffyvtwhL4-gvD67AtxpjWhlc",
	},
	type: "public-key",
	clientExtensionResults: {},
	authenticatorAttachment: "platform",
};

const authenticationOptionsOverride = {
	rpId: "localhost",
	challenge: "53kCzYApTbJ5vZnkBYMKMYl76mVfWHL18mSj9cfzjT4",
	allowCredentials: [{ id: registrationResponse.id, type: "public-key" }],
	timeout: 60000,
	userVerification: "preferred",
	extensions: undefined,
};
const authenticationResponse = {
	id: registrationResponse.id,
	rawId: registrationResponse.id,
	response: {
		authenticatorData: "SZYN5YgOjGh0NBcPZHZgW4_krrmihjLHmVzzuoMdl2MdAAAAAA",
		clientDataJSON:
			"eyJjaGFsbGVuZ2UiOiI1M2tDellBcFRiSjV2Wm5rQllNS01ZbDc2bVZmV0hMMThtU2o5Y2Z6alQ0Iiwib3JpZ2luIjoiaHR0cDovL2xvY2FsaG9zdCIsInR5cGUiOiJ3ZWJhdXRobi5nZXQifQ",
		signature:
			"MEYCIQDo7IiSTivehu1vilbW7HpcN3qTVMmBrhuDRmn0apmrswIhAJoJgD-l8QxyeS_ZrlqeagMJO6AFeC6wGdV_r00aZTmm",
		userHandle: "c3ViX0lLN21mb0lMOGJD",
	},
	type: "public-key",
	clientExtensionResults: {},
	authenticatorAttachment: "platform",
};
