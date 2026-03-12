---
title: "@1auth/authn"
description: Core authentication module with multi-factor authentication support.
---

Core authentication module with multi-factor authentication support.

## Install

```bash
npm i @1auth/authn
```

## Usage

```javascript
import authn from '@1auth/authn'

authn({
  store,
  notify,
  usernameExists: [usernameExists],
  encryptedFields: ['value', 'name']
})
```

## Configuration options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `store` | `object` | **required** | Storage backend module |
| `notify` | `object` | **required** | Notification module |
| `table` | `object` | — | Table schema definition |
| `encryptedFields` | `string[]` | `["value"]` | Fields to encrypt |
| `authenticationDuration` | `number` | `100` | Minimum auth duration (ms) for timing safety |
| `usernameExists` | `function[]` | `[]` | Username existence check callbacks |
| `idGenerate` | `object` | — | ID generation config |
| `randomId` | `object` | — | Random ID options (prefix: `authn_`) |

## API

### `randomId(options)`

Generate a random credential ID.

### `count(credentialOptions, sub)`

Count valid credentials of a given type for a subject.

### `list(credentialOptions, sub, params, fields)`

List credentials with automatic decryption.

### `create(credentialOptions, sub, values)`

Create a single credential.

### `createList(credentialOptions, sub, list)`

Create multiple credentials at once (e.g., recovery codes).

### `subject(username)`

Look up a subject by username using registered `usernameExists` callbacks.

### `authenticate(credentialOptions, username, secret)`

Authenticate a user with timing-safe comparison. Uses `setTimeout` to ensure constant-time responses.

### `verifySecret(credentialOptions, sub, id)`

Mark a credential as verified.

### `verify(credentialOptions, sub, input)`

Verify a credential value.

### `expire(credentialOptions, sub, id)`

Expire a credential.

### `remove(credentialOptions, sub, id)`

Delete a credential.

### `removeList(credentialOptions, sub, id)`

Delete multiple credentials.

### `select(credentialOptions, sub, id)`

Get a single credential by ID.

### `makeType(credentialOptions)`

Create a type identifier for a credential type.
