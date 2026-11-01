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
            stored value:  <algorithm id>:<packet>.<signature>
```

**Why the extra hop.** Rotating `symmetricEncryptionKey` re-encrypts one small row key per row
rather than every field, and a row key compromise is scoped to that row. `sub` is the AEAD
associated data, so a row key lifted from one account cannot decrypt another's — the ciphertext
is bound to the subject it belongs to.

**Algorithm ids.** Every packet names the cipher that wrote it with a JOSE id, `C20P:` for `chacha20-poly1305` or `A256GCM:` for `aes-256-gcm`, inside the signed data, so the id is authenticated before it picks a cipher. The ids are short because every stored value carries one; size columns for 5 to 8 more characters than before. Any other `symmetricEncryptionAlgorithm` is refused at configure time. A named packet always reads with its own cipher, so changing `symmetricEncryptionAlgorithm` leaves existing rows readable while new writes use the new cipher. A packet written before `0.0.0-rc.10` names none and reads with the `encryptionAlgorithm` passed to the call, else the configured one. Name every stored packet first (`symmetricRotation` with the same cipher on both sides) before changing the configured cipher, or the unnamed ones become unreadable. `symmetricEncryptionAlgorithmOf(value)` reads the name off a stored value without verifying it, for a sweep deciding which rows still need work.

The signature hash is not named in the packet: the HMAC has to verify before anything inside it is trusted. Rotate `symmetricSignatureHashAlgorithm` like `symmetricSignatureSecret`, passing the old `hashAlgorithm` to `symmetricRotation`.

**Batched rotation.** `symmetricRotation` can be rerun over a table. A row the old options cannot read but the new ones can is returned as the same object, without running `transform`, so compare the result to the input to skip the write and count it. A run that skips every row most likely has old and new swapped. A row both sides can read, such as a row key only rotation, is rotated again, so keep `transform` idempotent. A row neither side reads throws the old options' error. Before retiring an old key, secret, or hash, read every row with only the new options. That pass also catches rows written mid batch by instances still on the old configuration.

**Encrypt-then-MAC.** The signature covers the finished AEAD packet, so `symmetricSignatureSecret`
can be rotated on its own without touching the ciphertext, and a tampered packet is rejected
before any decryption is attempted.

## How a value becomes a lookup digest

Encryption is randomised, so an encrypted email cannot be searched for. Digests solve that: a
deterministic, one-way value that can be indexed.

```
  value ──► ‖ digestChecksumSalt ──► HMAC keyed with ──────► hash ──► digest
                     │               digestChecksumPepper      │
                     │                        │                │
        a secret the │           a keyed PRF: deterministic,   │
        table does   │           so equal values yield equal   │
        not contain  │           output -- that is what makes  │
                     │           it searchable at all          │
                     ▼                        ▼                ▼
              a stolen table cannot be brute forced without BOTH
              secrets, and neither lives in the database
```

The salt is appended as raw bytes. Up to `0.0.0-rc.7` it was appended as a string, which UTF-8
decoded the random salt and collapsed invalid byte sequences to U+FFFD.

**Breaking: existing digests must be rehashed.** Every digest written by `0.0.0-rc.7` or earlier
(`createSeasonedDigest`, `createSaltedDigest`: usernames, email addresses, sessions) no longer
matches. Recompute each one from its decrypted plaintext before upgrading lookups.

Rotating `digestChecksumPepper` invalidates every digest at once, which is the intended lever
for a right-to-erasure sweep. Digests are keyed only by the salt and pepper, so rotating the
encryption key or signature secret leaves them intact.

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

- `createSecretHash(secret)` — Hash a secret with Argon2id. Async: resolves to the encoded hash
- `verifySecretHash(hash, secret)` — Verify a secret against its hash. Async: resolves to a boolean

Both run Argon2 on the libuv threadpool (`crypto.argon2`), not on the event loop, so a hash
does not stall other requests. Concurrent hashes are bounded by `UV_THREADPOOL_SIZE` (default 4).

### Symmetric encryption

- `symmetricGenerateEncryptionKey()` — Generate a new encryption key
- `symmetricEncrypt(value, key)` — Encrypt a value. Throws when no encryption key resolves, rather than returning the plaintext
- `symmetricDecrypt(encrypted, key)` — Decrypt a value
- `symmetricEncryptFields(fields, values, key)` — Encrypt specific fields in an object. Throws when fields are named but no encryption key resolves
- `symmetricDecryptFields(fields, values, key)` — Decrypt specific fields in an object
- `symmetricRotation(encrypted, oldKey, newKey)` — Re-encrypt with a new key. Old and new options also take `encryptionAlgorithm` and `hashAlgorithm`. Safe to rerun, see batched rotation above
- `symmetricEncryptionAlgorithmOf(value)` - Read the cipher a stored value names, unverified, `undefined` when it names none

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

## Post-quantum

All symmetric primitives used here — ChaCha20-Poly1305, HMAC-SHA3-384, SHA3-384 digests, Argon2id — are post-quantum safe; Grover's algorithm only halves their effective strength, leaving ≥128-bit security. The one Shor-vulnerable primitive is `makeAsymmetricKeys` (EC P-384), currently unused by any other 1auth package; it will move to ML-DSA-65 (FIPS 204), supported natively by Node.js ≥ 24. See the full assessment in [Post-quantum](/docs/security/algorithms#post-quantum).
