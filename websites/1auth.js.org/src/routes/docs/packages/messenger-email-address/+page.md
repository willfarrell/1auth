---
title: "@1auth/messenger-email-address"
description: Email address verification with sanitization, validation, and IDNA support.
---

Email address verification with sanitization, validation, and IDNA support.

## Install

```bash
npm i @1auth/messenger-email-address
```

## Usage

```javascript
import messengerEmailAddress from '@1auth/messenger-email-address'

messengerEmailAddress()
```

## Configuration options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `optionalDotDomains` | `string[]` | Gmail domains | Domains where dots are optional |
| `aliasDomains` | `object` | — | Domain alias mapping |
| `usernameBlacklist` | `string[]` | `[]` | Blocked email usernames |

## API

### `token(options)`

Email-specific token configuration.

### `exists(value)`

Check if an email address is already registered.

### `count(sub)`

Count verified email addresses for a subject.

### `lookup(emailAddress)`

Find an account by email address.

### `list(sub)`

List all email addresses for a subject.

### `select(sub, id)`

Get a specific email messenger.

### `create(sub, value, values)`

Create an email messenger and send a verification token.

### `remove(sub, id)`

Delete an email messenger.

### `createToken(sub, sourceId)`

Generate a new verification token.

### `verifyToken(sub, token, sourceId)`

Verify the token and mark the email as verified.

### `sanitize(value)`

Normalize an email address: lowercase, IDNA encoding, optional dot handling, alias domain resolution.

### `validate(value)`

Validate email address format.

### `mask(value)`

Obfuscate an email for display (e.g., `u***@example.com`).
