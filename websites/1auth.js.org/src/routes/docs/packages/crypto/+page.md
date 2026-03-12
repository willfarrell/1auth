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
