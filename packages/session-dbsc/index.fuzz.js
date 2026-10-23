import { equal, ok } from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { test } from "node:test";
import crypto, {
	randomChecksumPepper,
	randomChecksumSalt,
	symmetricRandomEncryptionKey,
	symmetricRandomSignatureSecret,
} from "@1auth/crypto";
import fc from "fast-check";
import dbsc, { challenge, verifyProof } from "./index.js";

crypto({
	symmetricEncryptionKey: symmetricRandomEncryptionKey(),
	symmetricSignatureSecret: symmetricRandomSignatureSecret(),
	digestChecksumSalt: randomChecksumSalt(),
	digestChecksumPepper: randomChecksumPepper(),
	secretArgon2TimeCost: 1,
	secretArgon2MemoryCost: 3,
	secretArgon2Parallelism: 1,
});
dbsc();

const aud = "https://example.com/auth/dbsc/refresh";
const sessionId = "session_fuzz";
const device = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const deviceJwk = device.publicKey.export({ format: "jwk" });
const publicKey = JSON.stringify({
	kty: deviceJwk.kty,
	crv: deviceJwk.crv,
	x: deviceJwk.x,
	y: deviceJwk.y,
});

const base64url = (value) =>
	Buffer.from(JSON.stringify(value) ?? "").toString("base64url");

const mustReject = async (input, params) => {
	try {
		await verifyProof(input, params);
	} catch (e) {
		if (["401 Unauthorized", "403 Forbidden"].includes(e.message)) return;
		console.error(input, e);
		throw e;
	}
	throw new Error("verifyProof accepted an unsigned proof", {
		cause: { input },
	});
};

const options = {
	numRuns: 100_000,
	verbose: 2,
	examples: [],
};

const header = fc.record(
	{
		typ: fc.oneof(fc.constant("dbsc+jwt"), fc.anything()),
		alg: fc.oneof(fc.constantFrom("ES256", "RS256", "none"), fc.anything()),
		jwk: fc.oneof(
			fc.constant(deviceJwk),
			fc.record(
				{
					kty: fc.oneof(fc.constantFrom("EC", "RSA", "oct"), fc.anything()),
					crv: fc.oneof(fc.constantFrom("P-256", "P-384"), fc.anything()),
					x: fc.oneof(fc.base64String(), fc.anything()),
					y: fc.oneof(fc.base64String(), fc.anything()),
					n: fc.oneof(fc.base64String(), fc.anything()),
					e: fc.oneof(fc.constant("AQAB"), fc.anything()),
				},
				{ requiredKeys: [] },
			),
			fc.anything(),
		),
	},
	{ requiredKeys: [] },
);
const payload = fc.record(
	{
		aud: fc.oneof(fc.constant(aud), fc.anything()),
		sub: fc.oneof(fc.constant(sessionId), fc.anything()),
		jti: fc.oneof(
			fc.constant(challenge(sessionId)),
			fc.constant(challenge("")),
			fc.anything(),
		),
	},
	{ requiredKeys: [] },
);
const jwt = fc
	.tuple(
		fc.oneof(header.map(base64url), fc.string()),
		fc.oneof(payload.map(base64url), fc.string()),
		fc.oneof(fc.base64String(), fc.string()),
	)
	.map((parts) => parts.join("."));

test("fuzz verifyProof w/ proof", async () => {
	await fc.assert(
		fc.asyncProperty(fc.anything(), async (proof) => {
			await mustReject(proof, { aud });
		}),
		options,
	);
});

test("fuzz verifyProof w/ registration JWT", async () => {
	await fc.assert(
		fc.asyncProperty(jwt, async (proof) => {
			await mustReject(proof, { aud });
		}),
		options,
	);
});

test("fuzz verifyProof w/ refresh JWT", async () => {
	await fc.assert(
		fc.asyncProperty(jwt, async (proof) => {
			await mustReject(proof, { aud, sessionId, publicKey });
		}),
		options,
	);
});

test("fuzz verifyProof w/ stored publicKey", async () => {
	await fc.assert(
		fc.asyncProperty(
			fc.oneof(fc.json(), fc.anything()),
			jwt,
			async (storedKey, proof) => {
				await mustReject(proof, { aud, sessionId, publicKey: storedKey });
			},
		),
		options,
	);
});

test("fuzz verifyProof w/ params", async () => {
	await fc.assert(
		fc.asyncProperty(
			fc.record(
				{
					aud: fc.anything(),
					sessionId: fc.anything(),
					publicKey: fc.anything(),
				},
				{ requiredKeys: [] },
			),
			jwt,
			async (params, proof) => {
				await mustReject(proof, params);
			},
		),
		options,
	);
});

test("fuzz harness accepts a genuine proof", async () => {
	const encodedHeader = base64url({ typ: "dbsc+jwt", alg: "ES256" });
	const encodedPayload = base64url({ jti: challenge(sessionId) });
	const signature = sign(
		"sha256",
		Buffer.from(`${encodedHeader}.${encodedPayload}`),
		{ key: device.privateKey, dsaEncoding: "ieee-p1363" },
	).toString("base64url");
	const verified = await verifyProof(
		`${encodedHeader}.${encodedPayload}.${signature}`,
		{ aud, sessionId, publicKey },
	);
	equal(verified.publicKey, publicKey);
	ok(verified.payload.jti);
});
