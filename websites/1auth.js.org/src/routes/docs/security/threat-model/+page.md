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

**Mitigation:** Timing-safe authentication with minimum duration (`setTimeout`), Argon2id password hashing with configurable cost parameters.

All authentication responses take a constant minimum time regardless of whether the username exists or the password is correct.

### Session hijacking

**Mitigation:** HMAC-signed session IDs, encrypted session storage, per-session encryption keys.

Session tokens are signed with HMAC to prevent tampering. Session data is encrypted at rest with per-session keys.

### Credential theft at rest

**Mitigation:** Per-record ChaCha20-Poly1305 encryption with per-user derived keys.

Every sensitive field is encrypted before storage. Database compromise does not expose plaintext credentials.

### Account enumeration

**Mitigation:** Constant-time authentication responses via `setTimeout` to prevent timing side-channels.

Whether a username exists or not, the response time is identical, preventing attackers from determining valid usernames.

### Token replay

**Mitigation:** OTP tokens are expired/removed after single use.

Verification tokens (email, recovery codes) are consumed on use and cannot be replayed.

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
