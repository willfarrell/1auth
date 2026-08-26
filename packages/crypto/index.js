// Copyright 2003 - 2026 will Farrell, and 1Auth contributors.
// SPDX-License-Identifier: MIT
import {
	argon2Sync,
	createCipheriv,
	createDecipheriv,
	createHash,
	createHmac,
	generateKeyPair as generateKeyPairCallback,
	randomBytes,
	randomInt,
	sign as signCallback,
	timingSafeEqual,
	verify as verifyCallback,
} from "node:crypto";
import { promisify } from "node:util";
import { customAlphabet } from "nanoid";

const generateKeyPair = promisify(generateKeyPairCallback);
const sign = promisify(signCallback);
const verify = promisify(verifyCallback);

const defaults = {
	symmetricEncryptionKey: undefined, // symmetricRandomEncryptionKey()
	symmetricEncryptionAlgorithm: "chacha20-poly1305", // 2025-03: AES-256 GCM (aes-256-gcm) or ChaCha20-Poly1305 (chacha20-poly1305)
	symmetricEncryptionEncoding: undefined, // https://nodejs.org/api/buffer.html#buffers-and-character-encodings
	encryptionKeyProvider: "1", // wraps new row keys, see Encryption key providers
	symmetricSignatureHashAlgorithm: undefined, // fallback to defaultHashAlgorithm
	symmetricSignatureSecret: undefined, // symmetricRandomSignatureSecret()
	symmetricSignatureEncoding: undefined, // fallback to defaultEncoding
	asymmetricKeyNamedCurve: "P-384", // P-512
	asymmetricSignatureHashAlgorithm: undefined, // fallback to defaultHashAlgorithm
	asymmetricSignatureEncoding: undefined, // fallback to defaultEncoding
	digestChecksumHashAlgorithm: undefined, // fallback to defaultHashAlgorithm
	digestChecksumEncoding: undefined,
	digestChecksumSalt: undefined, // randomChecksumSalt()
	digestChecksumPepper: undefined, // randomChecksumPepper()
	// Password hashing defaults - based on OWASP Password Storage Cheat Sheet
	// https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
	// OWASP minimums: 19 MiB memory, 2 iterations, 1 parallelism
	// We use 32 MiB (exceeds minimum) for enhanced security
	secretArgon2Algorithm: "argon2id",
	secretArgon2Version: 19,
	secretArgon2Parallelism: 1, // OWASP: 1 (matches)
	secretArgon2MemoryCost: 15, // log2 exponent: 2^15 KiB = 32 MiB (exceeds OWASP minimum of 19 MiB)
	secretArgon2TimeCost: 3, // OWASP: 2 (we use 3 for better security)
	secretArgon2NonceLength: 16,
	secretArgon2HashLength: 64,

	defaultEncoding: "base64",
	defaultHashAlgorithm: "sha3-384",
};
const symmetricEncryptionEncodingLengths = {};
const options = {};
export default (opt = {}) => {
	Object.assign(options, defaults, opt);

	// Check options, set defaults
	if (!options.symmetricEncryptionKey) {
		throw new Error(
			"@1auth/crypto symmetricEncryptionKey is empty, use a stored secret made from randomBytes(32) Encryption disabled.",
		);
	}
	options.symmetricEncryptionKey = makeOptionsBuffer(
		options.symmetricEncryptionKey,
	);
	options.symmetricEncryptionEncoding ??= options.defaultEncoding;
	options.symmetricSignatureHashAlgorithm ??= options.defaultHashAlgorithm;
	if (!options.symmetricSignatureSecret) {
		throw new Error(
			"@1auth/crypto symmetricSignatureSecret is empty, use a stored secret made from randomBytes(32) Signature disabled.",
		);
	}
	options.symmetricSignatureSecret = makeOptionsBuffer(
		options.symmetricSignatureSecret,
	);
	options.symmetricSignatureEncoding ??= options.defaultEncoding;
	options.asymmetricSignatureHashAlgorithm ??= options.defaultHashAlgorithm;
	options.asymmetricSignatureEncoding ??= options.defaultEncoding;
	if (!options.digestChecksumSalt) {
		throw new Error(
			"@1auth/crypto digestChecksumSalt is empty, use a stored secret made from randomBytes(32) Checksum salting disabled.",
		);
	}
	options.digestChecksumSalt = makeOptionsBuffer(options.digestChecksumSalt);
	if (!options.digestChecksumPepper) {
		throw new Error(
			"@1auth/crypto digestChecksumPepper is empty, use a stored secret made from randomBytes(12) Checksum peppering disabled.",
		);
	}
	options.digestChecksumPepper = makeOptionsBuffer(
		options.digestChecksumPepper,
	);
	// The pepper is handed to createCipheriv as the IV, so anything but 12 bytes
	// throws ERR_CRYPTO_INVALID_IV on the first digest, far from the config that
	// caused it. randomBytes(32) is the natural wrong guess, because every other
	// secret here is 32 bytes.
	if (options.digestChecksumPepper.length !== ivLength) {
		throw new RangeError(
			`@1auth/crypto digestChecksumPepper must be ${ivLength} bytes, received ${options.digestChecksumPepper.length}. Use randomChecksumPepper().`,
			{ cause: { length: options.digestChecksumPepper.length } },
		);
	}
	options.digestChecksumHashAlgorithm ??= options.defaultHashAlgorithm;
	options.digestChecksumEncoding ??= options.defaultEncoding;

	// Encoded lengths for parsing ciphertext packets (IV = 12 bytes, authTag = 16 bytes)
	const encodedLength = (byteLength) =>
		Buffer.alloc(byteLength).toString(options.symmetricEncryptionEncoding)
			.length;
	symmetricEncryptionEncodingLengths.iv = encodedLength(ivLength);
	symmetricEncryptionEncodingLengths.ivAndAuthTag =
		symmetricEncryptionEncodingLengths.iv + encodedLength(authTagLength);
};

export const makeOptionsBuffer = (
	value,
	encoding = options.defaultEncoding,
) => {
	if (typeof value === "string") {
		return Buffer.from(value, encoding);
	}
	return value;
};

export const getOptions = () => options;

// *** Helpers *** //
// Ref: https://therootcompany.com/blog/how-many-bits-of-entropy-per-character/
export const entropyToCharacterLength = (bits, characterPoolSize) => {
	// bits*ln(2)/ln(characterPoolSize)
	return Math.ceil((bits * Math.LN2) / Math.log(characterPoolSize));
};

// *** Random generators *** //
export { randomBytes, randomInt, randomUUID } from "node:crypto";

export const charactersNumeric = "0123456789";
export const charactersAlphaUpper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export const charactersAlphaLower = "abcdefghijklmnopqrstuvwxyz";
export const charactersAlpha = charactersAlphaUpper + charactersAlphaLower;
export const charactersAlphaNumeric = charactersAlpha + charactersNumeric;
export const charactersDistinguishable = "CDEHKMPRTUWXY012458";

const randomCharactersCache = {};
export const randomCharacters = (
	length,
	characters = charactersAlphaNumeric,
) => {
	randomCharactersCache[characters] ??= customAlphabet(characters);
	return randomCharactersCache[characters](length);
};

export const randomAlphaNumeric = (characterLength) => {
	return randomCharacters(characterLength, charactersAlphaNumeric);
};

export const randomNumeric = (characterLength) => {
	let value = "";
	for (let i = characterLength; i--; ) {
		value += randomInt(0, 10);
	}
	return value;
};

// *** configs *** //
// Input: {id, prefix, entropy, characters, opt, expire}
// Output: {id, type, opt, expire, create, ...}
export const makeRandomConfigObject = ({
	id,
	prefix = "",
	entropy = 64,
	characters = charactersAlphaNumeric,
	...params
} = {}) => {
	const minLength = entropyToCharacterLength(entropy, characters.length);
	const config = {
		id,
		type: "id",
		create: () => prefix + randomCharacters(minLength, characters),
		...params,
	};
	return config;
};

// *** Digests *** //
export const randomChecksumSalt = () => {
	return randomBytes(32); // 256 bits
};
export const randomChecksumPepper = () => {
	return randomIV(); // 96
};

export const createSaltedValue = (value, { checksumSalt } = {}) => {
	checksumSalt ??= options.digestChecksumSalt;
	if (!checksumSalt) {
		return value;
	}
	const newValue = value + checksumSalt;
	return newValue;
};
// Deterministic encryption using a fixed IV (checksumPepper) to enable
// privacy-compliant digest lookups. Rotating the pepper invalidates all
// existing digests, supporting GDPR right-to-erasure workflows.
// The ciphertexts are never stored directly - only their hashes are persisted.
// A digest is keyed by all four of the pepper, the salt, the encryption key, and
// the signature secret, because symmetricEncrypt signs the packet on the way
// out. Every one of them has to be passable, or a caller that supplies the whole
// set still silently gets whatever the module globals happen to hold. That is
// what a key rotation needs: the new digest, computed before the new material
// is live.
export const createPepperedValue = (
	value,
	{ checksumPepper, encryptionKey, signatureSecret } = {},
) => {
	checksumPepper ??= options.digestChecksumPepper;
	encryptionKey ??= options.symmetricEncryptionKey;
	if (!checksumPepper || !encryptionKey) {
		return value;
	}
	const newValue = symmetricEncrypt(value, {
		encryptionKey,
		signatureSecret,
		sub: "",
		iv: checksumPepper,
	});
	return newValue;
};

export const createChecksum = (value, { hashAlgorithm, encoding } = {}) => {
	hashAlgorithm ??= options.digestChecksumHashAlgorithm;
	encoding ??= options.digestChecksumEncoding;
	return createHash(hashAlgorithm).update(value).digest(encoding);
};
export const createSeasonedChecksum = (
	value,
	{
		hashAlgorithm,
		encoding,
		checksumSalt,
		checksumPepper,
		encryptionKey,
		signatureSecret,
	} = {},
) => {
	return createChecksum(
		createPepperedValue(createSaltedValue(value, { checksumSalt }), {
			checksumPepper,
			encryptionKey,
			signatureSecret,
		}),
		{
			hashAlgorithm,
			encoding,
		},
	);
};

export const createDigest = (value, { hashAlgorithm, encoding } = {}) => {
	hashAlgorithm ??= options.digestChecksumHashAlgorithm;
	const checksum = createChecksum(value, { hashAlgorithm, encoding });
	return `${hashAlgorithm}:${checksum}`;
};
export const createSaltedDigest = (
	value,
	{ hashAlgorithm, encoding, checksumSalt } = {},
) => {
	hashAlgorithm ??= options.digestChecksumHashAlgorithm;
	const checksum = createChecksum(createSaltedValue(value, { checksumSalt }), {
		hashAlgorithm,
		encoding,
	});
	return `${hashAlgorithm}:${checksum}`;
};
export const createPepperedDigest = (
	value,
	{
		hashAlgorithm,
		encoding,
		checksumPepper,
		encryptionKey,
		signatureSecret,
	} = {},
) => {
	hashAlgorithm ??= options.digestChecksumHashAlgorithm;
	const checksum = createChecksum(
		createPepperedValue(value, {
			checksumPepper,
			encryptionKey,
			signatureSecret,
		}),
		{
			hashAlgorithm,
			encoding,
		},
	);
	return `${hashAlgorithm}:${checksum}`;
};
export const createSeasonedDigest = (
	value,
	{
		hashAlgorithm,
		encoding,
		checksumSalt,
		checksumPepper,
		encryptionKey,
		signatureSecret,
	} = {},
) => {
	hashAlgorithm ??= options.digestChecksumHashAlgorithm;
	const checksum = createSeasonedChecksum(value, {
		hashAlgorithm,
		encoding,
		checksumSalt,
		checksumPepper,
		encryptionKey,
		signatureSecret,
	});
	return `${hashAlgorithm}:${checksum}`;
};

// *** Hashing *** //
// `memoryCost` is a log2 exponent, NOT KiB: memory = 2 ** memoryCost KiB.
// Passing KiB (e.g. 2 ** 15) silently asked for 2 ** 32768 KiB = Infinity, which
// surfaced as an opaque failure deep inside node's argon2 binding. 31 caps it at
// 2 TiB, far above anything real, so anything larger is a units mistake.
export const assertMemoryCost = (memoryCost) => {
	if (!Number.isInteger(memoryCost) || memoryCost < 3 || memoryCost > 31) {
		throw new RangeError(
			`memoryCost must be a log2 exponent between 3 and 31, received ${memoryCost}`,
			{ cause: { memoryCost } },
		);
	}
};

// NOTE: the PHC string spec defines `m=` as memory in KiB, but we write the
// exponent. Every stored hash encodes it this way, so correcting it is a format
// migration (decode both forms, rehash on next verify), not an edit.
// ponytail: non-standard `m=`, only ever read back by this library. Fix it when
// a hash has to be verified by something that is not @1auth/crypto.
export const encodeArgon2 = ({
	algorithm,
	version,
	memoryCost,
	timeCost,
	parallelism,
	nonce,
	hash,
} = {}) => {
	return `$${algorithm}$v=${version}$m=${memoryCost},t=${timeCost},p=${parallelism}$${nonce.toString(options.defaultEncoding)}$${hash.toString(options.defaultEncoding)}`;
};
export const decodeArgon2 = (str) => {
	const argon2Options = {};
	const optionMap = {
		m: "memoryCost",
		t: "timeCost",
		p: "parallelism",
	};
	let [, algorithm, version, variables, nonce, hash] = str.split("$");

	if (version) {
		version = Number.parseInt(version.replace("v=", ""), 10);
	}
	nonce = Buffer.from(nonce, options.defaultEncoding);
	hash = Buffer.from(hash, options.defaultEncoding);
	const nonceLength = Buffer.byteLength(nonce);
	const hashLength = Buffer.byteLength(hash);
	Object.assign(argon2Options, {
		algorithm,
		version,
		nonce,
		nonceLength,
		hash,
		hashLength,
	});
	for (const pair of variables.split(",")) {
		const [key, value] = pair.split("=");
		argon2Options[optionMap[key]] = Number.parseInt(value, 10);
	}
	return argon2Options;
};

export const createArgon2 = (
	message,
	{
		algorithm,
		version,
		parallelism,
		memoryCost,
		timeCost,
		nonceLength,
		hashLength,
	} = {},
) => {
	algorithm ??= options.secretArgon2Algorithm;
	version ??= options.secretArgon2Version;
	memoryCost ??= options.secretArgon2MemoryCost;
	timeCost ??= options.secretArgon2TimeCost;
	parallelism ??= options.secretArgon2Parallelism;
	nonceLength ??= options.secretArgon2NonceLength;
	hashLength ??= options.secretArgon2HashLength;
	assertMemoryCost(memoryCost);

	const nonce = randomBytes(nonceLength);
	const hash = argon2Sync(algorithm, {
		message,
		nonce,
		parallelism,
		memory: 2 ** memoryCost,
		passes: timeCost,
		tagLength: hashLength,
	});
	return encodeArgon2({
		algorithm,
		version,
		memoryCost,
		timeCost,
		parallelism,
		nonce,
		hash,
	});
};
export const verifyArgon2 = (derivedKey, message) => {
	const {
		algorithm,
		memoryCost,
		timeCost,
		parallelism,
		nonce,
		hash,
		hashLength,
	} = decodeArgon2(derivedKey);
	// Params come off a stored string; a malformed `m=` would otherwise reach
	// argon2Sync as Infinity. authn treats a throw here as "credential invalid".
	assertMemoryCost(memoryCost);

	const verifyHash = argon2Sync(algorithm, {
		message,
		nonce,
		parallelism,
		memory: 2 ** memoryCost,
		passes: timeCost,
		tagLength: hashLength,
	});
	return timingSafeEqual(hash, verifyHash);
};

export const createSecretHash = createArgon2;
export const verifySecretHash = verifyArgon2;

// *** Symmetric Encryption *** //
const authTagLength = 16;
// 96 bits, the nonce size both supported AEAD ciphers take. Named because the
// checksum pepper is used as an IV and has to be validated against it.
const ivLength = 12;
// 16 is already node's default for both supported AEAD ciphers, so this is
// belt-and-braces against a future cipher whose default differs.
// Stryker disable next-line ObjectLiteral: byte-identical output either way
const cipherOptions = { authTagLength };
// The subject is bound into the ciphertext as associated data. Buffer.from
// decodes utf8 by default, which is what every stored packet was written with.
const associatedData = (sub) => Buffer.from(sub);

export const symmetricRandomEncryptionKey = () => {
	return randomBytes(32); // 256 bits
};

export const randomIV = () => {
	return randomBytes(ivLength); // 96 bits
};

// *** Encryption key providers *** //
// Wrapped keys store as `<provider>:<payload>` and read by prefix, not config,
// so providers change with no migration. Name = package suffix + version:
// `@1auth/crypto` -> `1`, `@1auth/crypto-kms` -> `kms1`. No prefix predates the
// scheme, unambiguous because base64, base64url and hex all exclude `:`.
export const encryptionKeyProviderSeparator = ":";
const encryptionKeyProviderDefault = "1";

// Null prototype: the name comes off a stored wrapped key, so on a plain object
// `toString:…` or `constructor:…` resolves to an inherited function, passes the
// truthiness guards below, and dies on `provider.decrypt is not a function`
// instead of falling back as documented. It also makes `__proto__` a storable
// provider name rather than a silently discarded assignment.
const encryptionKeyProviders = Object.create(null);

export const registerEncryptionKeyProvider = (name, provider) => {
	encryptionKeyProviders[name] = provider;
};

export const getEncryptionKeyProviders = () => encryptionKeyProviders;

const parseEncryptedKey = (encryptedKey) => {
	const separatorIndex = encryptedKey.indexOf(encryptionKeyProviderSeparator);
	const name = encryptedKey.substring(0, separatorIndex);
	// unknown prefix falls to `1` and fails its signature check, never mis-decrypts
	if (separatorIndex < 0 || !encryptionKeyProviders[name]) {
		return {
			provider: encryptionKeyProviders[encryptionKeyProviderDefault],
			payload: encryptedKey,
		};
	}
	return {
		provider: encryptionKeyProviders[name],
		payload: encryptedKey.substring(separatorIndex + 1),
	};
};

// The in-process provider, and the format every pre-prefix row was written in.
registerEncryptionKeyProvider(encryptionKeyProviderDefault, {
	generate: (sub, { encryptionKey, signatureSecret } = {}) => {
		encryptionKey ??= options.symmetricEncryptionKey;
		signatureSecret ??= options.symmetricSignatureSecret;

		const rowEncryptionKey = symmetricRandomEncryptionKey();
		const rowEncryptedKey = symmetricEncrypt(rowEncryptionKey, {
			encryptionKey,
			signatureSecret,
			sub,
		});
		return { encryptionKey: rowEncryptionKey, encryptedKey: rowEncryptedKey };
	},
	decrypt: (payload, sub, { encryptionKey, signatureSecret } = {}) => {
		encryptionKey ??= options.symmetricEncryptionKey;
		signatureSecret ??= options.symmetricSignatureSecret;

		return Buffer.from(
			symmetricDecrypt(payload, {
				encryptionKey,
				signatureSecret,
				sub,
				encoding: options.symmetricEncryptionEncoding,
			}),
			options.symmetricEncryptionEncoding,
		);
	},
});

export const symmetricGenerateEncryptionKey = (sub, providerOptions = {}) => {
	const name =
		providerOptions.encryptionKeyProvider ?? options.encryptionKeyProvider;
	const provider = encryptionKeyProviders[name];
	if (!provider) {
		throw new Error("Unknown encryptionKeyProvider", { cause: { name } });
	}
	const { encryptionKey, encryptedKey } = provider.generate(
		sub,
		providerOptions,
	);
	return {
		encryptionKey,
		encryptedKey: `${name}${encryptionKeyProviderSeparator}${encryptedKey}`,
	};
};

// sub add context to encryption
export const symmetricEncryptFields = (
	values,
	{ encryptedKey, encryptionKey, signatureSecret, sub },
	// naming a field the values do not carry is a no-op: `values[key] &&= ...`
	// never assigns, so no default other than empty is observable
	// Stryker disable next-line ArrayDeclaration
	fields = [],
) => {
	if (encryptedKey) {
		encryptionKey ??= symmetricDecryptKey(encryptedKey, {
			signatureSecret,
			sub,
		});
	}
	if (!encryptionKey) return values;
	const encryptedValues = structuredClone(values);
	for (const key of fields) {
		encryptedValues[key] &&= symmetricEncrypt(encryptedValues[key], {
			encryptionKey,
			signatureSecret,
			sub,
		});
	}
	return encryptedValues;
};

export const symmetricEncrypt = (
	data,
	{ encryptedKey, encryptionKey, signatureSecret, sub, decoding, encoding, iv },
) => {
	if (encryptedKey) {
		encryptionKey ??= symmetricDecryptKey(encryptedKey, {
			signatureSecret,
			sub,
		});
	}
	if (!encryptionKey || !data) return data;
	// Stryker disable next-line StringLiteral: node's normalizeEncoding maps "" to
	// utf8, so the two spellings are the same encoding to every Buffer API
	decoding ??= "utf8";
	encoding ??= options.symmetricEncryptionEncoding;
	iv ??= randomIV();
	const cipher = createCipheriv(
		options.symmetricEncryptionAlgorithm,
		encryptionKey,
		iv,
		cipherOptions,
	);
	cipher.setAAD(associatedData(sub));
	const encryptedData =
		cipher.update(data, decoding, encoding) + cipher.final(encoding);
	const authTag = cipher.getAuthTag();

	const encryptedDataPacket =
		iv.toString(encoding) + authTag.toString(encoding) + encryptedData;

	// Encrypt-then-MAC: HMAC signature wraps the AEAD ciphertext so that
	// signature secrets can be rotated independently without re-encryption.
	return symmetricSignatureSign(encryptedDataPacket, { signatureSecret });
};

export const symmetricDecryptFields = (
	encryptedValues,
	{ encryptedKey, encryptionKey, signatureSecret, sub },
	// see symmetricEncryptFields
	// Stryker disable next-line ArrayDeclaration
	fields = [],
) => {
	if (encryptedKey) {
		encryptionKey ??= symmetricDecryptKey(encryptedKey, {
			signatureSecret,
			sub,
		});
	}
	if (!encryptionKey) return encryptedValues;
	const values = structuredClone(encryptedValues);
	for (const key of fields) {
		values[key] &&= symmetricDecrypt(values[key], {
			encryptionKey,
			signatureSecret,
			sub,
		});
	}
	return values;
};

export const symmetricDecryptKey = (
	encryptedKey,
	{ sub, encryptionKey, signatureSecret } = {},
) => {
	const { provider, payload } = parseEncryptedKey(encryptedKey);
	return provider.decrypt(payload, sub, { encryptionKey, signatureSecret });
};

export const symmetricDecrypt = (
	signedEncryptedDataPacket,
	{ encryptedKey, encryptionKey, signatureSecret, sub, decoding, encoding },
) => {
	if (encryptedKey) {
		encryptionKey ??= symmetricDecryptKey(encryptedKey, {
			signatureSecret,
			sub,
		});
	}
	if (!encryptionKey || !signedEncryptedDataPacket)
		return signedEncryptedDataPacket;
	decoding ??= options.symmetricEncryptionEncoding;
	// Stryker disable next-line StringLiteral: see symmetricEncrypt's decoding
	encoding ??= "utf8";

	// remove signature when successful
	const encryptedDataPacket = symmetricSignatureVerify(
		signedEncryptedDataPacket,
		{
			signatureSecret,
		},
	);

	if (encryptedDataPacket === false) {
		throw new Error("Signature incorrect", {
			cause: { signedEncryptedDataPacket },
		});
	}
	const iv = Buffer.from(
		encryptedDataPacket.substring(0, symmetricEncryptionEncodingLengths.iv),
		decoding,
	);
	const authTag = Buffer.from(
		encryptedDataPacket.substring(
			symmetricEncryptionEncodingLengths.iv,
			symmetricEncryptionEncodingLengths.ivAndAuthTag,
		),
		decoding,
	);
	const encryptedData = Buffer.from(
		encryptedDataPacket.substring(
			symmetricEncryptionEncodingLengths.ivAndAuthTag,
		),
		decoding,
	);

	const decipher = createDecipheriv(
		options.symmetricEncryptionAlgorithm,
		encryptionKey,
		iv,
		cipherOptions,
	);
	decipher.setAAD(associatedData(sub));

	decipher.setAuthTag(authTag);
	const data =
		decipher.update(encryptedData, decoding, encoding) +
		decipher.final(encoding);
	return data;
};

// *** Symmetric Signatures *** //
export const symmetricRandomSignatureSecret = () => {
	return randomBytes(32); // 256 bits
};

export const symmetricGenerateSignatureSecret = () => {
	const signatureSecret = symmetricRandomSignatureSecret();
	return { signatureSecret };
};

export const symmetricSignatureSign = (
	data,
	{ hashAlgorithm, signatureSecret } = {},
) => {
	signatureSecret ??= options.symmetricSignatureSecret;
	hashAlgorithm ??= options.symmetricSignatureHashAlgorithm;
	const digest = createHmac(hashAlgorithm, signatureSecret)
		.update(data)
		.digest(options.symmetricSignatureEncoding);
	// base64 uses `=` only as trailing padding, so an unanchored match can never
	// find one mid-string; the anchor documents the intent and still holds if the
	// encoding ever changes.
	// Stryker disable next-line Regex: equivalent for every padded encoding
	const signature = digest.replace(/=+$/, "");

	const signedData = `${data}.${signature}`;
	return signedData;
};

export const symmetricSignatureVerify = (
	signedData,
	{ hashAlgorithm, signatureSecret } = {},
) => {
	if (typeof signedData !== "string") return false;
	const lastIndexOf = signedData.lastIndexOf(".");
	// Reject unsigned data
	// Stryker disable next-line ConditionalExpression: without this guard the
	// comparison below still fails for unsigned data, but only by accident of
	// substring(0, -1); the explicit rejection is the contract.
	if (lastIndexOf < 0) return false;
	const data = signedData.substring(0, lastIndexOf);
	const signedDataExpected = symmetricSignatureSign(data, {
		hashAlgorithm,
		signatureSecret,
	});
	return safeEqual(signedData, signedDataExpected) && data;
};

// Allow rotation of global encryption key, global signature secret, and row encryption key
export const symmetricRotation = (
	oldEncryptedValues,
	oldOptions, // { encryptionKey, signatureSecret, sub, decoding, encoding }, // old
	oldFields,
	newOptions, // { encryptionKey, signatureSecret, sub, decoding, encoding }, // new
	newFields,
	transform = (data) => {
		return data;
	},
) => {
	if (newOptions && oldOptions.sub !== newOptions.sub)
		throw new Error("Mismatching `sub`", {
			cause: { sub: oldOptions.sub },
		});

	const oldEncryptedValuesClone = structuredClone(oldEncryptedValues);
	// Don't use structuredClone, converts Buffer to Uint8Array ...
	const oldOptionsClone = { ...oldOptions };
	const newOptionsClone = { ...(newOptions ?? oldOptions) };

	// decrypt old encryption key
	const { encryptionKey: oldEncryptedKey } = oldEncryptedValuesClone;
	oldEncryptedValuesClone.encryptionKey = undefined;

	const oldEncryptionKey = symmetricDecryptKey(
		oldEncryptedKey,
		oldOptionsClone,
	);
	oldOptionsClone.encryptionKey = oldEncryptionKey;

	// decrypt
	const data = transform(
		symmetricDecryptFields(
			oldEncryptedValuesClone,
			{ ...oldOptionsClone, encryptionKey: oldEncryptionKey },
			oldFields,
		),
	);

	// rotate encryptionKey
	const { encryptionKey: newEncryptionKey, encryptedKey: newEncryptedKey } =
		symmetricGenerateEncryptionKey(newOptionsClone.sub, newOptionsClone);
	newOptionsClone.encryptionKey = newEncryptionKey;

	// encrypt
	const newEncryptedValues = symmetricEncryptFields(
		data,
		newOptionsClone,
		newFields ?? oldFields,
	);
	newEncryptedValues.encryptionKey = newEncryptedKey;

	return newEncryptedValues;
};

// *** Asymmetric Signatures *** //
// asymmetricKeyPairType
export const makeAsymmetricKeys = async () => {
	const { publicKey, privateKey } = await generateKeyPair("ec", {
		namedCurve: options.asymmetricKeyNamedCurve,
		paramEncoding: "named",
		publicKeyEncoding: {
			type: "spki",
			format: "pem",
		},
		privateKeyEncoding: {
			type: "sec1",
			format: "pem",
			// Encryption done at another level for consistency
			// cipher: options.asymmetricEncryptionAlgorithm,
			// passphrase: encryptionKey,
		},
	});
	return { publicKey, privateKey };
};

export const makeAsymmetricSignature = async (
	data,
	privateKey,
	{ hashAlgorithm } = {},
) => {
	hashAlgorithm ??= options.asymmetricSignatureHashAlgorithm;
	return (await sign(hashAlgorithm, Buffer.from(data), privateKey)).toString(
		options.asymmetricSignatureEncoding,
	);
};
export const verifyAsymmetricSignature = async (
	data,
	publicKey,
	signature,
	{ hashAlgorithm } = {},
) => {
	hashAlgorithm ??= options.asymmetricSignatureHashAlgorithm;
	return await verify(
		hashAlgorithm,
		Buffer.from(data),
		publicKey,
		Buffer.from(signature, options.asymmetricSignatureEncoding),
	);
};

export const nowInSeconds = () => Math.floor(Date.now() / 1000);

// *** Argument guards *** //
// `cause` is for developer debugging only, never expose to end users.
// Lives here because every package already depends on @1auth/crypto.
export const assertSub = (sub, cause) => {
	if (!sub || typeof sub !== "string") {
		throw new Error("401 Unauthorized", { cause: { sub, ...cause } });
	}
};

export const assertId = (id, cause) => {
	if (!id || typeof id !== "string") {
		throw new Error("404 Not Found", { cause: { id, ...cause } });
	}
};

export const safeEqual = (input, expected) => {
	const bufferInput = Buffer.from(input);
	const bufferExpected = Buffer.from(expected);
	return (
		bufferInput.length === bufferExpected.length &&
		timingSafeEqual(bufferInput, bufferExpected)
	);
};
