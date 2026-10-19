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
| `authenticationDuration` | `number` | `250` | Minimum auth duration (ms) for timing safety. Must exceed the worst-case hash time (see below) |
| `otpMaxAttempts` | `number` | `5` | Failed `verify` attempts before a one-time credential is removed |
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
  │                                │  no subject? verify a dummy,   │
  │                                │  wait out the timer, then 401  │
  │                                │                                │
  │                                │  selectList({ sub, type })     │
  │                                │  (+ digest, for access tokens) │
  │                                ├───────────────────────────────►│
  │                                │◄───────────────────────────────┤
  │                                │                                │
  │                       ┌────────┴────────────┐                   │
  │                       │ skip if unverified  │                   │
  │                       │  and not otp        │                   │
  │                       │ skip if expired     │                   │
  │                       │ none left? verify   │                   │
  │                       │  a dummy            │                   │
  │                       │ all at once: decrypt│                   │
  │                       │  decode, verify()   │                   │
  │                       │  (a throw = no      │                   │
  │                       │  match)             │                   │
  │                       └────────┬────────────┘                   │
  │                                │                                │
  │                                │  match, and otp?               │
  │                                │  remove it -- lost the race    │
  │                                │  to another request? no match  │
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
that difference is a user-enumeration oracle.

**Every path does the same work.** An unknown username, or a user with nothing to check, still
runs `config.verify()` once against a dummy value of the same credential type, so the CPU and
threadpool cost matches a user with one credential. Candidates are verified concurrently:
Argon2 runs on the libuv threadpool (off the event loop), so wall time grows with
`ceil(candidates / UV_THREADPOOL_SIZE)` hashes, not with the candidate count. At the defaults
(~100ms per hash, 4 threads) five recovery codes take about two hash times. Keep
`authenticationDuration` above your worst case under load, or the difference shows.

**A one-time credential is consumed on the way out.** For `otp` configs the match removes the
row before `authenticate` returns, and only the request whose `remove` deleted it succeeds. Two
parallel requests with the same recovery code or webauthn challenge get one success and one 401.
The `cause` on the 401 distinguishes `missing`, `expired` and `invalid` — for your logs only.
Never return it to the caller; that is the same oracle by another route.

**One bad row does not fail the rest.** A credential that cannot be decrypted (a rotated key, a
`kms1:` row) or decoded is logged and skipped like a wrong secret.

**Rate limiting is your job.** `authenticate` has no attempt counter: a password, recovery code
or access token can be guessed as fast as you accept requests. Limit attempts per account and
per IP in your application (or at your gateway) in front of every `authenticate` call.

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

Authenticate a user with timing-safe comparison. Uses `setTimeout` to ensure constant-time responses. Set `credentialOptions.digest` to check only the row with that digest (access tokens bind a username to its own secret this way).

### `verifySecret(credentialOptions, sub, id)`

Mark a credential as verified.

### `verify(credentialOptions, sub, input)`

Verify a credential value. A matching one-time credential is removed, so it verifies once. A
failed attempt on a one-time credential (including a `verify` that throws) increments its
`attempts` column; at `otpMaxAttempts` the credential is removed and a new one must be issued.
The counter is read then written, so requests racing on the same row can each get a guess
before the count catches up; keep app-level rate limiting in front of it too.

Existing SQL tables need the column (`packages/authn/table/sql.js` has it for new ones):

```sql
ALTER TABLE authentications ADD COLUMN "attempts" SMALLINT DEFAULT 0;
```

On DynamoDB add `attempts` to the `sub` index projection. Rows without it count from zero.

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
