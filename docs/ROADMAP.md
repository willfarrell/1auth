# Roadmap

## Documentation

- [ ] add in options, inputs, outputs for each package
- [ ] threat modelling

## Features

- [ ] crypto decode string options to buffer
- [ ] Add in dedicated stores
  - Split `store-sql` into multiple packages
    - `store-postgres`
    - `store-sqlite`
    - `store-mysql`
    - `store-rdsdataapi`
  - aws lambda cloud kv
  - cloudflare kv
  - redis
- [ ] update access token pattern
  - deprecate use of `digest`
- [ ] Asymmetric signatures

## Testing

- [ ] improve unit tests 95% -> 100%
- [ ] Add in more perf tests (crypto)
- [ ] Demo + DAST

## Planned Updates

- Nodejs support for Argon2id (2025-04)
- ASVS v5.0 (2025-05)
- Update to support quantum-safe algorithms (ie ML-KEM-1024, ML-DSA-87, SLH-DSA-SHA2-256) (2027)

## Schedule

Repository will be reviewed annually after each nodejs major LTS release. Deprecate support for old versions nodejs.
Security review should be conduced for every major version release, or every 5 years, which ever comes first.

- Node.js Releases - https://nodejs.org/en/about/previous-releases
- OpenSSL Releases - https://openssl-library.org/roadmap/index.html
