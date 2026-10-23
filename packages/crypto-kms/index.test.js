// Copyright 2003 - 2026 will Farrell, and 1Auth contributors.
// SPDX-License-Identifier: MIT
import {
	deepEqual,
	equal,
	notEqual,
	ok,
	rejects,
	throws,
} from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, it, mock } from "node:test";
import crypto, {
	createSeasonedDigest,
	symmetricDecryptFields,
	symmetricDecryptKey,
	symmetricEncryptFields,
	symmetricGenerateEncryptionKey,
} from "@1auth/crypto";
import { GenerateDataKeyCommand, KMSClient } from "@aws-sdk/client-kms";

import cryptoKms, {
	decryptEncryptionKey,
	generateEncryptionKey,
	getOptions,
} from "./index.js";

const secrets = {
	symmetricEncryptionKey: randomBytes(32),
	symmetricSignatureSecret: randomBytes(32),
	digestChecksumSalt: randomBytes(32),
	digestChecksumPepper: randomBytes(32),
};

crypto(secrets);

const keyId = "arn:aws:kms:ca-central-1:111122223333:key/test";

const fakeKms = () => {
	const vault = new Map();
	let counter = 0;
	return {
		send: async (command) => {
			const input = command.input;
			if (command instanceof GenerateDataKeyCommand) {
				const Plaintext = randomBytes(32);
				const CiphertextBlob = Buffer.from(`wrapped-${counter++}`);
				vault.set(CiphertextBlob.toString("base64"), {
					Plaintext,
					context: JSON.stringify(input.EncryptionContext ?? null),
				});
				return { Plaintext, CiphertextBlob };
			}
			const found = vault.get(
				Buffer.from(input.CiphertextBlob).toString("base64"),
			);
			if (!found) {
				throw new Error("InvalidCiphertextException");
			}
			if (found.context !== JSON.stringify(input.EncryptionContext ?? null)) {
				throw new Error("InvalidCiphertextException");
			}
			return { Plaintext: found.Plaintext };
		},
	};
};

describe("@1auth/crypto-kms", () => {
	it("Should throw when keyId is empty", async () => {
		throws(() => cryptoKms({ client: fakeKms() }), {
			message:
				"@1auth/crypto-kms keyId is empty, use a symmetric KMS key ARN or alias.",
		});
	});

	it("Should only make a KMSClient when the caller did not pass one", async () => {
		const client = fakeKms();
		cryptoKms({ client, keyId });
		equal(getOptions().client, client);
		cryptoKms({ keyId });
		const first = getOptions().client;
		ok(first instanceof KMSClient);
		cryptoKms({ keyId });
		notEqual(getOptions().client, first);
		cryptoKms({ client, keyId });
		equal(getOptions().client, client);
	});

	it("Should expose the resolved options", async () => {
		cryptoKms({ client: fakeKms(), keyId });
		equal(getOptions().keyId, keyId);
		equal(getOptions().keySpec, "AES_256");
		equal(getOptions().name, "kms1");
	});

	it("Should mint a data key with the subject as encryption context", async () => {
		const send = mock.fn(async () => ({
			Plaintext: new Uint8Array(32),
			CiphertextBlob: new Uint8Array([1, 2, 3]),
		}));
		cryptoKms({ client: { send }, keyId });

		const { encryptionKey, encryptedKey } =
			await generateEncryptionKey("sub_1");

		const { input } = send.mock.calls[0].arguments[0];
		equal(input.KeyId, keyId);
		equal(input.KeySpec, "AES_256");
		deepEqual(input.EncryptionContext, { sub: "sub_1" });
		equal(encryptionKey.length, 32);
		equal(encryptedKey, `kms1:${Buffer.from([1, 2, 3]).toString("base64")}`);
	});

	it("Should omit encryption context when there is no subject", async () => {
		const send = mock.fn(async () => ({
			Plaintext: new Uint8Array(32),
			CiphertextBlob: new Uint8Array([1]),
		}));
		cryptoKms({ client: { send }, keyId });

		await generateEncryptionKey("");

		equal(send.mock.calls[0].arguments[0].input.EncryptionContext, undefined);
	});

	it("Should pin the key id and strip the prefix on decrypt", async () => {
		const send = mock.fn(async () => ({ Plaintext: new Uint8Array(32) }));
		cryptoKms({ client: { send }, keyId });

		const encryptionKey = await decryptEncryptionKey(
			`kms1:${Buffer.from([9, 9]).toString("base64")}`,
			"sub_1",
		);

		const { input } = send.mock.calls[0].arguments[0];
		equal(input.KeyId, keyId);
		deepEqual(Buffer.from(input.CiphertextBlob), Buffer.from([9, 9]));
		deepEqual(input.EncryptionContext, { sub: "sub_1" });
		equal(encryptionKey.length, 32);
	});

	it("Should tolerate a wrapped key that carries no prefix", async () => {
		const send = mock.fn(async () => ({ Plaintext: new Uint8Array(32) }));
		cryptoKms({ client: { send }, keyId });

		await decryptEncryptionKey(Buffer.from([7]).toString("base64"), "sub_1");

		const { input } = send.mock.calls[0].arguments[0];
		deepEqual(Buffer.from(input.CiphertextBlob), Buffer.from([7]));
	});

	it("Should hand back nothing for a row with no wrapped key", async () => {
		cryptoKms({ client: fakeKms(), keyId });
		equal(await decryptEncryptionKey(undefined, "sub_1"), undefined);
	});

	it("Should log both commands when a logger is set", async () => {
		const log = mock.fn();
		const send = mock.fn(async () => ({
			Plaintext: new Uint8Array(32),
			CiphertextBlob: new Uint8Array([1]),
		}));
		cryptoKms({ client: { send }, keyId, log });

		await generateEncryptionKey("sub_1");
		await decryptEncryptionKey(
			`kms1:${Buffer.from([1]).toString("base64")}`,
			"sub_1",
		);

		equal(log.mock.callCount(), 2);
		equal(
			log.mock.calls[0].arguments[0],
			"@1auth/crypto-kms GenerateDataKeyCommand",
		);
		equal(log.mock.calls[1].arguments[0], "@1auth/crypto-kms DecryptCommand");
	});

	it("Should round trip a field through the sync helpers", async () => {
		cryptoKms({ client: fakeKms(), keyId });

		const { encryptionKey, encryptedKey } =
			await generateEncryptionKey("sub_1");
		ok(encryptedKey.startsWith("kms1:"));

		const encrypted = symmetricEncryptFields(
			{ value: "secret" },
			{ encryptionKey, sub: "sub_1" },
			["value"],
		);
		notEqual(encrypted.value, "secret");

		const rowKey = await decryptEncryptionKey(encryptedKey, "sub_1");
		const decrypted = symmetricDecryptFields(
			encrypted,
			{ encryptionKey: rowKey, sub: "sub_1" },
			["value"],
		);
		equal(decrypted.value, "secret");
	});

	it("Should decrypt the checksum pepper with no encryption context", async () => {
		const send = mock.fn(async () => ({ Plaintext: new Uint8Array(32) }));
		cryptoKms({ client: { send }, keyId });

		const pepper = await decryptEncryptionKey(
			`kms1:${Buffer.from([5]).toString("base64")}`,
		);

		const { input } = send.mock.calls[0].arguments[0];
		equal(input.KeyId, keyId);
		deepEqual(Buffer.from(input.CiphertextBlob), Buffer.from([5]));
		equal(input.EncryptionContext, undefined);
		equal(pepper.length, 32);
	});

	it("Should pepper digests with the KMS value", async () => {
		const kmsPepper = randomBytes(32);
		cryptoKms({
			client: { send: async () => ({ Plaintext: kmsPepper }) },
			keyId,
		});
		const localDigest = createSeasonedDigest("value");

		crypto({
			...secrets,
			digestChecksumPepper: await decryptEncryptionKey("wrapped-pepper"),
		});
		const kmsDigest = createSeasonedDigest("value");

		crypto({ ...secrets, digestChecksumPepper: kmsPepper });
		equal(createSeasonedDigest("value"), kmsDigest);
		notEqual(kmsDigest, localDigest);

		crypto(secrets);
	});

	it("Should refuse a wrapped key under a different subject", async () => {
		cryptoKms({ client: fakeKms(), keyId });

		const { encryptedKey } = await generateEncryptionKey("sub_1");

		await rejects(() => decryptEncryptionKey(encryptedKey, "sub_2"), {
			message: "InvalidCiphertextException",
		});
	});

	describe("registration", () => {
		it("Should register under its name so the prefix is recognised", async () => {
			cryptoKms({ client: fakeKms(), keyId });
			throws(
				() =>
					symmetricGenerateEncryptionKey("sub_1", {
						encryptionKeyProvider: "kms1",
					}),
				{
					message:
						"@1auth/crypto-kms is asynchronous, use generateEncryptionKey() and pass the resulting encryptionKey",
				},
			);
		});

		it("Should name the async entry point instead of failing as a bad signature", async () => {
			cryptoKms({ client: fakeKms(), keyId });

			throws(() => symmetricDecryptKey("kms1:anything", { sub: "sub_1" }), {
				message:
					"@1auth/crypto-kms is asynchronous, use decryptEncryptionKey() and pass the resulting encryptionKey",
			});
		});

		it("Should register under a custom name", async () => {
			cryptoKms({ client: fakeKms(), keyId, name: "kms2" });
			throws(() => symmetricDecryptKey("kms2:anything", { sub: "sub_1" }), {
				message:
					"@1auth/crypto-kms is asynchronous, use decryptEncryptionKey() and pass the resulting encryptionKey",
			});

			const { encryptedKey } = await generateEncryptionKey("sub_1");
			ok(encryptedKey.startsWith("kms2:"));

			cryptoKms({ client: fakeKms(), keyId });
		});
	});

	describe("re-exports", () => {
		it("Should re-export every @1auth/crypto function, drop-in", async () => {
			const core = await import("@1auth/crypto");
			const kms = await import("./index.js");
			for (const name of Object.keys(core)) {
				if (name === "default") continue;
				if (name === "getOptions") {
					notEqual(kms[name], core[name], name);
					continue;
				}
				equal(kms[name], core[name], name);
			}
		});
	});
});
