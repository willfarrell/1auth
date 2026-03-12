---
title: "@1auth/authn-recovery-codes"
description: Backup recovery codes for account access when primary credentials are unavailable.
---

Backup recovery codes for account access when primary credentials are unavailable.

## Install

```bash
npm i @1auth/authn-recovery-codes
```

## Usage

```javascript
import recoveryCodes from '@1auth/authn-recovery-codes'

recoveryCodes()
```

## Configuration

Recovery codes use sensible defaults:

- **Entropy:** 112 bits per code
- **Count:** 5 codes per account
- **OTP:** Single-use (removed after use)

## API

### `secret(options)`

Recovery code secret configuration.

### `authenticate(username, secret)`

Verify a recovery code. The code is consumed (removed) after successful use.

### `count(sub)`

Count remaining recovery codes for a subject.

### `list(sub)`

List all recovery codes.

### `create(sub)`

Generate a new set of recovery codes.

**Returns:** Array of plaintext recovery codes (store/display to user immediately — they cannot be retrieved later)

### `update(sub)`

Replace all recovery codes with a new set.

### `remove(sub, id)`

Remove a specific recovery code or all codes.
