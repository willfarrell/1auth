---
title: Roadmap
description: Planned features, improvements, and upcoming milestones for 1auth.
---

## Documentation

- Add options, inputs, outputs for each package
- Threat modelling
- Document item count enforcement
- Document DB permissions for stores
- Document SQS permissions for notify
- Document how to update `lastused` on accounts after login

## Features

- `authn-recovery-code`
- Update sqlite — move mock logic into lib
- Add dedicated stores:
  - `store-rdsdataapi`
  - `store-cloudfront-kv`
  - `store-cloudflare-kv`
  - `store-redis`
- DynamoDB update count to use `Scan({Select})`
- `session-cookie` — move sign/verify from `session`
- `session-peseto` — access-token exchange for PESETO token (single use, 15min expire)
- Add option to replace secret after config change (applies to `authn-access-token`)
- Add support for Secure Remote Password (SRP) protocol into `crypto`

## Testing

- Session fuzz `{values}` needs key enforcement
- Fix DynamoDB tests on all packages
- Fix `npm test` race condition with `store-postgres`
- Fix `npm test` race condition with `store-dynamodb`
- Improve unit tests 96% to 100%
- Add more perf tests (crypto)
- Demo + DAST (ZAP)

## Planned updates

- Node.js support for Argon2id (2025-04+)
- ASVS v5.0 (2025-05+)
- Update to support quantum-safe algorithms (ML-KEM-1024, ML-DSA-87, SLH-DSA-SHA2-256)

## Schedule

Repository will be reviewed annually after each Node.js major LTS release. Deprecate support for old Node.js versions.
Security review should be conducted for every major version release, or every 5 years, whichever comes first.
