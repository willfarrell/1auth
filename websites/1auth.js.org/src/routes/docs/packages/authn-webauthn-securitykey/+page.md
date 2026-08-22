---
title: "@1auth/authn-webauthn-securitykey"
description: SecurityKey preset for @1auth/authn-webauthn.
---

SecurityKey preset for [`@1auth/authn-webauthn`](/docs/packages/authn-webauthn): a roaming
authenticator used as a second factor.

## Install

```bash
npm i @1auth/authn-webauthn-securitykey
```

## Usage

```javascript
import securityKey, { create, verify } from '@1auth/authn-webauthn-securitykey'

securityKey({
  origin: process.env.ORIGIN,
  name: 'Organization Name'
})

await create(sub)
```

It is a configured `@1auth/authn-webauthn` module instance, so it carries the whole
[API](/docs/packages/authn-webauthn) — `count`, `list`, `select`, `create`, `verify`,
`authenticate`, `createChallenge`, `expire`, `remove`.

## Configuration options

Everything `@1auth/authn-webauthn` accepts, over these defaults:

| Option | Default | Why |
|--------|---------|-----|
| `residentKey` | `'discouraged'` | A security key holds a limited number of [discoverable credentials](https://fy.blackhats.net.au/blog/2023-02-02-how-hype-will-turn-your-security-key-into-junk/), and as a second factor it doesn't need one |
| `userVerification` | `'required'` | Verification is enforced on verify either way; `'preferred'` lets an authenticator skip it and fail afterwards |
| `preferredAuthenticatorType` | `'securityKey'` | Sends `hints` and `authenticatorAttachment` so the browser prompts for a security key, and is enforced on verify — a synced PassKey is rejected with `401 Unauthorized` |
| `id` | `'WebAuthnSecurityKey'` | Credentials are stored as `{id}-{type}`, so they never appear in `@1auth/authn-webauthn-passkey`'s `list`/`allowCredentials` |
| `notifyId` | `'authn-webauthn-securitykey'` | Prefix for the notify template ids: `{notifyId}-create`, `{notifyId}-expire`, `{notifyId}-remove` |

## Notes

This holds its own [`createInstance()`](/docs/packages/authn-webauthn), so it and
`@1auth/authn-webauthn-passkey` keep separate config. Everything else — `@1auth/authn`,
`@1auth/crypto`, `@1auth/account` — is shared, so both use the same store, table, and
encryption keys.

## Post-quantum

A configuration preset over [`@1auth/authn-webauthn`](/docs/packages/authn-webauthn) and inherits its post-quantum status: authenticator-signed ES256/RS256 assertions, migrating as the WebAuthn ecosystem does. See the full assessment in [Post-quantum](/docs/security/algorithms#post-quantum).
