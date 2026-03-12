---
title: "@1auth/authn-webauthn"
description: WebAuthn/FIDO2 credential support for passwordless authentication.
---

WebAuthn/FIDO2 credential support for passwordless authentication.

## Install

```bash
npm i @1auth/authn-webauthn
```

## Usage

```javascript
import webauthn from '@1auth/authn-webauthn'

webauthn({
  origin: process.env.ORIGIN,
  name: 'Organization Name',
  userVerification: 'preferred'
})
```

## Configuration options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `origin` | `string` | **required** | Application origin URL |
| `name` | `string` | **required** | Relying party name |
| `residentKey` | `string` | — | Resident key requirement |
| `userVerification` | `string` | `'preferred'` | User verification level |
| `preferredAuthenticatorType` | `string` | — | Preferred authenticator type |

## API

### `token(options)`

Token configuration for registration.

### `secret(options)`

Secret storage configuration for credentials.

### `challenge(options)`

Authentication challenge configuration.

### `count(sub)`

Count WebAuthn credentials for a subject.

### `list(sub)`

List all WebAuthn credentials.

### `select(sub, id)`

Get a specific WebAuthn credential.

### `authenticate(username, input)`

Authenticate a user with a WebAuthn assertion.

### `create(sub)`

Start the WebAuthn registration process. Returns registration options.

### `verify(sub, response, {name}, notify)`

Verify a WebAuthn registration response and store the credential.

### `createChallenge(sub)`

Generate an authentication challenge for an existing credential.

### `expire(sub, id)`

Expire a WebAuthn credential.

### `remove(sub, id)`

Delete a WebAuthn credential.
