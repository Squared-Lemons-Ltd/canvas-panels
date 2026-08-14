# Private package delivery

`@squaredlemons/canvas-panels` is published restricted on the npm registry, under the `@squaredlemons` scope. This repository contains no npm credential of any kind: the release workflow authenticates each run through OIDC trusted publishing, and nothing else in the repository can publish.

Everything below the "Release runbook" heading describes the one authorized path from a verified commit to a published version.

## Verified delivery path

The package is built as ES2022 ESM, packed with `npm pack`, and installed from the generated tarball into clean temporary React 19 and Next.js consumers by:

```sh
pnpm pack:check
```

The check verifies the tarball manifest, rejects source and build-script leakage, confirms lockfile integrity for the installed tarball, imports every JavaScript subpath, resolves the stylesheet, and production-builds the clean Next consumer. It does not publish anything.

Repository fixtures exercise the same package exports through the pnpm workspace:

```sh
pnpm build
```

## npm registry status

Checked on 7 August 2026:

- `npm whoami` returns `jonathangill`.
- The npm profile has a verified email address and two-factor authentication set to `auth-and-writes`.
- `npm org ls squaredlemons --json` confirms that `jonathangill` owns the `squaredlemons` organization.
- `npm team ls squaredlemons:developers --json` confirms that `jonathangill` belongs to the default developers team.
- `npm access list packages squaredlemons --json` succeeds and currently returns an empty package list.
- An authenticated lookup of `@squaredlemons/canvas-panels` returns `E404`. Because the organization owner can see its private packages, this confirms that the intended package name has not been published within the scope.

The npm CLI does not expose the organization's billing plan. The organization owner confirmed on 7 August 2026 that the **Unlimited private packages** plan is active. No placeholder package was published to reserve the name.

Reverify the access path without printing credentials:

```sh
npm whoami
npm org ls squaredlemons --json
npm team ls squaredlemons:developers --json
npm access list packages squaredlemons --json
npm view @squaredlemons/canvas-panels name version --json
```

The final command should continue to return `E404` until the first approved release.

## Trusted publishing route

npm's trusted-publishing documentation supports GitHub Actions through OIDC. Trusted publishers are configured in an existing package's settings, so they cannot be registered before the first real package version exists. When the complete Package Gate authorizes that release:

1. Bootstrap the first approved restricted release from an organization owner's authenticated local npm session with write-protected 2FA; do not create an automation token.
2. Add a trusted publisher in the new package's npm settings for GitHub organization `Squared-Lemons-Ltd`, repository `canvas-panels`, and the exact release workflow filename.
3. Use a GitHub-hosted runner with `permissions: id-token: write` and `contents: read`.
4. Configure `actions/setup-node` for `https://registry.npmjs.org`.
5. Install private dependencies with a separate read-only token if needed; do not use it for publishing.
6. Run the complete Package Gate before every `npm publish`.
7. Publish subsequent releases with OIDC and no long-lived publish token.

The normal CI workflow deliberately has only `contents: read` and contains no publishing command. `.github/workflows/release.yml` is the only workflow that publishes; it runs on `main` only, holds `id-token: write`, and carries no `NODE_AUTH_TOKEN` or `NPM_TOKEN`. The contract suite asserts all of that, and fails if a second workflow acquires a publishing command.

Because this is a private GitHub repository, npm provenance attestations are not supported. `publishConfig.provenance` is explicitly `false`; this does not prevent OIDC trusted publishing.

Primary reference: [Trusted publishing for npm packages](https://docs.npmjs.com/trusted-publishers/), reviewed 7 August 2026.

## Release runbook

One command is the gate:

```sh
pnpm gate
```

It runs formatting, linting and dependency boundaries, typechecking, the contract suite, the build, and the clean pack-and-install of both consumers. `release:publish` runs it again immediately before `changeset publish`, on the runner that publishes, so the tarball that reaches the registry is the one that was just verified.

### A stable release

1. Land the work on `main`, each change carrying a Changeset. Nothing else is required of a contributor.
2. The release workflow opens a **Version Packages** pull request holding the version bump and the generated `CHANGELOG.md`. That pull request is the review of the version and the changelog.
3. Merge it. The workflow runs again, the gate passes, and `changeset publish` publishes the package to the `latest` dist-tag and pushes the release tag.
4. Record the release in `docs/delivery/release-evidence.md` using the verification commands there.

### A prerelease

Prereleases publish to `next` and never to `latest`. The dist-tag comes from Changesets pre mode rather than from `publishConfig.tag` — with a tag pinned in the manifest *every* publish would carry it, which is exactly how a prerelease reaches a stable range by accident.

```sh
pnpm exec changeset pre enter next   # commit .changeset/pre.json
# land changes as usual; each merge publishes 0.x.y-next.<n> to the `next` tag
pnpm exec changeset pre exit         # commit; the next release goes to `latest`
```

While `.changeset/pre.json` exists, every version the workflow produces is a prerelease and every publish is tagged `next`. A consumer asking for `@squaredlemons/canvas-panels` without a version never resolves one, because npm resolves the `latest` tag and a semver range never matches a prerelease unless the range names one.

### Promoting a release candidate

A candidate is promoted by moving a tag, never by building again. The artifact that was verified is the artifact that becomes `latest`:

```sh
pnpm exec changeset pre exit            # commit; the next version is 1.0.0, not 1.0.0-next.n
# merge the Version Packages pull request; the workflow publishes 1.0.0
npm dist-tag add @squaredlemons/canvas-panels@1.0.0 latest
```

The candidate is published under its final version number and reaches consumers only through the `next` tag until the tag is moved. Verify it there — install `@squaredlemons/canvas-panels@next` into the proof consumer, run that application's own gate — and then move `latest` onto the version already on the registry.

Two things this deliberately avoids. It never publishes a *separate* `1.0.0-rc.1` that is then rebuilt as `1.0.0`, because those are two artifacts and only one of them was verified. And it never re-runs the build between verification and promotion, because `npm dist-tag add` touches no bytes: the integrity recorded in `release-evidence.md` is the same before and after.

If the candidate fails verification, leave `latest` where it is. Nothing has to be undone: a version nobody's range resolves is a version nobody has.

### The first release, which is different

npm registers a trusted publisher against a package that already exists, so the first version cannot come from the workflow:

1. Run `pnpm gate` on the exact commit to be released. It must pass.
2. Publish that commit from an organization owner's authenticated local npm session with write-protected 2FA. Do not create an automation token.
3. Add the trusted publisher in the new package's npm settings: GitHub organization `Squared-Lemons-Ltd`, repository `canvas-panels`, workflow `release.yml`.
4. Confirm with `npm access list packages squaredlemons --json` that the package is `restricted`.
5. Every release after this one goes through the workflow, and no long-lived publish token is ever created.

### Rolling back a release

npm versions are immutable and are not unpublished. A bad release is superseded:

```sh
npm dist-tag add @squaredlemons/canvas-panels@<previous-version> latest
```

That moves consumers installing by tag back to the previous version immediately. Then land the fix and release forward. `npm deprecate` the bad version with a sentence naming its replacement; deprecating is reversible, unpublishing is not, and after 72 hours unpublishing is not available at all.

Consumers roll back with a dependency change and nothing else — the package holds no persistent state. See "Rollback" in the package README for the two things to check when rolling back across a Navigation Document change.
