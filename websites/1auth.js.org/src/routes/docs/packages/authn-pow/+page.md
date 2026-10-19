---
title: "@1auth/authn-pow"
description: Proof-of-work anti-automation challenge for unauthenticated forms.
---

Proof-of-work anti-automation challenge for unauthenticated forms: sign up, sign in, recovery. Addresses OWASP ASVS 2.4.2 (flows require realistic human timing) without a CAPTCHA vendor.

## Install

```bash
npm i @1auth/authn-pow
```

## Usage

```javascript
import pow, { createChallenge, verify } from '@1auth/authn-pow'

pow() // uses the @1auth/authn store unless given `store`
```

Server, when rendering the form:

```javascript
const challenge = createChallenge()
```

Server, on submit, before any credential lookup:

```javascript
try {
  await verify(body.pow)
} catch (e) {
  // 401 Unauthorized, e.cause.type: missing | invalid | expired | unsolved | replayed
}
```

Browser, before submitting the form:

```javascript
import { solve } from '@1auth/authn-pow/client'

const worker = new Worker(new URL('@1auth/authn-pow/worker', import.meta.url), {
  type: 'module'
})
input.value = await solve(challenge, { worker })
```

The caller owns the Worker, so Trusted Types policies, CSP `worker-src`, and bundler URL handling stay with the app. Omit `worker` and the search runs inline on the calling thread.

## Configuration

- **`difficulty`:** `4` — leading hex zeros required of `sha256(challenge + ':' + nonce)`. Each step multiplies the expected work by 16; 4 is roughly 100 to 300ms in a browser worker.
- **`expire`:** `600` — challenge lifetime in seconds.
- **`store`:** the `@1auth/authn` store — where spent challenges are recorded. Its `insert` must throw when the id already exists.
- **`table`:** `pow` — the table spent challenges go in. Create it from `@1auth/authn-pow/table/sql.js` or `@1auth/authn-pow/table/dynamodb.js`.

## One signed claim, spent once

`createChallenge` signs `pow:<difficulty>:<random>:<expire>` with the shared symmetric signature secret. Difficulty and expiry ride inside the signed claim, so the client and the server can never disagree, and the `pow:` prefix rejects any other signed value (a session id) replayed as a proof. `verify` re-hashes the posted `${challenge}:${nonce}` exactly as posted, so the signature and the digest cover the same bytes.

```
  createChallenge()                    solve(challenge, { worker })
      │                                    │
      ▼                                    ▼
  pow:4:random16:expire.SIG ──────►  pow:4:random16:expire.SIG:nonce
                                           │
                                           ▼
                                     verify(solution)
                                       signature, id, expiry, digest, spent
```

A challenge is single use. On success `verify` inserts a row keyed on the SHA-256 of the challenge, with the claim's `expire`, and refuses the request as `replayed` if that row already exists. It is keyed on the challenge rather than the solution, so a second nonce for a spent challenge is refused too. Rows carry `expire` and the store's `remove` TTL, so they clear themselves.
