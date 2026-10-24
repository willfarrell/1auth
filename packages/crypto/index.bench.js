import { bench, suite } from "node:bench";
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
} from "../crypto/index.js";

crypto({
	symmetricEncryptionKey: symmetricRandomEncryptionKey(),
	symmetricSignatureSecret: symmetricRandomSignatureSecret(),
	digestChecksumSalt: randomChecksumSalt(),
	digestChecksumPepper: randomChecksumPepper(),
});

const sub = "sub_000000";
const value = "1auth";
const hash = await createSecretHash(value);
const hashFastest = await createSecretHash(value, {
	timeCost: 1,
	memoryCost: 3,
	parallelism: 1,
});
const hashTimeCost2 = await createSecretHash(value, { timeCost: 6 });
const hashMemoryCost2 = await createSecretHash(value, { memoryCost: 16 });
const hashParallelism2 = await createSecretHash(value, { parallelism: 2 });
const { encryptionKey } = symmetricGenerateEncryptionKey(sub);
const encryptedValue = symmetricEncrypt(value, { sub, encryptionKey });
const signedValue = symmetricSignatureSign(value);

suite("@1auth/crypto", () => {
	bench("randomAlphaNumeric", { warmup: 100, samples: 30 }, (b) => {
		const ops = 10_000;
		b.start();
		for (let i = 0; i < ops; i++) {
			randomAlphaNumeric();
		}
		b.end(ops);
	});
	bench("randomNumeric", { warmup: 100, samples: 30 }, (b) => {
		const ops = 10_000;
		b.start();
		for (let i = 0; i < ops; i++) {
			randomNumeric();
		}
		b.end(ops);
	});
	bench(
		'createDigest({ hashAlgorithm: "sha2-256" })',
		{ warmup: 100, samples: 30 },
		(b) => {
			const ops = 10_000;
			b.start();
			for (let i = 0; i < ops; i++) {
				createDigest(value, { hashAlgorithm: "sha2-256" });
			}
			b.end(ops);
		},
	);
	bench(
		'createDigest({ hashAlgorithm: "sha3-384" })',
		{ warmup: 100, samples: 30 },
		(b) => {
			const ops = 10_000;
			b.start();
			for (let i = 0; i < ops; i++) {
				createDigest(value, { hashAlgorithm: "sha3-384" });
			}
			b.end(ops);
		},
	);
	bench(
		'createSaltedDigest({ hashAlgorithm: "sha2-256" })',
		{ warmup: 100, samples: 30 },
		(b) => {
			const ops = 10_000;
			b.start();
			for (let i = 0; i < ops; i++) {
				createSaltedDigest(value, { hashAlgorithm: "sha2-256" });
			}
			b.end(ops);
		},
	);
	bench(
		'createPepperedDigest({ hashAlgorithm: "sha2-256" })',
		{ warmup: 100, samples: 30 },
		(b) => {
			const ops = 10_000;
			b.start();
			for (let i = 0; i < ops; i++) {
				createPepperedDigest(value, { hashAlgorithm: "sha2-256" });
			}
			b.end(ops);
		},
	);
	bench(
		'createSeasonedDigest({ hashAlgorithm: "sha2-256" })',
		{ warmup: 100, samples: 30 },
		(b) => {
			const ops = 10_000;
			b.start();
			for (let i = 0; i < ops; i++) {
				createSeasonedDigest(value, { hashAlgorithm: "sha2-256" });
			}
			b.end(ops);
		},
	);
	bench("createSecretHash (default)", { warmup: 2, samples: 10 }, async (b) => {
		const ops = 10;
		b.start();
		for (let i = 0; i < ops; i++) {
			await createSecretHash(value, {
				timeCost: 3,
				memoryCost: 15,
				parallelism: 1,
			});
		}
		b.end(ops);
	});
	bench("createSecretHash (fastest)", { warmup: 2, samples: 10 }, async (b) => {
		const ops = 10;
		b.start();
		for (let i = 0; i < ops; i++) {
			await createSecretHash(value, {
				timeCost: 1,
				memoryCost: 3,
				parallelism: 1,
			});
		}
		b.end(ops);
	});
	bench(
		"createSecretHash x 2 timeCost",
		{ warmup: 2, samples: 10 },
		async (b) => {
			const ops = 10;
			b.start();
			for (let i = 0; i < ops; i++) {
				await createSecretHash(value, { timeCost: 6 });
			}
			b.end(ops);
		},
	);
	bench(
		"createSecretHash x 2 memoryCost",
		{ warmup: 2, samples: 10 },
		async (b) => {
			const ops = 10;
			b.start();
			for (let i = 0; i < ops; i++) {
				await createSecretHash(value, { memoryCost: 16 });
			}
			b.end(ops);
		},
	);
	bench(
		"createSecretHash x 2 parallelism",
		{ warmup: 2, samples: 10 },
		async (b) => {
			const ops = 10;
			b.start();
			for (let i = 0; i < ops; i++) {
				await createSecretHash(value, { parallelism: 2 });
			}
			b.end(ops);
		},
	);
	bench("verifySecretHash = valid", { warmup: 2, samples: 10 }, async (b) => {
		const ops = 10;
		b.start();
		for (let i = 0; i < ops; i++) {
			await verifySecretHash(hash, value);
		}
		b.end(ops);
	});
	bench("verifySecretHash = invalid", { warmup: 2, samples: 10 }, async (b) => {
		const ops = 10;
		b.start();
		for (let i = 0; i < ops; i++) {
			await verifySecretHash(hash, "invalid");
		}
		b.end(ops);
	});
	bench("verifySecretHash (fastest)", { warmup: 2, samples: 10 }, async (b) => {
		const ops = 10;
		b.start();
		for (let i = 0; i < ops; i++) {
			await verifySecretHash(hashFastest, value);
		}
		b.end(ops);
	});
	bench(
		"verifySecretHash x 2 timeCost",
		{ warmup: 2, samples: 10 },
		async (b) => {
			const ops = 10;
			b.start();
			for (let i = 0; i < ops; i++) {
				await verifySecretHash(hashTimeCost2, value);
			}
			b.end(ops);
		},
	);
	bench(
		"verifySecretHash x 2 memoryCost",
		{ warmup: 2, samples: 10 },
		async (b) => {
			const ops = 10;
			b.start();
			for (let i = 0; i < ops; i++) {
				await verifySecretHash(hashMemoryCost2, value);
			}
			b.end(ops);
		},
	);
	bench(
		"verifySecretHash x 2 parallelism",
		{ warmup: 2, samples: 10 },
		async (b) => {
			const ops = 10;
			b.start();
			for (let i = 0; i < ops; i++) {
				await verifySecretHash(hashParallelism2, value);
			}
			b.end(ops);
		},
	);
	bench("symmetricGenerateEncryptionKey", { warmup: 100, samples: 30 }, (b) => {
		const ops = 10_000;
		b.start();
		for (let i = 0; i < ops; i++) {
			symmetricGenerateEncryptionKey(sub);
		}
		b.end(ops);
	});
	bench("symmetricEncrypt", { warmup: 100, samples: 30 }, (b) => {
		const ops = 10_000;
		b.start();
		for (let i = 0; i < ops; i++) {
			symmetricEncrypt(value, { sub, encryptionKey });
		}
		b.end(ops);
	});
	bench("symmetricDecrypt", { warmup: 100, samples: 30 }, (b) => {
		const ops = 10_000;
		b.start();
		for (let i = 0; i < ops; i++) {
			symmetricDecrypt(encryptedValue, {
				sub,
				encryptionKey,
			});
		}
		b.end(ops);
	});
	bench("symmetricSignatureSign", { warmup: 100, samples: 30 }, (b) => {
		const ops = 10_000;
		b.start();
		for (let i = 0; i < ops; i++) {
			symmetricSignatureSign(value);
		}
		b.end(ops);
	});
	bench(
		"symmetricSignatureVerify = valid",
		{ warmup: 100, samples: 30 },
		(b) => {
			const ops = 10_000;
			b.start();
			for (let i = 0; i < ops; i++) {
				symmetricSignatureVerify(signedValue);
			}
			b.end(ops);
		},
	);
	bench(
		"symmetricSignatureVerify = invalid",
		{ warmup: 100, samples: 30 },
		(b) => {
			const ops = 10_000;
			b.start();
			for (let i = 0; i < ops; i++) {
				symmetricSignatureVerify("invalid");
			}
			b.end(ops);
		},
	);
});
