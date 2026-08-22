---
title: Algorithms
description: Default cryptographic algorithms used by 1auth, including encryption, hashing, and signing choices.
---

## Default algorithms

1auth enforces modern cryptographic algorithms by default. These can be configured per-module where noted.

| Purpose | Algorithm | Alternatives |
|---------|-----------|-------------|
| Symmetric encryption | ChaCha20-Poly1305 | AES-256-GCM |
| Symmetric signature | HMAC | — |
| Asymmetric encryption | ECDSA | — |
| Asymmetric key | ECC P-384 | ECC P-512 |
| Asymmetric signature | Ed25519 (future) | — |
| Digest | SHA3-384 | SHA2-512, SHA3-512 |
| Secret hash | Argon2id | — |
| Encoding | base64 | — |

## FIPS compliance

FIPS 140-3 Level 4 can be achieved by using `aes-256-gcm` as the symmetric encryption algorithm instead of the default `chacha20-poly1305`.

## Argon2id parameters

Password hashing uses [OWASP-recommended Argon2id parameters](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#argon2id):

| Parameter | Value |
|-----------|-------|
| `timeCost` | 3 |
| `memoryCost` | 2^15 (32 MiB) |
| `saltLength` | 16 bytes |
| `outputLen` | 64 bytes |

## Rationale

### ChaCha20-Poly1305

Default symmetric cipher because it provides:
- Consistent performance across hardware (no AES-NI dependency)
- AEAD construction (authenticated encryption with associated data)
- Wide adoption in TLS 1.3 and modern protocols

### SHA3-384

Default digest algorithm because:
- SHA-3 family provides defense-in-depth against SHA-2 vulnerabilities
- 384-bit output balances security margin with performance
- Supported natively in Node.js `crypto` module

### Argon2id

Default password hashing because:
- Recommended by OWASP for password storage
- Resistant to both GPU and ASIC attacks (memory-hard)
- Combines Argon2i (side-channel resistant) and Argon2d (GPU-resistant)

## Post-quantum

A cryptographically relevant quantum computer affects the two halves of cryptography very
differently. Shor's algorithm breaks public-key cryptography built on factoring and discrete
logarithms (RSA, ECDSA, ECDH) outright. Grover's algorithm merely halves the effective strength
of symmetric ciphers and hashes — a 256-bit key drops to ~128-bit effective security, which
remains out of reach.

Almost everything 1auth does is symmetric, so almost everything is already post-quantum safe:

| Primitive | Used for | Post-quantum status |
|-----------|----------|---------------------|
| ChaCha20-Poly1305 / AES-256-GCM | Field encryption at rest | ✅ Safe (256-bit key, Grover-resistant) |
| HMAC-SHA3-384 | Session cookies, ciphertext packet signatures | ✅ Safe |
| SHA3-384 | Lookup digests, checksums | ✅ Safe (~192-bit post-quantum) |
| Argon2id | Password and secret hashing | ✅ Safe (memory-hard, not quantum-relevant) |
| CSPRNG tokens and identifiers | Session ids, OTPs, recovery codes | ✅ Safe |
| EC P-384 (`makeAsymmetricKeys`) | Exported helper, unused by other 1auth packages | ❌ Shor-vulnerable — planned move to ML-DSA-65 (FIPS 204) |
| ES256 / RS256 (DBSC) | Device-bound session proofs | ❌ Shor-vulnerable — algorithms fixed by the browser DBSC spec |
| ES256 / RS256 (WebAuthn) | Passkey and security-key assertions | ❌ Shor-vulnerable — algorithms fixed by authenticator hardware |

### Harvest now, decrypt later

The realistic quantum threat today is an adversary recording ciphertext now to decrypt once a
quantum computer exists. That attack only applies to **encrypted data** — and 1auth's data at
rest is protected exclusively by symmetric encryption, which survives. Signatures are not
retroactively forgeable: a future quantum computer could only forge proofs for sessions alive
*at that time*, and sessions expire. This is why the remaining ECDSA usage is a low-urgency,
ecosystem-paced migration rather than a today-problem.

### Migration plan

- **`makeAsymmetricKeys`** — will move from EC P-384 to ML-DSA-65 (FIPS 204), supported
  natively by Node.js ≥ 24 (OpenSSL 3.5). No new dependency required.
- **DBSC** — adopt post-quantum algorithms when the browser spec and TPMs ship them.
- **WebAuthn** — COSE identifiers for ML-DSA already exist (−48/−49/−50); support lands when
  authenticators and `@simplewebauthn/server` ship it.
- **Roadmap** — ML-KEM-1024 (key encapsulation), ML-DSA-87 (signatures), and
  SLH-DSA-SHA2-256 (stateless hash-based signatures) for configurations wanting NIST
  category 5 margins.
