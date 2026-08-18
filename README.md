# Canvas Panels

Reusable Canvas Panels interaction framework for React 19 and Next.js applications. MIT licensed.

A **Canvas Workspace** presents an ordered **Panel Stack**: a permanent Root Panel followed by the contextual Panels a user opened from it. The package owns navigation, guarded removal, accessibility, presentation, and URL synchronisation — and owns no data fetching, cache, repository, permission model, or domain schema.

## Install the package

```sh
pnpm add @squaredlemons/canvas-panels
```

Published publicly to npm as [`@squaredlemons/canvas-panels`](https://www.npmjs.com/package/@squaredlemons/canvas-panels), so there is no `.npmrc` to write, no registry to map a scope to, and no token — in your repository or in its CI.

React and React DOM are **required peers** at `>=19 <20`, and Next.js is an optional one at `>=15 <17`. The package itself ships no runtime dependencies, so it adds nothing to a lockfile beyond itself. An existing React application already satisfies the peers and needs nothing further — only add them if you are starting from nothing:

```sh
pnpm add react@^19 react-dom@^19
```

**Pin the exact version while the package is `0.x`**: a minor release may contain a breaking change, each described in the changelog with the edit it requires.

Then import from a subpath — there is deliberately no root export — and load the stylesheet once:

```ts
import { definePanel, defineRootPanel } from "@squaredlemons/canvas-panels/core";
import { createCanvasModule } from "@squaredlemons/canvas-panels/ui";
import "@squaredlemons/canvas-panels/styles.css";
```

The full API, the theming tokens, the accessibility guarantees, and the compatibility matrix are in [the package README](packages/canvas-panels/README.md), which ships inside the tarball.

## Install the agent skill

Coding agents get a skill that teaches the wiring order, which subpath to reach for, and the failure modes that bite first:

```sh
npx skills add Squared-Lemons-Ltd/canvas-panels
```

Add `-g` to install it globally rather than into the current project. It lands in `.claude/skills/` (or your agent's equivalent) and is read from [`skills/canvas-panels/SKILL.md`](skills/canvas-panels/SKILL.md) in this repository, so it versions with the source rather than drifting from it.

The skill deliberately restates none of the package's frozen lists — exports, tokens, integration attributes — because a second copy would drift silently and the contract suite only enforces the first. It points agents at the shipped README for those, and spends its own words on the sequencing and judgement the README does not cover.

## Interactive showcase

Run the polished React showcase to explore typed panel navigation, semantic reuse,
branch replacement, nested Workspace isolation, and guarded Save / Discard / Stay
transitions:

```sh
pnpm install
pnpm showcase:dev
```

Open the local URL printed by Vite, then choose a project, open its creative brief,
make an edit, and try closing the Panel or switching projects.

## Repository commands

```sh
pnpm install
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm pack:check
```

`pnpm pack:check` builds an unpublished tarball and verifies it in clean temporary React and Next consumers. It does not publish the package.

See [Package delivery](docs/delivery/package-delivery.md) for the registry, clean-consumer, and trusted-publishing contract.
