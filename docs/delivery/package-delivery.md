# Package delivery

`@squaredlemons/canvas-panels` is published as MIT-licensed open source to the **public npm registry**, from this repository. This repository stores no publishing credential: the release workflow authenticates by exchanging a workflow-run OIDC token for a short-lived registry credential — npm's **trusted publishing** — and nothing else in the repository can publish.

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

## Why the registry changed twice

The registry decision reversed twice in three days. Both reversals are recorded here rather than tidied away, because the second one undoes the first and a reader who finds only the outcome would reasonably conclude the first was never considered.

**The original decision**, in [#10](https://github.com/Squared-Lemons-Ltd/canvas-panels/issues/10), was the public npm registry under a *restricted* `@squaredlemons` scope — private code, npm's registry.

**Reversed on 16 August 2026**, before anything was published, when the first `npm publish` was refused:

```
402 Payment Required — You must sign up for private packages
```

npm sells private packages under a *personal* scope and under an *organization* scope as two separate paid plans, and `@squaredlemons` is an organization. With no consumers and no published version, the registry was changed rather than the plan, and `0.1.0` was published privately to GitHub Packages as `@squared-lemons-ltd/canvas-panels`.

**Reversed again on 17 August 2026**, when the repository was opened as MIT-licensed open source. That single change removed the premise of the first reversal and inverted the trade: the `402` applies only to *private* packages, and a public package on npm is free. Meanwhile GitHub Packages requires an access token to install a package **whether it is public or private** — its own documentation is explicit that a token is needed "to publish, install, and delete private, internal, and public packages." An open-source package hosted there would have kept every cost of the private arrangement and returned none of the benefit.

What the second reversal recovered:

- **The scope became a choice again.** GitHub Packages resolves a package by scope and requires that scope to be the repository owner, which is the only reason the name ever carried the legal suffix. `@squared-lemons-ltd/canvas-panels` was renamed to `@squaredlemons/canvas-panels`, and the package name is no longer coupled to the GitHub organization name.
- **Consumers stopped authenticating.** No `.npmrc`, no token, no `read:packages` scope. `pnpm add @squaredlemons/canvas-panels` is the whole instruction.
- **Provenance came back.** Trusted publishing generates an attestation automatically, which is the property [`release-evidence.md`](./release-evidence.md) previously had to stand in for.

And what it cost: the bootstrap step returned. npm registers a trusted publisher against a package that already exists, so the first version could not come from CI — see "The first release is different" below. GitHub Packages authenticated the workflow run itself and had no such step, which was its one genuine advantage.

Primary references: [Working with the npm registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry) and [npm trusted publishers](https://docs.npmjs.com/trusted-publishers), both reviewed 17 August 2026.

## The publishing credential

`.github/workflows/release.yml` is the only workflow that publishes. It runs on `main` only, and the job that publishes holds `id-token: write` and reads exactly one secret: `GITHUB_TOKEN`, which Changesets uses to write the version commit and open its pull request — never to publish.

There is no npm credential in this repository. The npm CLI detects the Actions OIDC environment, exchanges the run's identity token for a registry credential scoped to this package, and that credential expires with the job. So there is no publishing token to leak, to rotate, or to find in a settings page. The contract suite asserts that the workflow reads no other secret, that `NPM_TOKEN` and `_authToken` appear nowhere, that no second workflow acquires a publishing command, and that the ordinary CI workflow keeps `contents: read` and publishes nothing.

Two requirements are load-bearing and easy to lose:

- **npm 11.5.1 or later.** `actions/setup-node` on Node 22 installs npm 10, which predates OIDC. It would not fail — it would fall back to looking for a token and publish *without* an attestation. The workflow upgrades npm explicitly, and the contract suite asserts the floor, because nothing else would notice.
- **Nothing may set `NPM_CONFIG_PROVENANCE`.** Attestations are generated without being asked under trusted publishing; the only way to lose one is to turn it off. The suite asserts nothing does.

The trusted publisher is registered in the package's settings on npmjs.com against this organization, this repository, and the filename `release.yml`. Renaming that workflow file breaks publishing until the registration is updated to match.

## Release runbook

One command is the gate:

```sh
pnpm gate
```

It runs formatting, linting and dependency boundaries, typechecking, the contract suite, the build, and the clean pack-and-install of both consumers. `release:publish` runs it again immediately before `changeset publish`, on the runner that publishes, so the tarball that reaches the registry is the one that was just verified.

### A stable release

1. Land the work on `main`, each change carrying a Changeset. Nothing else is required of a contributor.
2. The release workflow opens a **Version Packages** pull request holding the version bump and the generated `CHANGELOG.md`. That pull request is the review of the version and the changelog.
3. Merge it. The workflow runs again, the gate passes, and `changeset publish` publishes the package to the `latest` dist-tag with a provenance attestation, and pushes the release tag.
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

A candidate is promoted by moving a tag, never by building again. The artifact that was verified is the artifact that becomes `latest`.

The version published is the final one — `1.0.0`, not `1.0.0-rc.1` — and it reaches `next` first. That is the whole point: a separate `rc` that is later rebuilt as `1.0.0` is two artifacts, and only one of them was ever verified.

Getting there needs one deliberate step, because the ordinary path does not do it. Out of pre mode `changeset publish` tags whatever it publishes `latest` immediately, so exiting pre mode and merging the version pull request would put `1.0.0` straight into every consumer's range with nothing between. The candidate is published with an explicit tag instead:

```sh
pnpm exec changeset pre exit      # commit; the next version is 1.0.0, not 1.0.0-next.n
# land the exit and the version bump with the release workflow disabled, then:
pnpm gate && pnpm exec changeset publish --tag next
```

Publishing by hand goes through `npm login` in a real terminal — trusted publishing covers the workflow, not a laptop — and an interactive session leaves no long-lived credential behind. Re-enable the release workflow as soon as the promotion is done: it is the ordinary path, and a repository that stays in the manual state loses the guarantee that the gate ran, and publishes without an attestation.

Now verify what is on the registry: install `@squaredlemons/canvas-panels@next` into the Proof Consumer, run that application's own gate, and check the integrity against `release-evidence.md`. Then promote the version already there:

```sh
npm dist-tag add @squaredlemons/canvas-panels@1.0.0 latest
```

`npm dist-tag add` touches no bytes. The integrity recorded before promotion is the integrity after it, which is what makes "the already verified artifact" a checkable claim rather than a hope.

If the candidate fails verification, leave `latest` where it is. Nothing has to be undone: a version no consumer's range resolves is a version no consumer has. Deprecate it with a sentence naming its replacement and release forward.

### The first release is different

Worth stating plainly, because it is the one step that cannot be repeated and the one place a credential exists at all.

npm registers a trusted publisher through an existing package's settings, so a package that has never been published has no settings page to register against. `0.2.0-rc.0` was therefore published from a maintainer's machine with a granular access token — read and write, scoped to `@squaredlemons/*`, seven-day expiry — for no purpose other than bringing the package into existence. It was published with an explicit `--tag next`, leaving `latest` unclaimed so the first stable version could take it.

The trusted publisher was then registered, the token revoked, and `0.2.0` published from CI with an attestation. Every version after it takes the ordinary path.

Do not reintroduce that token. Beyond it being a stored publishing credential, npm [restricted 2FA-bypass granular tokens](https://github.blog/changelog/2026-07-31-restricting-npm-bypass-2fa-granular-access-tokens/) from account and package management on 31 July 2026, and targets January 2027 for removing their direct-publish capability entirely — after which such a token can only stage a publish for a maintainer to approve interactively.

### Installing

A consumer needs nothing but the dependency:

```sh
pnpm add @squaredlemons/canvas-panels
```

No `.npmrc`, no registry mapping, and no token — in the consuming repository or in its CI. That is the whole of the change from the GitHub Packages arrangement, and it is the reason for it.

### Rolling back a release

A published version is superseded, not withdrawn:

```sh
npm dist-tag add @squaredlemons/canvas-panels@<previous-version> latest
```

That moves every consumer installing by tag back to the previous version immediately. Then land the fix and release forward, and `npm deprecate` the bad version with a sentence naming its replacement — deprecating is reversible, deleting is not.

npm's registry mostly refuses to delete a published version, and that refusal is a feature. **Do not seek a way around it.** A deleted version breaks every lockfile that pinned it, including ones in repositories nobody is looking at today. Moving the tag achieves the same thing for anyone installing by range, and costs nothing to anyone who pinned.

Consumers roll back with a dependency change and nothing else — the package holds no persistent state. See "Rollback" in the package README for the two things to check when rolling back across a Navigation Document change.
