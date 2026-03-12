---
title: Introduction
description: Secure authentication and session management modules for Node.js with encryption by default and consistent APIs.
slug: /
---

## What is 1auth

1auth is a collection of modules to assist in **user authentication** and **session management** for **Node.js** applications.

It works like an ORM for `accounts`, `authentications`, `messengers`, and `sessions` — providing a consistent API while ensuring that encoding, decoding, encryption, and decryption are applied transparently. All while enforcing industry defaults for cryptographic algorithms with an easy method to keep them up to date.

## Key features

- **Secure by default** — ChaCha20-Poly1305 encryption, Argon2id password hashing, HMAC-signed sessions
- **Consistent API** — All modules follow the same initialization and CRUD patterns
- **Per-record encryption** — Every sensitive field is encrypted before storage with per-user derived keys
- **Multi-factor authentication** — WebAuthn/FIDO2, recovery codes, and access tokens
- **Multiple storage backends** — DynamoDB, PostgreSQL, SQLite, Cloudflare D1
- **Security-first** — OWASP ASVS v5.0 Level 3 compliance, OpenSSF Scorecard, SLSA 3

## Security standards

1auth aims to meet [OWASP ASVS v5.0 Level 3](https://github.com/OWASP/ASVS/tree/master/5.0/en) using automated scans (Linting, Unit tests, SAST, SCA, DAST, Perf) and manual self-audits.

## License

Licensed under [MIT License](https://github.com/willfarrell/1auth/blob/main/LICENSE).
