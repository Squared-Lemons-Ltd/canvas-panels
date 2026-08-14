# Release evidence

One record per published version of `@squaredlemons/canvas-panels`, so that "which artifact is in production, and what was verified about it?" is answerable from this repository without asking npm, and so that a version can be matched to the exact source that produced it.

Every release records the immutable version, the tarball integrity, the provenance position, the source commit, the workflow run, and the verification that was performed. A release with a missing field is not a released version.

## How to reproduce the artifact evidence

From the repository root, on the exact commit under test:

```sh
pnpm gate
cd packages/canvas-panels && npm pack --dry-run --json
```

`npm pack` normalises file modification times, so the tarball is a function of its contents alone: the same commit produces the same `shasum` and the same `integrity`, on any machine. That is what makes the row below a check rather than a note — a rebuild that disagrees means the tree disagrees.

## How to verify a published version from the registry

```sh
npm view @squaredlemons/canvas-panels@<version> dist.integrity dist.shasum gitHead --json
npm dist-tag ls @squaredlemons/canvas-panels
```

The `dist.integrity` the registry reports must equal the row below. Then install it into a clean consumer that is not this workspace:

```sh
mkdir /tmp/canvas-smoke && cd /tmp/canvas-smoke && npm init -y
npm add @squaredlemons/canvas-panels@<version> react@^19 react-dom@^19
node --input-type=module -e '
  import { createPanelEngine, defineRootPanel } from "@squaredlemons/canvas-panels/core";
  import { createRequire } from "node:module";
  const engine = createPanelEngine({ root: defineRootPanel({ kind: "root", title: "Root" }), panels: [] });
  console.log(engine.getSnapshot().panels.length === 1 ? "core ok" : "core broken");
  console.log(createRequire(import.meta.url).resolve("@squaredlemons/canvas-panels/styles.css"));
'
```

`pnpm pack:check` already does the equivalent against the local tarball for every subpath, both consumers, and a Next production build. The commands above are the part it cannot do: proving that the *registry* holds the same bytes, and that an install with no workspace resolution reaches them.

## 0.1.0

The first release: the package's whole history to date, versioned out of thirteen Changesets.

| Field | Value |
| --- | --- |
| Version | `0.1.0` |
| Tarball | `squaredlemons-canvas-panels-0.1.0.tgz` |
| Integrity | `sha512-Moh17Xtw6kKgcBByJpQ/lhGQxILGX5yXegtPBv+nvp/ckDrFLvo52JnbLRwgZwMbcb4UEzMmC7YCFt44Y323ww==` |
| Shasum | `9f2e1a02c3573ff26ad22495fe7469520365cd2c` |
| Packed size | 128,918 bytes, 51 entries, 580,703 bytes unpacked |
| Provenance | Not available. The repository is private, so npm cannot attest; `publishConfig.provenance` is `false` by decision, not by omission. |
| Access | `restricted`, scope `@squaredlemons` |
| dist-tag | `latest` |
| Source commit | `8f9d282fe207a64d1d519652605c020e315c6196` |
| Workflow run | Not applicable — see "Publication status" below |
| Toolchain | Node 22.20.0, npm 11.12.1, pnpm 9.15.9 |
| Gate | `pnpm gate` passed: 424 contract tests, 3 packed-consumer tests, 0 failures |

### What the gate verified

- Formatting, linting, and the dependency-boundary check across the workspace.
- Typechecking of the package, every fixture application, and the public type tests.
- 424 contract tests, including the frozen export inventory, the frozen result discriminants, the complete integration-attribute table, and every accepted finding from the Meridian consumer proof.
- The build, and a clean pack-and-install of both a React 19 and a Next.js consumer from the tarball: every subpath imported, the stylesheet resolved, a Next production build completed, a server render hydrated with matching Panel identities, and the artifact inspected for source leakage, secret material, duplicate React copies, and reachable deep imports.

### Publication status

**Not yet published.** Everything that does not require a credential is done and verified; what remains is the one step npm cannot delegate.

The first version of a package cannot come from the release workflow, because npm registers a trusted publisher against a package that already exists. So `0.1.0` is published once, by hand, from an organization owner's authenticated npm session with write-protected 2FA — the procedure in [`private-package.md`](./private-package.md#the-first-release-which-is-different) — after which the trusted publisher is registered for `Squared-Lemons-Ltd/canvas-panels` and `release.yml`, and no long-lived publish token is ever created.

When that is done, fill in the source commit and, for `0.1.1` onward, the workflow run URL. Until then this row records a verified artifact, not a published one, and it should not be read as either less or more than that.
