# Release evidence

One record per published version of `@squared-lemons-ltd/canvas-panels`, so that "which artifact is in production, and what was verified about it?" is answerable from this repository without asking the registry, and so that a version can be matched to the exact source that produced it.

It carries more weight here than it would elsewhere. GitHub Packages serves no provenance attestation, so nothing on the registry ties a published tarball back to a commit — this file is that tie, and it is checkable because the tarball is reproducible from the source.

Every release records the immutable version, the tarball integrity, the provenance position, the source commit, the workflow run, and the verification that was performed. A release with a missing field is not a released version — and a row whose registry fields are still marked *intended* records a verified artifact, not a published one.

## How to reproduce the artifact evidence

From the repository root, on the exact commit under test:

```sh
pnpm gate
cd packages/canvas-panels && npm pack --dry-run --json
```

`npm pack` normalises file modification times, so the tarball is a function of its contents alone: the same commit produces the same `shasum` and the same `integrity`, on any machine. That is what makes the row below a check rather than a note — a rebuild that disagrees means the tree disagrees.

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
| Integrity | `sha512-wOm2tSNPGOg5q3NzNOfWYdUwEGzUn11TJvqyFBGdRsIAhhoAcZsG7A/GXHHUYaJYmtFLk7hBICQTMUKQMbbX+g==` |
| Shasum | `370a509802933975ef0d1b68c3eebd0167c87136` |
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

### Still to confirm

The registry's own report of the integrity — `npm view … dist.integrity` — and a clean install from it, per "How to verify a published version" above. Both need a token with `read:packages`, which is a separate grant from the one that pushes code. Until that is run, the artifact's integrity is established by reproduction from source and by the workflow log, and the registry's agreement with it is expected but unchecked.
