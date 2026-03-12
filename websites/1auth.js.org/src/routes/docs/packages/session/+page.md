---
title: "@1auth/session"
description: Session creation, signing, verification, and management with encrypted storage.
---

Session creation, signing, verification, and management with encrypted storage.

## Install

```bash
npm i @1auth/session
```

## Usage

```javascript
import session from '@1auth/session'

session({
  store,
  notify,
  expire: 12 * 60 * 60 // 12 hours (OWASP ASVS)
})
```

## Configuration options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `store` | `object` | **required** | Storage backend module |
| `notify` | `object` | **required** | Notification module |
| `table` | `object` | — | Table schema definition |
| `encryptedFields` | `string[]` | `["value"]` | Fields to encrypt |
| `expire` | `number` | `900` (15min) | Session expiry in seconds |
| `idGenerate` | `object` | — | ID generation config |
| `randomId` | `object` | — | Random ID options (prefix: `session_`) |
| `randomSessionId` | `object` | — | Session token options (prefix: `sid_`, entropy: 128) |
| `encode` | `function` | — | Custom session encoding |
| `decode` | `function` | — | Custom session decoding |
| `checkMetadata` | `function` | — | Device metadata check function |

## API

### `randomId(options)`

Generate a random session record ID.

### `randomSessionId(options)`

Generate a random session token (the value stored in the cookie).

### `lookup(sid, value)`

Find a session by its signed token.

### `select(sub, id)`

Get a specific session by subject and record ID.

### `list(sub)`

List all sessions for a subject.

### `create(sub, value, values)`

Create a new session. Generates a session token, encrypts metadata, and stores the record.

**Returns:** Object with `id`, `sid` (signed session token), and metadata

### `check(sub, value)`

Check if the device is new before session creation (for "new device" notifications).

### `expire(sub, id)`

Expire a session.

### `remove(sub, id)`

Delete a session.

### `sign(sid)`

Sign a session token with HMAC.

**Returns:** `sid.signature`

### `verify(sidWithSignature)`

Verify a signed session token.

**Returns:** Original `sid` if valid, `undefined` otherwise
