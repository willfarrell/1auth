# Release Plan

## Versioning

All releases follow [semantic versioning](https://semver.org/).

## Process

### Maintenance

Before deploying a new version, update all dependancies where possible without breaking changes.

### Publishing

1. Release Please Bot will trigger automatically and create a PR with the version & changelog update
1. Change PR to merge into `main`
1. Preview PR
1. Merge PR, this will trigger `release.yml`
1. Approve the `npm-publish` environment when the Publish job requests review
1. After CI stages the publish, run `npm run release:approve` to approve the staged packages on npm (requires `npm login` with 2FA)
1. Delete Branch
1. Git merge `main` back into `develop`
