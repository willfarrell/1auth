---
title: Threat Model
description: 1auth's security goals, threat model, and OWASP ASVS v5.0 Level 3 compliance approach.
---

## Security goals

1auth aims to comply with [OWASP ASVS v5.0 Level 3](https://github.com/OWASP/ASVS/tree/master/5.0/en) using automated and manual security audits.

## Secure design principles

- **Secure by default** — Safe configurations out of the box
- **Use white lists** — Explicit allow lists over deny lists
- **No backdoors** — No debug modes or hidden access
- **Follow least privilege** — Minimal permissions required
- **Keep it simple** — Reduced attack surface through simplicity

## Primary threats

### Credential stuffing / brute force

**Mitigation:** Argon2id hashing with configurable cost parameters, run off the event loop. One-time codes checked with `verify` (for example 6-digit email/SMS codes) are removed after `otpMaxAttempts` failed attempts (default 5).

**Not mitigated by 1auth:** `authenticate` (passwords, recovery codes, access tokens) does not count failed attempts. Per-account and per-IP rate limiting, lockout and CAPTCHA are the application's responsibility, in front of every `authenticate` call. Without it, guessing is bounded only by how fast your servers hash.

### Session hijacking

**Mitigation:** HMAC-signed session IDs, encrypted session storage, per-session encryption keys.

Session tokens are signed with HMAC to prevent tampering. Session data is encrypted at rest with per-session keys.

### Credential theft at rest

**Mitigation:** Per-record ChaCha20-Poly1305 encryption with per-user derived keys.

Every sensitive field is encrypted before storage. Database compromise does not expose plaintext credentials.

### Account enumeration

**Mitigation:** A response-time floor (`authenticationDuration`, default 250ms) plus equal work on every path.

Every `authenticate` call waits out the floor before answering. An unknown username, or a user with nothing to check, still verifies a dummy value of the same credential type, so it costs the same hash as a user with one credential. Candidates are hashed concurrently on the threadpool, so a user with several (recovery codes) takes about `ceil(candidates / UV_THREADPOOL_SIZE)` hash times. The floor hides the difference only while it exceeds that worst case. Under enough load hashes queue and take longer, and a long enough measurement can see it. Keep the floor above your worst case, and rate limit (see above).

### Token replay

**Mitigation:** One-time credentials are removed on use, and only the request that removed the row succeeds.

Verification tokens, recovery codes and webauthn challenges are consumed on use and cannot be replayed, including by parallel requests racing with the same value.

## Trust boundaries

### Client to Application Server

All user inputs (credentials, tokens, session IDs) are validated at entry. No user-supplied data is trusted without validation.

### Application Server to Database

All sensitive fields are encrypted before storage. Digests are used for lookups instead of plaintext values. The database never sees plaintext credentials.

### Application Server to Notification Service

Tokens are sent through notification channels (email, SMS), never returned in API responses directly. This ensures tokens are delivered through a verified communication channel.

## Vulnerability reporting

Report security vulnerabilities by emailing: `willfarrell@proton.me` (PGP supported).

- **Acknowledgment:** Within 14 days
- **Detailed response:** Within 48 hours of acknowledgment
- **Fix target:** Within 60 days
