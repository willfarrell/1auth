---
title: "@1auth/account-username"
description: Username validation, sanitization, and account lookup by username.
---

Username validation, sanitization, and account lookup by username.

## Install

```bash
npm i @1auth/account-username
```

## Usage

```javascript
import accountUsername, {
  exists as usernameExists
} from '@1auth/account-username'

accountUsername({
  usernameBlacklist: ['root', 'admin', 'sa']
})
```

## Configuration options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `minLength` | `number` | `1` | Minimum username length |
| `maxLength` | `number` | `32` | Maximum username length |
| `allowedCharRegExp` | `RegExp` | — | Allowed characters pattern |
| `usernameBlacklist` | `string[]` | `[]` | Blocked usernames |
| `notifyId` | `string` | `'account-username'` | Prefix for the notify template ids: `{notifyId}-change`, `{notifyId}-recover` |

## API

### `exists(username)`

Resolve a username to its account. An expired or removed account does not resolve, though its username stays taken until the row is deleted.

**Returns:** the `sub`, or `undefined`

### `lookup(username)`

Find an account by username. Sanitizes and digests the input before lookup. An expired or removed account is not found.

**Returns:** Account object or `undefined`

### `create(sub, username)`

Create a username for an account. The sanitized username is stored, so the value shown and sent by `recover` is the one it resolves as (`Ádmin` is stored as `admin`).

Throws `409 Conflict` when the username is taken. On SQL stores a unique index on the digest also catches two claims racing each other. DynamoDB has no unique index and its digest index is eventually consistent, so two claims made at the same moment can both succeed there.

### `update(sub, username)`

Update an account's username.

### `recover(sub)`

Trigger a username recovery notification.

### `sanitize(value)`

Normalize a username: lowercase, trim whitespace, remove diacritics.

**Returns:** Sanitized string

### `validate(value)`

Validate a username against all rules (length, characters, blacklist).

**Returns:** `boolean`

### `validateLength(value)`

Check username length constraints.

### `validateAllowedChar(value)`

Check username contains only allowed characters.

### `validateBlacklist(value)`

Check username is not blacklisted.

## Post-quantum

Uses only SHA3-384 seasoned digests and symmetric field decryption, both post-quantum safe. No migration needed. See the full assessment in [Post-quantum](/docs/security/algorithms#post-quantum).
