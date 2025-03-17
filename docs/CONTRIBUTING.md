# Contributing

In the spirit of Open Source Software, everyone is very welcome to contribute to this repository. Feel free to [raise issues](https://github.com/willfarrell/template-npm/issues) or to [submit Pull Requests](https://github.com/willfarrell/template-npm/pulls).

Before contributing to the project, make sure to have a look at our [Code of Conduct](/.github/CODE_OF_CONDUCT.md).

To ensure we're following FLOSS Best Practices:

- We require all commits to have Developer Certificate of Origin (DCO)
  a. `git config --global user.name "Your Name"` and `git config --global user.email username@example.org` setup
  a. Or, `Signed-off-by: username <email address>` as the last line of a commit, when a change is made through GitHub
- We require all commits to have signature verification [GitHub Docs: About commit signature verification](https://docs.github.com/en/authentication/managing-commit-signature-verification/about-commit-signature-verification)

If you are a maintainer and want to release a new version, consult the dedicated [RELEASE manual](/docs/RELEASE.md).

## Setup

```bash
npm i -g @sandworm/audit
brew install semgrep
brew install trufflehog
brew install --cask zap
```

## License

Licensed under [MIT License](LICENSE). Copyright (c) 1985-2025 [will Farrell](https://github.com/willfarrell), and all [contributors](https://github.com/willfarrell/template-npm/graphs/contributors).
