<div align="center">
  <!--<img alt="1auth logo" src="https://raw.githubusercontent.com/willfarrell/1auth/main/docs/img/logo.svg"/>-->
  <h1>1auth</h1>
  <p><strong>Collection of modules to assist in user authentication and session management.</strong></p>
<p>
  <a href="https://github.com/willfarrell/1auth/actions/workflows/test-unit.yml"><img src="https://github.com/willfarrell/1auth/actions/workflows/test-unit.yml/badge.svg" alt="GitHub Actions unit test status"></a>
  <a href="https://github.com/willfarrell/1auth/actions/workflows/test-dast.yml"><img src="https://github.com/willfarrell/1auth/actions/workflows/test-dast.yml/badge.svg" alt="GitHub Actions dast test status"></a>
  <a href="https://github.com/willfarrell/1auth/actions/workflows/test-perf.yml"><img src="https://github.com/willfarrell/1auth/actions/workflows/test-pref.yml/badge.svg" alt="GitHub Actions perf test status"></a>
  <a href="https://github.com/willfarrell/1auth/actions/workflows/test-sast.yml"><img src="https://github.com/willfarrell/1auth/actions/workflows/test-sast.yml/badge.svg" alt="GitHub Actions SAST test status"></a>
  <a href="https://github.com/willfarrell/1auth/actions/workflows/test-lint.yml"><img src="https://github.com/willfarrell/1auth/actions/workflows/test-lint.yml/badge.svg" alt="GitHub Actions lint test status"></a>
  <br/>
  <a href="https://www.npmjs.com/package/@1auth/authn"><img alt="npm version" src="https://img.shields.io/npm/v/@1auth/authn.svg"></a>
  <a href="https://packagephobia.com/result?p=@1auth/authn"><img src="https://packagephobia.com/badge?p=@1auth/authn" alt="npm install size"></a>
  <a href="https://www.npmjs.com/package/@1auth/authn">
  <img alt="npm weekly downloads" src="https://img.shields.io/npm/dw/@1auth/authn.svg"></a>
  <a href="https://www.npmjs.com/package/@1auth/authn#provenance">
  <img alt="npm provenance" src="https://img.shields.io/badge/provenance-Yes-brightgreen"></a>
  <br/>
  <a href="https://scorecard.dev/viewer/?uri=github.com/willfarrell/1auth"><img src="https://api.scorecard.dev/projects/github.com/willfarrell/1auth/badge" alt="Open Source Security Foundation (OpenSSF) Scorecard"></a>
  <a href="https://github.com/willfarrell/1auth/blob/main/docs/CODE_OF_CONDUCT.md"><img src="https://img.shields.io/badge/Contributor%20Covenant-2.1-4baaaa.svg"></a>
  <a href="https://prettier.io/"><img alt="Code style: prettier" src="https://img.shields.io/badge/code_style-prettier-ff69b4.svg"></a>
  <a href="https://conventionalcommits.org"><img alt="Conventional Commits" src="https://img.shields.io/badge/Conventional%20Commits-1.0.0-%23FE5196?logo=conventionalcommits&logoColor=white"></a>
  <a href="https://github.com/willfarrell/1auth/blob/main/package.json#L32">
  <img alt="code coverage" src="https://img.shields.io/badge/code%20coverage-80%25-brightgreen"></a>
</p>
<p><!--You can read the documentation at: <a href="https://github.com/willfarrell/1auth">https://github.com/willfarrell/1auth</a>--> 1Auth is like an ORM for `accounts`, `authentications`, `messengers`, `sessions` with extensibility to ensure they have a consistent API and ensure that encoding/decoding/encryption/decryption are applied in a consistent way. All while enforcing industry defaults for cryptographic algorithms with an easy method to keep them up to date.</p>
</div>

## Default algorithms

- Symmetric encryption: chacha20-poly1305 (AES-256 GCM also supported)
- Symmetric signature: HMAC
- Asymmetric encryption: ECDSA
- Asymmetric encryption key: ECC P-384 (ECC P-512 also supported)
- Asymmetric signature: Ed25521 (future)
- Digest: SHA3-384 (SHA2-512, SHA3-512 also supported)
- Secret hash: [Argon2id](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#argon2id) (timeCost:3, memoryCost: 2^15, slatLength: 16, outputLen: 64)
- Encoding: base64

FIPS 140-3 Level 4 can be achieved using `aes-256-gcm`.

## License

Licensed under [MIT License](LICENSE). Copyright (c) 1985-2025 [will Farrell](https://github.com/willfarrell) and all [contributors](https://github.com/willfarrell/1auth/graphs/contributors).
