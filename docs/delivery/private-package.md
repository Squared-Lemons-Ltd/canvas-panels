# Private package delivery

`@squared-lemons-ltd/canvas-panels` is published privately to **GitHub Packages**, at `https://npm.pkg.github.com`, from this repository. This repository stores no publishing credential: the release workflow authenticates with the `GITHUB_TOKEN` that GitHub mints for that run and expires when the job ends, and nothing else in the repository can publish.

**Nothing has been published yet.** `0.1.0` is built, gated, and recorded in [`release-evidence.md`](./release-evidence.md), and it is the release workflow's to publish.

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

## Why GitHub Packages, and what it cost

The original decision, in [#10](https://github.com/Squared-Lemons-Ltd/canvas-panels/issues/10), was the public npm registry under a restricted `@squaredlemons` scope, chosen over GitHub Packages to keep the agreed scope name and to spare consumers a GitHub token in their `.npmrc`.

That decision was reversed on 16 August 2026, before anything was published, when the first `npm publish` was refused:

```
402 Payment Required — You must sign up for private packages
```

npm sells private packages under a *personal* scope and under an *organization* scope as two separate paid plans. `@squaredlemons` is an organization, so a personal subscription does not cover it. With no consumers and no published version, the cheapest moment to change registry was that one, and GitHub Packages hosts private packages for a private repository under the plan the repository is already on.

Two consequences, both accepted deliberately:

- **The scope is not a choice.** GitHub Packages resolves a package by scope and requires that scope to be the repository owner, so the package is `@squared-lemons-ltd/canvas-panels` — `Squared-Lemons-Ltd`, lowercased. Renaming the GitHub organization would rename the package with it, and vice versa. Nothing else could have kept `@squaredlemons`.
- **Consumers authenticate to GitHub, not to npm.** Every consuming application, and every CI job of every consuming application, needs a token with `read:packages` in its `.npmrc` before `pnpm install` resolves the scope. See "Installation" in the package README.

One thing got simpler. npm's trusted publishing had to be registered against a package that already existed, so the first version could never come from CI and had to be published by hand from an owner's session. GitHub Packages authenticates the workflow run itself, so **the first release is an ordinary release** — there is no bootstrap step and no human publish.

## The publishing credential

`.github/workflows/release.yml` is the only workflow that publishes. It runs on `main` only, and the job that publishes holds `packages: write` and reads exactly one secret: `GITHUB_TOKEN`.

That token is not stored anywhere. GitHub mints it for the run, scopes it to the permissions the job declares, and expires it when the job finishes — so there is no publishing credential to leak, to rotate, or to find in a settings page. The contract suite asserts that the workflow reads no other secret, that no second workflow acquires a publishing command, and that the ordinary CI workflow keeps `contents: read` and publishes nothing.

GitHub Packages does not serve npm provenance attestations, so `publishConfig.provenance` stays `false`. The integrity recorded for each release in [`release-evidence.md`](./release-evidence.md) is what stands in its place: it is reproducible from the source commit by anyone, which is the property provenance would otherwise assert on the registry's behalf.

Primary reference: [Working with the npm registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry), reviewed 16 August 2026.

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

While `.changeset/pre.json` exists, every version the workflow produces is a prerelease and every publish is tagged `next`. A consumer asking for `@squared-lemons-ltd/canvas-panels` without a version never resolves one, because npm resolves the `latest` tag and a semver range never matches a prerelease unless the range names one.

### Promoting a release candidate

A candidate is promoted by moving a tag, never by building again. The artifact that was verified is the artifact that becomes `latest`.

The version published is the final one — `1.0.0`, not `1.0.0-rc.1` — and it reaches `next` first. That is the whole point: a separate `rc` that is later rebuilt as `1.0.0` is two artifacts, and only one of them was ever verified.

Getting there needs one deliberate step, because the ordinary path does not do it. Out of pre mode `changeset publish` tags whatever it publishes `latest` immediately, so exiting pre mode and merging the version pull request would put `1.0.0` straight into every consumer's range with nothing between. The candidate is published with an explicit tag instead — from a maintainer's own machine, with the release job disabled while the version commit lands:

```sh
pnpm exec changeset pre exit      # commit; the next version is 1.0.0, not 1.0.0-next.n
# land the exit and the version bump with the release workflow disabled, then:
pnpm gate && pnpm exec changeset publish --tag next
```

Publishing by hand needs a GitHub token with `write:packages` in your own `.npmrc`; see "Installing from GitHub Packages" below and add `write:packages` to the scopes. Re-enable the release workflow as soon as the promotion is done — it is the ordinary path, and a repository that stays in the manual state loses the guarantee that the gate ran.

Now verify what is on the registry: install `@squared-lemons-ltd/canvas-panels@next` into the Proof Consumer, run that application's own gate, and check the integrity against `release-evidence.md`. Then promote the version already there:

```sh
npm dist-tag add @squared-lemons-ltd/canvas-panels@1.0.0 latest
```

`npm dist-tag add` touches no bytes. The integrity recorded before promotion is the integrity after it, which is what makes "the already verified artifact" a checkable claim rather than a hope.

If the candidate fails verification, leave `latest` where it is. Nothing has to be undone: a version no consumer's range resolves is a version no consumer has. Deprecate it with a sentence naming its replacement and release forward.

### The first release is not different

Worth stating plainly, because the previous registry made it a whole procedure. GitHub Packages authenticates the workflow run itself, so `0.1.0` publishes exactly the way `0.2.0` will: land it on `main`, let the gate pass, let the workflow publish. There is no bootstrap, no publish from a laptop, and no credential to create.

### Installing from GitHub Packages

A consumer authenticates to GitHub rather than to npm. In the consuming repository:

```ini
# .npmrc
@squared-lemons-ltd:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}
```

The token is a GitHub personal access token — classic, with the `read:packages` scope, and nothing else — or, inside a GitHub Actions job in the same organization, the run's own `GITHUB_TOKEN` with `permissions: packages: read`. A fine-grained token works too, given read access to this repository's packages.

Only the scope line is required in the repository; keep the token itself in the environment rather than committed.

### Rolling back a release

A published version is superseded, not withdrawn:

```sh
npm dist-tag add @squared-lemons-ltd/canvas-panels@<previous-version> latest
```

That moves every consumer installing by tag back to the previous version immediately. Then land the fix and release forward, and `npm deprecate` the bad version with a sentence naming its replacement — deprecating is reversible, deleting is not.

GitHub Packages does allow deleting a version outright, which npm's registry mostly does not. **Do not.** A deleted version breaks every lockfile that pinned it, including ones in repositories nobody is looking at today, and the deletion is not reversible. Moving the tag achieves the same thing for anyone installing by range, and costs nothing to anyone who pinned.

Consumers roll back with a dependency change and nothing else — the package holds no persistent state. See "Rollback" in the package README for the two things to check when rolling back across a Navigation Document change.
