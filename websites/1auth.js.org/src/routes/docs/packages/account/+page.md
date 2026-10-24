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

Check if an account exists by subject. An expired or removed account does not exist.

**Returns:** the `sub`, or `undefined`

### `lookup(sub)`

Retrieve and decrypt an account by subject. Throws `404 Not Found` when there is no account, or it is expired or removed.

**Returns:** Decrypted account object

### `create(values)`

Create a new account. Generates a subject ID, encrypts configured fields, and stores the record.

`values` can't set the columns the package owns: `id`, `sub`, `encryptionKey`, `value`, `digest`, `update`, `expire` and `remove` are dropped. `create` is kept, for importing accounts.

**Returns:** the new account's `sub`

### `update(sub, values)`

Update account metadata. Re-encrypts modified fields. Drops the same owned columns as `create`, and `create` too, so a request body can be passed through.

### `updateIdentifier(sub, { value, digest })`

Set the lookup identifier (the username) and its digest. For sibling packages such as `@1auth/account-username`, which check the digest is free first. The SQL table has a unique index on `digest`, so a second account can't take the same one.

### `expire(sub)`

Mark an account as expired, from this second. Triggers the `account-expire` notification.

### `remove(sub)`

Mark an account as expired and schedule the row for deletion after `removeExpireOffset` seconds. Triggers the `account-remove` notification.

### `getOptions()`

Get current module configuration.

## Post-quantum

Uses only symmetric field encryption and CSPRNG identifiers, both post-quantum safe. No migration needed. See the full assessment in [Post-quantum](/docs/security/algorithms#post-quantum).
