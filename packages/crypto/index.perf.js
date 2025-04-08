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

const suite = new Bench({ name: "@1auth/crypto" });

const hash = await createSecretHash("1auth");
const sub = "sub_000000";
const value = "1auth";
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
	.add("createSecretHash", async () => {
		await createSecretHash(value);
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
