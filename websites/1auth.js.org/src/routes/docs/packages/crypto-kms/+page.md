---
title: "@1auth/crypto-kms"
description: AWS KMS encryption key provider for @1auth/crypto that keeps the key-encryption key inside KMS.
---

AWS KMS encryption key provider for [`@1auth/crypto`](/docs/packages/crypto). Keeps the key-encryption key (KEK) inside KMS instead of in process.

## Why

`@1auth/crypto` gives every row its own data key and wraps it with `symmetricEncryptionKey`, a secret the process holds in memory. Anything that can read that memory can decrypt every row, forever, including from a stolen database dump.

This package moves the wrap and unwrap into KMS. The KEK is created there and never leaves. KMS mints each row's data key and returns that key plus a wrapped copy, so the bulk field encryption still runs locally at full speed. The network cost is one call per row, not one per field.

That is what OWASP ASVS 5.0 13.3.3 asks for. An attacker with code execution still decrypts whatever rows the process touches while they hold it. What they can no longer do is take the KEK away, and every unwrap they cause leaves a CloudTrail record.

## Install

```bash
npm i @1auth/crypto-kms @aws-sdk/client-kms
```

## Usage

`@1auth/crypto` is synchronous and KMS is a network call, so this package is driven directly rather than through `symmetricGenerateEncryptionKey`. Mint or unwrap the row key here, then hand the plaintext `encryptionKey` to the field helpers.

```javascript
// re-exports all of @1auth/crypto, so one import site covers both
import cryptoKms, {
  decryptEncryptionKey,
  generateEncryptionKey,
  symmetricDecryptFields,
  symmetricEncryptFields
} from '@1auth/crypto-kms'

cryptoKms({ keyId: 'alias/app-secrets' })

// write
const { encryptionKey, encryptedKey } = await generateEncryptionKey(sub)
const row = symmetricEncryptFields({ value }, { encryptionKey, sub }, ['value'])
await store.insert(table, { ...row, sub, encryptionKey: encryptedKey })

// read
const rowKey = await decryptEncryptionKey(row.encryptionKey, sub)
const { value } = symmetricDecryptFields(
  row,
  { encryptionKey: rowKey, sub },
  ['value']
)
```

## Configuration options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `keyId` | `string` | **required** | Symmetric KMS key ARN or alias |
| `client` | `KMSClient` | `new KMSClient()` | Inject your own, or a fake in tests. The default is only built when none is passed |
| `keySpec` | `string` | `AES_256` | 32 bytes, the key length both `chacha20-poly1305` and `aes-256-gcm` take |
| `encoding` | `string` | `base64` | How the wrapped key is stored as a string |
| `name` | `string` | `kms1` | The prefix written into every wrapped key. Override only to run two KMS keys side by side |
| `log` | `function \| false` | `false` | A function to log each command |

## Digest pepper

`digestChecksumPepper` is the HMAC key behind every blind-index lookup, so it has to be the same bytes on every boot: it cannot be minted per process like a row key. Keep it wrapped by the same KMS key and unwrap it once at startup, so the config holds ciphertext and only a role with `kms:Decrypt` can turn it back into a pepper.

```javascript
cryptoKms({ keyId: 'alias/app-secrets' })

crypto({
  symmetricEncryptionKey: process.env.SYMMETRIC_ENCRYPTION_KEY,
  symmetricSignatureSecret: process.env.SYMMETRIC_SIGNATURE_SECRET,
  digestChecksumSalt: process.env.DIGEST_CHECKSUM_SALT,
  digestChecksumPepper: await decryptEncryptionKey(
    process.env.DIGEST_CHECKSUM_PEPPER
  )
})
```

Mint one once, with `generateEncryptionKey("")` or `aws kms encrypt`, and store the wrapped copy as `DIGEST_CHECKSUM_PEPPER`. No encryption context is bound, because the pepper belongs to no subject. Rotating it invalidates every stored digest: plan the re-digest before swapping the ciphertext.

The packages that mint row keys internally (`account`, `authn`, `messenger`, `session`) still use the in-process provider. Reaching those needs an injected crypto instance, which is scoped separately in [`docs/inject-crypto.spec.md`](https://github.com/willfarrell/1auth/blob/develop/docs/inject-crypto.spec.md).

## Storage format

Wrapped keys are stored as `<provider>:<payload>`, so the reader picks the provider from the stored value rather than from configuration:

```
1:GdT7...         wrapped in process by @1auth/crypto
kms1:AQIDAHh...   wrapped by KMS, this package
GdT7...           written before providers existed, read as `1`
```

Nothing has to migrate. Rows written under the old provider keep decrypting, and each row moves to the new one the next time it is written.

Calling this package's configure function registers `kms1` with `@1auth/crypto`. It cannot serve the synchronous path, so it registers a pair of functions that throw and name the async entry point. Without it a `kms1:` row would fall through to `1` and fail as `Signature incorrect`, which reads like data corruption instead of a missing `await`.

## Encryption context

The subject is bound in as KMS encryption context, mirroring the AAD that `symmetricEncrypt` already binds into every field. KMS refuses a `Decrypt` whose context does not match, so a row key cannot be unwrapped against a different subject.

`Decrypt` also pins `KeyId`. That is optional for a symmetric key, since the wrapped blob names its own key, but sending it makes KMS reject a blob minted under any other key. It stops an attacker who can write to the table from swapping in a row key wrapped by a key they control.

## IAM

The calling role needs `kms:GenerateDataKey` and `kms:Decrypt` on the key. Nothing else.
