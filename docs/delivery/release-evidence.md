# Release evidence

One record per published version of `@squaredlemons/canvas-panels`, so that "which artifact is in production, and what was verified about it?" is answerable from this repository without asking the registry, and so that a version can be matched to the exact source that produced it.

**`0.2.1` is the first version published by the workflow with a provenance attestation.** The three before it have none: `0.1.0` predates the move to npm, and `0.2.0-rc.0` and `0.2.0` were published by hand for the reasons recorded against each. For those three this file is the only tie between a published artifact and its source. For `0.2.1` the attestation is now the stronger tie — it is signed, and it names the commit — but this file remains the only record of what was *verified*, which an attestation does not say in any case.

Every release records the immutable version, the tarball integrity, the provenance position, the source commit, the workflow run, and the verification that was performed. A release with a missing field is not a released version — and a row whose registry fields are still marked *intended* records a verified artifact, not a published one.

## How to reproduce the artifact evidence

From the repository root, on the exact commit under test:

```sh
pnpm gate
cd packages/canvas-panels && npm pack --dry-run --json
```

`npm pack` normalises file modification times, so a local pack of the same tree gives the same `shasum` on any machine. Each row below records that **local** integrity, and a rebuild that disagrees with it means the tree disagrees.

**It may or may not be the integrity the registry reports, and which depends on how the version was published.** Measured across three releases:

- **Via `changeset publish`** (`0.1.0`, `0.2.1`): the hashes differ. `package.json` is rewritten on the way out — key order changes and the trailing newline goes — so the published tarball differs from a locally packed one in that single file. Every file under `dist/` was byte-identical both times; `package.json` carried the same fields with the same values, with `scripts` moved to the end.
- **Via a direct `npm publish`** (`0.2.0-rc.0` and `0.2.0`): the hashes are **identical**. `sha512-ylTH24Z3gxOGQ…` was produced locally and is what the registry reports.

So the rewrite is a property of the Changesets path, not of publishing as such. Where both integrities are recorded for a release, comparing across them is a category error; where only one is recorded, the two agreed.

What is worth checking, and what "the artifact was verified" actually means here, is that the *contents* agree:

```sh
npm pack @squaredlemons/canvas-panels@<version>        # the published one
cd packages/canvas-panels && npm pack --pack-destination /tmp/local
# unpack both, then:
diff -r <published>/package/dist /tmp/local/package/dist    # must be empty
```

## How to verify a published version from the registry

The package is public, so nothing needs authenticating:

```sh
npm view @squaredlemons/canvas-panels@<version> dist.integrity dist.shasum gitHead --json
npm dist-tag ls @squaredlemons/canvas-panels
npm audit signatures                                   # verifies the attestation
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

## 0.4.0

Five reports from two external adoptions on `0.3.0` — PodMule across 16 Canvas Workspaces, and a ~40-host admin migration — implemented in four worktrees behind four separate gates, merged into one branch, and released together. Four additions to the Public Contract; nothing removed, nothing narrowed, and the `0.x` allowance for a breaking change in a minor unused.

| Field | Value |
| --- | --- |
| Version | `0.4.0` |
| Tarball | `canvas-panels-0.4.0.tgz` |
| Integrity, as published | `sha512-UG+FGvgM9Tqrr1f3okgjt/QoionJEazM3JT0eJ5Q3jRyhkyoK37oOGdftlj1fxwNMZs44WtHz7+J2VMe+iNFGg==` |
| Shasum, as published | `310dccc69e55465a02ab0abc7d3d0d49adaa0d2d` |
| Integrity, local pack | `sha512-L90KNNambgsjsoX7kBY59HcsvOe4xCjPwMGV19nWNjOZlaTJsaICIGGiy0WZGQktM6cXFlGLqLHHqoNkAfeeig==` (`2fdd0a34…`) — differs only by the Changesets `package.json` rewrite; see "How to reproduce" |
| Packed size | 52 entries, 151,282 bytes packed, 654,345 bytes unpacked |
| Registry | Public npm, `https://registry.npmjs.org` |
| Licence | MIT, shipped in the tarball |
| Provenance | **Attested.** `https://slsa.dev/provenance/v1` plus npm's publish attestation, naming workflow `.github/workflows/release.yml` on `refs/heads/main` and source commit `0cd643c8…` |
| Visibility | Public |
| dist-tag | `latest`; `next` left on `0.2.0-rc.0` |
| Source commit | `0cd643c89a1574129c24406f36459822acee7f9a`, tagged `@squaredlemons/canvas-panels@0.4.0` |
| Workflow run | [32500220452](https://github.com/Squared-Lemons-Ltd/canvas-panels/actions/runs/32500220452), 21 August 2026 |
| Toolchain | Node 22.23.2 in the publish job, npm `^11.5.1` installed in the job, pnpm 9.15.9; gate additionally on Node 24.19.0 |
| Gate | `pnpm gate` passed on the cut commit and again in CI: 473 contract tests, 3 packed-consumer tests, 0 failures, on Node 22 and Node 24 |

### What shipped

Minor, all four additions to the Public Contract:

- **A button Action can carry an icon** ([#67](https://github.com/Squared-Lemons-Ltd/canvas-panels/issues/67)). `icon?: ReactNode` on the button shape, rendered inside the button before the label in an `aria-hidden` wrapper. `label` stays a `string` and stays the whole accessible name — now contractual rather than merely true, so an icon can never carry meaning the name does not. Adds the `data-canvas-action-icon` attribute. An icon written inline is a new element on every render, so the registration holds a store rather than the node, exactly as a content Action does; naming the element in the registration's dependency array is an infinite re-registration loop, not merely churn, and a re-render-counting test holds that shut.
- **A button Action can say why it is disabled** ([#65](https://github.com/Squared-Lemons-Ltd/canvas-panels/issues/65)). `description?: string`, rendered as the button's accessible description through `aria-describedby` onto a visually-hidden element — keyboard- and touch-reachable, deliberately not a `title` tooltip, which is neither. Adds the `data-canvas-action-description` attribute. It renders whenever it is supplied rather than only while `disabled`: the disabled case is what motivated it, but the description of a control is not a state of it. Both this and the icon render *inside* the button, because the header row is laid out by direct-child adjacency and a sibling element between two buttons would throw the next control to the far side of the header.
- **A Canvas Workspace can activate the Panel someone focuses** ([#66](https://github.com/Squared-Lemons-Ltd/canvas-panels/issues/66)). `activateOnFocus`, defaulting to `false`. Only focus arriving on its own activates: every focus move the Canvas makes on its own account — returning focus after a Guarded Transition, rescuing it out of a Panel the presentation has hidden, claiming `initialFocus`, the renderer-failure notice — goes through one helper the focus handler ignores, because a repair is not an arrival. F6 deliberately does activate. An activation caused by focus already inside the Panel never moves that focus.
- **The Canvas bed and a Panel's corners have their own tokens** ([#64](https://github.com/Squared-Lemons-Ltd/canvas-panels/issues/64)). `--canvas-surface-bed` and `--canvas-panel-radius`, so Panels-as-cards-on-a-ground is a token change rather than an override of the package's own painting.

Patch:

- **A single-Panel Guarded Transition dialog names its Panel once** ([#63](https://github.com/Squared-Lemons-Ltd/canvas-panels/issues/63)). The heading already names it, and every message line repeated the title in front of the message. Against a real 104-character record title that filled two thirds of the modal, printed twice, and was read out twice — the heading being `aria-labelledby` and the message `aria-describedby`. Several dirty Panels are unchanged and keep the prefix, because there the heading can only count them.

### The documentation half of #66 shipped whether or not a Canvas opts in

The split between the DOM-Focused Panel and the Active Panel was always deliberate and was nowhere written down, and the package maintained a focus signal that looked exactly like the input to click-to-select. The reporter found it by debugging a converted admin whose Panels appeared not to respond to clicks. The README now states the rule under "Navigation", the contract carries it as its own enforced row, and the shipped skill carries it too — so an agent building against the package meets it before it debugs it.

### Two renderings change without anyone setting anything

Both are in the changelog rather than left to be discovered, and neither requires an edit:

- **The single-Panel dialog message loses its title prefix** (#63). Anyone asserting on that exact string in a test sees it change. The rendered sentence is not contract text and never was — it is in the same class as the DOM inside a Panel body.
- **A Panel rounded through `[data-canvas-panel]` now clips its scrolled content to the corner** (#64). The Panel body takes its two bottom radii with `inherit` rather than from `--canvas-panel-radius`, because `data-canvas-panel` is a published attribute and rounding a Panel through it is a supported thing to do; reading the token would have followed only the token, leaving a square body clipping content on a curve. Found by hitting it in the Proof Consumer, whose nested Canvas does exactly that, and pinned by a test that a token-only test would have passed.

The second was caught during the release review: the changeset had claimed nothing changes for a consumer who sets neither token, which is false for precisely that case. Corrected in `e86a603` before the version was cut. It is the reason the review step exists.

### Why `--canvas-surface-bed` has no `:root` default

The issue asked for `--canvas-surface-bed: var(--canvas-surface)`. The contract suite forbids that shape, and correctly: a `var()` inside a custom property is substituted where the property is *declared*, so a `:root` default resolves against the package's own surface once and hands every descendant the answer — an application that recoloured `--canvas-surface` would find its bed unchanged. It is derived on the element that reads it instead, the way the three action colours are, so recolouring the general token carries the bed with it and naming the bed takes it out of the arrangement. Four tokens now have no default of their own, and the README's "Theming" table says which and why.

### A rounded Panel is not clipped by the Panel

`overflow: hidden` on `[data-canvas-panel]` would cut the outer half of the Panel Separator's pointer target off, which deliberately straddles that edge for WCAG 2.5.8 — and would do so at every value including `0`, failing the requirement that a new token's default change nothing. What a rounded Panel needs clipped is what scrolls inside it, so the body — already a scroll container — takes the two radii that meet the Panel's bottom edge. The top pair belong to the header, which paints nothing.

### The publish left no `gitHead`, and again did not push its tag

The same two gaps as `0.2.1` and `0.3.0`. **Three for three**, so they are properties of this path and not accidents:

- **`npm view @squaredlemons/canvas-panels@0.4.0 gitHead` is empty.** The tie to source is the attestation, which is signed and names `0cd643c8…`.
- **`changeset publish` created the tag and the workflow's own `git push --tags` did not push it.** The run log shows `🦋 New tag: @squaredlemons/canvas-panels@0.4.0` at `15:58:35.947Z`, the push step starting 26ms later, and `Everything up-to-date` at `15:58:36.233Z`. The tag was absent from the remote afterwards and was created here from the attested commit and pushed by hand.

**The cause is still not established, and one plausible explanation has now been ruled out.** The obvious candidate — that Changesets writes an *annotated* tag (`git tag <name> -m <name>`) and the runner has no committer identity, so tag creation fails and Changesets logs its success message anyway — was tested directly against git with no global or system config: the annotated tag was created, exit 0. So a missing identity is not it. What is left to check is whether the tag exists in the runner's working copy at all when the push runs, which the log cannot answer because Changesets logs `New tag:` without reporting the git command's result. A diagnostic `git tag --list` between the two steps would settle it in one release. Tracked in [#71](https://github.com/Squared-Lemons-Ltd/canvas-panels/issues/71).

### Verified against the registry

Run on 21 August 2026, unauthenticated — the package is public:

- `npm view` reports `dist.integrity sha512-UG+FGvgM…` and `dist.shasum 310dccc6…`, matching the row above, with `latest` resolving to `0.4.0` and `next` still on `0.2.0-rc.0`.
- **The attestation covers the bytes npm serves.** Both the SLSA provenance and npm's publish attestation carry a subject digest of `506f851af80cf53a…`, which is exactly what the published `dist.integrity` decodes to, so the tarball on the registry is the one the workflow built, from `0cd643c8…`, in run 32500220452.
- The published tarball was downloaded and compared against a local pack of the same tree: `diff -r` over `dist/` is **empty**, the file lists are identical, and `package.json` is semantically equal — `scripts` moved to the end and the trailing newline dropped, the Changesets rewrite seen at `0.1.0` and `0.2.1` and now confirmed a third time.
- A clean consumer outside this workspace — `npm init`, then `npm add @squaredlemons/canvas-panels@0.4.0 react@^19 react-dom@^19` with no `.npmrc` and no token — installed it and recorded `sha512-UG+FGvgM…` in its own lockfile.
- In that consumer all nine subpaths import and `styles.css` resolves to `@squaredlemons/canvas-panels/dist/styles.css`.
- **All five changes were exercised against the published artifact**, not the local build: the published `dist/styles.css` declares `--canvas-panel-radius: 0`, paints the bed from `var(--canvas-surface-bed, var(--canvas-surface))`, and carries `border-end-end-radius: inherit` / `border-end-start-radius: inherit` on the Panel body; the published `dist/ui/index.d.ts` carries `description?: string` and `icon?: ReactNode` on `CanvasActionButtonProps` and `activateOnFocus?: boolean` on the Workspace props; the published `dist/ui/index.js` emits both new `data-canvas-action-*` attributes, destructures `activateOnFocus = false`, and carries the single-Panel dialog ternary that drops the title prefix.
- `npm audit signatures` reports verified registry signatures for all four packages and verified attestations for three, this package among them.

## 0.3.0

Five reports from the first external adopter's migration onto `0.2.x`, each fixed in its own worktree behind its own gate and merged together. Two additions to the Public Contract, and one published type narrowed with them.

| Field | Value |
| --- | --- |
| Version | `0.3.0` |
| Tarball | `canvas-panels-0.3.0.tgz` |
| Integrity, as published | `sha512-jtRsA0VzsI7OOw9NeEGV1Wvn2T8drrdZm0eR5SiCGQZZ09fO/JuBLNVJegIeT1ifBhvfu/CFLElbi7CZ+wTmoA==` |
| Shasum, as published | `feb8d4afac94ada1e7b40a12a5c6e3e1919f1bb0` |
| Integrity, local pack | `sha512-ySQXen8wbJ315YdJicxQCLWvBZOYKf8afWwmf+z4pUfmSl32usHrDc1/rCXM/3Z0qwxRts+f7pttaeKfaV01LA==` (`65fdfd9a…`) — differs only by the Changesets `package.json` rewrite; see "How to reproduce" |
| Packed size | 52 entries, 144,549 bytes packed, 632,067 bytes unpacked |
| Registry | Public npm, `https://registry.npmjs.org` |
| Licence | MIT, shipped in the tarball |
| Provenance | **Attested.** `https://slsa.dev/provenance/v1` plus npm's publish attestation, naming workflow `.github/workflows/release.yml` on `refs/heads/main` and source commit `68cdeeae…` |
| Visibility | Public |
| dist-tag | `latest`; `next` left on `0.2.0-rc.0` |
| Source commit | `68cdeeae40be1b5c3b3bc53067159c382f8e9cd2`, tagged `@squaredlemons/canvas-panels@0.3.0` |
| Workflow run | [32351946241](https://github.com/Squared-Lemons-Ltd/canvas-panels/actions/runs/32351946241), 20 August 2026 |
| Toolchain | Node 22.23.2, npm `^11.5.1` installed in the job, pnpm 9.15.9 |
| Gate | `pnpm gate` passed on the cut commit and again in CI: 457 contract tests, 3 packed-consumer tests, 0 failures, on Node 22 and Node 24 |

### What shipped

Minor, both additions to the Public Contract:

- **A Panel Kind can declare its own width** ([#57](https://github.com/Squared-Lemons-Ltd/canvas-panels/issues/57)). `definePanel({ width: { resting, active } })`, either half alone, validated at definition time so a malformed or hostile value throws a `TypeError` on the line that wrote it rather than rendering wrongly on the first surface that opens the Panel. A declared width is resolved onto the two existing custom properties on the Panel element, so it outranks a stylesheet rule for that Kind; the narrow presentations and a Panel Separator drag still outrank it.
- **A Canvas Action can carry application content in the Panel header** ([#59](https://github.com/Squared-Lemons-Ltd/canvas-panels/issues/59)). Registered through the same path a button uses rather than portalled, so no application DOM races the package's re-renders. Adds the `data-canvas-action-content` attribute.

Patch:

- **The breadcrumb trail is one scrolling line** ([#58](https://github.com/Squared-Lemons-Ltd/canvas-panels/issues/58)). It was a wrapping row of full Panel titles, so its height was unbounded in title length — 284px on a 390×844 viewport at three deep, against real data. Measured in Chromium at 54px after, with no horizontal overflow at 320, 390, 480, or 767px.
- **A Context Signal is compared by value** ([#60](https://github.com/Squared-Lemons-Ltd/canvas-panels/issues/60)). It was keyed on object identity, so the natural inline literal republished every render and woke every Context Target reader. Held and compared one level deep, non-recursive, so a cyclic signal is safe rather than a hang.
- **A resolved Guarded Transition leaves focus inside the Workspace** ([#61](https://github.com/Squared-Lemons-Ltd/canvas-panels/issues/61)). It was returning focus to `document.body`, which passes `isConnected`, so the retained Active Panel heading was never reached and the next Escape did not dismiss an Overlay Workspace. The primary Canvas Workspace had the same defect and is fixed by the same change.

### One published type narrowed

`CanvasActionProps` became the union `CanvasActionButtonProps | CanvasActionContentProps`, so `label` and `onSelect` are no longer unconditionally present on it. Checked against the built declarations rather than reasoned about: constructing an action and holding a `readonly CanvasActionProps[]` are unaffected; reading one of those members off the type fails with `error TS18048`. The freeze policy permits a `0.x` minor to carry a breaking change only where the consumer's exact edit is recorded, and the changelog carries it.

### The publish left no `gitHead`, and again did not push its tag

The same two gaps as `0.2.1`, now seen twice and therefore properties of this path rather than accidents:

- **`npm view @squaredlemons/canvas-panels@0.3.0 gitHead` is empty.** The tie to source is the attestation, which is signed and names `68cdeeae…`.
- **`changeset publish` created the tag and the workflow's own `git push --tags` did not push it.** The run log shows both: `🦋 New tag: @squaredlemons/canvas-panels@0.3.0`, then `Everything up-to-date` from the push step, and the tag was absent from the remote afterwards. It was created here from the attested commit and pushed by hand. The step is not merely redundant, it reports success while doing nothing — worth fixing rather than continuing to compensate for by hand.

### Verified against the registry

Run on 20 August 2026, unauthenticated — the package is public:

- `npm view` reports `dist.integrity sha512-jtRsA0Vz…` and `dist.shasum feb8d4af…`, matching the row above, with `latest` resolving to `0.3.0` and `next` still on `0.2.0-rc.0`.
- **The attestation covers the bytes npm serves.** Both the SLSA provenance and npm's publish attestation carry a subject digest that decodes to exactly the `dist.integrity` above, so the tarball on the registry is the one the workflow built, from `68cdeeae…`, in run 32351946241.
- The published tarball was downloaded and compared against a local pack of the same tree: `diff -r` over `dist/` is **empty**, the file lists are identical, and `package.json` is semantically equal.
- A clean consumer outside this workspace — `npm init`, then `npm add @squaredlemons/canvas-panels@0.3.0 react@^19 react-dom@^19` with no `.npmrc` and no token — installed it and recorded `sha512-jtRsA0Vz…` in its own lockfile.
- In that consumer all nine subpaths import and `styles.css` resolves to `@squaredlemons/canvas-panels/dist/styles.css`.
- **The `#57` addition was exercised against the published artifact**, not the local build: `definePanel({ width })` round-trips `{ resting, active }` onto the definition, and a width carrying a second declaration (`"28rem; color: red"`) is refused with a `TypeError` at definition time.
- `npm audit signatures` reports verified registry signatures for all four packages and verified attestations for three, this package among them.

## 0.2.1

The first release published by the workflow end to end — trusted publishing, an attestation, and no human holding a credential. Three patch changes, no movement on the Public Contract.

| Field | Value |
| --- | --- |
| Version | `0.2.1` |
| Tarball | `canvas-panels-0.2.1.tgz` |
| Integrity, as published | `sha512-pROla/lJxYiD4Bo/QIzoG7wzOXtCM0yn4Ko6wkib32/hJIqMbqt/ePxc82bBhsU2lhE2KfsYNeGmrroyNIljtQ==` |
| Shasum, as published | `ced77a70a3462df7a975e12b30623b326203bf8d` |
| Integrity, local pack | `sha512-MJjtt7wvhmh/pqF6O4oiHOiZ6VrlWUfYa/3ZuDWJYs3tnHTeKp1T0DXZQCzyKlZrlvEM463z3pgtYfKiJHOPeQ==` (`585a968e…`) — differs only by the Changesets `package.json` rewrite; see "How to reproduce" |
| Packed size | 52 entries, 131,604 bytes packed, 588,558 bytes unpacked |
| Registry | Public npm, `https://registry.npmjs.org` |
| Licence | MIT, shipped in the tarball |
| Provenance | **Attested.** `https://slsa.dev/provenance/v1` plus npm's publish attestation, naming workflow `.github/workflows/release.yml` on `refs/heads/main` and source commit `e1b8e4bd…` |
| Visibility | Public |
| dist-tag | `latest`; `next` left on `0.2.0-rc.0` |
| Source commit | `e1b8e4bd9c104bd7d779f49987bfc347ca1ca457`, tagged `@squaredlemons/canvas-panels@0.2.1` |
| Workflow run | [32336258899](https://github.com/Squared-Lemons-Ltd/canvas-panels/actions/runs/32336258899), 20 August 2026 |
| Toolchain | Node 22.23.2, npm `^11.5.1` installed in the job, pnpm 9.15.9 |
| Gate | `pnpm gate` passed on the cut commit and again in CI: 437 contract tests, 3 packed-consumer tests, 0 failures, on Node 22 and Node 24 |

### What shipped

- **`restoreStack` decides sharing on persisted identity** ([#53](https://github.com/Squared-Lemons-Ltd/canvas-panels/issues/53), [#55](https://github.com/Squared-Lemons-Ltd/canvas-panels/pull/55)). It had compared whole in-memory Panel inputs against references that had been through the codec, so a Panel titled from a fetched record — which the navigation rule requires a codec to leave out — was never equal to its own decoded reference. Sharing is now Kind, semantic Panel Key, and encoded descriptor.
- The npm listing's description and keywords, and a README that assumes nothing about the reader's package manager.

Nothing on the Public Contract moved: no export, `status` or `reason` discriminant, `--canvas-*` property, `data-canvas-*` attribute, peer range, or Navigation Document limit differs from `0.2.0`.

### The publish left no `gitHead`, and did not push its tag

Two gaps worth knowing about before the next release, because step 1 of the release procedure starts from both:

- **`npm view @squaredlemons/canvas-panels@0.2.1 gitHead` is empty**, where `0.2.0` reports one. The tie to the source commit is the attestation instead, which is signed and therefore better: `e1b8e4bd…`, read from the SLSA predicate.
- **`changeset publish` created the tag and nothing pushed it.** The workflow does not push tags, so `@squaredlemons/canvas-panels@0.2.1` existed only inside the runner. It was created here from the attested commit and pushed by hand.

### Verified against the registry

Run on 20 August 2026, unauthenticated — the package is public:

- `npm view` reports `dist.integrity sha512-pROla/lJ…` and `dist.shasum ced77a70…`, matching the row above, with `latest` resolving to `0.2.1`.
- **The attestation covers the bytes npm serves.** The SLSA predicate's subject digest decodes to exactly the `dist.integrity` above, so the tarball on the registry is the one the workflow built, from `e1b8e4bd…`, in run 32336258899.
- The published tarball was downloaded and compared against a local pack of the same tree: `diff -r` over `dist/` is **empty**, the file lists are identical, and `package.json` is semantically equal with `scripts` reordered to the end.
- A clean consumer outside this workspace — `npm init`, then `npm add @squaredlemons/canvas-panels@0.2.1 react@^19 react-dom@^19` with no `.npmrc` and no token — installed it and recorded the same integrity in its own lockfile.
- In that consumer all nine subpaths import and `styles.css` resolves to `@squaredlemons/canvas-panels/dist/styles.css`.
- **The `#53` fix was exercised against the published artifact**, not the local build: a `reuse` Kind whose codec persists only the identifier retains its Panel across a decode-and-restore for all three input shapes from the issue — `{ id }`, `{ id, title }`, and `{ id, title: undefined }`. On `0.2.0` the last two rebuild the Panel.
- `npm audit signatures` reports verified registry signatures for all four packages and **verified attestations for three**, this package among them.

## 0.2.0

The first public release, and the first under the npm name. Content-identical to `0.2.0-rc.0`; only the version and the dist-tag differ.

| Field | Value |
| --- | --- |
| Version | `0.2.0` |
| Tarball | `squaredlemons-canvas-panels-0.2.0.tgz` |
| Integrity, as published | `sha512-ylTH24Z3gxOGQ2v1alEgOTVW3Ow2LklTi0wE/GYi1uCu75oF5I105GOO1PaZw1QbBsqyrSfQa8RLJevARPjMkQ==` |
| Shasum, as published | `96a3fe64a7a4a10bed7794e766f1b98ba884d7ec` |
| Integrity, local pack | **Identical** to the published one — see "How to reproduce" |
| Packed size | 52 entries, 583,905 bytes unpacked |
| Registry | Public npm, `https://registry.npmjs.org` |
| Licence | MIT, shipped in the tarball |
| Provenance | **None.** Published by hand, so no OIDC exchange and no attestation. The registry signature verifies; the attestation does not exist. See "Why this one has no attestation". |
| Visibility | Public |
| dist-tag | `latest` |
| Source commit | `6c4bfdf2c1f7c3260b0e8a6bb0351a6af05d568b` |
| Toolchain | Node 22.20.0, npm 11.12.1 |
| Gate | `pnpm gate` passed: 427 contract tests, 3 packed-consumer tests, 0 failures, on Node 22 and Node 24 in CI |

### Why this one has no attestation

Trusted publishing was configured but never reached. Three faults sat on top of each other, each hiding the next:

1. `actions/setup-node` was given `registry-url`, so it wrote an `.npmrc` with `_authToken=${NODE_AUTH_TOKEN}` and set that variable to the literal placeholder `XXXXX-XXXXX-XXXXX-XXXXX`. npm believed it held a credential, never attempted the OIDC exchange, and published with a junk token — reported as `404 Not Found`, not `401`, so it read as a missing package.
2. With that removed the error became an honest `ENEEDAUTH`, which is npm correctly reporting that it has no credential and is not exchanging one.
3. A latent temporal-dead-zone race in `canvas-accessibility.test.mjs` failed the Node 22 gate in between, skipping the publish job entirely and costing a round.

4. And underneath all of it, the trusted publisher had never been saved. The form on npmjs.com was empty. npm attempts the OIDC exchange only when it finds a registration matching the running workflow, and reports its absence as `ENEEDAUTH` — indistinguishable from any other missing credential.

`0.2.0` was published by hand to move `latest` off the release candidate, which nothing else could do.

**Resolved on 18 August 2026.** With the registration saved — `Squared-Lemons-Ltd` / `canvas-panels` / `release.yml`, no environment, `npm publish` allowed — a publish attempt from CI was refused with `You cannot publish over the previously published versions: 0.2.0` rather than `ENEEDAUTH`. That refusal is the proof: npm authenticated through the OIDC exchange and declined only because the version already existed. `0.2.1` was the first release to carry an attestation, and it did.

### Verified against the registry

Run on 18 August 2026, unauthenticated — the package is public:

- `npm view` reports `dist.integrity sha512-ylTH24Z3…` and `dist.shasum 96a3fe64…`, matching the row above, with `latest` resolving to `0.2.0` and `next` left on `0.2.0-rc.0`.
- The published tarball was downloaded and compared against a local pack of the same tree: `diff -r` over `dist/` is **empty**, and the two integrities are identical.
- A clean consumer outside this workspace — `npm init`, then `npm add @squaredlemons/canvas-panels@0.2.0 react@^19 react-dom@^19` with **no `.npmrc` and no token** — installed it and recorded the same integrity in its own lockfile.
- In that consumer all nine subpaths import, `styles.css` resolves to `@squaredlemons/canvas-panels/dist/styles.css`, and a Panel Engine built from `core` opened a child Panel (`Root > Ada Lovelace`, status `opened`).
- `require.resolve` on a subpath fails with `ERR_PACKAGE_PATH_NOT_EXPORTED`, and so does the bare package name. Both are correct: the package is ESM-only and declares no root export.
- `npm audit signatures` reports a verified registry signature. It reports no attestation for this package, which is the expected consequence of the hand publish.

## 0.2.0-rc.0

The bootstrap. Published by hand for one reason: npm registers a trusted publisher through an existing package's settings, so a package that has never been published has no settings page to register against.

| Field | Value |
| --- | --- |
| Version | `0.2.0-rc.0` |
| Integrity, as published | `sha512-Lq6c+P/13g0tPN5Wni7L866pyVu7gwr/rzgFZnSiW/lZGreGZgRsCoOgjepfCdXW1/9L1DO/BPqNU2kcmbJHUQ==` |
| Shasum, as published | `27ff516e3a6143622941e5975d8b1f5eff16fb12` |
| Integrity, local pack | Identical to the published one |
| Registry | Public npm |
| Provenance | None — published by hand, which was the whole point of it existing |
| dist-tag | `next`, and also `latest` — see below |
| Source commit | `f8edaa92d8378b01505d54b889979e967cc9436d` |

It was published with an explicit `--tag next` so that `latest` would stay unclaimed for the first stable version. **That did not work, and cannot.** A package must have a `latest`, so the first version published takes it whatever tag is requested — npm recorded `{"next":"0.2.0-rc.0","latest":"0.2.0-rc.0"}`. This is specific to the inaugural publish; later prereleases do stay off `latest`. It was corrected when `0.2.0` published and claimed the tag in the ordinary way.

## 0.1.0

The first release: the package's whole history to date, versioned out of thirteen Changesets.

**Published under a different name, to a different registry, and since withdrawn.** Every identifier in this section is recorded as it was, not as it would be written today — see "Superseded by the registry move" below.

| Field | Value |
| --- | --- |
| Version | `0.1.0` |
| Published as | `@squared-lemons-ltd/canvas-panels` |
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

The route here was not the planned one. This version was first prepared for the public npm registry as `@squaredlemons/canvas-panels`, and that publish was refused — `402 Payment Required`, because private packages under an *organization* scope need a paid org plan that a personal subscription does not cover. With nothing published and no consumers to break, the registry was changed rather than the plan. Nothing was ever published under the npm scope at this version, so `0.1.0` has exactly one published form: this one.

### Verified against the registry

Run on 17 August 2026, with a `read:packages` token:

- `npm view` reports `dist.integrity sha512-DDJJgzF6…`, `dist.shasum 5891e0dc…`, matching the published row above, and the version resolves as `0.1.0`.
- The published tarball was downloaded and compared against a local pack of the same tree: **all 49 files under `dist/` byte-identical**, `package.json` semantically equal with `scripts` reordered to the end. This is what corrected the reproducibility claim above, which had assumed the two hashes would agree.
- A clean consumer outside this workspace — `npm init`, scope mapped to GitHub Packages, `npm add @squared-lemons-ltd/canvas-panels@0.1.0 react@^19 react-dom@^19` — installed it and recorded `sha512-DDJJgzF6…` in its own lockfile, agreeing with the registry a third time.
- In that consumer, all nine subpaths import, `styles.css` resolves to `@squared-lemons-ltd/canvas-panels/dist/styles.css`, and a Panel Engine built from `core` opened a child Panel (`Root > Ada`) and encoded a Navigation Document.

The install used `require.resolve` for the subpaths first and failed with `ERR_PACKAGE_PATH_NOT_EXPORTED` — correctly, because the package is ESM-only and declares no `require` condition. Noted because it looks like a packaging fault for a moment and is not one.

### Superseded by the registry move

On 17 August 2026 the repository was opened as MIT-licensed open source, which removed the reason this version was on GitHub Packages at all — the `402` applies only to private packages, and GitHub Packages requires a token to install even a public one. The package moved to the public npm registry and was renamed `@squaredlemons/canvas-panels`; [`package-delivery.md`](./package-delivery.md#why-the-registry-changed-twice) records both reversals.

`0.1.0` was **not** republished under the new name. It was private, org-only, and had one consumer inside this repository, so re-versioning was cheaper than carrying a name nobody outside had installed. The public history therefore starts at `0.2.0`, and `0.1.0` exists only in this record.

The GitHub Packages package was deleted once the npm release was verified. That is a deletion, which this repository otherwise forbids — the exception is recorded rather than quietly taken, and it is available only because the version was private, unreferenced by any external lockfile, and superseded by a version with different bytes and a different name.
