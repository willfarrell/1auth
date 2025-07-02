import { Bench } from "tinybench";
import crypto, {
	createDigest,
	createPepperedDigest,
	createSaltedDigest,
	createSeasonedDigest,
	createSecretHash,
	randomAlphaNumeric,
	randomChecksumPepper,
	randomChecksumSalt,
	randomNumeric,
	symmetricDecrypt,
	symmetricEncrypt,
	symmetricGenerateEncryptionKey,
	symmetricRandomEncryptionKey,
	symmetricRandomSignatureSecret,
	symmetricSignatureSign,
	symmetricSignatureVerify,
	verifySecretHash,
	// safeEqual
} from "../crypto/index.js";

crypto({
	symmetricEncryptionKey: symmetricRandomEncryptionKey(),
	symmetricSignatureSecret: symmetricRandomSignatureSecret(),
	digestChecksumSalt: randomChecksumSalt(),
	digestChecksumPepper: randomChecksumPepper(),
});

const suite = new Bench({ name: "@1auth/crypto" });

const sub = "sub_000000";
const value = "1auth";
const hash = await createSecretHash(value);
const hashFastest = await createSecretHash(value, {
	timeCost: 1,
	memoryCost: 2 ** 3,
	parallelism: 1,
});
const hashTimeCost2 = await createSecretHash(value, { timeCost: 6 });
const hashMemoryCost2 = await createSecretHash(value, { memoryCost: 2 ** 16 });
const hashParallelism2 = await createSecretHash(value, { parallelism: 2 });
const { encryptionKey } = symmetricGenerateEncryptionKey(sub);
const encryptedValue = symmetricEncrypt(value, { sub, encryptionKey });
const signedValue = symmetricSignatureSign(value);

suite
	.add("randomAlphaNumeric", () => {
		randomAlphaNumeric();
	})
	.add("randomNumeric", () => {
		randomNumeric();
	})
	.add('createDigest({ hashAlgorithm: "sha2-256" })', () => {
		createDigest(value, { hashAlgorithm: "sha2-256" });
	})
	.add('createDigest({ hashAlgorithm: "sha3-384" })', () => {
		createDigest(value, { hashAlgorithm: "sha3-384" });
	})
	.add('createSaltedDigest({ hashAlgorithm: "sha2-256" })', () => {
		createSaltedDigest(value, { hashAlgorithm: "sha2-256" });
	})
	.add('createPepperedDigest({ hashAlgorithm: "sha2-256" })', () => {
		createPepperedDigest(value, { hashAlgorithm: "sha2-256" });
	})
	.add('createSeasonedDigest({ hashAlgorithm: "sha2-256" })', () => {
		createSeasonedDigest(value, { hashAlgorithm: "sha2-256" });
	})
	.add("createSecretHash (default)", async () => {
		await createSecretHash(value, {
			timeCost: 3,
			memoryCost: 2 ** 15,
			parallelism: 1,
		});
	})
	.add("createSecretHash (fastest)", async () => {
		await createSecretHash(value, {
			timeCost: 1,
			memoryCost: 2 ** 3,
			parallelism: 1,
		});
	})
	.add("createSecretHash x 2 timeCost", async () => {
		await createSecretHash(value, { timeCost: 6 });
	})
	.add("createSecretHash x 2 memoryCost", async () => {
		await createSecretHash(value, { memoryCost: 2 ** 16 });
	})
	.add("createSecretHash x 2 parallelism", async () => {
		await createSecretHash(value, { parallelism: 2 });
	})
	.add("verifySecretHash = valid", async () => {
		await verifySecretHash(hash, value);
	})
	.add("verifySecretHash = invalid", async () => {
		await verifySecretHash(hash, "invalid");
	})
	.add("verifySecretHash (fastest)", async () => {
		await verifySecretHash(hashFastest, value);
	})
	.add("verifySecretHash x 2 timeCost", async () => {
		await verifySecretHash(hashTimeCost2, value);
	})
	.add("verifySecretHash x 2 memoryCost", async () => {
		await verifySecretHash(hashMemoryCost2, value);
	})
	.add("verifySecretHash x 2 parallelism", async () => {
		await verifySecretHash(hashParallelism2, value);
	})
	.add("symmetricGenerateEncryptionKey", () => {
		symmetricGenerateEncryptionKey(sub);
	})
	.add("symmetricEncrypt", () => {
		symmetricEncrypt(value, { sub, encryptionKey });
	})
	.add("symmetricDecrypt", () => {
		symmetricDecrypt(encryptedValue, {
			sub,
			encryptionKey,
		});
	})
	.add("symmetricSignatureSign", () => {
		symmetricSignatureSign(value);
	})
	.add("symmetricSignatureVerify = valid", () => {
		symmetricSignatureVerify(signedValue);
	})
	.add("symmetricSignatureVerify = invalid", () => {
		symmetricSignatureVerify("invalid");
	});

suite.addEventListener("complete", () => {
	console.table(suite.table());
});

suite.run();
