import { deepEqual, equal, ok } from "node:assert/strict";
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
import passkey, {
	getOptions as passkeyGetOptions,
} from "@1auth/authn-webauthn-passkey";
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
import securityKey, {
	count as securityKeyCount,
	create as securityKeyCreate,
	createChallenge as securityKeyCreateChallenge,
	getOptions as securityKeyGetOptions,
	verify as securityKeyVerify,
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

describe("authn-webauthn-securitykey", { concurrency: 1 }, () => {
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
		securityKey({ name: webauthnName, origin: webauthnOrigin });
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

	it("Can apply the SecurityKey preset", () => {
		equal(securityKeyGetOptions().residentKey, "discouraged");
		equal(securityKeyGetOptions().userVerification, "required");
		equal(securityKeyGetOptions().preferredAuthenticatorType, "securityKey");
		equal(securityKeyGetOptions().notifyId, "authn-webauthn-securitykey");
		equal(securityKeyGetOptions().secret.id, "WebAuthnSecurityKey");
	});

	// The two packages only stay separate while their `import()` query strings differ
	it("Can NOT share config with @1auth/authn-webauthn-passkey", () => {
		equal(passkeyGetOptions().residentKey, undefined);
		passkey({ name: webauthnName, origin: webauthnOrigin });
		equal(passkeyGetOptions().residentKey, "required");
		equal(securityKeyGetOptions().residentKey, "discouraged");
		equal(passkeyGetOptions().secret.id, "WebAuthnPassKey");
		equal(securityKeyGetOptions().secret.id, "WebAuthnSecurityKey");
	});

	it("Can override the preset", () => {
		securityKey({
			name: webauthnName,
			origin: webauthnOrigin,
			userVerification: "preferred",
		});
		equal(securityKeyGetOptions().userVerification, "preferred");
		equal(securityKeyGetOptions().residentKey, "discouraged");
		securityKey({ name: webauthnName, origin: webauthnOrigin });
	});

	it("Can create a registration", async () => {
		const { secret: registrationOptions } = await securityKeyCreate(sub);

		deepEqual(registrationOptions.hints, ["security-key"]);
		deepEqual(registrationOptions.authenticatorSelection, {
			residentKey: "discouraged",
			requireResidentKey: false,
			userVerification: "required",
			authenticatorAttachment: "cross-platform",
		});

		const [token] = await store.selectList(authnGetOptions().table, { sub });
		equal(token.type, "WebAuthnSecurityKey-token");
	});

	it("Can register a SecurityKey", async () => {
		await register(registrationResponseSecurityKey);

		equal(await securityKeyCount(sub), 1);
		ok((await securityKeyCreateChallenge(sub)).secret);
	});

	it("Can notify with the SecurityKey template ids", async () => {
		await register(registrationResponseSecurityKey, true);

		equal(
			mocks.notifyClient.mock.calls[0].arguments[0].id,
			"authn-webauthn-securitykey-create",
		);
	});

	it("Can NOT register a PassKey", async () => {
		try {
			await register(registrationResponse);
			throw new Error("should not reach");
		} catch (e) {
			equal(e.message, "401 Unauthorized");
		}
		equal(await securityKeyCount(sub), 0);
	});

	const register = async (response, notify = false) => {
		await securityKeyCreate(sub);
		const [token] = await store.selectList(authnGetOptions().table, {
			sub,
			type: "WebAuthnSecurityKey-token",
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
		const secret = await securityKeyVerify(
			sub,
			response,
			{ name: "Yubikey" },
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
