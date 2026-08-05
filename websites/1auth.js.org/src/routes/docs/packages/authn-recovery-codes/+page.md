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
- **`notifyId`:** `'authn-recovery-codes'` — prefix for the notify template ids: `{notifyId}-create`, `{notifyId}-update`, `{notifyId}-remove`

## Codes are a batch, not a credential

Every operation works on the whole set. There is no "add one more".

```
  create(sub)      ──►  N codes minted, all verified, all otp
                        returned once, in the clear, never again

  authenticate()   ──►  one code matches, and is consumed on the way out
                        the rest are untouched -- N-1 remain

  update(sub)      ──►  a fresh batch is minted FIRST, then the old batch
                        is removed. an interruption leaves the user with
                        too many codes, never with none

  remove(sub)      ──►  the whole batch goes
```

The ordering in `update` is deliberate: minting before removing means a failure between the two
is recoverable, where the reverse would lock the user out of their own recovery path.

Codes are stored hashed like any other secret, so the list returned by `create` is the only
time they exist in readable form. Show them once and tell the user to store them.

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
