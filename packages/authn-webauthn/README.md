<div align="center">
  <h1>@1auth/authn-webauthn</h1>
  <!--<img alt="1auth logo" src="https://raw.githubusercontent.com/willfarrell/1auth/main/docs/img/logo.svg"/>-->
  <p><strong>WebAuthn/FIDO2 authentication implementation for passwordless login</strong></p>
<p>
  <a href="https://github.com/willfarrell/1auth/actions/workflows/test-unit.yml"><img src="https://github.com/willfarrell/1auth/actions/workflows/test-unit.yml/badge.svg" alt="GitHub Actions unit test status"></a>
  <a href="https://github.com/willfarrell/1auth/actions/workflows/test-dast.yml"><img src="https://github.com/willfarrell/1auth/actions/workflows/test-dast.yml/badge.svg" alt="GitHub Actions dast test status"></a>
  <a href="https://github.com/willfarrell/1auth/actions/workflows/test-perf.yml"><img src="https://github.com/willfarrell/1auth/actions/workflows/test-perf.yml/badge.svg" alt="GitHub Actions perf test status"></a>
  <a href="https://github.com/willfarrell/1auth/actions/workflows/test-sast.yml"><img src="https://github.com/willfarrell/1auth/actions/workflows/test-sast.yml/badge.svg" alt="GitHub Actions SAST test status"></a>
  <a href="https://github.com/willfarrell/1auth/actions/workflows/test-lint.yml"><img src="https://github.com/willfarrell/1auth/actions/workflows/test-lint.yml/badge.svg" alt="GitHub Actions lint test status"></a>
  <br/>
  <a href="https://www.npmjs.com/package/@1auth/authn-webauthn"><img alt="npm version" src="https://img.shields.io/npm/v/@1auth/authn-webauthn.svg"></a>
  <a href="https://packagephobia.com/result?p=@1auth/authn-webauthn"><img src="https://packagephobia.com/badge?p=@1auth/authn-webauthn" alt="npm install size"></a>
  <a href="https://www.npmjs.com/package/@1auth/authn-webauthn">
  <img alt="npm weekly downloads" src="https://img.shields.io/npm/dw/@1auth/authn-webauthn.svg"></a>
  <a href="https://www.npmjs.com/package/@1auth/authn-webauthn#provenance">
  <img alt="npm provenance" src="https://img.shields.io/badge/provenance-Yes-brightgreen"></a>
  <br/>
  <a href="https://scorecard.dev/viewer/?uri=github.com/willfarrell/1auth"><img src="https://api.scorecard.dev/projects/github.com/willfarrell/1auth/badge" alt="Open Source Security Foundation (OpenSSF) Scorecard"></a>
  <a href="https://slsa.dev"><img src="https://slsa.dev/images/gh-badge-level3.svg" alt="SLSA 3"></a>
  <a href="https://github.com/willfarrell/1auth/blob/main/docs/CODE_OF_CONDUCT.md"><img src="https://img.shields.io/badge/Contributor%20Covenant-2.1-4baaaa.svg"></a>
  <a href="https://biomejs.dev"><img alt="Checked with Biome" src="https://img.shields.io/badge/Checked_with-Biome-60a5fa?style=flat&logo=biome"></a>
  <a href="https://conventionalcommits.org"><img alt="Conventional Commits" src="https://img.shields.io/badge/Conventional%20Commits-1.0.0-%23FE5196?logo=conventionalcommits&logoColor=white"></a>
</p>
<p>You can read the documentation at: <a href="https://1auth.js.org">https://1auth.js.org</a></p>
</div>

## Install

```bash
npm install @1auth/authn-webauthn
```

## Account enumeration

A login form that answers "no such user" reports which accounts exist. `createChallenge` takes an optional `username` so an unknown account is answered the same way as a known one:

```javascript
const sub = await subject(username) // undefined when nothing matches
const { secret } = await createChallenge(sub, { username })
```

With a `sub`, nothing changes. Without one, and only when `username` is passed, it returns a decoy: a real challenge over a single credential id derived from a seasoned checksum of the username. That id is stable for a username across probes, the way a real credential is, and cannot be recomputed without the pepper, so a decoy cannot be told from a real id offline. Its length is drawn from the seed across the lengths real authenticators emit, because one length shared by every decoy would identify them as a set.

Nothing is stored for a decoy, so the returned object carries no `id`. The assertion it answers fails as an ordinary bad credential.

Omitting `username` keeps the existing throw on a missing `sub`. An authenticated caller that lost its `sub` is a bug, and should not be quietly handed a credential its user can never satisfy.

Two things this does not do. It does not equalise response time, because the real path writes challenge rows and a decoy does not, so the caller should hold both paths to a fixed budget. It also does not pad a real account's credential list, so how many credentials an account holds is still visible.

## Documentation and examples

For documentation and examples, refer to the main [1auth monorepo on GitHub](https://github.com/willfarrell/1auth) or the [1auth website](https://1auth.js.org).

## Contributing

Everyone is very welcome to contribute to this repository. Feel free to [raise issues](https://github.com/willfarrell/1auth/issues) or to [submit Pull Requests](https://github.com/willfarrell/1auth/pulls).

## License

Licensed under [MIT License](LICENSE). Copyright (c) 2020-2026 [will Farrell](https://github.com/willfarrell) and [contributors](https://github.com/willfarrell/1auth/graphs/contributors).
