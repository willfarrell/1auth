---
title: Upgrade Guide
description: Migration guide for upgrading between 1auth major versions with breaking changes and required steps.
---

## 0.0.0-rc.11

Breaking default changes, for OWASP ASVS 5.0 Level 3 (11.2.3, 11.6.1). Each one is a default, so a caller can widen it back explicitly.

- `@1auth/authn-webauthn`: `supportedAlgorithmIDs` defaults to `[-48, -8, -7]` (ML-DSA-44, EdDSA, ES256). RS256 (`-257`) is no longer offered or accepted at registration, so an authenticator that only makes RSA keys, such as Windows Hello on an RSA-only TPM, cannot register a new credential. Credentials registered before still authenticate. Pass `supportedAlgorithmIDs: [-48, -8, -7, -257]` to keep accepting RSA.
- `@1auth/session-dbsc`: `algorithms` defaults to `['ES256']`. A browser whose TPM only makes RSA keys gets no binding, and with `require: false` its session stays unbound. Sessions bound to RS256 before the upgrade keep refreshing until they expire. Pass `algorithms: ['ES256', 'RS256']` to keep offering RSA.
- `@1auth/crypto`: a packet whose HMAC is not `sha3-384` now names its hash (`HS256:`, `HS512:` and so on), and any `symmetricSignatureHashAlgorithm` without an id is refused at configure time. Default packets are unchanged. Readers on 0.0.0-rc.10 cannot read a hash-named packet, so upgrade every reader before configuring another hash.

## v0.0.0 => v1.0.0

Details about breaking changes and details on how to migrate will be documented here when v1.0.0 is released.
