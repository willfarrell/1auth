---
title: Algorithms
description: Default cryptographic algorithms used by 1auth, including encryption, hashing, and signing choices.
---

## Default algorithms

1auth enforces modern cryptographic algorithms by default. These can be configured per-module where noted.

| Purpose | Algorithm | Alternatives |
|---------|-----------|-------------|
| Symmetric encryption | ChaCha20-Poly1305 | AES-256-GCM |
| Symmetric signature | HMAC | — |
| Asymmetric encryption | ECDSA | — |
| Asymmetric key | ECC P-384 | ECC P-512 |
| Asymmetric signature | Ed25519 (future) | — |
| Digest | SHA3-384 | SHA2-512, SHA3-512 |
| Secret hash | Argon2id | — |
| Encoding | base64 | — |

## FIPS compliance

FIPS 140-3 Level 4 can be achieved by using `aes-256-gcm` as the symmetric encryption algorithm instead of the default `chacha20-poly1305`.

## Argon2id parameters

Password hashing uses [OWASP-recommended Argon2id parameters](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#argon2id):

| Parameter | Value |
|-----------|-------|
| `timeCost` | 3 |
| `memoryCost` | 2^15 (32 MiB) |
| `saltLength` | 16 bytes |
| `outputLen` | 64 bytes |

## Rationale

### ChaCha20-Poly1305

Default symmetric cipher because it provides:
- Consistent performance across hardware (no AES-NI dependency)
- AEAD construction (authenticated encryption with associated data)
- Wide adoption in TLS 1.3 and modern protocols

### SHA3-384

Default digest algorithm because:
- SHA-3 family provides defense-in-depth against SHA-2 vulnerabilities
- 384-bit output balances security margin with performance
- Supported natively in Node.js `crypto` module

### Argon2id

Default password hashing because:
- Recommended by OWASP for password storage
- Resistant to both GPU and ASIC attacks (memory-hard)
- Combines Argon2i (side-channel resistant) and Argon2d (GPU-resistant)

## Future: quantum-safe algorithms

The roadmap includes migration to quantum-safe algorithms:

- **ML-KEM-1024** — Key encapsulation
- **ML-DSA-87** — Digital signatures
- **SLH-DSA-SHA2-256** — Stateless hash-based signatures
