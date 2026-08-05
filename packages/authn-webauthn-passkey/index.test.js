import { deepEqual, equal } from "node:assert/strict";
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
import authn, { getOptions as authnGetOptions } from "@1auth/authn";
import * as mockAuthnSQLTable from "@1auth/authn/table/sql.js";
import crypto, {
	randomChecksumPepper,
	randomChecksumSalt,
	symmetricDecrypt,
	symmetricEncrypt,
	symmetricRandomEncryptionKey,
	symmetricRandomSignatureSecret,
} from "@1auth/crypto";
// *** Setup Start *** //
import * as notify from "@1auth/notify";
import * as storeSQLite from "@1auth/store-sqlite";
import * as mockNotify from "../notify/mock.js";
import * as mockSQLite from "../store-sqlite/mock.js";
import passkey, {
	count as passkeyCount,
	create as passkeyCreate,
	createChallenge as passkeyCreateChallenge,
	getOptions as passkeyGetOptions,
	verify as passkeyVerify,
} from "./index.js";

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
	storeAccount: mockAccountSQLTable,
	storeAuthn: mockAuthnSQLTable,
};
const store = storeSQLite;

const username = "username";
const webauthnName = "1Auth";
const webauthnOrigin = "http://localhost";
let sub;
// *** Setup End *** //

describe("authn-webauthn-passkey", { concurrency: 1 }, () => {
	test.before(async () => {
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
		});
		passkey({ name: webauthnName, origin: webauthnOrigin });
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

	it("Can apply the PassKey preset", () => {
		equal(passkeyGetOptions().residentKey, "required");
		equal(passkeyGetOptions().userVerification, "required");
		equal(passkeyGetOptions().preferredAuthenticatorType, "localDevice");
		equal(passkeyGetOptions().notifyId, "authn-webauthn-passkey");
		equal(passkeyGetOptions().secret.id, "WebAuthnPassKey");
	});

	it("Can override the preset", () => {
		passkey({
			name: webauthnName,
			origin: webauthnOrigin,
			userVerification: "preferred",
		});
		equal(passkeyGetOptions().userVerification, "preferred");
		equal(passkeyGetOptions().residentKey, "required");
		passkey({ name: webauthnName, origin: webauthnOrigin });
	});

	it("Can override the preset id", () => {
		passkey({ name: webauthnName, origin: webauthnOrigin, id: "MyPassKey" });
		equal(passkeyGetOptions().secret.id, "MyPassKey");
		equal(passkeyGetOptions().token.id, "MyPassKey");
		equal(passkeyGetOptions().challenge.id, "MyPassKey");
		passkey({ name: webauthnName, origin: webauthnOrigin });
		equal(passkeyGetOptions().secret.id, "WebAuthnPassKey");
	});

	it("Can create a registration on the local device", async () => {
		const { secret: registrationOptions } = await passkeyCreate(sub);

		deepEqual(registrationOptions.hints, ["client-device"]);
		deepEqual(registrationOptions.authenticatorSelection, {
			residentKey: "required",
			requireResidentKey: true,
			userVerification: "required",
			authenticatorAttachment: "platform",
		});

		const [token] = await store.selectList(authnGetOptions().table, { sub });
		equal(token.type, "WebAuthnPassKey-token");
	});

	it("Can create a registration on a remote device", async () => {
		const { secret: registrationOptions } = await passkeyCreate(sub, {
			preferredAuthenticatorType: "remoteDevice",
		});

		deepEqual(registrationOptions.hints, ["hybrid"]);
		equal(
			registrationOptions.authenticatorSelection.authenticatorAttachment,
			"cross-platform",
		);
	});

	it("Can offer local and remote PassKeys in one challenge", async () => {
		await register(registrationResponse);
		await register(registrationResponseRemote, "remoteDevice");

		equal(await passkeyCount(sub), 2);
		const { secret: authenticationOptions } = await passkeyCreateChallenge(sub);
		equal(authenticationOptions.allowCredentials.length, 2);
	});

	it("Can notify with the PassKey template ids", async () => {
		await register(registrationResponse, undefined, true);

		equal(
			mocks.notifyClient.mock.calls[0].arguments[0].id,
			"authn-webauthn-passkey-create",
		);
	});

	it("Can NOT register a SecurityKey", async () => {
		try {
			await register(registrationResponseSecurityKey);
			throw new Error("should not reach");
		} catch (e) {
			equal(e.message, "401 Unauthorized");
		}
		equal(await passkeyCount(sub), 0);
	});

	const register = async (
		response,
		preferredAuthenticatorType,
		notify = false,
	) => {
		await passkeyCreate(sub, { preferredAuthenticatorType });
		const [token] = await store.selectList(authnGetOptions().table, {
			sub,
			type: "WebAuthnPassKey-token",
		});
		await store.update(
			authnGetOptions().table,
			{ sub, id: token.id },
			{
				value: symmetricEncrypt(
					JSON.stringify({
						...JSON.parse(
							symmetricDecrypt(token.value, {
								sub,
								encryptedKey: token.encryptionKey,
							}),
						),
						expectedChallenge: registrationChallenge,
						expectedOrigin: webauthnOrigin,
						expectedRPID: "localhost",
						requireUserVerification: true,
					}),
					{ sub, encryptedKey: token.encryptionKey },
				),
			},
		);
		const secret = await passkeyVerify(
			sub,
			response,
			{ name: "PassKey" },
			notify,
		);
		return secret.id;
	};
});

const registrationChallenge = "Jl-QJo7l9_InkLl52RE0DLbc3I7sU4IuVJHV1EyHYY4";
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

// Same PassKey, reached over hybrid transport rather than on this device
const registrationResponseRemote = {
	...registrationResponse,
	response: { ...registrationResponse.response, transports: ["hybrid"] },
	authenticatorAttachment: "cross-platform",
};

// BE/BS flags cleared, so it reads as hardware bound rather than a synced PassKey
const registrationResponseSecurityKey = {
	...registrationResponse,
	response: {
		...registrationResponse.response,
		attestationObject:
			"o2NmbXRkbm9uZWdhdHRTdG10oGhhdXRoRGF0YViYSZYN5YgOjGh0NBcPZHZgW4_krrmihjLHmVzzuoMdl2NFAAAAAAAAAAAAAAAAAAAAAAAAAAAAFPYpAzBvnzQSBqOxM-_18dTxos5apQECAyYgASFYIHvLwmeIblhH_Tpm7WYjlhnrA3OnL_GL5crvjQI7mjozIlgguEqNjVVHwqmD-QVmXu5ffyvtwhL4-gvD67AtxpjWhlc",
		authenticatorData:
			"SZYN5YgOjGh0NBcPZHZgW4_krrmihjLHmVzzuoMdl2NFAAAAAAAAAAAAAAAAAAAAAAAAAAAAFPYpAzBvnzQSBqOxM-_18dTxos5apQECAyYgASFYIHvLwmeIblhH_Tpm7WYjlhnrA3OnL_GL5crvjQI7mjozIlgguEqNjVVHwqmD-QVmXu5ffyvtwhL4-gvD67AtxpjWhlc",
		transports: ["usb"],
	},
	authenticatorAttachment: "cross-platform",
};
