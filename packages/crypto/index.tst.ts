/// <reference types="node" />

import type { Buffer } from "node:buffer";
import crypto, {
	assertId,
	assertSub,
	type CryptoOptions,
	charactersAlphaNumeric,
	createArgon2,
	createChecksum,
	createDigest,
	createSeasonedDigest,
	createSecretHash,
	decodeArgon2,
	type EncryptionKeyProvider,
	type GeneratedEncryptionKey,
	getOptions,
	makeAsymmetricKeys,
	makeAsymmetricSignature,
	makeOptionsBuffer,
	makeRandomConfigObject,
	nowInSeconds,
	type RandomConfigObject,
	randomBytes,
	randomCharacters,
	randomChecksumPepper,
	randomUUID,
	registerEncryptionKeyProvider,
	safeEqual,
	symmetricDecrypt,
	symmetricDecryptFields,
	symmetricDecryptKey,
	symmetricEncrypt,
	symmetricEncryptFields,
	symmetricGenerateEncryptionKey,
	symmetricRotation,
	symmetricSignatureSign,
	symmetricSignatureVerify,
	verifyArgon2,
	verifyAsymmetricSignature,
	verifySecretHash,
} from "@1auth/crypto";
import { describe, expect, test } from "tstyche";

describe("configure", () => {
	test("default export takes partial options", () => {
		expect(
			crypto({
				symmetricEncryptionKey: "key",
				symmetricSignatureSecret: randomBytes(32),
				digestChecksumSalt: "salt",
				digestChecksumPepper: "pepper",
			}),
		).type.toBe<void>();
		expect(crypto()).type.toBe<void>();
		expect(crypto).type.not.toBeCallableWith({ secretArgon2TimeCost: "3" });
	});

	test("getOptions returns CryptoOptions", () => {
		expect(getOptions()).type.toBe<CryptoOptions>();
	});

	test("makeOptionsBuffer decodes strings and passes anything else through", () => {
		expect(makeOptionsBuffer("a2V5")).type.toBe<Buffer>();
		expect(makeOptionsBuffer("a2V5", "hex")).type.toBe<Buffer>();
		expect(makeOptionsBuffer(undefined)).type.toBe<undefined>();
	});
});

describe("random", () => {
	test("character generators return strings", () => {
		expect(randomCharacters(8)).type.toBe<string>();
		expect(randomCharacters(8, charactersAlphaNumeric)).type.toBe<string>();
		expect(randomUUID()).type.toBeAssignableTo<string>();
	});

	test("makeRandomConfigObject returns a RandomConfigObject", () => {
		const config = makeRandomConfigObject({ id: "x", prefix: "x_" });
		expect(config).type.toBe<RandomConfigObject>();
		expect(config.create()).type.toBe<string>();
		expect(makeRandomConfigObject()).type.toBe<RandomConfigObject>();
		expect(makeRandomConfigObject).type.not.toBeCallableWith({ entropy: "64" });
	});
});

describe("digests", () => {
	test("checksums and digests return strings", () => {
		expect(createChecksum("value")).type.toBe<string>();
		expect(
			createChecksum("value", { hashAlgorithm: "sha256", encoding: "hex" }),
		).type.toBe<string>();
		expect(createDigest("value")).type.toBe<string>();
		expect(
			createSeasonedDigest("value", { checksumPepper: randomChecksumPepper() }),
		).type.toBe<string>();
		expect(createChecksum).type.not.toBeCallableWith("value", {
			encoding: "utf8",
		});
	});
});

describe("hashing", () => {
	test("argon2 helpers", () => {
		expect(createArgon2("secret")).type.toBe<Promise<string>>();
		expect(createArgon2("secret", { memoryCost: 15 })).type.toBe<
			Promise<string>
		>();
		expect(verifyArgon2("$argon2id$...", "secret")).type.toBe<
			Promise<boolean>
		>();
		expect(createSecretHash).type.toBe<typeof createArgon2>();
		expect(verifySecretHash).type.toBe<typeof verifyArgon2>();
		expect(decodeArgon2("$argon2id$...").nonce).type.toBe<Buffer>();
	});
});

describe("symmetric", () => {
	test("encrypt and decrypt strings", () => {
		expect(symmetricEncrypt("data", { sub: "sub_1" })).type.toBe<string>();
		expect(
			symmetricEncrypt(undefined, { sub: "sub_1" }),
		).type.toBe<undefined>();
		expect(
			symmetricDecrypt("packet", { sub: "sub_1", encryptedKey: "1:key" }),
		).type.toBe<string>();
		expect(symmetricDecrypt(null, { sub: "sub_1" })).type.toBe<null>();
	});

	test("field helpers return records", () => {
		expect(
			symmetricEncryptFields({ value: "x" }, { sub: "sub_1" }, ["value"]),
		).type.toBe<Record<string, any>>();
		expect(
			symmetricDecryptFields({ value: "x" }, { sub: "sub_1" }, ["value"]),
		).type.toBe<Record<string, any>>();
		expect(
			symmetricRotation({ value: "x" }, { sub: "sub_1" }, ["value"]),
		).type.toBe<Record<string, any>>();
	});

	test("row encryption keys", () => {
		expect(
			symmetricGenerateEncryptionKey("sub_1"),
		).type.toBe<GeneratedEncryptionKey>();
		expect(symmetricDecryptKey("1:key", { sub: "sub_1" })).type.toBe<Buffer>();
	});

	test("registerEncryptionKeyProvider takes a provider", () => {
		const provider: EncryptionKeyProvider = {
			generate: () => {
				throw new Error("async");
			},
			decrypt: () => {
				throw new Error("async");
			},
		};
		expect(registerEncryptionKeyProvider("kms1", provider)).type.toBe<void>();
		expect(registerEncryptionKeyProvider).type.not.toBeCallableWith("kms1", {});
	});

	test("signatures", () => {
		expect(symmetricSignatureSign("data")).type.toBe<string>();
		expect(symmetricSignatureVerify("data.sig")).type.toBe<string | false>();
	});
});

describe("asymmetric", () => {
	test("key pair and signatures", () => {
		expect(makeAsymmetricKeys()).type.toBe<
			Promise<{ publicKey: string; privateKey: string }>
		>();
		expect(makeAsymmetricSignature("data", "pem")).type.toBe<Promise<string>>();
		expect(verifyAsymmetricSignature("data", "pem", "sig")).type.toBe<
			Promise<boolean>
		>();
	});
});

describe("guards", () => {
	test("assertSub and assertId narrow to string", () => {
		const sub: unknown = "sub_1";
		assertSub(sub);
		expect(sub).type.toBe<string>();
		const id: unknown = "id_1";
		assertId(id, { sub });
		expect(id).type.toBe<string>();
	});

	test("nowInSeconds and safeEqual", () => {
		expect(nowInSeconds()).type.toBe<number>();
		expect(safeEqual("a", "b")).type.toBe<boolean>();
	});
});
