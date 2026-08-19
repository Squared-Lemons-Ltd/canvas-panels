# Canvas Panels

`@squaredlemons/canvas-panels` — a Canvas Panel Stack UI for React 19 and Next.js,
published publicly to npm under MIT. This repository is the package, its proof
consumers, and the path that releases it. Everything in it is world-readable,
including Actions logs.

## One command

```sh
pnpm gate
```

That is format, lint, dependency boundaries, typecheck, the contract suite, the
build, and a clean pack-and-install into temporary React and Next consumers. It
is what CI runs, what the release path runs before it publishes, and the only
answer to "is this green". Run it before you claim anything is done — not the
individual steps, which drift from each other the moment they are run apart.

## The Public Contract is frozen, and the suite enforces it

`docs/delivery/public-contract.md` is the contract: export names per subpath,
`status` and `reason` discriminants, `--canvas-*` custom properties, the
`data-canvas-*` attributes, peer ranges, the compatibility matrix, and the
Navigation Document migration chain. `tests/package-contract.test.mjs` checks
the documents against the **built** package, so a contract change that is not
also a document change fails the gate.

The rules are not the default semver ones. Adding is a minor; removing or
narrowing is breaking and must have been deprecated for a minor first; while the
package is `0.x` a minor may carry a breaking change, each one described with
the exact edit a consumer makes. Undocumented internals — module layout,
generated id spelling, the DOM inside a Panel body, `data-testid` — are not the
contract.

## Landing work

Finished work goes straight to `main`. There is no pull request for ordinary
changes, and the gate plus `/code-review` is the review.

**A push to `main` runs the release workflow.** It publishes whenever the
manifest version is not already on the registry, with no second confirmation,
and a published version cannot be replaced. So: never edit
`packages/canvas-panels/package.json`'s `version` by hand, and never hand-edit
`CHANGELOG.md` — both are written by `changeset version`. Fix the changeset and
run it again.

## Releasing

Use the `/release` command. It establishes the baseline from the registry rather
than from a tag, sorts the diff into what ships and what does not, chooses the
bump against the Public Contract, writes the changeset, and opens the one pull
request whose merge publishes. Cutting a version by hand skips the only human
review of the version number that exists here.

Changes under `packages/canvas-panels/` — `src`, the manifest, the stylesheet,
the package README — reach a consumer's `node_modules` and need a changeset.
Workflows, `docs/`, `tests/`, `apps/`, the root README and this file reach
nobody and must not produce a version.

## Vocabulary

`CONTEXT.md` is the glossary, and it is normative: Panel Stack, Guarded
Transition, Navigation Document, History Namespace, Proof Consumer, and the rest
mean what it says they mean. Use those terms in code, tests, issues, and prose.
If a concept you need is missing, resolve the gap rather than inventing a
synonym.

## Where the reasoning already lives

Read these before re-deciding something that was decided:

| | |
| --- | --- |
| `CONTEXT.md` | the domain glossary |
| `docs/delivery/public-contract.md` | what is frozen, and the versioning policy |
| `docs/delivery/package-delivery.md` | registry, clean consumers, trusted publishing |
| `docs/delivery/release-evidence.md` | what each published version is, and what was verified |
| `.github/workflows/release.yml` | the publish path, with each trap recorded at the line that avoids it |
| `skills/canvas-panels/SKILL.md` | what consumers are told; it ships via `npx skills add` |

The workflow comments in particular are load-bearing. `setup-node` must never be
given `registry-url` or `scope` here, `changesets/action` must not come back,
and the actions are pinned to commits — each has a paragraph saying why, written
after the failure it describes.

## Issues

Tracked as GitHub issues in `Squared-Lemons-Ltd/canvas-panels` via `gh`. See
`docs/agents/issue-tracker.md` for the conventions and `docs/agents/triage-labels.md`
for the labels.
