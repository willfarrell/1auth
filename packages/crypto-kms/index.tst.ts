/// <reference types="node" />

import type { Buffer } from "node:buffer";
import type * as crypto from "@1auth/crypto";
import type { GeneratedEncryptionKey } from "@1auth/crypto";
import type { CryptoKmsOptions } from "@1auth/crypto-kms";
import configure, {
	createSeasonedDigest,
	decryptEncryptionKey,
	generateEncryptionKey,
	getOptions,
	symmetricEncryptFields,
} from "@1auth/crypto-kms";
import { KMSClient } from "@aws-sdk/client-kms";
import { describe, expect, test } from "tstyche";

describe("configure", () => {
	test("takes partial options", () => {
		expect(
			configure({ keyId: "alias/1auth", client: new KMSClient() }),
		).type.toBe<void>();
		expect(
			configure({ keyId: "alias/1auth", keySpec: "AES_128" }),
		).type.toBe<void>();
		expect(configure).type.not.toBeCallableWith({ keySpec: "AES_512" });
	});

	test("getOptions returns its own options, not @1auth/crypto's", () => {
		expect(getOptions()).type.toBe<CryptoKmsOptions>();
		expect(getOptions).type.not.toBe<typeof crypto.getOptions>();
	});
});

describe("data keys", () => {
	test("generate and decrypt", () => {
		expect(generateEncryptionKey("sub_1")).type.toBe<
			Promise<GeneratedEncryptionKey>
		>();
		expect(decryptEncryptionKey("kms1:blob", "sub_1")).type.toBe<
			Promise<Buffer | undefined>
		>();
		expect(decryptEncryptionKey(undefined)).type.toBe<
			Promise<Buffer | undefined>
		>();
	});
});

describe("re-exports @1auth/crypto", () => {
	test("helpers keep their types", () => {
		expect(createSeasonedDigest).type.toBe<
			typeof crypto.createSeasonedDigest
		>();
		expect(symmetricEncryptFields).type.toBe<
			typeof crypto.symmetricEncryptFields
		>();
	});
});
