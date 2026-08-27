import {
	deepEqual,
	equal,
	notDeepEqual,
	notEqual,
	ok,
	throws,
} from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, it } from "node:test";
import crypto, {
	assertId,
	assertMemoryCost,
	assertSub,
	charactersAlpha,
	charactersAlphaLower,
	charactersAlphaNumeric,
	charactersAlphaUpper,
	charactersDistinguishable,
	charactersNumeric,
	// createArgon2,
	createDigest,
	createPepperedDigest,
	createSaltedDigest,
	createSaltedValue,
	createSeasonedDigest,
	createSecretHash,
	decodeArgon2,
	encodeArgon2,
	encryptionKeyProviderSeparator,
	entropyToCharacterLength,
	getEncryptionKeyProviders,
	getOptions,
	makeAsymmetricKeys,
	makeAsymmetricSignature,
	makeOptionsBuffer,
	makeRandomConfigObject,
	nowInSeconds,
	randomAlphaNumeric,
	randomChecksumPepper,
	randomChecksumSalt,
	randomNumeric,
	registerEncryptionKeyProvider,
	safeEqual,
	symmetricDecrypt,
	symmetricDecryptFields,
	symmetricDecryptKey,
	symmetricEncrypt,
	symmetricEncryptFields,
	symmetricGenerateEncryptionKey,
	symmetricGenerateSignatureSecret,
	symmetricRandomEncryptionKey,
	symmetricRandomSignatureSecret,
	symmetricRotation,
	symmetricSignatureSign,
	symmetricSignatureVerify,
	// verifyArgon2,
	verifyAsymmetricSignature,
	verifySecretHash,
} from "../crypto/index.js";

// Fixed test vectors, so the digests asserted below stay stable. Declared once
// and reused: tests that reconfigure the singleton restore it from here.
const testOptions = {
	symmetricEncryptionKey: "K6u9kqw3u+w/VxR48wYT21hUY56gDIWgxzL5uPTK9zw=", // symmetricRandomEncryptionKey()
	symmetricSignatureSecret: "B6u9kqw3u+w/VxR48wYT21hUY56gDIWgxzL5uPTK9zw=", // symmetricRandomSignatureSecret()
	digestChecksumSalt: "ViB9S/dvoJUB7lcNU9oA97/hT+kUvD2FLat7lXudF34=", // randomChecksumSalt()
	digestChecksumPepper: "x7yUpaFphJU4hLDzL7dSUxpMkPuYOn2s0uz2pIVwYWQ=", // randomChecksumPepper()
};
crypto(testOptions);

/*
ASVS v5.0 (bits)
2.6.2: 112
2.6.4: 20
2.7.6: 20
2.7.7: 64
2.9.2: 64
3.2.2: 128
*/

describe("crypto", () => {
	describe("entropy", () => {
		it("alphaNumeric", async () => {
			for (const [bits, chars] of Object.entries({
				128: 22,
				112: 19,
				64: 11,
				20: 4,
			})) {
				const characterLength = entropyToCharacterLength(
					bits,
					charactersAlphaNumeric.length,
				);
				equal(characterLength, chars);
			}
		});
		it("numeric", async () => {
			for (const [bits, chars] of Object.entries({
				128: 39,
				112: 34,
				64: 20,
				19: 6,
			})) {
				const characterLength = entropyToCharacterLength(
					bits,
					charactersNumeric.length,
				);
				equal(characterLength, chars);
			}
		});
	});

	describe("random", () => {
		const randomAlphaNumericRegExp = /^[A-Za-z0-9]+$/;
		it("randomAlphaNumeric", async () => {
			const value = randomAlphaNumeric(64);
			equal(value.length, 64);
			ok(randomAlphaNumericRegExp.test(value));
		});
		const randomNumericRegExp = /^[0-9]+$/;
		it("randomNumeric", async () => {
			const value = randomNumeric(6);
			equal(value.length, 6);
			ok(randomNumericRegExp.test(value));
		});
		const randomIdRegExp = /^[A-Za-z0-9]+$/;
		it("makeRandomConfigObject()", async () => {
			const prefix = "";
			const entropy = 128;
			const randomId = makeRandomConfigObject({ prefix, entropy });
			const value = randomId.create(prefix);
			ok(randomIdRegExp.test(value));
			equal(value.length, 22);
		});
		it("makeRandomConfigObject(prefix)", async () => {
			const prefix = "prefix_";
			const entropy = 128;
			const randomId = makeRandomConfigObject({ prefix, entropy });
			const value = randomId.create();
			ok(new RegExp(`^${prefix}[A-Za-z0-9_-]+$`).test(value));
			equal(value.length, prefix.length + 22);
		});
	});

	describe("digest", () => {
		it("createDigest", async () => {
			let digest = createDigest("1auth", { hashAlgorithm: "sha3-256" });
			equal(digest, "sha3-256:0uITV182D6igoH3CrcihY+fFrN1s/1aQlYjJoCOjhDs=");
			digest = createDigest("1auth", { hashAlgorithm: "sha3-256" });
			equal(digest, "sha3-256:0uITV182D6igoH3CrcihY+fFrN1s/1aQlYjJoCOjhDs=");
		});
		it("createSaltedDigest", async () => {
			let digest = createSaltedDigest("1auth", { hashAlgorithm: "sha3-256" });
			equal(digest, "sha3-256:8aVqzzAf/gWlLblIWvvNVO/2ct5LGq8jK/MPi0q/ZZ8=");
			digest = createSaltedDigest("1auth", { hashAlgorithm: "sha3-256" });
			equal(digest, "sha3-256:8aVqzzAf/gWlLblIWvvNVO/2ct5LGq8jK/MPi0q/ZZ8=");
		});
		it("createSaltedDigest w/o checksumSalt", async () => {
			let digest = createSaltedDigest("1auth", {
				hashAlgorithm: "sha3-256",
				checksumSalt: "",
			});
			equal(digest, "sha3-256:0uITV182D6igoH3CrcihY+fFrN1s/1aQlYjJoCOjhDs=");
			digest = createSaltedDigest("1auth", {
				hashAlgorithm: "sha3-256",
				checksumSalt: "",
			});
			equal(digest, "sha3-256:0uITV182D6igoH3CrcihY+fFrN1s/1aQlYjJoCOjhDs=");
		});
		it("createSaltedValue passes the value through when salting is off", async () => {
			// `??=` only fills in the configured salt for null/undefined, so any
			// other falsy value is an explicit "salting disabled"
			for (const checksumSalt of ["", false, 0]) {
				equal(createSaltedValue("1auth", { checksumSalt }), "1auth");
			}
			// and with a salt the value is extended by it
			equal(createSaltedValue("1auth", { checksumSalt: "S" }), "1authS");
		});
		it("createPepperedDigest", async () => {
			let digest = createPepperedDigest("1auth", {
				hashAlgorithm: "sha3-256",
			});
			// KAT: sha3-256(HMAC-sha3-256(pepper, value)), computed from raw
			// node:crypto primitives, independent of the implementation
			equal(digest, "sha3-256:pPMf8HzDgpriPYOHKXwBJI9Sd9PIQptWm4kkfNcw+cQ=");
			digest = createPepperedDigest("1auth", {
				hashAlgorithm: "sha3-256",
			});
			equal(digest, "sha3-256:pPMf8HzDgpriPYOHKXwBJI9Sd9PIQptWm4kkfNcw+cQ=");
		});
		it("createPepperedDigest w/o checksumPepper", async () => {
			let digest = createPepperedDigest("1auth", {
				hashAlgorithm: "sha3-256",
				checksumPepper: "",
			});
			equal(digest, "sha3-256:0uITV182D6igoH3CrcihY+fFrN1s/1aQlYjJoCOjhDs=");
			digest = createPepperedDigest("1auth", {
				hashAlgorithm: "sha3-256",
				checksumPepper: "",
			});
			equal(digest, "sha3-256:0uITV182D6igoH3CrcihY+fFrN1s/1aQlYjJoCOjhDs=");
		});
		it("createSeasonedDigest", async () => {
			let digest = createSeasonedDigest("1auth", {
				hashAlgorithm: "sha3-256",
			});
			// KAT: sha3-256(HMAC-sha3-256(pepper, value + salt))
			equal(digest, "sha3-256:aNyexR/m4tFFX5FyROEHKcS2yPwmuZd5a/6b03H5UJo=");
			digest = createSeasonedDigest("1auth", {
				hashAlgorithm: "sha3-256",
			});
			equal(digest, "sha3-256:aNyexR/m4tFFX5FyROEHKcS2yPwmuZd5a/6b03H5UJo=");
		});
		it("createSeasonedDigest w/o checksumSalt & checksumPepper", async () => {
			let digest = createSeasonedDigest("1auth", {
				hashAlgorithm: "sha3-256",
				checksumSalt: "",
				checksumPepper: "",
			});
			equal(digest, "sha3-256:0uITV182D6igoH3CrcihY+fFrN1s/1aQlYjJoCOjhDs=");
			digest = createSeasonedDigest("1auth", {
				hashAlgorithm: "sha3-256",
				checksumSalt: "",
				checksumPepper: "",
			});
			equal(digest, "sha3-256:0uITV182D6igoH3CrcihY+fFrN1s/1aQlYjJoCOjhDs=");
		});
		it("createSeasonedDigest keys off every secret it is given", async () => {
			// A rotation has to compute the new digest before the new material is
			// live, so each of these has to reach the primitive rather than fall
			// back to the module globals.
			const other = {
				checksumSalt: randomChecksumSalt(),
				checksumPepper: randomChecksumPepper(),
			};
			const base = createSeasonedDigest("1auth");
			for (const secret of Object.keys(other)) {
				notEqual(
					createSeasonedDigest("1auth", { [secret]: other[secret] }),
					base,
					secret,
				);
			}
		});
		it("createPepperedDigest keys off every secret it is given", async () => {
			const other = {
				checksumPepper: randomChecksumPepper(),
			};
			const base = createPepperedDigest("1auth");
			for (const secret of Object.keys(other)) {
				notEqual(
					createPepperedDigest("1auth", { [secret]: other[secret] }),
					base,
					secret,
				);
			}
		});
		it("digests are independent of the encryption key and signature secret", async () => {
			// The digest is an HMAC keyed only by the pepper (and salt), so
			// rotating the encryption material no longer invalidates digests.
			const base = createSeasonedDigest("1auth");
			try {
				crypto({
					...testOptions,
					symmetricEncryptionKey: symmetricRandomEncryptionKey(),
					symmetricSignatureSecret: symmetricRandomSignatureSecret(),
				});
				equal(createSeasonedDigest("1auth"), base);
			} finally {
				crypto(testOptions);
			}
		});
		it("randomChecksumPepper returns a 256 bit HMAC key", async () => {
			equal(randomChecksumPepper().length, 32);
		});
	});

	describe("hash", () => {
		it("decodeArgon2() tolerates a hash with no version segment", async () => {
			const { nonce, hash } = decodeArgon2(
				createSecretHash("s3cret", { sub: "sub_000" }),
			);
			const encoding = getOptions().defaultEncoding;
			const noVersion = `$argon2id$$m=4,t=2,p=1$${nonce.toString(encoding)}$${hash.toString(encoding)}`;
			// left as-is rather than parsed into NaN
			equal(decodeArgon2(noVersion).version, "");
		});
		it("encodeArgon2() returns string that can be decoded", async () => {
			const options = {
				algorithm: "argon2id",
				version: 19,
				memoryCost: 15, // 2^memoryCost // Default 2 ** 12 = 4MB
				timeCost: 3, // Default 3
				parallelism: 1, // Default 1
				nonceLength: 16,
				nonce: randomBytes(16), // nonceLength,
				hashLength: 64, // hashLength: 128 // Default 32
				hash: randomBytes(64), // tagLength
			};
			const hash = encodeArgon2(options);
			equal(typeof hash, "string");
			const parts = decodeArgon2(hash);
			equal(parts.algorithm, options.algorithm);
			equal(parts.version, options.version);
			equal(parts.memoryCost, options.memoryCost);
			equal(parts.timeCost, options.timeCost);
			equal(parts.parallelism, options.parallelism);
			equal(parts.nonceLength, options.nonceLength);
			deepEqual(parts.nonce, options.nonce);
			equal(parts.hashLength, options.hashLength);
			deepEqual(parts.hash, options.hash);
		});
		it("createSecretHash() rejects memoryCost given in KiB instead of log2", async () => {
			// 2 ** 15 is the *memory*, 15 is the exponent. Passing the former
			// used to compute 2 ** 32768 = Infinity and throw deep inside node.
			throws(() => createSecretHash("1auth", { memoryCost: 2 ** 15 }), {
				name: "RangeError",
				message: /log2 exponent/,
			});
		});
		it("createSecretHash() returns hash that can be verified", async () => {
			const message = "1auth";
			const derivedKey = await createSecretHash(message);

			const parts = decodeArgon2(derivedKey);
			equal(parts.algorithm, "argon2id");
			equal(parts.version, 19);
			equal(parts.memoryCost, 15);
			equal(parts.timeCost, 3);
			equal(parts.parallelism, 1);
			equal(parts.nonceLength, 16);
			equal(parts.hashLength, 64);

			const valid = await verifySecretHash(derivedKey, message);
			ok(valid);
		});

		it("verifySecretHash() should fail when value was not used to create hash", async () => {
			const value = "1auth";
			const hash = await createSecretHash(value);

			const parts = decodeArgon2(hash);
			equal(parts.algorithm, "argon2id");
			equal(parts.memoryCost, 15);
			equal(parts.timeCost, 3);
			equal(parts.parallelism, 1);
			equal(parts.version, 19);
			equal(parts.nonceLength, 16);
			equal(parts.hashLength, 64);

			const valid = await verifySecretHash(hash, `${value}fail`);
			ok(!valid);
		});
	});

	describe("symmetric encryption", () => {
		it("Can make encryptionKey/encryptedKey pair", async () => {
			const sub = "sub_000000";

			const { encryptedKey, encryptionKey } =
				symmetricGenerateEncryptionKey(sub);
			equal(Buffer.from(encryptionKey).length, randomBytes(32).length);

			const decryptedKey = symmetricDecryptKey(encryptedKey, { sub });
			equal(Buffer.from(decryptedKey).length, randomBytes(32).length);
			equal(decryptedKey.toString("base64"), encryptionKey.toString("base64"));
		});
		it("Can make encryptionKey/encryptedKey pair (override options)", async () => {
			const sub = "sub_000000";

			const overrideEncryptionKey = symmetricRandomEncryptionKey();
			const overrideSignatureSecret = symmetricRandomSignatureSecret();

			const { encryptedKey, encryptionKey } = symmetricGenerateEncryptionKey(
				sub,
				{
					encryptionKey: overrideEncryptionKey,
					signatureSecret: overrideSignatureSecret,
				},
			);
			equal(Buffer.from(encryptionKey).length, randomBytes(32).length);

			const decryptedKey = symmetricDecryptKey(encryptedKey, {
				sub,
				encryptionKey: overrideEncryptionKey,
				signatureSecret: overrideSignatureSecret,
			});
			equal(Buffer.from(decryptedKey).length, randomBytes(32).length);
			equal(decryptedKey.toString("base64"), encryptionKey.toString("base64"));
		});
		it("Can encrypt and decrypt a string using encryptionKey", async () => {
			const sub = "sub_000000";

			const { encryptionKey } = symmetricGenerateEncryptionKey(sub);

			const value = "1auth";
			const encryptedValue = symmetricEncrypt(value, {
				encryptionKey,
				sub,
			});
			notEqual(encryptedValue, value);
			const decryptedValue = symmetricDecrypt(encryptedValue, {
				encryptionKey,
				sub,
			});
			equal(decryptedValue, value);
		});
		it("Can encrypt and decrypt a string using encryptedKey", async () => {
			const sub = "sub_000000";

			const { encryptedKey } = symmetricGenerateEncryptionKey(sub);

			const value = "1auth";
			const encryptedValue = symmetricEncrypt(value, {
				encryptedKey,
				sub,
			});
			notEqual(encryptedValue, value);
			const decryptedValue = symmetricDecrypt(encryptedValue, {
				encryptedKey,
				sub,
			});
			equal(decryptedValue, value);
		});
		it("Can NOT encrypt and decrypt a string using EMPTY encryption key", async () => {
			const sub = "sub_000000";

			const encryptionKey = "";

			const value = "1auth";
			const encryptedValue = symmetricEncrypt(value, {
				encryptionKey,
				sub,
			});
			equal(encryptedValue, value);
			const decryptedValue = symmetricDecrypt(encryptedValue, {
				encryptionKey,
				sub,
			});
			equal(decryptedValue, value);
		});

		it("Can encrypt and decrypt a string using encrypted key", async () => {
			const sub = "sub_000000";

			const { encryptedKey, encryptionKey } =
				symmetricGenerateEncryptionKey(sub);

			equal(
				symmetricDecryptKey(encryptedKey, { sub }).toString("base64"),
				encryptionKey.toString("base64"),
			);

			const value = "1auth";
			const encryptedValue = symmetricEncrypt(value, {
				encryptedKey,
				sub,
			});
			notEqual(encryptedValue, value);
			const decryptedValue = symmetricDecrypt(encryptedValue, {
				encryptedKey,
				sub,
			});
			equal(decryptedValue, value);
		});
		it("Can NOT encrypt and decrypt a string using EMPTY encrypted key", async () => {
			const sub = "sub_000000";

			const encryptedKey = "";

			const value = "1auth";
			const encryptedValue = symmetricEncrypt(value, {
				encryptedKey,
				sub,
			});
			equal(encryptedValue, value);
			const decryptedValue = symmetricDecrypt(encryptedValue, {
				encryptedKey,
				sub,
			});
			equal(decryptedValue, value);
		});
		it("Can NOT decrypt when signature is invailid", async () => {
			const sub = "sub_000000";

			const { encryptionKey, encryptedKey } =
				symmetricGenerateEncryptionKey(sub);

			const value = "1auth";
			const encryptedValue = symmetricEncrypt(value, {
				encryptionKey,
				sub,
			});
			throws(
				() =>
					symmetricDecrypt(encryptedValue, {
						encryptedKey,
						signatureSecret: Buffer.from("invalid"),
						sub,
					}),
				{
					message: "Signature incorrect",
					// the wrapped key is unwrapped first, so that is the packet
					// whose signature fails, and it is carried for debugging. The
					// provider prefix is stripped before the packet gets that far.
					cause: {
						signedEncryptedDataPacket: encryptedKey.split(
							encryptionKeyProviderSeparator,
						)[1],
					},
				},
			);
		});
		it("Should tag a new wrapped key with the provider that wrote it", async () => {
			const { encryptedKey } = symmetricGenerateEncryptionKey("sub_000000");
			ok(encryptedKey.startsWith(`1${encryptionKeyProviderSeparator}`));
		});
		it("Should read a wrapped key written before the prefix existed", async () => {
			const sub = "sub_000000";

			const { encryptedKey, encryptionKey } =
				symmetricGenerateEncryptionKey(sub);
			// exactly what every row held before providers were introduced
			const legacyKey = encryptedKey.substring(
				encryptedKey.indexOf(encryptionKeyProviderSeparator) + 1,
			);
			ok(!legacyKey.includes(encryptionKeyProviderSeparator));

			equal(
				symmetricDecryptKey(legacyKey, { sub }).toString("base64"),
				encryptionKey.toString("base64"),
			);
		});
		it("Should NOT silently read a key whose provider is not loaded", async () => {
			// a row wrapped by a provider this deployment has not loaded must fail
			// loudly, never fall back to a local unwrap that returns garbage
			const sub = "sub_000000";
			const { encryptedKey } = symmetricGenerateEncryptionKey(sub);

			throws(
				() =>
					symmetricDecryptKey(
						`kms9${encryptionKeyProviderSeparator}${encryptedKey}`,
						{ sub },
					),
				{ message: "Signature incorrect" },
			);
		});
		it("Should throw when the configured provider does not exist", async () => {
			throws(
				() =>
					symmetricGenerateEncryptionKey("sub_000000", {
						encryptionKeyProvider: "nope",
					}),
				{ message: "Unknown encryptionKeyProvider" },
			);
		});
		it("Should treat an Object.prototype name as a provider that does not exist", async () => {
			// the registry is keyed by a name taken off a stored wrapped key, so on
			// a plain object these resolve to inherited functions, pass the
			// truthiness guards, and die on `provider.generate is not a function`
			for (const name of ["toString", "constructor", "valueOf", "__proto__"]) {
				throws(
					() =>
						symmetricGenerateEncryptionKey("sub_000000", {
							encryptionKeyProvider: name,
						}),
					{ message: "Unknown encryptionKeyProvider" },
					name,
				);
			}
		});
		it("Should NOT silently read a key prefixed with an Object.prototype name", async () => {
			const sub = "sub_000000";
			const { encryptedKey } = symmetricGenerateEncryptionKey(sub);

			for (const name of ["toString", "constructor", "valueOf", "__proto__"]) {
				throws(
					() =>
						symmetricDecryptKey(
							`${name}${encryptionKeyProviderSeparator}${encryptedKey}`,
							{ sub },
						),
					{ message: "Signature incorrect" },
					name,
				);
			}
		});
		it("Should let a provider name itself after an Object.prototype member", async () => {
			const sub = "sub_000000";
			const rowKey = symmetricRandomEncryptionKey();
			registerEncryptionKeyProvider("__proto__", {
				generate: () => ({
					encryptionKey: rowKey,
					encryptedKey: "wrapped-by-proto",
				}),
				decrypt: () => rowKey,
			});
			// an own key, which is the point: on a plain object this assignment
			// would have set the prototype and stored nothing
			ok(Object.hasOwn(getEncryptionKeyProviders(), "__proto__"));

			const { encryptedKey } = symmetricGenerateEncryptionKey(sub, {
				encryptionKeyProvider: "__proto__",
			});
			equal(
				encryptedKey,
				`__proto__${encryptionKeyProviderSeparator}wrapped-by-proto`,
			);
			deepEqual(symmetricDecryptKey(encryptedKey, { sub }), rowKey);
		});
		it("Should let a provider register itself", async () => {
			const sub = "sub_000000";
			const rowKey = symmetricRandomEncryptionKey();
			registerEncryptionKeyProvider("test1", {
				generate: () => ({
					encryptionKey: rowKey,
					encryptedKey: "wrapped-by-test1",
				}),
				decrypt: (payload) => {
					equal(payload, "wrapped-by-test1");
					return rowKey;
				},
			});
			ok(getEncryptionKeyProviders().test1);

			const { encryptedKey } = symmetricGenerateEncryptionKey(sub, {
				encryptionKeyProvider: "test1",
			});
			equal(
				encryptedKey,
				`test1${encryptionKeyProviderSeparator}wrapped-by-test1`,
			);
			deepEqual(symmetricDecryptKey(encryptedKey, { sub }), rowKey);
		});
		it("encrypt can be decrypted object fields", async () => {
			const sub = "sub_000000";
			const fields = ["name"];

			const { encryptedKey } = symmetricGenerateEncryptionKey(sub);

			const values = { name: "pii", create: "2000-01-01" };
			const encryptedValues = symmetricEncryptFields(
				values,
				{ encryptedKey, sub },
				fields,
			);
			notDeepEqual(encryptedValues, values);
			const decryptedValues = symmetricDecryptFields(
				encryptedValues,
				{ encryptedKey, sub },
				fields,
			);
			deepEqual(decryptedValues, values);
		});
	});

	describe("symmetric signatures", () => {
		it("Should be able to sign using a encryption key and verify using encryption key", async () => {
			const data = "1auth";
			const { signatureSecret } = symmetricGenerateSignatureSecret();
			const signedData = symmetricSignatureSign(data, { signatureSecret });
			const valid = symmetricSignatureVerify(signedData, { signatureSecret });
			ok(valid);
		});
		it("Should NOT be able to sign using a encryption key and verify using another encryption key", async () => {
			const data = "1auth";
			const { signatureSecret } = symmetricGenerateSignatureSecret();
			const signedData = symmetricSignatureSign(data, { signatureSecret });
			const valid = symmetricSignatureVerify(signedData, {
				signatureSecret: Buffer.from(`not${signatureSecret}`),
			});
			ok(!valid);
		});
		it("Should NOT be able to sign using a encryption key and verify when input is undefined", async () => {
			const { signatureSecret } = symmetricGenerateSignatureSecret();
			const valid = symmetricSignatureVerify(undefined, { signatureSecret });
			ok(!valid);
		});
		it("Should NOT be able to sign using a encryption key and verify when input is unsigned", async () => {
			const data = "1auth";
			const { signatureSecret } = symmetricGenerateSignatureSecret();
			const valid = symmetricSignatureVerify(data, { signatureSecret });
			ok(!valid);
		});
	});

	describe("symmetric signature padding", () => {
		it("Should strip every base64 padding character from a signature", () => {
			// sha3-384 base64 happens to land on a 3-byte boundary and needs no
			// padding, so use a digest length that produces two `=`
			const signed = symmetricSignatureSign("1auth", {
				hashAlgorithm: "sha3-224",
			});
			const signature = signed.slice("1auth.".length);
			equal(signature.includes("="), false);
			equal(signature.length, 38); // 40 base64 chars less two of padding
			equal(
				symmetricSignatureVerify(signed, { hashAlgorithm: "sha3-224" }),
				"1auth",
			);
		});
		it("Should verify a signature over empty data", () => {
			// `sign("")` puts the separator at index 0, which is still a signature
			const signed = symmetricSignatureSign("");
			equal(signed.startsWith("."), true);
			// verification returns the data it recovered, here the empty string
			equal(symmetricSignatureVerify(signed), "");
		});
		it("Should not verify unsigned data", () => {
			equal(symmetricSignatureVerify("1auth"), false);
			equal(symmetricSignatureVerify(""), false);
			equal(symmetricSignatureVerify(undefined), false);
			equal(symmetricSignatureVerify(1234), false);
		});
		it("Should make a signature secret of its own", () => {
			const { signatureSecret } = symmetricGenerateSignatureSecret();
			equal(Buffer.byteLength(signatureSecret), 32);
			// and it is usable as one
			const signed = symmetricSignatureSign("1auth", { signatureSecret });
			equal(symmetricSignatureVerify(signed, { signatureSecret }), "1auth");
			equal(symmetricSignatureVerify(signed), false);
		});
	});

	describe("symmetric field helpers", () => {
		it("Should hand back the very same object when there is no key", () => {
			// not a clone: without a key there is nothing to do, so the caller's
			// object is passed straight through
			const values = { value: "1auth" };
			equal(symmetricEncryptFields(values, {}, ["value"]), values);
			equal(symmetricDecryptFields(values, {}, ["value"]), values);
		});
		it("Should leave every field alone when none are named", () => {
			const sub = "sub_000000";
			const { encryptionKey } = symmetricGenerateEncryptionKey(sub);
			const values = { value: "1auth", other: "kept" };
			deepEqual(symmetricEncryptFields(values, { encryptionKey, sub }), values);
			deepEqual(symmetricDecryptFields(values, { encryptionKey, sub }), values);
		});
		it("Should honour a non-default decoding and encoding", () => {
			const sub = "sub_000000";
			const { encryptionKey } = symmetricGenerateEncryptionKey(sub);
			const hex = Buffer.from("1auth").toString("hex");
			const encrypted = symmetricEncrypt(hex, {
				encryptionKey,
				sub,
				decoding: "hex",
			});
			// read back as hex, it is the same bytes we put in
			equal(
				symmetricDecrypt(encrypted, { encryptionKey, sub, encoding: "hex" }),
				hex,
			);
		});
	});

	describe("symmetric rotation", () => {
		it("Should be able to rotate the values encryptionKey (x1)", async () => {
			// setup
			const sub = "sub_000000";
			const fields = ["name"];

			const oldOptions = { sub };
			const oldFields = fields;
			const newOptions = { sub };
			const newFields = fields;

			const { encryptionKey, encryptedKey } = symmetricGenerateEncryptionKey(
				sub,
				oldOptions,
			);
			const values = {
				name: "pii",
				create: "2000-01-01",
				encryptionKey: encryptedKey,
			};
			const oldEncryptedValues = symmetricEncryptFields(
				values,
				{ ...oldOptions, encryptionKey },
				oldFields,
			);

			// start
			const newEncryptedValues = symmetricRotation(
				oldEncryptedValues,
				oldOptions,
				oldFields,
				newOptions,
				newFields,
			);

			// test
			const decryptedValues = symmetricDecryptFields(
				newEncryptedValues,
				{ ...newOptions, encryptedKey: newEncryptedValues.encryptionKey },
				newFields,
			);
			values.encryptionKey = undefined;
			decryptedValues.encryptionKey = undefined;
			deepEqual(decryptedValues, values);
		});
		it("Should be able to rotate the values encryptionKey (x2)", async () => {
			// setup
			const sub = "sub_000000";
			const fields = ["name"];

			const oldOptions = { sub };
			const oldFields = fields;
			const newOptions = { sub };
			const newFields = fields;

			const { encryptionKey, encryptedKey } = symmetricGenerateEncryptionKey(
				sub,
				oldOptions,
			);
			const values = {
				name: "pii",
				create: "2000-01-01",
				encryptionKey: encryptedKey,
			};
			const oldEncryptedValues = symmetricEncryptFields(
				values,
				{ ...oldOptions, encryptionKey },
				oldFields,
			);

			// start
			const nextEncryptedValues = symmetricRotation(
				oldEncryptedValues,
				oldOptions,
				oldFields,
				newOptions,
				newFields,
			);
			const newEncryptedValues = symmetricRotation(
				nextEncryptedValues,
				structuredClone(oldOptions),
				oldFields,
				structuredClone(newOptions),
				newFields,
			);

			// test
			const decryptedValues = symmetricDecryptFields(
				newEncryptedValues,
				{ ...newOptions, encryptedKey: newEncryptedValues.encryptionKey },
				newFields,
			);
			values.encryptionKey = undefined;
			decryptedValues.encryptionKey = undefined;
			deepEqual(decryptedValues, values);
		});
		it("Should be able to rotate the values with transform", async () => {
			// setup
			const sub = "sub_000000";
			const fields = ["name"];

			const oldOptions = { sub };
			const oldFields = fields;
			const newOptions = { sub };
			const newFields = fields;

			const now = Date.now();
			const transform = (data) => {
				data.rotate = now;
				return data;
			};

			const { encryptionKey, encryptedKey } = symmetricGenerateEncryptionKey(
				sub,
				oldOptions,
			);
			const values = {
				name: "pii",
				create: "2000-01-01",
				encryptionKey: encryptedKey,
			};
			const oldEncryptedValues = symmetricEncryptFields(
				values,
				{ ...oldOptions, encryptionKey },
				oldFields,
			);

			// start
			const newEncryptedValues = symmetricRotation(
				oldEncryptedValues,
				oldOptions,
				oldFields,
				newOptions,
				newFields,
				transform,
			);

			// test
			const decryptedValues = symmetricDecryptFields(
				newEncryptedValues,
				{ ...newOptions, encryptedKey: newEncryptedValues.encryptionKey },
				newFields,
			);
			values.encryptionKey = undefined;
			decryptedValues.encryptionKey = undefined;
			equal(decryptedValues.rotate, now);
		});
		it("Should be able to rotate the values encrypted fields", async () => {
			// setup
			const sub = "sub_000000";

			const oldOptions = { sub };
			const oldFields = ["oldName"];
			const newOptions = { sub };
			const newFields = ["newName"];

			const { encryptionKey, encryptedKey } = symmetricGenerateEncryptionKey(
				sub,
				oldOptions,
			);
			const values = {
				oldName: "pii",
				newName: "pii",
				create: "2000-01-01",
				encryptionKey: encryptedKey,
			};
			const oldEncryptedValues = symmetricEncryptFields(
				values,
				{ ...oldOptions, encryptionKey },
				oldFields,
			);

			notEqual(oldEncryptedValues.oldName, values.oldName);
			equal(oldEncryptedValues.newName, values.newName);

			// start
			const newEncryptedValues = symmetricRotation(
				oldEncryptedValues,
				oldOptions,
				oldFields,
				newOptions,
				newFields,
			);
			equal(newEncryptedValues.oldName, values.oldName);
			notEqual(newEncryptedValues.newName, values.newName);

			// test
			const decryptedValues = symmetricDecryptFields(
				newEncryptedValues,
				{ ...newOptions, encryptedKey: newEncryptedValues.encryptionKey },
				newFields,
			);
			values.encryptionKey = undefined;
			decryptedValues.encryptionKey = undefined;

			deepEqual(decryptedValues, values);
		});
		it("Should be able to rotate the config encryptionKey", async () => {
			// setup
			const sub = "sub_000000";
			const fields = ["name"];

			const oldEncryptionKey = symmetricRandomEncryptionKey();
			const newEncryptionKey = symmetricRandomEncryptionKey();

			const oldOptions = {
				encryptionKey: oldEncryptionKey,
				sub,
			};
			const oldFields = fields;
			const newOptions = {
				encryptionKey: newEncryptionKey,
				sub,
			};
			const newFields = fields;

			const { encryptionKey, encryptedKey } = symmetricGenerateEncryptionKey(
				sub,
				oldOptions,
			);
			const values = {
				name: "pii",
				create: "2000-01-01",
				encryptionKey: encryptedKey,
			};
			const oldEncryptedValues = symmetricEncryptFields(
				values,
				{ ...oldOptions, encryptionKey },
				oldFields,
			);

			// start
			const newEncryptedValues = symmetricRotation(
				oldEncryptedValues,
				oldOptions,
				oldFields,
				newOptions,
				newFields,
			);

			// test
			const newRowEncryptionKey = symmetricDecryptKey(
				newEncryptedValues.encryptionKey,
				newOptions,
			);
			const decryptedValues = symmetricDecryptFields(
				newEncryptedValues,
				{ ...newOptions, encryptionKey: newRowEncryptionKey },
				newFields,
			);
			values.encryptionKey = undefined;
			decryptedValues.encryptionKey = undefined;
			deepEqual(decryptedValues, values);
		});
		it("Should be able to rotate the config signatureSecret", async () => {
			// setup
			const sub = "sub_000000";
			const fields = ["name"];

			const oldSignatureSecret = symmetricRandomSignatureSecret();
			const newSignatureSecret = symmetricRandomSignatureSecret();

			const oldOptions = { signatureSecret: oldSignatureSecret, sub };
			const oldFields = fields;
			const newOptions = { signatureSecret: newSignatureSecret, sub };
			const newFields = fields;

			const { encryptionKey, encryptedKey } = symmetricGenerateEncryptionKey(
				sub,
				oldOptions,
			);
			const values = {
				name: "pii",
				create: "2000-01-01",
				encryptionKey: encryptedKey,
			};
			const oldEncryptedValues = symmetricEncryptFields(
				values,
				{ ...oldOptions, encryptionKey },
				oldFields,
			);

			// start
			const newEncryptedValues = symmetricRotation(
				oldEncryptedValues,
				oldOptions,
				oldFields,
				newOptions,
				newFields,
			);

			// test
			const decryptedValues = symmetricDecryptFields(
				newEncryptedValues,
				{ ...newOptions, encryptedKey: newEncryptedValues.encryptionKey },
				newFields,
			);
			values.encryptionKey = undefined;
			decryptedValues.encryptionKey = undefined;
			deepEqual(decryptedValues, values);
		});
		it("Should expose the resolved options", async () => {
			ok(getOptions().symmetricEncryptionKey);
			equal(getOptions().defaultEncoding, "base64");
		});
		it("Should pass values through untouched without an encryption key", async () => {
			const values = { value: "plain" };
			deepEqual(
				symmetricEncryptFields(values, { sub: "sub_0" }, ["value"]),
				values,
			);
			deepEqual(
				symmetricDecryptFields(values, { sub: "sub_0" }, ["value"]),
				values,
			);
		});
		it("Should reuse the old options and fields when new ones are omitted", async () => {
			const sub = "sub_000000";
			const { encryptionKey, encryptedKey } =
				symmetricGenerateEncryptionKey(sub);
			const encrypted = symmetricEncryptFields(
				{ value: "secret" },
				{ encryptionKey, sub },
				["value"],
			);
			encrypted.encryptionKey = encryptedKey;
			// only three arguments: `newOptions` and `newFields` fall back to the old
			const rotated = symmetricRotation(encrypted, { sub }, ["value"]);
			const decrypted = symmetricDecryptFields(
				rotated,
				{ encryptedKey: rotated.encryptionKey, sub },
				["value"],
			);
			equal(decrypted.value, "secret");
		});
		it("Should NOT rotate across a different `sub`", async () => {
			// `sub` is the AEAD associated data, so re-encrypting under another
			// subject would silently produce a row that cannot be read back
			throws(
				() =>
					symmetricRotation(
						{ encryptionKey: "x" },
						{ sub: "sub_000000" },
						["value"],
						{ sub: "sub_111111" },
					),
				{ message: "Mismatching `sub`", cause: { sub: "sub_000000" } },
			);
		});
		it("Should be able to rotate all cryptography", async () => {
			// setup
			const sub = "sub_000000";
			const fields = ["name"];

			const oldEncryptionKey = symmetricRandomEncryptionKey();
			const oldSignatureSecret = symmetricRandomSignatureSecret();
			const newEncryptionKey = symmetricRandomEncryptionKey();
			const newSignatureSecret = symmetricRandomSignatureSecret();

			const oldOptions = {
				encryptionKey: oldEncryptionKey,
				signatureSecret: oldSignatureSecret,
				sub,
			};
			const oldFields = fields;
			const newOptions = {
				encryptionKey: newEncryptionKey,
				signatureSecret: newSignatureSecret,
				sub,
			};
			const newFields = fields;

			// setup
			const { encryptionKey, encryptedKey } = symmetricGenerateEncryptionKey(
				sub,
				oldOptions,
			);
			const values = {
				name: "pi",
				create: "2000-01-01",
				encryptionKey: encryptedKey,
			};
			const oldEncryptedValues = symmetricEncryptFields(
				values,
				{ ...oldOptions, encryptionKey },
				oldFields,
			);

			// start
			const newEncryptedValues = symmetricRotation(
				oldEncryptedValues,
				oldOptions,
				oldFields,
				newOptions,
				newFields,
			);

			// test
			const newRowEncryptionKey = symmetricDecryptKey(
				newEncryptedValues.encryptionKey,
				newOptions,
			);
			const decryptedValues = symmetricDecryptFields(
				newEncryptedValues,
				{ ...newOptions, encryptionKey: newRowEncryptionKey },
				newFields,
			);
			values.encryptionKey = undefined;
			decryptedValues.encryptionKey = undefined;
			deepEqual(decryptedValues, values);
		});
	});

	describe("asymmetric signatures", () => {
		it("Should be able to sign using a private key and verify using public key", async () => {
			const data = "1auth";
			const { publicKey, privateKey } = await makeAsymmetricKeys();
			const signature = await makeAsymmetricSignature(data, privateKey);
			const valid = await verifyAsymmetricSignature(data, publicKey, signature);
			ok(valid);
		});
		it("Should NOT be able to dign using a private key and verify using another public key", async () => {
			const data = "1auth";

			const alice = await makeAsymmetricKeys();
			const bob = await makeAsymmetricKeys();
			const signature = await makeAsymmetricSignature(data, alice.privateKey);
			const valid = await verifyAsymmetricSignature(
				data,
				bob.publicKey,
				signature,
			);
			ok(!valid);
		});
	});

	describe("options", () => {
		// These leave the singleton half-configured, so put it back afterwards
		const restore = () => crypto(testOptions);
		const secrets = {
			symmetricEncryptionKey: symmetricRandomEncryptionKey(),
			symmetricSignatureSecret: symmetricRandomSignatureSecret(),
			digestChecksumSalt: randomChecksumSalt(),
			digestChecksumPepper: randomChecksumPepper(),
		};
		it("Should fail when digestChecksumPepper is shorter than 32 bytes", () => {
			// the pepper is the digest HMAC key; a 12 byte pepper is the old
			// encrypt-era size, which must rotate anyway
			try {
				throws(
					() => crypto({ ...secrets, digestChecksumPepper: randomBytes(31) }),
					{ name: "RangeError", message: /at least 32 bytes, received 31/ },
				);
			} finally {
				restore();
			}
		});
		it("Should accept a digestChecksumPepper of exactly 32 bytes", () => {
			try {
				crypto({ ...secrets, digestChecksumPepper: randomBytes(32) });
			} finally {
				restore();
			}
		});
		for (const missing of Object.keys(secrets)) {
			it(`Should fail when missing ${missing}`, () => {
				const opt = { ...secrets };
				delete opt[missing];
				try {
					throws(
						() => crypto(opt),
						(e) => e.message.includes(missing),
					);
				} finally {
					restore();
				}
			});
		}
		it("Should resolve hash algorithms and encodings from the defaults", () => {
			restore();
			const options = getOptions();
			// each of these falls back to the shared default when not given
			equal(options.defaultHashAlgorithm, "sha3-384");
			equal(options.defaultEncoding, "base64");
			equal(options.symmetricSignatureHashAlgorithm, "sha3-384");
			equal(options.asymmetricSignatureHashAlgorithm, "sha3-384");
			equal(options.digestChecksumHashAlgorithm, "sha3-384");
			equal(options.symmetricEncryptionEncoding, "base64");
			equal(options.symmetricSignatureEncoding, "base64");
			equal(options.asymmetricSignatureEncoding, "base64");
			equal(options.digestChecksumEncoding, "base64");
		});
		it("Should keep hash algorithms and encodings that are given", () => {
			try {
				crypto({
					symmetricEncryptionKey: secrets.symmetricEncryptionKey,
					symmetricSignatureSecret: secrets.symmetricSignatureSecret,
					digestChecksumSalt: secrets.digestChecksumSalt,
					digestChecksumPepper: secrets.digestChecksumPepper,
					symmetricSignatureHashAlgorithm: "sha256",
					asymmetricSignatureHashAlgorithm: "sha512",
					digestChecksumHashAlgorithm: "sha384",
				});
				const options = getOptions();
				equal(options.symmetricSignatureHashAlgorithm, "sha256");
				equal(options.asymmetricSignatureHashAlgorithm, "sha512");
				equal(options.digestChecksumHashAlgorithm, "sha384");
			} finally {
				restore();
			}
		});
		it("Should carry the argon2 settings into the hasher", () => {
			try {
				crypto({
					...secrets,
					secretArgon2TimeCost: 2,
					secretArgon2MemoryCost: 4,
					secretArgon2Parallelism: 1,
					secretArgon2HashLength: 32,
					secretArgon2NonceLength: 8,
				});
				const hash = createSecretHash("s3cret", { sub: "sub_000" });
				const decoded = decodeArgon2(hash);
				equal(decoded.algorithm, "argon2id");
				equal(decoded.version, 19);
				equal(decoded.timeCost, 2);
				equal(decoded.memoryCost, 4);
				equal(decoded.parallelism, 1);
				equal(decoded.hashLength, 32);
				equal(decoded.nonceLength, 8);
			} finally {
				restore();
			}
		});
		it("Should accept a Buffer secret as readily as an encoded string", () => {
			const asBuffer = randomBytes(32);
			try {
				crypto({ ...secrets, symmetricEncryptionKey: asBuffer });
				// handed back untouched, not re-decoded from a string
				equal(getOptions().symmetricEncryptionKey, asBuffer);
			} finally {
				restore();
			}
			equal(
				makeOptionsBuffer("ViB9S/dvoJUB7lcNU9oA97/hT+kUvD2FLat7lXudF34=")
					.length,
				32,
			);
			equal(makeOptionsBuffer(asBuffer), asBuffer);
			// the encoding is what turns a string into bytes
			equal(makeOptionsBuffer("QUJD", "base64").toString("utf8"), "ABC");
			equal(makeOptionsBuffer("QUJD", "utf8").toString("utf8"), "QUJD");
		});
	});

	describe("character pools", () => {
		it("Should expose the pools it generates from", () => {
			equal(charactersNumeric, "0123456789");
			equal(charactersAlphaUpper, "ABCDEFGHIJKLMNOPQRSTUVWXYZ");
			equal(charactersAlphaLower, "abcdefghijklmnopqrstuvwxyz");
			equal(charactersAlpha, charactersAlphaUpper + charactersAlphaLower);
			equal(charactersAlphaNumeric, charactersAlpha + charactersNumeric);
			// the human-readable pool drops characters that are easily confused
			equal(charactersDistinguishable, "CDEHKMPRTUWXY012458");
			for (const confusable of ["I", "L", "O", "S", "3", "6", "7", "9"]) {
				equal(charactersDistinguishable.includes(confusable), false);
			}
		});
	});

	describe("`makeRandomConfigObject`", () => {
		it("Should describe an id generator", () => {
			const config = makeRandomConfigObject({ id: "authn" });
			equal(config.id, "authn");
			equal(config.type, "id");
			// no prefix by default: the generated value is pool characters only
			const value = config.create();
			equal(/^[A-Za-z0-9]+$/.test(value), true);
			equal(value.length, entropyToCharacterLength(64, 62));
		});
		it("Should let params override the shape", () => {
			const config = makeRandomConfigObject({
				id: "authn",
				type: "secret",
				expire: 600,
			});
			equal(config.type, "secret");
			equal(config.expire, 600);
		});
		it("Should size the value to the entropy and pool asked for", () => {
			const config = makeRandomConfigObject({
				prefix: "tok_",
				entropy: 128,
				characters: charactersNumeric,
			});
			const value = config.create();
			equal(value.startsWith("tok_"), true);
			equal(value.length, "tok_".length + entropyToCharacterLength(128, 10));
			equal(/^tok_[0-9]+$/.test(value), true);
		});
	});

	describe("`assertMemoryCost`", () => {
		it("Should accept the whole log2 range, ends included", () => {
			for (const memoryCost of [3, 4, 15, 30, 31]) {
				equal(assertMemoryCost(memoryCost), undefined);
			}
		});
		it("Should reject a memoryCost outside the log2 range", () => {
			for (const memoryCost of [2, 0, -1, 32, 2 ** 15]) {
				throws(() => assertMemoryCost(memoryCost), {
					name: "RangeError",
					cause: { memoryCost },
				});
			}
		});
		it("Should reject a memoryCost that is not a whole number", () => {
			// in range but fractional, so the integer check has to stand on its own
			for (const memoryCost of [15.5, 4.2, Number.NaN, "15", undefined, null]) {
				throws(() => assertMemoryCost(memoryCost), {
					name: "RangeError",
					cause: { memoryCost },
				});
			}
		});
		it("Should name the offending value in its message", () => {
			throws(() => assertMemoryCost(32), {
				message:
					"memoryCost must be a log2 exponent between 3 and 31, received 32",
			});
		});
	});

	describe("guards", () => {
		it("Should reject a sub that is not a non-empty string", () => {
			for (const sub of [undefined, "", 0, 1234, null, {}, true]) {
				throws(() => assertSub(sub), {
					message: "401 Unauthorized",
					cause: { sub },
				});
			}
			for (const sub of ["sub_000", "0"]) {
				equal(assertSub(sub), undefined);
			}
		});
		it("Should carry extra debugging context on a sub", () => {
			throws(() => assertSub(undefined, { id: "authn_1" }), {
				message: "401 Unauthorized",
				cause: { sub: undefined, id: "authn_1" },
			});
		});
		it("Should reject an id that is not a non-empty string", () => {
			for (const id of [undefined, "", 0, 1234, null, {}, true]) {
				throws(() => assertId(id), {
					message: "404 Not Found",
					cause: { id },
				});
			}
			for (const id of ["authn_1", "0"]) {
				equal(assertId(id), undefined);
			}
		});
		it("Should carry extra debugging context on an id", () => {
			throws(() => assertId(undefined, { sub: "sub_000" }), {
				message: "404 Not Found",
				cause: { id: undefined, sub: "sub_000" },
			});
		});
		it("Should compare equal-length values without leaking a mismatch", () => {
			equal(safeEqual("abc", "abc"), true);
			equal(safeEqual("abc", "abd"), false);
			// a length mismatch short-circuits rather than throwing
			equal(safeEqual("abc", "abcd"), false);
			equal(safeEqual("", ""), true);
		});
		it("Should report the current time in whole seconds", () => {
			const before = Math.floor(Date.now() / 1000);
			const now = nowInSeconds();
			equal(Number.isInteger(now), true);
			ok(now >= before);
			ok(now <= Math.floor(Date.now() / 1000));
			// seconds, not milliseconds
			ok(now < Date.now());
		});
	});
});
