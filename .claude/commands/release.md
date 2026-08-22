---
description: Review every change since the last published version, choose the version bump against the frozen Public Contract, write the changeset and release notes, and open the pull request whose merge publishes.
---

# Release

> Deliberately a project command rather than a skill. `npx skills add` discovers `.claude/skills/` and would hand this to every consumer who installs the `canvas-panels` skill — measured, not assumed: it reported "Found 2 skills, installing all 2". A release procedure for *this* package has no business on a consumer's machine. `.claude/commands/` is not scanned.

**Merging the pull request you produce is what publishes.** The release workflow runs on every push to `main` and publishes whenever the manifest version is not already on the registry. There is no second confirmation, and a published version cannot be replaced. Everything below happens while it is still reversible.

This is also the only human review of the version number and the changelog: this organization forbids GitHub Actions from opening pull requests, so nothing else raises one.

## 1. Establish the baseline

The registry is the truth about what was last released. A tag can be missing — a hand-published version creates none, only `changeset publish` does.

```sh
npm view @squaredlemons/canvas-panels version                  # what `latest` resolves to
npm view @squaredlemons/canvas-panels@<version> gitHead        # the commit it was built from
git tag --list '@squaredlemons/canvas-panels@*'
```

Use the `gitHead` as the baseline commit. **It can be empty** — `0.2.1` published from CI without one where `0.2.0` has one. When it is, read the commit off the provenance attestation instead, which is signed and names it outright:

```sh
curl -s https://registry.npmjs.org/-/npm/v1/attestations/@squaredlemons/canvas-panels@<version> \
  | python3 -c "import sys,json,base64;d=json.load(sys.stdin);[print(json.loads(base64.b64decode(a['bundle']['dsseEnvelope']['payload']))['predicate']['buildDefinition']['resolvedDependencies'][0]['digest']) for a in d['attestations'] if 'slsa' in a['predicateType']]"
```

If a tag for the published version is missing, create it from that commit and push it — the next release depends on it.

## 2. Review every change since the baseline

```sh
git log --oneline <baseline>..HEAD
git diff --stat <baseline>..HEAD -- packages/canvas-panels
```

Sort what you find into two piles, because only one of them justifies a version:

- **Shipped** — `packages/canvas-panels/src`, the package `package.json`, the stylesheet, the package README. These reach a consumer's `node_modules`.
- **Repository** — workflows, `docs/`, `tests/`, fixtures, `apps/`, the root README, this skill. These reach nobody.

**If nothing shipped changed, stop and say so.** A version whose tarball is identical to the previous one is noise on a public registry. Most commits in this repository are of the second kind.

Read the actual diff of shipped changes, not just the commit subjects. A commit message describes intent; the contract is decided by what moved.

## 3. Decide the bump against the Public Contract

Read `docs/delivery/public-contract.md`. Its rules are not the default semver ones, and while the package is `0.x` they are deliberately looser:

- **Adding** to the contract is a **minor**.
- **Removing or narrowing** is **breaking** — and must have been deprecated for at least one minor first. If it was not, stop: the deprecation is the release, and the removal is the one after.
- While `0.x`, **a minor may contain a breaking change**. Each one must be described with the exact edit a consumer makes. This is the freeze policy, not a licence to break quietly.
- Undocumented internals are not the contract: module layout, generated id spelling, the DOM inside a Panel body, `data-testid`.

Check each of these explicitly, because each is frozen and each is easy to change without noticing:

| Surface | Where it is frozen |
| --- | --- |
| Export names, per subpath | `public-contract.md`, enforced by the contract suite |
| `status` and `reason` discriminants | `public-contract.md`, enforced |
| `--canvas-*` custom properties and their defaults | package README "Theming", enforced |
| `data-canvas-*` attributes | package README "Theming", enforced |
| Peer ranges | widening is minor, narrowing is breaking |
| Node, React, Next support | the compatibility matrix |
| Navigation Document limits and migration chain | a removed migration breaks bookmarked URLs |

The suite enforces the export lists against the built package, so if you added an export and the gate is green, you already edited `public-contract.md` — that edit is your evidence for a minor.

## 4. Write the changeset

One file per user-visible change, `.changeset/<kebab-case-name>.md`:

```md
---
"@squaredlemons/canvas-panels": minor
---

What changed, and why it changed.
```

Write it for someone who does not have this repository open and will read it in a changelog on npm. Match the repository's voice: state the *why*, not just the what.

For anything breaking, or anything requiring action, give the consumer's edit as a diff. A sentence saying "the API changed" is not a release note.

## 5. Cut it

```sh
pnpm release:version    # changeset version && pnpm install --lockfile-only
```

Then **read what it produced** — the new version number in `packages/canvas-panels/package.json` and the generated `CHANGELOG.md` entry. This is the review. Do not hand-edit the changelog; fix the changeset and run it again.

```sh
pnpm gate               # must exit 0
```

The gate runs the whole thing: format, lint, dependency boundaries, typecheck, the contract suite, the build, and a clean pack-and-install into temporary React and Next consumers. Read the count off the run rather than expecting one — it moves with almost every commit, which is why it is not written here.

## 6. Open the pull request

**Never push the version bump straight to `main`** — that publishes immediately, with no review of the thing this whole procedure exists to review.

```sh
git switch -c release/<version>
git add -A && git commit    # subject: `release: cut <version>`
git push -u origin release/<version>
gh pr create --title "release: cut <version>" --body "<the changelog entry, plus what was verified>"
```

The body should let a reader decide whether to merge without opening the diff: the version, why that bump, the consumer-visible changes, any required edit, and that the gate is green.

## 7. After it merges

The workflow publishes to `latest` with a provenance attestation. Then close the loop:

```sh
npm view @squaredlemons/canvas-panels@<version> dist.integrity dist.shasum gitHead
npm dist-tag ls @squaredlemons/canvas-panels
```

Record the release in `docs/delivery/release-evidence.md` — integrity, shasum, dist-tag, source commit, workflow run, provenance, and what was verified. Check the attestation's subject digest against `dist.integrity`: that is what proves the bytes npm serves are the bytes the workflow built.

**Check the tag reached the remote.** `changeset publish` writes an annotated tag, which needs the committer identity the publish job configures before it — see [#71](https://github.com/Squared-Lemons-Ltd/canvas-panels/issues/71), where three releases reported a tag and pushed nothing because it had none. Fixed and proven by `0.4.1`, and worth one command per release, because the failure is silent by construction: `New tag:` is logged whether or not the tag was written.

```sh
git ls-remote --tags origin '@squaredlemons/canvas-panels@<version>'
```

Nothing back means it has regressed. Reopen #71, say so in the evidence record, then create the tag from the attested commit — see step 1 for reading that when `gitHead` is empty — and push it by hand.

## Refuse to proceed if

- `pnpm gate` is not green. It gates the release for a reason.
- A shipped change has no changeset. Find out whether it is user-visible and write one, or establish that it isn't.
- Something was removed that was never deprecated.
- A breaking change is described without the consumer's edit.
- The only changes since the baseline are repository ones. There is nothing to release.
