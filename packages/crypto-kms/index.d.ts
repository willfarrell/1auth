// Copyright 2003 - 2026 will Farrell, and 1Auth contributors.
// SPDX-License-Identifier: MIT
import type { Buffer } from "node:buffer";
import type { GeneratedEncryptionKey } from "@1auth/crypto";
import type { DataKeySpec, KMSClient } from "@aws-sdk/client-kms";

export * from "@1auth/crypto";

export interface CryptoKmsOptions {
	/** Created with `new KMSClient()` when not given. */
	client: KMSClient;
	/** Symmetric KMS key ARN or alias, required. */
	keyId: string;
	keySpec: DataKeySpec;
	encoding: BufferEncoding;
	/** Provider name, the prefix on wrapped keys. */
	name: string;
	log: ((...args: unknown[]) => void) | false;
}

/** Registers the provider, throws when `keyId` is empty. */
declare function configure(opt?: Partial<CryptoKmsOptions>): void;
export default configure;

export function getOptions(): CryptoKmsOptions;

/** A new data key, `sub` is bound in as the encryption context. */
export function generateEncryptionKey(
	sub?: string,
): Promise<GeneratedEncryptionKey>;
/** Resolves `undefined` when `encryptedKey` is empty. */
export function decryptEncryptionKey(
	encryptedKey: string | undefined,
	sub?: string,
): Promise<Buffer | undefined>;
