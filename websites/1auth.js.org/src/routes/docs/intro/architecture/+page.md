---
title: Architecture
description: Overview of 1auth's modular architecture, package responsibilities, and how components communicate through shared interfaces.
---

## Overview

1auth is designed as a modular system where each package handles a specific concern. Packages communicate through a shared `store` and `notify` interface, while `@1auth/crypto` provides the cryptographic primitives used throughout.

![Architecture diagram](/img/architecture.png)

## Module layers

### Crypto layer

`@1auth/crypto` is the foundation. It must be initialized before any other module. It provides:

- Symmetric encryption (ChaCha20-Poly1305 / AES-256-GCM)
- Password hashing (Argon2id)
- HMAC signing
- Digest computation
- Random ID generation

`@1auth/crypto-kms` is an optional key provider for `@1auth/crypto` that keeps the key-encryption key inside AWS KMS, so row keys are wrapped and unwrapped by KMS instead of by a secret held in process memory.

### Storage layer

Store modules implement a common interface for database operations:

- `@1auth/store-dynamodb` — AWS DynamoDB
- `@1auth/store-postgres` — PostgreSQL
- `@1auth/store-sqlite` — SQLite
- `@1auth/store-d1` — Cloudflare D1

All stores provide: `exists`, `count`, `select`, `selectList`, `insert`, `update`, `remove`

### Notification layer

- `@1auth/notify` — Base notification interface
- `@1auth/notify-sqs` — AWS SQS implementation

Notifications are decoupled from business logic. Events like "verification token created" are sent to a queue for processing by a separate service.

### Application layer

- `@1auth/account` — User account CRUD with encrypted storage
- `@1auth/account-username` — Username validation and lookup
- `@1auth/authn` — Core authentication framework
- `@1auth/authn-webauthn` — WebAuthn/FIDO2 credential support
- `@1auth/authn-recovery-codes` — Backup recovery codes
- `@1auth/authn-access-token` — API access tokens (PATs)
- `@1auth/authn-pow` — Proof-of-work anti-automation challenge for unauthenticated forms
- `@1auth/messenger` — Messaging framework for contact verification
- `@1auth/messenger-email-address` — Email address verification
- `@1auth/session` — Session creation, signing, and management

## Data flow

1. **User input** enters through the application layer
2. **Authentication** validates credentials using timing-safe comparisons
3. **Encryption** is applied transparently before storage
4. **Storage** persists encrypted data to the configured backend
5. **Notifications** are sent asynchronously through SQS or similar

## Trust boundaries

- **Client to Application Server** — All user inputs validated at entry
- **Application Server to Database** — Sensitive fields encrypted before storage; digests used for lookups
- **Application Server to Notification Service** — Tokens sent through notification channels, never returned in API responses
