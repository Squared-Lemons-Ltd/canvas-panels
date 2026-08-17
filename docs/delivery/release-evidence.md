# Release evidence

One record per published version of `@squared-lemons-ltd/canvas-panels`, so that "which artifact is in production, and what was verified about it?" is answerable from this repository without asking the registry, and so that a version can be matched to the exact source that produced it.

It carries more weight here than it would elsewhere. GitHub Packages serves no provenance attestation, so nothing on the registry ties a published tarball back to a commit — this file is that tie, and it is checkable because the tarball's *contents* are reproducible from the source.

Every release records the immutable version, the tarball integrity, the provenance position, the source commit, the workflow run, and the verification that was performed. A release with a missing field is not a released version — and a row whose registry fields are still marked *intended* records a verified artifact, not a published one.

## How to reproduce the artifact evidence

From the repository root, on the exact commit under test:

```sh
pnpm gate
cd packages/canvas-panels && npm pack --dry-run --json
```

`npm pack` normalises file modification times, so a local pack of the same tree gives the same `shasum` on any machine. Each row below records that **local** integrity, and a rebuild that disagrees with it means the tree disagrees.

**It is not the integrity the registry reports, and it is not meant to be.** Publishing rewrites `package.json` on the way out — key order changes and the trailing newline goes — so the published tarball differs from a locally packed one in that single file, and therefore in its hash. Measured for `0.1.0`: all 50 files under `dist/` byte-identical, `package.json` carrying the same fields with the same values in a different order. Both integrities are recorded per release; comparing across them is a category error.

What is worth checking, and what "the artifact was verified" actually means here, is that the *contents* agree:

```sh
npm pack @squared-lemons-ltd/canvas-panels@<version>        # the published one
cd packages/canvas-panels && npm pack --pack-destination /tmp/local
# unpack both, then:
diff -r <published>/package/dist /tmp/local/package/dist    # must be empty
```

## How to verify a published version from the registry

Reading a private package needs a GitHub token with `read:packages`; the commands below assume it is in `GITHUB_PACKAGES_TOKEN` and the scope is mapped as described in [`private-package.md`](./private-package.md#installing-from-github-packages).

```sh
npm view @squared-lemons-ltd/canvas-panels@<version> dist.integrity dist.shasum gitHead --json
npm dist-tag ls @squared-lemons-ltd/canvas-panels
```

The `dist.integrity` the registry reports must equal the row below. Then install it into a clean consumer that is not this workspace:

```sh
mkdir /tmp/canvas-smoke && cd /tmp/canvas-smoke && npm init -y
printf '@squared-lemons-ltd:registry=https://npm.pkg.github.com\n//npm.pkg.github.com/:_authToken=%s\n' "$GITHUB_PACKAGES_TOKEN" > .npmrc
npm add @squared-lemons-ltd/canvas-panels@<version> react@^19 react-dom@^19
node --input-type=module -e '
  import { createPanelEngine, defineRootPanel } from "@squared-lemons-ltd/canvas-panels/core";
  import { createRequire } from "node:module";
  const engine = createPanelEngine({ root: defineRootPanel({ kind: "root", title: "Root" }), panels: [] });
  console.log(engine.getSnapshot().panels.length === 1 ? "core ok" : "core broken");
  console.log(createRequire(import.meta.url).resolve("@squared-lemons-ltd/canvas-panels/styles.css"));
'
```

`pnpm pack:check` already does the equivalent against the local tarball for every subpath, both consumers, and a Next production build. The commands above are the part it cannot do: proving that the *registry* holds the same bytes, and that an install with no workspace resolution reaches them.

## 0.1.0

The first release: the package's whole history to date, versioned out of thirteen Changesets.

| Field | Value |
| --- | --- |
| Version | `0.1.0` |
| Tarball | `squared-lemons-ltd-canvas-panels-0.1.0.tgz` |
| Integrity, as published | `sha512-DDJJgzF6hfOPY3jvQ2mTtn1MaUpG31EeNRpjdMp1TOjFOcNi/S2vxhodaH8iivjVWqA9lvG9kj2qpYfQ88NeNw==` |
| Shasum, as published | `5891e0dc6af798ed3a0222fe11b8aa0fa0d19d44` |
| Integrity, local pack | `sha512-wOm2tSNPGOg5q3NzNOfWYdUwEGzUn11TJvqyFBGdRsIAhhoAcZsG7A/GXHHUYaJYmtFLk7hBICQTMUKQMbbX+g==` (`370a5098…`) — differs only by `package.json` key order; see "How to reproduce" |
| Packed size | 129,750 bytes, 51 entries, 583,719 bytes unpacked |
| Registry | GitHub Packages, `https://npm.pkg.github.com`, from `Squared-Lemons-Ltd/canvas-panels` |
| Provenance | Not available. GitHub Packages serves no npm attestation; `publishConfig.provenance` is `false` by decision, not by omission. The reproducible integrity above stands in its place. |
| Visibility | Private, following the repository |
| dist-tag | `latest` |
| Source commit | `a0c47231c7e1fcd6d331dbe7ca37f05ff0369dec` — the tree the artifact above was packed from |
| Published from | `ded9e0a1747104454ef61b892d5cae0502c81148`, tagged `@squared-lemons-ltd/canvas-panels@0.1.0` |
| Workflow run | [31999486816](https://github.com/Squared-Lemons-Ltd/canvas-panels/actions/runs/31999486816), 17 August 2026 |
| Toolchain | Node 22.20.0, npm 11.12.1, pnpm 9.15.9 |
| Gate | `pnpm gate` passed: 426 contract tests, 3 packed-consumer tests, 0 failures |

### What the gate verified

- Formatting, linting, and the dependency-boundary check across the workspace.
- Typechecking of the package, every fixture application, and the public type tests.
- 426 contract tests, including the frozen export inventory, the frozen result discriminants, the complete token and integration-attribute tables, and every accepted finding from the Meridian consumer proof.
- The build, and a clean pack-and-install of both a React 19 and a Next.js consumer from the tarball: every subpath imported, the stylesheet resolved, a Next production build completed, a server render hydrated with matching Panel identities, and the artifact inspected for source leakage, secret material, duplicate React copies, and reachable deep imports.

### Publication status

**Published**, on 17 August 2026, by the release workflow — no hand publish, and no credential that outlived the run.

Two commits appear above because the record is stamped after the tree it describes. `a0c4723` is the tree the tarball was packed from; `ded9e0a` adds only this file's own source-commit line, which is outside `files` and so cannot reach the tarball. Packing either produces the integrity recorded above.

The route here was not the planned one. This version was first prepared for the public npm registry as `@squaredlemons/canvas-panels`, and that publish was refused — `402 Payment Required`, because private packages under an *organization* scope need a paid org plan that a personal subscription does not cover. With nothing published and no consumers to break, the registry was changed rather than the plan. [`private-package.md`](./private-package.md#why-github-packages-and-what-it-cost) records the reversal, what it cost, and what it made simpler. Nothing was ever published under the npm scope, so `0.1.0` has exactly one published form: this one.

### Verified against the registry

Run on 17 August 2026, with a `read:packages` token:

- `npm view` reports `dist.integrity sha512-DDJJgzF6…`, `dist.shasum 5891e0dc…`, matching the published row above, and the version resolves as `0.1.0`.
- The published tarball was downloaded and compared against a local pack of the same tree: **all 50 files under `dist/` byte-identical**, `package.json` semantically equal with `scripts` reordered to the end. This is what corrected the reproducibility claim above, which had assumed the two hashes would agree.
- A clean consumer outside this workspace — `npm init`, scope mapped to GitHub Packages, `npm add @squared-lemons-ltd/canvas-panels@0.1.0 react@^19 react-dom@^19` — installed it and recorded `sha512-DDJJgzF6…` in its own lockfile, agreeing with the registry a third time.
- In that consumer, all nine subpaths import, `styles.css` resolves to `@squared-lemons-ltd/canvas-panels/dist/styles.css`, and a Panel Engine built from `core` opened a child Panel (`Root > Ada`) and encoded a Navigation Document.

The install used `require.resolve` for the subpaths first and failed with `ERR_PACKAGE_PATH_NOT_EXPORTED` — correctly, because the package is ESM-only and declares no `require` condition. Noted because it looks like a packaging fault for a moment and is not one.
