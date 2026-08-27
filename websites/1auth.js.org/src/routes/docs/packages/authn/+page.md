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

## How `authenticate` works

Every `@1auth/authn-*` package is this one flow with a different credential config. Two parts
of it are easy to miss and both are deliberate.

```
Caller                        @1auth/authn                        Store
  │                                │                                │
  │  authenticate(config,          │                                │
  │    username, secret)           │                                │
  ├───────────────────────────────►│                                │
  │                                │                                │
  │                       ┌────────┴────────────┐                   │
  │                       │ start a timer for   │                   │
  │                       │ authenticationDura- │                   │
  │                       │ tion. every exit    │                   │
  │                       │ below waits on it   │                   │
  │                       └────────┬────────────┘                   │
  │                                │                                │
  │                                │  subject(username) via the     │
  │                                │  usernameExists hooks          │
  │                                ├───────────────────────────────►│
  │                                │                                │
  │                                │  no subject? wait out the      │
  │                                │  timer, then 401               │
  │                                │                                │
  │                                │  selectList({ sub, type })     │
  │                                ├───────────────────────────────►│
  │                                │◄───────────────────────────────┤
  │                                │                                │
  │                       ┌────────┴────────────┐                   │
  │                       │ for each credential │                   │
  │                       │  skip if unverified │                   │
  │                       │   and not otp       │                   │
  │                       │  skip if expired    │                   │
  │                       │  decrypt, decode,   │                   │
  │                       │   config.verify()   │                   │
  │                       └────────┬────────────┘                   │
  │                                │                                │
  │                                │  match, and otp?               │
  │                                │  expire it now -- one use      │
  │                                │  match, not otp?               │
  │                                │  write lastused                │
  │                                ├───────────────────────────────►│
  │                                │                                │
  │                                │  config.cleanup(), if any      │
  │                                │  (webauthn writes its counter) │
  │                                │                                │
  │                       ┌────────┴────────────┐                   │
  │                       │ await the timer     │                   │
  │                       └────────┬────────────┘                   │
  │  sub, or 401                   │                                │
  │◄───────────────────────────────┤                                │
```

**Every path takes the same minimum time.** `authenticationDuration` is started before the
username is even resolved and awaited on every exit, success or failure. Without it, "no such
user" returns in a millisecond while "wrong password" takes as long as an Argon2 hash — and
that difference is a user-enumeration oracle. It must exceed your worst-case hash time or it
stops covering anything.

**A one-time credential is consumed on the way out.** For `otp` configs the match expires the
row before `authenticate` returns, so a replay of the same secret finds it already spent. The
`cause` on the 401 distinguishes `missing`, `expired` and `invalid` — for your logs only.
Never return it to the caller; that is the same oracle by another route.

## API

### `randomId(options)`

Generate a random credential ID.

### `count(credentialOptions, sub)`

Count valid credentials of a given type for a subject.

### `list(credentialOptions, sub, params, fields)`

List credentials with automatic decryption.

### `create(credentialOptions, sub, values)`

Create a single credential.

`values.expire` is a lifetime in seconds and overrides `credentialOptions.expire` for this one credential, so a single config can back a choice of lifetimes. Leave it out and the credential default applies.

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

## Post-quantum

Uses only symmetric field encryption and CSPRNG identifiers, both post-quantum safe. Credential-specific concerns live in each `authn-*` package. See the full assessment in [Post-quantum](/docs/security/algorithms#post-quantum).
