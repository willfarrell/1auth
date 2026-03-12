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
