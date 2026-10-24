# Release Plan

## Versioning

All releases follow [semantic versioning](https://semver.org/).

## Process

### Maintenance

Before deploying a new version, update all dependencies where possible without breaking changes.

### Publishing

1. On `develop`, set the new version on the root package with `npm pkg set version=<version>`
1. Run `npm run release:sync` to update every workspace and the `@1auth/*` cross-dependencies to the new version, and to copy the root `LICENSE` into each package
1. Commit the result as `chore: version bump`
1. Run `npm run release:tag` to create the signed tag and push it
1. Create a PR from `develop` into `main` titled with the version
1. Preview PR
1. Merge PR, this will trigger `release.yml`. It only proceeds when the root `package.json` version differs from `main` before the merge, then runs the unit tests (Node 24 and 26) before it builds. It goes on to draft the GitHub release and stage the npm publish (`--tag next` for prerelease versions, `--tag latest` for stable)
1. Approve the `npm-publish` environment when the Publish job requests review
1. After CI stages the publish, run `npm run release:approve` to approve the staged packages on npm (requires `npm login` with 2FA)
1. Publish the draft GitHub release
1. Git merge `main` back into `develop`
