---
title: Contributing
description: How to contribute to 1auth, including development setup, coding standards, and pull request guidelines.
---

In the spirit of Open Source Software, everyone is very welcome to contribute to this repository. Feel free to [raise issues](https://github.com/willfarrell/1auth/issues) or to [submit Pull Requests](https://github.com/willfarrell/1auth/pulls).

Before contributing, make sure to have a look at our [Code of Conduct](https://github.com/willfarrell/1auth/blob/main/docs/CODE_OF_CONDUCT.md).

## Fork

Ensure git history is pulled from the `develop` branch.

## Setup

```bash
npm i -g nmq
npm i -g lockfile-lint
npm i -g @sandworm/audit
brew install semgrep
brew install trufflehog
```

## Implementation

When necessary ensure changes follow secure design principles. See the [Threat Model](/docs/security/threat-model) for details.

## Testing

```bash
npm test
```

Ensure tests are updated and pass. All tests are automatically enforced using GitHub Actions on Pull-Requests.

### Formatting / Linting

We use `biome` with recommended configurations plus a few correctness additions.

### Unit tests

We use `node --test` with a minimum test coverage of:

- lines: >=90%
- branches: >=80%
- functions: >=90%

Bug fixes should always start with a failing unit test.
New features should have acceptance and rejection tests.

### SAST

We use `CodeQL` & `semgrep` to ensure code is written in a secure way.

### SCA

We use `DependaBot` & `sandworm` to ensure dependencies are free of known vulnerabilities.

### DAST

We use `fast-check` to run fuzzing on user inputs. It is expected that user inputs are pre-validated and/or sanitized before reaching package inputs.

### Performance benchmarks

We use `tinybench` to ensure there are no performance regressions.

## Committing

Ensure git commits meet the following FLOSS Best Practices:

- Message follows [Conventional Commits](https://www.conventionalcommits.org/) pattern. Enforced using `@commitlint/cli`.
- Message includes sign off for [Developer Certificate of Origin (DCO)](https://developercertificate.org/) compliance. Enforced via GitHub Actions.
- Commit is cryptographically signed and can be verified.

## Pull Request

Submit a PR to the `develop` branch. Keep PR in draft mode until all automated tests pass. At least 2 maintainers will review the PR.
