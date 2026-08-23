---
title: "@1auth/authn-access-token"
description: API access tokens (Personal Access Tokens) for programmatic authentication.
---

API access tokens (Personal Access Tokens) for programmatic authentication.

## Install

```bash
npm i @1auth/authn-access-token
```

## Usage

```javascript
import accessToken from '@1auth/authn-access-token'

accessToken()
```

## Configuration

Access tokens use these defaults:

- **Username prefix:** `pat-`
- **Entropy:** 112 bits
- **Expiry:** 30 days
- **`notifyId`:** `'authn-access-token'` — prefix for the notify template ids: `{notifyId}-create`, `{notifyId}-expire`, `{notifyId}-remove`

## Two halves, one token

`create` returns a `username` and a `secret`, and they are not interchangeable. The username is
a public lookup handle stored as a plain digest; the secret is hashed with Argon2 and is the
only half that proves anything.

```
  create(sub)
      │
      ├──► username   pat-xxxxx   digest stored, indexed, NOT a secret
      │                           lets `lookup` find the row in one read
      │
      └──► secret     pat-xxxxx   Argon2 hash stored, never recoverable
                                  returned exactly once, at creation

  authenticate(username, secret)
      │
      ├──► find the credential by the username's digest
      └──► verify the secret against the stored hash, in constant time
```

Hand the caller both, usually concatenated into one string your API splits back apart. Losing
the secret means issuing a new token — there is nothing to recover, which is the point.

## API

### `username(options)`

Access token username configuration (the public identifier).

### `secret(options)`

Access token secret configuration.

### `authenticate(username, secret)`

Verify an access token.

### `exists(username)`

Check if a token username exists.

### `count(sub)`

Count access tokens for a subject.

### `lookup(username)`

Find a token by its public username.

### `select(sub, id)`

Get a specific access token.

### `list(sub)`

List all access tokens for a subject.

### `create(sub, values)`

Create a new access token.

**Returns:** Object with `username` and `secret` (the secret is only returned once at creation)

### `expire(sub, id)`

Expire an access token.

### `remove(sub, id)`

Delete an access token.

## Post-quantum

Uses only CSPRNG token generation, Argon2id hashing, and SHA3-384 digests, all post-quantum safe. No migration needed. See the full assessment in [Post-quantum](/docs/security/algorithms#post-quantum).
