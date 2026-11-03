---
title: "@1auth/messenger-email-address"
description: Email address verification with sanitization, validation, and IDNA support.
---

Email address verification with sanitization, validation, and IDNA support.

## Install

```bash
npm i @1auth/messenger-email-address
```

## Usage

```javascript
import messengerEmailAddress from '@1auth/messenger-email-address'

messengerEmailAddress()
```

## Configuration options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `optionalDotDomains` | `string[]` | `gmail.com`, `google.com`, `yahoodns.net` | Domains where dots are optional, matched after aliasing |
| `aliasDomains` | `object` | `googlemail.com` → `gmail.com`, Proton domains → `protonmail.com` | Domain alias mapping, applied before dots are dropped |
| `usernameBlacklist` | `string[]` | `['admin', 'root', 'sa']` | Blocked local parts, matched exactly |

## API

### `token(options)`

Email-specific token configuration.

### `exists(value)`

Check if an email address is already registered.

### `count(sub)`

Count verified email addresses for a subject.

### `lookup(emailAddress)`

Find an account by email address.

### `list(sub)`

List all email addresses for a subject.

### `select(sub, id)`

Get a specific email messenger.

### `create(sub, value, values)`

Create an email messenger and send a verification token.

### `remove(sub, id)`

Delete an email messenger.

### `createToken(sub, sourceId)`

Generate a new verification token.

### `verifyToken(sub, token, sourceId)`

Verify the token and mark the email as verified.

### `sanitize(value)`

Normalize an email address: lowercase, IDNA encoding, optional dot handling, alias domain resolution. Anything without exactly one `@` is returned unchanged, for `validate` to reject.

`+tag` is stripped from every address, not only at providers that support subaddressing, so `user+a@example.com` and `user@example.com` are one address.

The alias is applied before dots are dropped, so `A.B@googlemail.com` and `ab@gmail.com` are one address.

### Migrating `googlemail.com` addresses

Earlier versions kept `googlemail.com` as its own domain, so its digests differ from the ones now written. An account holding a `googlemail.com` address is not found by `lookup` or `exists` until its digest is rewritten. Re-digest those rows once, after upgrading:

```javascript
import { createSeasonedDigest } from '@1auth/crypto'
import { sanitize } from '@1auth/messenger-email-address'

// for each messenger row of type emailAddress whose decrypted value ends in @googlemail.com
await store.update(table, { sub: row.sub, id: row.id }, {
  digest: createSeasonedDigest(sanitize(value)),
})
```

If the same person also verified the `gmail.com` spelling under another account, the two rows now share a digest. Resolve those by hand before rewriting.

### `validate(value)`

Validate email address format.

### `mask(value)`

Obfuscate an email for display (e.g., `u***@example.com`).

## Post-quantum

Uses only SHA3-384 seasoned digests, post-quantum safe. No migration needed. See the full assessment in [Post-quantum](/docs/security/algorithms#post-quantum).
