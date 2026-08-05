---
title: "@1auth/crypto"
description: Cryptographic utilities for encryption, hashing, and signing with modern algorithms.
---

Cryptographic utilities for encryption, hashing, and signing with modern algorithms.

## Install

```bash
npm i @1auth/crypto
```

## Usage

```javascript
import crypto from '@1auth/crypto'

crypto({
  symmetricEncryptionKey: process.env.SYMMETRIC_ENCRYPTION_KEY,
  symmetricSignatureSecret: process.env.SYMMETRIC_SIGNATURE_SECRET,
  digestChecksumSalt: process.env.DIGEST_CHECKSUM_SALT,
  digestChecksumPepper: process.env.DIGEST_CHECKSUM_PEPPER
})
```

## Configuration options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `symmetricEncryptionKey` | `string` | **required** | Key for symmetric encryption |
| `symmetricSignatureSecret` | `string` | — | Secret for HMAC signing |
| `digestChecksumSalt` | `string` | — | Salt for digest computation |
| `digestChecksumPepper` | `string` | — | Pepper for additional digest security |
| `symmetricEncryptionAlgorithm` | `string` | `chacha20-poly1305` | Encryption algorithm |
| `digestAlgorithm` | `string` | `sha3-384` | Digest algorithm |
| `asymmetricEncryptionCurve` | `string` | `P-384` | Asymmetric key curve |

## How a field is encrypted

Two keys, not one. The key in your environment never encrypts a field directly — it encrypts a
per-row key, and that row key encrypts the fields.

```
  symmetricEncryptionKey                     symmetricSignatureSecret
  (your env, 32 bytes)                       (your env, 32 bytes)
          │                                            │
          │  encrypts, with `sub` as AAD               │
          ▼                                            │
  ┌───────────────────┐                                │
  │  row key          │  random, per row               │
  └─────────┬─────────┘                                │
            │                                          │
            │  stored as `encryptionKey` on the row,   │
            │  in its encrypted form                   │
            │                                          │
            │  encrypts each field in encryptedFields  │
            ▼                                          ▼
  ┌──────────────────────────────────────────┐   HMAC over the
  │ iv (12B) ‖ authTag (16B) ‖ ciphertext    │──►whole packet
  └──────────────────────────────────────────┘        │
                                                      ▼
                          stored value:  <packet>.<signature>
```

**Why the extra hop.** Rotating `symmetricEncryptionKey` re-encrypts one small row key per row
rather than every field, and a row key compromise is scoped to that row. `sub` is the AEAD
associated data, so a row key lifted from one account cannot decrypt another's — the ciphertext
is bound to the subject it belongs to.

**Encrypt-then-MAC.** The signature covers the finished AEAD packet, so `symmetricSignatureSecret`
can be rotated on its own without touching the ciphertext, and a tampered packet is rejected
before any decryption is attempted.

## How a value becomes a lookup digest

Encryption is randomised, so an encrypted email cannot be searched for. Digests solve that: a
deterministic, one-way value that can be indexed.

```
  value ──► + digestChecksumSalt ──► encrypt with a FIXED iv ──► hash ──► digest
                     │                (digestChecksumPepper)      │
                     │                        │                   │
        a secret the │           deterministic, so equal          │
        table does   │           values yield equal output        │
        not contain  │           -- that is what makes it         │
                     │           searchable at all                │
                     ▼                        ▼                   ▼
              a stolen table cannot be brute forced without BOTH
              secrets, and neither lives in the database
```

Rotating `digestChecksumPepper` invalidates every digest at once, which is the intended lever
for a right-to-erasure sweep. The ciphertext produced here is never stored — only its hash is.

## API

### Random generation

- `randomBytes(length)` — Generate random bytes
- `randomInt(min, max)` — Generate random integer
- `randomCharacters(options)` — Generate random string from character set
- `randomAlphaNumeric(options)` — Generate alphanumeric string
- `randomNumeric(options)` — Generate numeric string

### Digests

- `createChecksum(value)` — Create a checksum digest
- `createDigest(value)` — Create a digest
- `createSeasonedDigest(value)` — Create a seasoned digest
- `createSaltedDigest(value)` — Create a salted digest
- `createPepperedDigest(value)` — Create a peppered digest

### Secret hashing

- `createSecretHash(secret)` — Hash a secret with Argon2id
- `verifySecretHash(secret, hash)` — Verify a secret against its hash

### Symmetric encryption

- `symmetricGenerateEncryptionKey()` — Generate a new encryption key
- `symmetricEncrypt(value, key)` — Encrypt a value
- `symmetricDecrypt(encrypted, key)` — Decrypt a value
- `symmetricEncryptFields(fields, values, key)` — Encrypt specific fields in an object
- `symmetricDecryptFields(fields, values, key)` — Decrypt specific fields in an object
- `symmetricRotation(encrypted, oldKey, newKey)` — Re-encrypt with a new key

### Symmetric signatures

- `symmetricSignatureSign(value)` — Sign a value with HMAC
- `symmetricSignatureVerify(value, signature)` — Verify an HMAC signature

### Asymmetric keys

- `makeAsymmetricKeys()` — Generate asymmetric key pair
- `makeAsymmetricSignature(data, privateKey)` — Sign data with private key
- `verifyAsymmetricSignature(data, signature, publicKey)` — Verify signature

### Utilities

- `nowInSeconds()` — Current timestamp in seconds
- `safeEqual(a, b)` — Timing-safe string comparison
- `getOptions()` — Get current configuration
