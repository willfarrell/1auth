---
title: Quick Start
description: Install and configure 1auth packages to add secure authentication to your Node.js application.
---

## Install

```bash
npm i @1auth/store-dynamodb @1auth/notify-sqs @1auth/crypto @1auth/account-username @1auth/account @1auth/messenger @1auth/messenger-email-address @1auth/authn @1auth/authn-webauthn @1auth/authn-recovery-codes @1auth/authn-access-token @1auth/session
```

## Example

```javascript
import * as store from '@1auth/store-dynamodb'
import * as notify from '@1auth/notify-sqs'
import crypto from '@1auth/crypto'

import account from '@1auth/account'
import accountUsername, {
  exists as usernameExists
} from '@1auth/account-username'

import messenger from '@1auth/messenger'
import messengerEmailAddress from '@1auth/messenger-email-address'

import authn from '@1auth/authn'
import webauthn from '@1auth/authn-webauthn'
import recoveryCodes from '@1auth/authn-recovery-codes'
import accessToken from '@1auth/authn-access-token'

import session from '@1auth/session'

// 12h chosen based on OWASP ASVS
const sessionExpire = 12 * 60 * 60
// 10d chosen based on EFF DNT Policy
const ttlExpire = 10 * 24 * 60 * 60

store.default({
  timeToLiveExpireOffset: ttlExpire - sessionExpire
})
notify.default({
  queueName: process.env.QUEUE_NAME ?? 'notify-queue'
})

// Passed in via ENV for example only
crypto({
  symmetricEncryptionKey: process.env.SYMMETRIC_ENCRYPTION_KEY ?? '',
  symmetricSignatureSecret: process.env.SYMMETRIC_SIGNATURE_SECRET ?? '',
  digestChecksumSalt: process.env.DIGEST_CHECKSUM_SALT ?? '',
  digestChecksumPepper: process.env.DIGEST_CHECKSUM_PEPPER ?? ''
})

account({
  store,
  notify,
  encryptedFields: ['value','name', 'locale']
})
accountUsername({
  usernameBlacklist: ['root', 'admin', 'sa']
})

messenger({
  store,
  notify,
  encryptedFields: ['value']
})
messengerEmailAddress()

authn({
  store,
  notify,
  usernameExists: [usernameExists],
  encryptedFields: ['value', 'name']
})
webauthn({
  origin: process.env.ORIGIN,
  name: 'Organization Name',
  userVerification: 'preferred'
})
recoveryCodes()
accessToken()

session({
  store,
  notify,
  expire: sessionExpire
})
```

## Initialization pattern

Every 1auth module follows the same pattern:

1. Import the module's default export (configuration function)
2. Call it with an options object containing `store`, `notify`, and module-specific settings
3. Use the returned functions for CRUD operations

All modules require `@1auth/crypto` to be initialized first, as it provides the encryption primitives used throughout.

## Environment variables

The following environment variables are typically needed:

| Variable | Description |
|----------|-------------|
| `SYMMETRIC_ENCRYPTION_KEY` | Key for ChaCha20-Poly1305 encryption |
| `SYMMETRIC_SIGNATURE_SECRET` | Secret for HMAC signing |
| `DIGEST_CHECKSUM_SALT` | Salt for digest computation |
| `DIGEST_CHECKSUM_PEPPER` | Pepper for additional digest security |
| `ORIGIN` | Application origin for WebAuthn |
| `QUEUE_NAME` | SQS queue name for notifications |
