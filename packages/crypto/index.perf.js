import { Bench } from "tinybench";
import crypto, {
  randomAlphaNumeric,
  randomNumeric,
  randomChecksumSalt,
  randomChecksumPepper,
  createDigest,
  createSaltedDigest,
  createPepperedDigest,
  createSeasonedDigest,
  createSecretHash,
  verifySecretHash,
  symmetricRandomEncryptionKey,
  symmetricGenerateEncryptionKey,
  symmetricEncrypt,
  symmetricDecrypt,
  symmetricRandomSignatureSecret,
  symmetricSignatureSign,
  symmetricSignatureVerify,
  // safeEqual
} from "../crypto/index.js";

crypto({
  symmetricEncryptionKey: symmetricRandomEncryptionKey(),
  symmetricSignatureSecret: symmetricRandomSignatureSecret(),
  digestChecksumSalt: randomChecksumSalt(),
  digestChecksumPepper: randomChecksumPepper(),
});

let suite = new Bench({ name: "@1auth/crypto" });

const hash = await createSecretHash("1auth");
const sub = "sub_000000";
const value = "1auth";
const { encryptionKey } = symmetricGenerateEncryptionKey(sub);
const encryptedValue = symmetricEncrypt(value, { sub, encryptionKey });
const signedValue = symmetricSignatureSign(value);

suite
  .add("randomAlphaNumeric", function () {
    randomAlphaNumeric();
  })
  .add("randomNumeric", function () {
    randomNumeric();
  })
  .add('createDigest({ hashAlgorithm: "sha2-256" })', function () {
    createDigest(value, { hashAlgorithm: "sha2-256" });
  })
  .add('createDigest({ hashAlgorithm: "sha3-384" })', function () {
    createDigest(value, { hashAlgorithm: "sha3-384" });
  })
  .add('createSaltedDigest({ hashAlgorithm: "sha2-256" })', function () {
    createSaltedDigest(value, { hashAlgorithm: "sha2-256" });
  })
  .add('createPepperedDigest({ hashAlgorithm: "sha2-256" })', function () {
    createPepperedDigest(value, { hashAlgorithm: "sha2-256" });
  })
  .add('createSeasonedDigest({ hashAlgorithm: "sha2-256" })', function () {
    createSeasonedDigest(value, { hashAlgorithm: "sha2-256" });
  })
  .add("createSecretHash", async function () {
    await createSecretHash(value);
  })
  .add("createSecretHash x 2 timeCost", async function () {
    await createSecretHash(value, { timeCost: 6 });
  })
  .add("createSecretHash x 2 memoryCost", async function () {
    await createSecretHash(value, { memoryCost: 2 ** 16 });
  })
  .add("createSecretHash x 2 parallelism", async function () {
    await createSecretHash(value, { parallelism: 2 });
  })
  .add("verifySecretHash = valid", async function () {
    await verifySecretHash(hash, value);
  })
  .add("verifySecretHash = invalid", async function () {
    await verifySecretHash(hash, "invalid");
  })
  .add("symmetricGenerateEncryptionKey", function () {
    symmetricGenerateEncryptionKey(sub);
  })
  .add("symmetricEncrypt", function () {
    symmetricEncrypt(value, { sub, encryptionKey });
  })
  .add("symmetricDecrypt", function () {
    symmetricDecrypt(encryptedValue, {
      sub,
      encryptionKey,
    });
  })
  .add("symmetricSignatureSign", function () {
    symmetricSignatureSign(value);
  })
  .add("symmetricSignatureVerify = valid", function () {
    symmetricSignatureVerify(signedValue);
  })
  .add("symmetricSignatureVerify = invalid", function () {
    symmetricSignatureVerify("invalid");
  });

suite.addEventListener("complete", function () {
  console.table(suite.table());
});

suite.run();
