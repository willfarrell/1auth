---
title: "@1auth/account"
description: User account management with encrypted storage and lifecycle operations.
---

User account management with encrypted storage and lifecycle operations.

## Install

```bash
npm i @1auth/account
```

## Usage

```javascript
import account from '@1auth/account'

account({
  store,
  notify,
  encryptedFields: ['value', 'name', 'locale']
})
```

## Configuration options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `store` | `object` | **required** | Storage backend module |
| `notify` | `object` | **required** | Notification module |
| `table` | `object` | — | Table schema definition |
| `encryptedFields` | `string[]` | `[]` | Fields to encrypt before storage |
| `idGenerate` | `object` | — | ID generation config |
| `randomId` | `object` | — | Random ID options (prefix: `user_`) |
| `randomSubject` | `object` | — | Random subject options (prefix: `sub_`) |

## API

### `randomId(options)`

Generate a random account ID.

### `randomSubject(options)`

Generate a random subject identifier.

### `exists(sub)`

Check if an account exists by subject.

**Returns:** `boolean`

### `lookup(sub)`

Retrieve and decrypt an account by subject.

**Returns:** Decrypted account object or `undefined`

### `create(values)`

Create a new account. Generates a subject ID, encrypts configured fields, and stores the record.

**Returns:** Created account with `sub` and `id`

### `update(sub, values)`

Update account metadata. Re-encrypts modified fields.

### `expire(sub)`

Mark an account as expired.

### `remove(sub)`

Delete an account record.

### `getOptions()`

Get current module configuration.
