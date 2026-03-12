---
title: Generate Secrets
description: Generate the cryptographic secrets required to configure 1auth.
---

## Generate secrets

1auth requires four cryptographic secrets for encryption, signing, and digest operations. Use the following script to generate them:

```javascript
import {
  randomChecksumPepper,
  randomChecksumSalt,
  symmetricRandomEncryptionKey,
  symmetricRandomSignatureSecret,
} from "@1auth/crypto";

const secrets = {
  symmetricEncryptionKey: symmetricRandomEncryptionKey().toString("base64"),
  symmetricSignatureSecret: symmetricRandomSignatureSecret().toString("base64"),
  digestChecksumSalt: randomChecksumSalt().toString("base64"),
  digestChecksumPepper: randomChecksumPepper().toString("base64"),
};
console.log(secrets);
```

## Run

```bash
node -e "
import {
  randomChecksumPepper,
  randomChecksumSalt,
  symmetricRandomEncryptionKey,
  symmetricRandomSignatureSecret,
} from '@1auth/crypto';

console.log({
  symmetricEncryptionKey: symmetricRandomEncryptionKey().toString('base64'),
  symmetricSignatureSecret: symmetricRandomSignatureSecret().toString('base64'),
  digestChecksumSalt: randomChecksumSalt().toString('base64'),
  digestChecksumPepper: randomChecksumPepper().toString('base64'),
});
"
```

## Usage

Store the generated values as environment variables:

| Variable | Secret |
|----------|--------|
| `SYMMETRIC_ENCRYPTION_KEY` | `symmetricEncryptionKey` |
| `SYMMETRIC_SIGNATURE_SECRET` | `symmetricSignatureSecret` |
| `DIGEST_CHECKSUM_SALT` | `digestChecksumSalt` |
| `DIGEST_CHECKSUM_PEPPER` | `digestChecksumPepper` |

These are passed to `@1auth/crypto` during initialization. See [Quick Start](/docs/intro/quick-start) for the full setup example.
