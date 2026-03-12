---
title: "@1auth/messenger"
description: Messaging framework for contact method verification (email, phone, etc.).
---

Messaging framework for contact method verification (email, phone, etc.).

## Install

```bash
npm i @1auth/messenger
```

## Usage

```javascript
import messenger from '@1auth/messenger'

messenger({
  store,
  notify,
  encryptedFields: ['value']
})
```

## Configuration options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `store` | `object` | **required** | Storage backend module |
| `notify` | `object` | **required** | Notification module |
| `table` | `object` | — | Table schema definition |
| `encryptedFields` | `string[]` | `["value"]` | Fields to encrypt |
| `idGenerate` | `object` | — | ID generation config |
| `randomId` | `object` | — | Random ID options (prefix: `messenger_`) |

## API

### `randomId(options)`

Generate a random messenger ID.

### `token(options)`

Token configuration — 6-digit numeric OTP with 10 minute expiry by default.

### `exists(type, value)`

Check if a messenger of the given type and value exists.

### `count(type, sub)`

Count verified messengers of a type for a subject.

### `lookup(type, value)`

Find a messenger by type and value.

### `list(type, sub)`

List all messengers of a type for a subject.

### `select(type, sub, id)`

Get a specific messenger.

### `create(type, sub, values)`

Create a new messenger with a verification token. Triggers a notification with the token.

### `createToken(type, sub, sourceId)`

Generate a new verification token for an existing messenger.

### `verifyToken(type, sub, token, sourceId)`

Verify a token and mark the messenger as verified.

### `remove(type, sub, id)`

Delete a messenger.
