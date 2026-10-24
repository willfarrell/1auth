// Copyright 2003 - 2026 will Farrell, and 1Auth contributors.
// SPDX-License-Identifier: MIT
import type { Buffer } from "node:buffer";
import type {
	Argon2Algorithm,
	BinaryLike,
	BinaryToTextEncoding,
	KeyLike,
} from "node:crypto";

export { randomBytes, randomInt, randomUUID } from "node:crypto";

/** A secret given as an encoded string or as raw bytes. */
export type Secret = string | Buffer;

export interface CryptoOptions {
	symmetricEncryptionKey: Secret;
	symmetricEncryptionAlgorithm: string;
	symmetricEncryptionEncoding: BufferEncoding | undefined;
	/** Provider that wraps new row keys, `"1"` is the in-process one. */
	encryptionKeyProvider: string;
	symmetricSignatureHashAlgorithm: string | undefined;
	symmetricSignatureSecret: Secret;
	symmetricSignatureEncoding: BufferEncoding | undefined;
	asymmetricKeyNamedCurve: string;
	asymmetricSignatureHashAlgorithm: string | undefined;
	asymmetricSignatureEncoding: BufferEncoding | undefined;
	digestChecksumHashAlgorithm: string | undefined;
	digestChecksumEncoding: BinaryToTextEncoding | undefined;
	digestChecksumSalt: Secret;
	/** HMAC key for digests, at least 32 bytes. */
	digestChecksumPepper: Secret;
	secretArgon2Algorithm: Argon2Algorithm;
	secretArgon2Version: number;
	secretArgon2Parallelism: number;
	/** log2 exponent, memory is `2 ** memoryCost` KiB. */
	secretArgon2MemoryCost: number;
	secretArgon2TimeCost: number;
	secretArgon2NonceLength: number;
	secretArgon2HashLength: number;
	defaultEncoding: BufferEncoding;
	defaultHashAlgorithm: string;
}

/** Throws when a required secret is missing or the pepper is under 32 bytes. */
declare function crypto(opt?: Partial<CryptoOptions>): void;
export default crypto;

export function getOptions(): CryptoOptions;

export function makeOptionsBuffer(
	value: string,
	encoding?: BufferEncoding,
): Buffer;
export function makeOptionsBuffer<T>(value: T, encoding?: BufferEncoding): T;

// *** Helpers *** //
export function entropyToCharacterLength(
	bits: number,
	characterPoolSize: number,
): number;

// *** Random generators *** //
export const charactersNumeric: string;
export const charactersAlphaUpper: string;
export const charactersAlphaLower: string;
export const charactersAlpha: string;
export const charactersAlphaNumeric: string;
export const charactersDistinguishable: string;

export function randomCharacters(length: number, characters?: string): string;
export function randomAlphaNumeric(characterLength: number): string;
export function randomNumeric(characterLength: number): string;

// *** configs *** //
export interface RandomConfigOptions {
	id?: string;
	prefix?: string;
	/** Bits of entropy, sets the generated length. */
	entropy?: number;
	characters?: string;
	[key: string]: unknown;
}

export interface RandomConfigObject {
	id: string | undefined;
	type: string;
	create: () => string;
	[key: string]: unknown;
}

export function makeRandomConfigObject(
	params?: RandomConfigOptions,
): RandomConfigObject;

// *** Digests *** //
export interface ChecksumOptions {
	hashAlgorithm?: string;
	encoding?: BinaryToTextEncoding;
}
export interface SeasonedChecksumOptions extends ChecksumOptions {
	checksumSalt?: Secret;
	checksumPepper?: Secret;
}

export function randomChecksumSalt(): Buffer;
export function randomChecksumPepper(): Buffer;

export function createChecksum(
	value: BinaryLike,
	options?: ChecksumOptions,
): string;
export function createSeasonedChecksum(
	value: string | Buffer,
	options?: SeasonedChecksumOptions,
): string;

/** Returns `<hashAlgorithm>:<checksum>`. */
export function createDigest(
	value: BinaryLike,
	options?: ChecksumOptions,
): string;
export function createSaltedDigest(
	value: string | Buffer,
	options?: ChecksumOptions & { checksumSalt?: Secret },
): string;
export function createPepperedDigest(
	value: BinaryLike,
	options?: ChecksumOptions & { checksumPepper?: Secret },
): string;
export function createSeasonedDigest(
	value: string | Buffer,
	options?: SeasonedChecksumOptions,
): string;

// *** Hashing *** //
export interface Argon2Options {
	algorithm?: Argon2Algorithm;
	version?: number;
	parallelism?: number;
	/** log2 exponent between 3 and 31, not KiB. */
	memoryCost?: number;
	timeCost?: number;
	nonceLength?: number;
	hashLength?: number;
}

export interface Argon2Parameters {
	algorithm: Argon2Algorithm;
	version: number;
	memoryCost: number;
	timeCost: number;
	parallelism: number;
	nonce: Buffer;
	hash: Buffer;
}

export interface DecodedArgon2 extends Argon2Parameters {
	nonceLength: number;
	hashLength: number;
}

/** Throws a RangeError unless `memoryCost` is an integer from 3 to 31. */
export function assertMemoryCost(memoryCost: number): void;
export function encodeArgon2(params: Argon2Parameters): string;
export function decodeArgon2(str: string): DecodedArgon2;
export function createArgon2(
	message: BinaryLike,
	options?: Argon2Options,
): Promise<string>;
export function verifyArgon2(
	derivedKey: string,
	message: BinaryLike,
): Promise<boolean>;
export const createSecretHash: typeof createArgon2;
export const verifySecretHash: typeof verifyArgon2;

// *** Symmetric Encryption *** //
export function symmetricRandomEncryptionKey(): Buffer;

// *** Encryption key providers *** //
export const encryptionKeyProviderSeparator: string;

export interface EncryptionKeyProviderOptions {
	encryptionKey?: Secret;
	signatureSecret?: Secret;
	[key: string]: unknown;
}

export interface GeneratedEncryptionKey {
	encryptionKey: Buffer;
	/** Wrapped key, stored as `<provider>:<payload>`. */
	encryptedKey: string;
}

export interface EncryptionKeyProvider {
	generate: (
		sub: string,
		options?: EncryptionKeyProviderOptions,
	) => GeneratedEncryptionKey;
	decrypt: (
		payload: string,
		sub: string | undefined,
		options?: EncryptionKeyProviderOptions,
	) => Buffer;
}

export function registerEncryptionKeyProvider(
	name: string,
	provider: EncryptionKeyProvider,
): void;

export function symmetricGenerateEncryptionKey(
	sub: string,
	providerOptions?: EncryptionKeyProviderOptions & {
		encryptionKeyProvider?: string;
	},
): GeneratedEncryptionKey;

export interface SymmetricKeyOptions {
	/** Wrapped row key, unwrapped when `encryptionKey` is not given. */
	encryptedKey?: string;
	encryptionKey?: Secret;
	signatureSecret?: Secret;
	/** Bound into the ciphertext as associated data. */
	sub?: string;
}

export interface SymmetricEncryptOptions extends SymmetricKeyOptions {
	decoding?: BufferEncoding;
	encoding?: BufferEncoding;
	iv?: Buffer;
}

export interface SymmetricDecryptOptions extends SymmetricKeyOptions {
	decoding?: BufferEncoding;
	encoding?: BufferEncoding;
}

export function symmetricEncryptFields(
	values: Record<string, any>,
	options: SymmetricKeyOptions,
	fields?: string[],
): Record<string, any>;

/** Falsy `data` is returned as is. */
export function symmetricEncrypt(
	data: string | NodeJS.ArrayBufferView,
	options: SymmetricEncryptOptions,
): string;
export function symmetricEncrypt<T extends null | undefined>(
	data: T,
	options: SymmetricEncryptOptions,
): T;

export function symmetricDecryptFields(
	encryptedValues: Record<string, any>,
	options: SymmetricKeyOptions,
	fields?: string[],
): Record<string, any>;

export function symmetricDecryptKey(
	encryptedKey: string,
	options?: Pick<
		SymmetricKeyOptions,
		"sub" | "encryptionKey" | "signatureSecret"
	>,
): Buffer;

/** Returns the packet unchanged when it or the key is missing. */
export function symmetricDecrypt(
	signedEncryptedDataPacket: string,
	options: SymmetricDecryptOptions,
): string;
export function symmetricDecrypt<T extends null | undefined>(
	signedEncryptedDataPacket: T,
	options: SymmetricDecryptOptions,
): T;

// *** Symmetric Signatures *** //
export interface SignatureOptions {
	hashAlgorithm?: string;
	signatureSecret?: Secret;
}

export function symmetricRandomSignatureSecret(): Buffer;
/** Returns `<data>.<signature>`. */
export function symmetricSignatureSign(
	data: string,
	options?: SignatureOptions,
): string;
/** Returns the unsigned data, or `false` when the signature does not match. */
export function symmetricSignatureVerify(
	signedData: unknown,
	options?: SignatureOptions,
): string | false;

export interface SymmetricRotationOptions extends EncryptionKeyProviderOptions {
	sub: string;
	encryptionKeyProvider?: string;
}

export function symmetricRotation(
	oldEncryptedValues: Record<string, any>,
	oldOptions: SymmetricRotationOptions,
	oldFields: string[] | undefined,
	newOptions?: SymmetricRotationOptions,
	newFields?: string[],
	transform?: (data: Record<string, any>) => Record<string, any>,
): Record<string, any>;

// *** Asymmetric Signatures *** //
export function makeAsymmetricKeys(): Promise<{
	publicKey: string;
	privateKey: string;
}>;
export function makeAsymmetricSignature(
	data: string | Uint8Array,
	privateKey: KeyLike,
	options?: { hashAlgorithm?: string },
): Promise<string>;
export function verifyAsymmetricSignature(
	data: string | Uint8Array,
	publicKey: KeyLike,
	signature: string,
	options?: { hashAlgorithm?: string },
): Promise<boolean>;

export function nowInSeconds(): number;

// *** Argument guards *** //
/** Throws `401 Unauthorized` unless `sub` is a non-empty string. */
export function assertSub(
	sub: unknown,
	cause?: Record<string, unknown>,
): asserts sub is string;
/** Throws `404 Not Found` unless `id` is a non-empty string. */
export function assertId(
	id: unknown,
	cause?: Record<string, unknown>,
): asserts id is string;

/** Timing safe comparison. */
export function safeEqual(
	input: string | Uint8Array,
	expected: string | Uint8Array,
): boolean;
