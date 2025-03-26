import { describe, it } from "node:test";
import {
  ok,
  equal,
  notEqual,
  deepEqual,
  notDeepEqual,
} from "node:assert/strict";
import { randomBytes } from "node:crypto";
import crypto, {
  entropyToCharacterLength,
  charactersAlphaNumeric,
  charactersNumeric,
  randomAlphaNumeric,
  randomNumeric,
  makeRandomConfigObject,
  createDigest,
  createSaltedDigest,
  createPepperedDigest,
  createSeasonedDigest,
  createSecretHash,
  verifySecretHash,
  symmetricRandomEncryptionKey,
  symmetricGenerateEncryptionKey,
  //symmetricRandomSignatureSecret,
  symmetricGenerateSignatureSecret,
  symmetricEncryptFields,
  symmetricEncrypt,
  symmetricDecryptFields,
  symmetricDecrypt,
  symmetricDecryptKey,
  symmetricRandomSignatureSecret,
  symmetricSignatureSign,
  symmetricSignatureVerify,
  symmetricRotation,
  makeAsymmetricKeys,
  makeAsymmetricSignature,
  verifyAsymmetricSignature,
  // safeEqual
} from "../crypto/index.js";

crypto({
  symmetricEncryptionKey: Buffer.from(
    "K6u9kqw3u+w/VxR48wYT21hUY56gDIWgxzL5uPTK9zw=",
    "base64",
  ), // symmetricRandomEncryptionKey()
  symmetricSignatureSecret: Buffer.from(
    "B6u9kqw3u+w/VxR48wYT21hUY56gDIWgxzL5uPTK9zw=",
    "base64",
  ), // symmetricRandomSignatureSecret()
  digestChecksumSalt: Buffer.from(
    "ViB9S/dvoJUB7lcNU9oA97/hT+kUvD2FLat7lXudF34=",
    "base64",
  ), // randomChecksumSalt()
  digestChecksumPepper: Buffer.from("yTJifrFGweECzlse", "base64"), // randomChecksumPepper()
});

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
    it("createPepperedDigest", async () => {
      let digest = createPepperedDigest("1auth", {
        hashAlgorithm: "sha3-256",
      });
      equal(digest, "sha3-256:r9VPCMbABiWVy/xTFYwHtJ3SyUhZcu5cNSIhYI7Awtg=");
      digest = createPepperedDigest("1auth", {
        hashAlgorithm: "sha3-256",
      });
      equal(digest, "sha3-256:r9VPCMbABiWVy/xTFYwHtJ3SyUhZcu5cNSIhYI7Awtg=");
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
      equal(digest, "sha3-256:9zAIe3Jee2+s+AFK18LERL6OiwVaGZgE2xtM7eB2TfA=");
      digest = createSeasonedDigest("1auth", {
        hashAlgorithm: "sha3-256",
      });
      equal(digest, "sha3-256:9zAIe3Jee2+s+AFK18LERL6OiwVaGZgE2xtM7eB2TfA=");
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
  });

  describe("hash", () => {
    it("createSecretHash() returns hash that can be verified", async (t) => {
      const value = "1auth";
      const hash = await createSecretHash(value);

      const parts = parseSecretHash(hash);
      equal(parts.type, "argon2id");
      equal(parts.memoryCost, 32768);
      equal(parts.timeCost, 3);
      equal(parts.parallelism, 1);
      equal(parts.version, 19);
      equal(parts.saltLength, 22);
      equal(parts.hashLength, 86);

      const valid = await verifySecretHash(hash, value);
      ok(valid);
    });

    it("verifySecretHash() should fail when value was not used to create hash", async (t) => {
      const value = "1auth";
      const hash = await createSecretHash(value);

      const parts = parseSecretHash(hash);
      equal(parts.type, "argon2id");
      equal(parts.memoryCost, 32768);
      equal(parts.timeCost, 3);
      equal(parts.parallelism, 1);
      equal(parts.version, 19);
      equal(parts.saltLength, 22);
      equal(parts.hashLength, 86);

      const valid = await verifySecretHash(hash, value + "fail");
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
      try {
        symmetricDecrypt(encryptedValue, {
          encryptedKey,
          signatureSecret: Buffer.from("invalid"),
          sub,
        });
      } catch (e) {
        equal(e.message, "Signature incorrect");
      }
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
        signatureSecret: Buffer.from("not" + signatureSecret),
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
      delete values.encryptionKey;
      delete decryptedValues.encryptionKey;
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
      delete values.encryptionKey;
      delete decryptedValues.encryptionKey;
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
      delete values.encryptionKey;
      delete decryptedValues.encryptionKey;
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
      delete values.encryptionKey;
      delete decryptedValues.encryptionKey;

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
      delete values.encryptionKey;
      delete decryptedValues.encryptionKey;
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
      delete values.encryptionKey;
      delete decryptedValues.encryptionKey;
      deepEqual(decryptedValues, values);
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
      delete values.encryptionKey;
      delete decryptedValues.encryptionKey;
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
});
export const parseSecretHash = (str) => {
  const optionMap = {
    m: "memoryCost",
    t: "timeCost",
    p: "parallelism",
    data: "associatedData",
  };
  const options = {};
  let [, type, version, config, salt, hash] = str.split("$");

  config.split(",").forEach((pair) => {
    const [key, value] = pair.split("=");
    options[optionMap[key]] = Number.parseInt(value);
  });
  if (version) {
    version = Number.parseInt(version.replace("v=", ""));
  }
  if (options.associatedData) {
    delete options.associatedData;
  }
  return {
    ...options,
    type,
    version,
    saltLength: salt.length,
    hashLength: hash.length,
  };
};
