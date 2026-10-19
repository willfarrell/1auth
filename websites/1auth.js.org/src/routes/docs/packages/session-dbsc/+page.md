---
title: "@1auth/session-dbsc"
description: Device Bound Session Credentials (DBSC) for @1auth/session.
---

Binds a session cookie to a private key held in the device's secure hardware, so a stolen
cookie is useless off the device that earned it. Implements the server half of
[Device Bound Session Credentials](https://www.w3.org/TR/dbsc/).

The browser keeps the private key, holds a short lived cookie, and re-proves possession of
the key to your refresh endpoint every time that cookie expires. This package verifies the
proof and mints the next one.

> DBSC is a W3C First Public Working Draft and only ships in Chromium. Browsers without it
> send nothing, so keep your existing `session.lookup()` path as the fallback — this is
> hardening on top, not the gate. It can become the gate with `require: true`, which locks
> out every browser that cannot register a binding.

## Install

```bash
npm i @1auth/session-dbsc
```

## Usage

```javascript
import dbsc from '@1auth/session-dbsc'

// Anything this package does not own is forwarded to @1auth/session,
// so there is one module to configure rather than two wired together
dbsc({
  store,
  notify,
  expire: 12 * 60 * 60
})
```

### Where the binding lives

The binding owns no table. The device key is a nullable `publicKey` column on the
`@1auth/session` row, so a bound session **is** a session — not a session plus a second
record to keep in step. That means the session's own record ID is the DBSC
`session_identifier`, and a refresh reads one row that already carries the key it has to
verify against.

`refresh` never writes the session row. The row's ID **is** the `session_identifier`, so it is
stable across refreshes by construction — the browser caches it and sends it back as
`Sec-Secure-Session-Id`, while only the bound cookie behind it turns over.

The one thing a refresh does write is the challenge it spent, to the `challengeTable`
(`dbsc_challenges`). A challenge is a signed timestamp, so without that record a captured proof
could be replayed for as long as its challenge stays valid. The insert fails on a key that
already exists, and that failure is the replay check, so two copies of one proof racing each
other cannot both pass. A row is only useful until its challenge would have expired anyway,
which is what its `expire` records. Create the table from `@1auth/session-dbsc/table/sql.js`
or `@1auth/session-dbsc/table/dynamodb.js`.

Two lifetimes, but only one of them is stored:

| | Meaning | Where it lives | Ends at |
|---|---|---|---|
| `dbscCookieExpire` | Proof-of-possession window, on `__Host-Http-dbsc` | The bound cookie, enforced by the browser | 5min, then the browser refreshes |
| `session.expire` | Absolute cap on the login | The `sessions` row, and `__Host-Http-sid` | `create + session.expire`, and neither value ever moves |

The idle timeout is neither of these: it is `@1auth/session`'s `idleExpire` (30min by
default), read from the row's `update` on every `lookup`. A refresh keeps the bound cookie
alive but does not count as use; the next ordinary request does.

The database keeps no record of the bound cookie's window, because there is nothing to keep:
the cookie's expiry is what makes the browser refresh, and it is the browser that enforces it.
That is why `dbscCookieExpire` is load bearing — set it to `session.expire` and the bound
cookie never expires before the session does, so the browser never refreshes and the binding
is never exercised.

A refresh is *expected* to arrive with a dead cookie — that is the whole mechanism — so an
expired cookie does not stop it. Only the row's `expire` does.

> **Stateless token, stateful session.** A bound token is a signed timestamp, so a refresh
> mints a replacement rather than revoking anything and the previous one stays valid until its
> own `dbscCookieExpire` elapses. That is deliberate: it is what makes a refresh cost no
> database write.
>
> It gives up nothing on revocation, because revocation belongs to `sid`. `lookup` resolves
> the row first, so `expire(sub, id)` or `remove(sub, id)` kills the session immediately and
> an outstanding bound token is worthless without a live row behind it.
>
> What the short lifetime buys is the theft case: an attacker holding **both** cookies has
> until `dbscCookieExpire` and cannot refresh, because that needs the device key. An attacker
> holding only `sid` has nothing the moment a key is bound.

### The flow

Three phases. Registration happens once per device, refresh happens whenever the bound cookie
expires, and everything in between is an ordinary request carrying two cookies.

```
Browser                          Your app                    session-dbsc
   │                                │                                    │
   │  ── 1. after primary auth ─────────────────────────────────────     │
   │  POST /login                   │                                    │
   ├───────────────────────────────►│                                    │
   │                                │  registrationHeader()              │
   │                                ├───────────────────────────────────►│
   │  200  Set-Cookie: __Host-Http-sid=<sid>                             │
   │       Secure-Session-Registration: (ES256 RS256);path=...;challenge=...
   │◄───────────────────────────────┤                                    │
   │                                │                                    │
 ┌─┴──────────────────────┐         │   session row exists, publicKey    │
 │ generate key pair      │         │   is NULL -- `sid` alone is valid  │
 │ private half stays in  │         │                                    │
 │ TPM / secure enclave   │         │                                    │
 └─┬──────────────────────┘         │                                    │
   │                                │                                    │
   │  ── 2. registration ───────────────────────────────────────────     │
   │  POST /dbsc/register           │                                    │
   │  Cookie: __Host-Http-sid       │                                    │
   │  Secure-Session-Response: <proof JWT, carries the public key>       │
   ├───────────────────────────────►│                                    │
   │                                │  register(sid, proof, { aud })     │
   │                                ├───────────────────────────────────►│
   │                                │        verify proof, store         │
   │                                │        publicKey on the row, and   │
   │                                │        rotate sid                  │
   │                                │◄───────────────────────────────────┤
   │                                │        { session, bound, config }  │
   │  200  Set-Cookie: __Host-Http-sid=<new sid>   (12h)                 │
   │       Set-Cookie: __Host-Http-dbsc=<token>    (5min)               │
   │       { session_identifier, refresh_url, credentials }              │
   │◄───────────────────────────────┤                                    │
   │                                │   publicKey set -- the bound       │
   │                                │   cookie is now REQUIRED           │
   │                                │                                    │
   │  ── 3. ordinary request ───────────────────────────────────────     │
   │  GET /api/thing                │                                    │
   │  Cookie: __Host-Http-sid; __Host-Http-dbsc                          │
   ├───────────────────────────────►│                                    │
   │                                │  lookup(sid, bound)                │
   │                                ├───────────────────────────────────►│
   │                                │        row by sid, then verify     │
   │                                │        bound token against it      │
   │  200                           │◄───────────────────────────────────┤
   │◄───────────────────────────────┤                                    │
```

Once `__Host-Http-dbsc` expires the browser pauses the next request, refreshes, then lets it
through. Your app never sees the paused request.

```
Browser                          Your app                    session-dbsc
   │                                │                                    │
   │  __Host-Http-dbsc has expired; the request is held, not sent        │
   │                                │                                    │
   │  POST /dbsc/refresh            │                                    │
   │  Sec-Secure-Session-Id: <session_identifier>                        │
   │  (no proof yet -- no challenge cached)                              │
   ├───────────────────────────────►│                                    │
   │  401  Secure-Session-Challenge: "<challenge>";id="<id>"             │
   │◄───────────────────────────────┤                                    │
   │                                │                                    │
 ┌─┴──────────────────────┐         │                                    │
 │ sign the challenge     │         │                                    │
 │ with the private key   │         │                                    │
 └─┬──────────────────────┘         │                                    │
   │                                │                                    │
   │  POST /dbsc/refresh            │                                    │
   │  Secure-Session-Response: <proof JWT>                               │
   ├───────────────────────────────►│                                    │
   │                                │  refresh(sessionId, proof, { aud })│
   │                                ├───────────────────────────────────►│
   │                                │        selectBinding, check the    │
   │                                │        row's expire, verify proof  │
   │                                │        against the stored key,     │
   │                                │        spend the challenge         │
   │                                │◄───────────────────────────────────┤
   │  200  Set-Cookie: __Host-Http-dbsc=<new token>   (5min)            │
   │◄───────────────────────────────┤                                    │
   │                                │                                    │
   │  the held request now proceeds, with both cookies                   │
   ├───────────────────────────────►│                                    │
```

A cached challenge collapses this to one round trip — hand one out with
`challengeHeader(sessionId)` on any response. When the row's `expire` passes, `refresh` returns
401 instead and the login is over: the device must authenticate again.

### The bound cookie

Two cookies, with different jobs. `sidCookieName` carries `sid` and lives as long as the row;
`dbscCookieName` is the bound credential and is the one the browser watches, expires and
refreshes. Only the second is named in the DBSC config — naming `sid` there would ask the
browser to refresh the long lived cookie, and nothing would ever expire.

Both default to the strictest
[cookie name prefix](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Cookies#cookie_prefixes):
the browser only accepts it on a `Secure`, `HttpOnly`, `Path=/`, host-only cookie, which means
a session cookie carrying this name provably came from `Set-Cookie` and never from script. A
browser that only knows `__Host-` still enforces that much of it, so there is no downside to
the longer prefix.

| Prefix | Secure | HttpOnly | `Path=/`, no `Domain` |
|--------|--------|----------|----------------------|
| `__Host-Http-` | ✓ | ✓ | ✓ |
| `__Host-` | ✓ | | ✓ |
| `__Http-` | ✓ | ✓ | |
| `__Secure-` | ✓ | | |

A cookie that breaks its own prefix rules is dropped silently and presents as an endless
refresh loop, so each cookie's name and attributes are checked against each other at config
time and throw on a mismatch. Serving a session cookie across subdomains needs a `Domain=`
attribute, which rules out the `__Host-` prefixes — use `__Http-` there.

### After login

Offer the browser a bound session on the login response.

```javascript
res.setHeader('Secure-Session-Registration', registrationHeader())
```

### Registration endpoint

```javascript
const proof = req.headers['secure-session-response']
const sid = req.cookies['__Host-Http-sid']
const { session, bound, config } = await register(sid, proof, {
  aud: `https://${req.headers.host}${req.url}`,
  // compared byte for byte on every lookup -- keep volatile fields
  // like `ip` out of it, see @1auth/session
  value: { os, deviceType },
  values: { metadata: JSON.stringify({ ip, browser }) }
})
res.setHeader('Set-Cookie', [
  sidCookieHeader(session.sid),
  dbscCookieHeader(bound)
])
res.json(config)
```

The bound cookie is issued **here**, not on the login response: it proves possession of a key
that does not exist until this exchange registers it. Until then the session is unbound and
`sid` alone is valid — the same path a browser without DBSC takes forever.

Registration binds the key onto the session the request's `sid` names and rotates `sid` in
the same write, so set the new `sid` cookie from `session.sid`. The `sid` the browser held
before binding stops resolving at once. Without the rotation, a `sid` stolen before
registration would keep working, unbound, until the row's `expire`. A `sid` that does not
resolve, belongs to another device (`value`), or already has a key bound is refused with a 401.
Refusing rebinding matters: otherwise a stolen `sid` could swap in the thief's key.

### Refresh endpoint

```javascript
const sessionId = req.headers['sec-secure-session-id']
const proof = req.headers['secure-session-response']
const aud = `https://${req.headers.host}${req.url}`

// No proof yet: hand the browser a challenge and let it come back
if (!proof) {
  res.setHeader('Secure-Session-Challenge', challengeHeader(sessionId))
  return res.status(401).end()
}

const { bound, config } = await refresh(sessionId, proof, { aud })
res.setHeader('Set-Cookie', dbscCookieHeader(bound))
res.json(config)
```

Only the bound cookie is reissued. `sid` keeps its value and its lifetime, and the session row
is **not written** — a refresh is verify-proof, one insert to spend the challenge, sign,
`Set-Cookie`. That matters because Chromium blocks the in-flight request until this endpoint
answers.

`challengeHeader` echoes `sessionId`, which is the raw `Sec-Secure-Session-Id` request
header, into a quoted structured field. It throws `404 Not Found` for anything that is not
printable ASCII or contains `"` or `\`, instead of letting the value end the quotes.

Both header builders take their name and attributes from the same options advertised to the
browser in `config`, so the cookie you set and the cookie the browser was promised cannot
drift.

### Log `Secure-Session-Skipped`

When the browser sends a request *without* refreshing the bound cookie, it says so — and says
why — on the request:

```
Secure-Session-Skipped: unreachable;session_identifier=session_abc
```

This package does not read that header, because the spec requires no particular response to
it. Log it anyway. Without it, a request carrying a stale bound cookie is ambiguous: it could
be an attacker replaying a stolen cookie, or a browser that tried to refresh and could not.
This is the only thing that tells the two apart.

```javascript
const skipped = req.headers['secure-session-skipped']
if (skipped) log.warn('dbsc refresh skipped', { skipped, sub })
```

It is a [structured field](https://www.rfc-editor.org/rfc/rfc9651) list of reason tokens, each
with a `session_identifier` parameter. Three are defined, and they are not equally interesting:

| Token | Meaning | Worth alerting on |
|-------|---------|-------------------|
| `server_error` | The refresh endpoint answered badly, e.g. a 500 | **Yes** — Chromium is reporting your endpoint is broken |
| `quota_exceeded` | The browser declined to refresh, e.g. too many recent TPM operations | **Yes, on a spike** — presents as unexplained session churn |
| `unreachable` | The refresh request never landed | Mostly network noise |

Decide what a skipped refresh should *mean* before acting on it programmatically: treating one
as hostile logs users out on flaky networks, and treating it as benign hands an attacker a way
to opt out of the binding by suppressing refreshes. Logging costs nothing and commits to
neither.

## Configuration options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `store` | `object` | **required** | Passed straight through to `@1auth/session`, along with anything else it owns — configure this package, not both |
| `require` | `boolean` | `false` | Reject unbound sessions on `lookup`. An unbound row then only resolves for `challengeExpire` after creation — long enough to reach the registration endpoint, nothing more. Leave `false` while browsers without DBSC must be able to stay signed in |
| `challengeExpire` | `number` | `60` (1min) | How long a challenge stays valid |
| `challengeTable` | `string` | `dbsc_challenges` | Where spent refresh challenges are recorded, so a proof cannot be replayed |
| `registerPath` | `string` | `/dbsc/register` | Registration endpoint |
| `refreshPath` | `string` | `/dbsc/refresh` | Refresh endpoint |
| `sidCookieName` | `string` | `__Host-Http-sid` | The session cookie |
| `sidCookieAttributes` | `string` | `Path=/; Secure; HttpOnly; SameSite=Strict` | Attributes of the session cookie. No `Max-Age` — it comes from `session.expire` |
| `dbscCookieName` | `string` | `__Host-Http-dbsc` | The bound cookie, the one DBSC watches and refreshes |
| `dbscCookieExpire` | `number` | `300` (5min) | Bound cookie lifetime, and the token's own expiry |
| `dbscCookieAttributes` | `string` | `Path=/; Secure; HttpOnly; SameSite=Strict` | Attributes of the bound cookie. No `Max-Age` — it comes from `dbscCookieExpire`. `Strict` never leaves the site; drop to `Lax` if arriving from an external link must show logged-in immediately |
| `scope` | `object` | `{ include_site: false }` | DBSC scope the cookie applies to |

## API

### `registrationHeader({ authorization })`

Value for the `Secure-Session-Registration` response header, including a fresh challenge.

### `challengeHeader(sessionId)`

Value for the `Secure-Session-Challenge` response header, bound to one session. Throws
`404 Not Found` when `sessionId` is not a non-empty string of printable ASCII without `"` or
`\`.

### `challenge(sessionId)`

The raw challenge string. Stateless: a signed timestamp, valid for `challengeExpire`.

### `register(sid, proof, { aud, value, values })`

Resolve `sid` to a live, unbound session (compared against `value`, as `lookup` does), verify
the registration proof, then bind the device key onto that row and rotate its `sid`.
Returns `{ id, session, bound, config }`, where `id` is the session's record ID and doubles as
the DBSC `session_identifier`, and `session.sid` is the new `sid` to set. The old `sid` stops
resolving. Throws `401 Unauthorized` when `sid` does not resolve or is already bound.

### `refresh(sessionId, proof, { aud, value, values })`

Verify a refresh proof against the bound key and mint a replacement bound token under the same
`session_identifier`. Returns `{ id, bound, config }` — no row is written, so `sid` keeps both
its value and its lifetime.

Rejects when the session is unknown, carries no device key, or is past `expire` (the absolute
cap, or an earlier `expire(sub, id)`). An expired *cookie* does not reject — that is the case
refresh exists for. A proof whose challenge was already spent throws `403 Forbidden`, which
makes the browser fetch a fresh challenge.

### `sidCookieHeader(sid)` / `dbscCookieHeader(token)`

The two `Set-Cookie` values. `sidCookieHeader` carries the session and takes its `Max-Age`
from `session.expire`; `dbscCookieHeader` carries the bound credential and takes its `Max-Age`
from `dbscCookieExpire`. Each lifetime is stated once, so the pair cannot disagree.

### `lookup(sid, bound, value)`

Resolves a request's two cookies to a session. An unbound row is `sid` alone — registration
has not happened yet, or the browser does not do DBSC. Once a key **is** bound the bound
cookie is required, which is what makes registering retroactively lock out a `sid` stolen
beforehand.

With `require: true` an unbound row only resolves for `challengeExpire` after creation. That
window cannot be zero — `register` itself resolves the unbound `sid`, so a session must survive long enough to bind a key, and the challenge issued at login
already dies on the same clock.

### `verifyProof(proof, { aud, sessionId, publicKey })`

Verify a `dbsc+jwt` proof on its own. ES256 and RS256 only.

### `select(sub, id)` / `list(sub)`

Thin pass-throughs to `@1auth/session`. Because a binding is a session, `list(sub)` returns
every session on the account, bound and unbound alike — filter on `publicKey` if you only
want bound ones.

### `expire(sub, id)` / `remove(sub, id)`

`expire` ends the session **and** its binding: `lookup` and `refresh` both refuse a row past
its `expire`, so the device has to log in again. The row stays, so it still shows in
`list(sub)`. `remove(sub, id)` deletes it outright.

### `terminate(sessionId)`

Response body telling the browser to stop maintaining the session.

## Security

- The proof key is compared byte for byte against the key stored at registration, so a
  refresh can only come from the device that registered.
- A session with no `publicKey` cannot be refreshed at all. With no key to compare against
  there is nothing binding the proof to a device, so an unbound session is refused outright
  rather than accepting any well formed proof.
- `selectBinding` projects a fixed field list, so the record ID — which travels in a
  plaintext `Sec-Session-Id` header, unlike `sid` — can never be traded for the session's
  `value`, `digest` or `encryptionKey`.
- Private JWK members are stripped before storage — only `kty`/`crv`/`x`/`y` (EC) and
  `kty`/`n`/`e` (RSA) are kept.
- ES256 requires P-256; RS256 requires a modulus of at least 2048 bits.
- Refresh challenges are bound to the session identifier, so a challenge issued for one
  session cannot be replayed against another. Each is spent on first use (see
  `challengeTable`), so a captured refresh proof cannot be replayed at all.
- `aud` is checked when a proof carries it, but not required: Chromium's refresh proof sets
  `jti` alone. The challenge already covers what `aud` would add, since it is signed, bound to
  the session, and single-use.
- Registration binds onto the session that requested it and rotates its `sid`, so a `sid`
  stolen before binding stops working when the key is bound.
- The bound cookie name is checked against its own prefix rules at config time, since a
  cookie the browser silently drops presents as a refresh loop rather than an error.

## Post-quantum

The HMAC signing used internally is post-quantum safe. The device-bound proof, however, is an ES256/RS256 JWT signed by a TPM-held key — Shor-vulnerable, with algorithms fixed by the browser DBSC spec. Signatures are not retroactively forgeable and sessions expire, so this is an ecosystem-paced migration, not a stored-data risk. See the full assessment in [Post-quantum](/docs/security/algorithms#post-quantum).
