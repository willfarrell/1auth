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
  expire: 12 * 60 * 60, // absolute cap, the default (OWASP ASVS)
  limit: 10 // live sessions per account, the default
})
```

## Configuration options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `store` | `object` | **required** | Storage backend module |
| `notify` | `object` | **required** | Notification module |
| `table` | `object` | — | Table schema definition |
| `encryptedFields` | `string[]` | `["value"]` | Fields to encrypt |
| `expire` | `number` | `43200` (12h) | Absolute session lifetime in seconds, set at `create` and never extended — `rotate()` deliberately leaves it alone, so a session that keeps refreshing still ends. The short idle window is the cookie's `Max-Age`, not this |
| `limit` | `number` | `10` | Live sessions one account may hold. At the maximum, `create()` expires the oldest live session and keeps the new one. A falsy value turns the cap off |
| `idGenerate` | `object` | — | ID generation config |
| `randomId` | `object` | — | Random ID options (prefix: `session_`) |
| `randomSessionId` | `object` | — | Session token options (prefix: `sid_`, entropy: 128) |
| `encode` | `function` | — | Custom session encoding |
| `decode` | `function` | — | Custom session decoding |
| `checkMetadata` | `function` | — | Device metadata check function |
| `notifyId` | `string` | `'authn-session'` | Prefix for the notify template id: `{notifyId}-new-device` |

### Concurrent sessions

An account holds at most `limit` live sessions, `10` by default. At the maximum, `create()` expires the oldest live session, by `create` time, and keeps the new one. It never refuses the new session: refusing it would let anyone who can reach the login form fill an account's list and lock the owner out. The eviction is the same soft expire as `expire(sub, id)`, so the row stays in the table and stops resolving, exactly as it does when a session reaches its own `expire`.

Only live sessions count toward the cap, so an expired row leaves room for a new session. The count is read, not locked, and no store here offers an atomic counter across an account's rows, so two logins arriving at the same moment can both pass the check. Treat the cap as advisory.

### The `publicKey` column

The session row carries a nullable `publicKey`, the device key a session is bound to. It is
`NULL` for ordinary sessions and holds a public JWK for sessions opened through
[`@1auth/session-dbsc`](/docs/packages/session-dbsc). It is public by definition and compared
byte for byte, so it is deliberately **not** in `encryptedFields`.

## Two identifiers, two jobs

A session has an `id` and a `sid`, and confusing them is the easiest mistake to make here.

```
                    ┌──────────────────────────────────────┐
                    │            sessions row              │
                    │                                      │
  never sent to ───►│  id        session_xxx               │
  the client        │  sub       sub_xxx                   │
  (except as the    │  digest    <seasoned digest of sid>  │◄─── lookup finds
  DBSC session id)  │  value     <encrypted metadata>      │     the row by this
                    │  publicKey <device key, or NULL>     │
                    │  expire    create + 12h, absolute    │
                    └──────────────────────────────────────┘
                                     ▲
                                     │  the sid itself is never stored,
                                     │  only its digest -- a leaked table
                                     │  yields no usable session token
                                     │
  sid_xxx ───────────────────────────┘
  the secret. goes to the client, comes back on every request.
```

`select`, `expire` and `remove` take `(sub, id)` — they are for a user managing their own
sessions, where `sub` is already known. `lookup` takes the `sid` and is the request path.

```
Client                    Your app                    @1auth/session
  │                          │                              │
  │  authenticated           │                              │
  ├─────────────────────────►│                              │
  │                          │  check(sub, value)           │
  │                          ├─────────────────────────────►│
  │                          │     metadata matches no      │
  │                          │     existing session?        │
  │                          │     notify -new-device       │
  │                          │  create(sub, value)          │
  │                          ├─────────────────────────────►│
  │                          │     mint sid, digest it,     │
  │                          │     encrypt metadata,        │
  │                          │     expire = now + 12h       │
  │  sid                     │◄─────────────────────────────┤
  │◄─────────────────────────┤                              │
  │                          │                              │
  │  request + sid           │                              │
  ├─────────────────────────►│                              │
  │                          │  lookup(sid, value)          │
  │                          ├─────────────────────────────►│
  │                          │     digest the sid, find     │
  │                          │     the row, reject if past  │
  │                          │     expire, then compare     │
  │                          │     metadata                 │
  │  200 or nothing          │◄─────────────────────────────┤
  │◄─────────────────────────┤                              │
```

`lookup` returns nothing rather than throwing when the metadata does not match, so a session
whose device details have changed is simply not found. That check is a heuristic over client
supplied headers — treat it as a signal, not a control. For a cryptographic device binding,
see [`@1auth/session-dbsc`](/docs/packages/session-dbsc).

## What goes in `value` — and what must not

`create(sub, value, values)` takes two payloads and they behave very differently.

| | Purpose | Compared on every `lookup` |
|---|---|---|
| `value` | The device fingerprint | **Yes**, byte for byte |
| `values` | Extra columns on the row | No |

`checkMetadata` compares the *whole* encoded `value`, so anything volatile in there ends a
session the moment it changes:

```javascript
// DON'T: every one of these ends the session on a routine, harmless change
session.create(sub, { os, browser, ip })
//                            │      └─ wifi → cellular logs the user out
//                            └─────── a browser auto-update logs them out
```

```javascript
// DO: compare what identifies the device, store the rest alongside it
session.create(
  sub,
  { os, deviceType },                      // stable -> compared
  { metadata: JSON.stringify({ ip, browser, city }) }  // volatile -> stored only
)
```

Both end up on the row and both come back from `list(sub)`, so your "your sessions" screen
still shows the IP and browser. Only `value` decides whether a returning request is the same
device.

Be clear-eyed about what this check is: every field in it comes from client-supplied headers,
so it is a heuristic, not a control. It catches a cookie replayed from a different-looking
client; it does not stop one replayed from a similar-looking one. For a real device binding,
see [`@1auth/session-dbsc`](/docs/packages/session-dbsc) — and note that a bound session is
still subject to this check, so the same advice applies.

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

Pass a device public key as `values.publicKey` to open a bound session —
[`@1auth/session-dbsc`](/docs/packages/session-dbsc) does this for you.

**Returns:** Object with `id`, `sid` (signed session token), and metadata

### `selectBinding(id)`

Look a session up by record ID alone, with no `sub`. This is the read a DBSC refresh needs:
it only receives the `Sec-Session-Id` header.

Returns a fixed, narrow projection — `{ id, sub, publicKey, create, expire }` — and never
`value`, `digest` or `encryptionKey`. Unlike `sid`, the record ID travels in a plaintext
header, so this deliberately cannot hand back anything that would let the caller take the
session over.

**Returns:** The binding, or `undefined` when no session has that ID. `publicKey` is empty
for an unbound session.

### `rotate(sub, id, value, values)`

Reissue `sid` on an existing row. `id`, `publicKey`, `create` and `expire` all survive, so the
session keeps its identity and its absolute deadline while the credential the client holds
changes.

Nothing in 1auth calls this — it exists for **sliding sessions on the unbound path**. A DBSC
session gets credential turnover for free, because every refresh mints a new bound token. A
session without DBSC has no such mechanism, so a `sid` stolen from it stays useful until the
row expires. Calling `rotate` on activity closes that gap: issue the new `sid` as a fresh
cookie and the stolen one stops resolving immediately.

> Assumes the row exists. `rotate` writes without reading first, so the caller is expected to
> have one in hand. It deliberately does not extend `expire` — a session that keeps refreshing
> still ends on schedule.

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

## Post-quantum

Uses only CSPRNG session identifiers, HMAC-SHA3-384 cookie signatures, and symmetric field encryption, all post-quantum safe. No migration needed. See the full assessment in [Post-quantum](/docs/security/algorithms#post-quantum).
