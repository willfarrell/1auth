---
title: "@1auth/authn-webauthn-passkey"
description: PassKey preset for @1auth/authn-webauthn.
---

PassKey preset for [`@1auth/authn-webauthn`](/docs/packages/authn-webauthn): a discoverable
credential, usable as the only factor.

## Install

```bash
npm i @1auth/authn-webauthn-passkey
```

## Usage

```javascript
import passkey, { create, verify } from '@1auth/authn-webauthn-passkey'

passkey({
  origin: process.env.ORIGIN,
  name: 'Organization Name'
})

// PassKey on the device in front of the user
await create(sub)
// PassKey on their phone, over hybrid transport
await create(sub, { preferredAuthenticatorType: 'remoteDevice' })
```

It is a configured `@1auth/authn-webauthn` module instance, so it carries the whole
[API](/docs/packages/authn-webauthn) — `count`, `list`, `select`, `create`, `verify`,
`authenticate`, `createChallenge`, `expire`, `remove`.

## Configuration options

Everything `@1auth/authn-webauthn` accepts, over these defaults:

| Option | Default | Why |
|--------|---------|-----|
| `residentKey` | `'required'` | A PassKey has to be discoverable to log in without a username |
| `userVerification` | `'required'` | Verification is enforced on verify either way; `'preferred'` lets an authenticator skip it and fail afterwards |
| `preferredAuthenticatorType` | `'localDevice'` | Sends `hints` and `authenticatorAttachment` so the browser prompts for a PassKey, and is enforced on verify — a security key is rejected with `401 Unauthorized` |
| `id` | `'WebAuthnPassKey'` | Credentials are stored as `{id}-{type}`, so they never appear in `@1auth/authn-webauthn-securitykey`'s `list`/`allowCredentials` |
| `notifyId` | `'authn-webauthn-passkey'` | Prefix for the notify template ids: `{notifyId}-create`, `{notifyId}-expire`, `{notifyId}-remove` |

## Local and remote are one credential store

A PassKey on this device and one on a phone are the same credential to `authenticate`, and a
single challenge carries one `allowCredentials` set — splitting them would mean a user with a
PassKey on their laptop and one on their phone could not be offered both at login. The choice
belongs on `create`, not on the package.

## Notes

This holds its own [`createInstance()`](/docs/packages/authn-webauthn), so it and
`@1auth/authn-webauthn-securitykey` keep separate config. Everything else — `@1auth/authn`,
`@1auth/crypto`, `@1auth/account` — is shared, so both use the same store, table, and
encryption keys.

## Post-quantum

A configuration preset over [`@1auth/authn-webauthn`](/docs/packages/authn-webauthn) and inherits its post-quantum status: authenticator-signed ES256/RS256 assertions, migrating as the WebAuthn ecosystem does. See the full assessment in [Post-quantum](/docs/security/algorithms#post-quantum).
