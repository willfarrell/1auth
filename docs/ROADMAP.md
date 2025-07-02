# Roadmap

## Documentation

- [ ] add in options, inputs, outputs for each package
- [ ] threat modelling
- [ ] document item count enforcement
- [ ] document db permissions for stores
- [ ] document sqs permisisons for notify
- [ ] document how to update `lastused` on `accounts` after login

## Features

- [ ] `authn-recovery-code`
- [ ] update sqlite -> move mock logic into lib
- [ ] Add in dedicated stores
  - `store-rdsdataapi`
  - `store-cloudfront-kv`
  - `store-cloudflare-kv`
  - `store-redis`
- [ ] dynamodb update count to used Scan({Select}) (https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/dynamodb/command/ScanCommand/)
- [ ] `session-cookie` move sign/verify from `session`
- [ ] `session-peseto` - access-token exchange for peseto token (single use, 15min expire) -> requests returns a new peseto token (single use, 15min expire) in response
- [ ] add in option to replace secret after config change - only applies to `authn-access-token`
- [ ] Add in suppport for Secure Remote Password (SRP) protocol into `crypto`

## Testing

- [ ] session fuzz {values} needs key enforcement
- [ ] fix dynamodb tests on all packages
- [ ] fix `npm --test` race condion with `store-postgres`
- [ ] fix `npm --test` race condion with `store-dynamodb`
- [ ] improve unit tests 96% -> 100%
- [ ] Add in more perf tests (crypto)
- [ ] Demo + DAST (zap)

## Planned Updates

- Nodejs support for Argon2id (2025-04+)
- ASVS v5.0 (2025-05+)
- Update to support quantum-safe algorithms (ie ML-KEM-1024, ML-DSA-87, SLH-DSA-SHA2-256)

## Schedule

Repository will be reviewed annually after each nodejs major LTS release. Deprecate support for old versions nodejs.
Security review should be conduced for every major version release, or every 5 years, which ever comes first.

- Node.js Releases - https://nodejs.org/en/about/previous-releases
- OpenSSL Releases - https://openssl-library.org/roadmap/index.html
