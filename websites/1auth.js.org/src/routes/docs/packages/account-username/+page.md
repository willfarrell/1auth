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

## API

### `exists(username)`

Check if a username is already taken.

**Returns:** `boolean`

### `lookup(username)`

Find an account by username. Sanitizes and digests the input before lookup.

**Returns:** Account object or `undefined`

### `create(sub, username)`

Create a username for an account.

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
