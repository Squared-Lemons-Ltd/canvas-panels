---
name: canvas-panels
description: Build a horizontal Canvas Panel Stack UI in a React 19 or Next.js app with @squaredlemons/canvas-panels — typed panel navigation, guarded unsaved-changes transitions, deep-linkable URL state, and accessible region cycling. Use when building admin interfaces, CRM or dashboard UIs, CRUD screens, or any interface where opening an entity should push a panel beside the list rather than navigate away from it.
---

# Canvas Panels

`@squaredlemons/canvas-panels` is a published package. **Install it — do not reimplement it.** If you find yourself writing a `CanvasProvider`, a panel-stack reducer, or a `?panels=` query-string format by hand, stop: all of that is in the package, contract-frozen, and accessibility-tested.

A **Canvas Workspace** shows an ordered **Panel Stack** — a permanent Root Panel, then the contextual Panels a user opened from it. The package owns navigation, guarded removal, accessibility, presentation, and URL synchronisation.

It owns **no** data fetching, cache, repository, permission model, or domain schema. Those stay yours. An agent that tries to make the package fetch something has misread it.

## Install

```sh
pnpm add @squaredlemons/canvas-panels     # or npm install / yarn add / bun add
```

Public on npm — no `.npmrc`, no registry mapping, no token. Node `^22 || ^24`.

**Use whichever package manager the project already uses**, and do not add the peers unless they are missing. React and React DOM are required peers at `>=19 <20` and Next.js is an optional one at `>=15 <17`; an application that renders React already satisfies them, and installing `react@^19` over a deliberately pinned version is a change nobody asked for.

**Pin the exact version.** While the package is `0.x` a minor release may break; `"@squaredlemons/canvas-panels": "0.2.0"` with deliberate upgrades is supported, a caret range is not.

## Read the shipped README first

The package README ships inside the tarball and is the enforced reference — a contract suite fails the release when it and the built package disagree. Read it rather than guessing, and rather than trusting this file, for anything frozen:

```
node_modules/@squaredlemons/canvas-panels/README.md
```

That is where the complete export inventory, every `--canvas-*` custom property and its default, the full `data-canvas-*` attribute table, the result discriminants, and the compatibility matrix live. **This skill deliberately does not restate them** — a copy would drift silently at the next minor release, and the README's copy cannot.

## Choose your subpaths

There is **no root export**. Import from the subpath, and pay only for what you name.

| You are… | Import from |
| --- | --- |
| Defining panels and the root | `/core` |
| Rendering the Canvas (the normal path) | `/ui` |
| Loading the stylesheet | `/styles.css` |
| Deep-linking in a Next.js Server Component | `/next/server` |
| Syncing URL state in a Next.js client component | `/next` |
| Tracking unsaved edits in a panel | `/extensions/editor` |
| Telling sibling panels a record changed | `/extensions/resources` |
| Presenting a global or modal Workspace | `/overlay` |
| Writing tests | `/testing` |
| Replacing the package's chrome wholesale | `/react` |

Most applications need `/core`, `/ui`, and `/styles.css`. Reach for `/react` only when you are rendering your own chrome and accept owning the Workspace, the dialog, and the accessibility behaviour yourself — otherwise `createCanvasModule` from `/ui`.

## Wiring order

Do these in order. Most breakage is a step done out of sequence.

**1. Define the Root Panel and each Panel Kind** (`/core`). `definePanel` takes a `kind`, a `deduplication` mode (`reuse` collapses onto an existing Panel for the same key, `allow-many` does not), and optional `key`, `title`, `width`, and `update`. A `width` — `{ resting, active }`, either half on its own — is that Kind's default presentation, applied to its Panel element, and it wins over a stylesheet rule that sets the width tokens for that Kind.

**2. Close them into one Bound Canvas Module** with `createCanvasModule({ root, panels, renderers })` from `/ui`. The returned module carries `Provider`, `Workspace`, `useNavigation`, `usePanel`, `useHeader`, `useLifecycle`, and `Action`. An `Action` is either a button — a label and a handler — or application content the package places in the header's action row. Reach for the second only when no label expresses the control: a live readout, a status with an embedded control. It is a constrained escape hatch, not a header slot — and it is not the way to add a glyph or a tooltip, because a button Action takes an optional `icon` and an optional `description` of its own. Switching to content to get either one gives up `disabled`, `destructive`, the accessible naming and the pointer target in exchange.

**3. Render `Module.Provider` above `Module.Workspace`.** Each Provider owns an isolated engine.

**4. Import the stylesheet once**, as high as the Canvas renders:

```ts
import "@squaredlemons/canvas-panels/styles.css";
```

**5. State the cascade layer order** if the application uses layers of its own — see the failure modes below.

**6. Navigate with `useNavigation()`**, never with your router. It returns definition-bound `open`, `update`, `activate`, `collapse`, and `close`, fully inferred. Called inside a renderer it defaults to that renderer's own Panel.

Renderers receive only their deeply readonly descriptor and Panel Ref. Fetch inside the renderer with your own data layer.

## The failure modes that bite first

**No root export.** `import { … } from "@squaredlemons/canvas-panels"` does not resolve, by design. Name a subpath.

**ESM only.** No CommonJS build and no `require` condition. `require.resolve("@squaredlemons/canvas-panels/core")` fails with `ERR_PACKAGE_PATH_NOT_EXPORTED`, which looks like a packaging fault and is not one.

**Cascade layer order is yours to state.** The stylesheet is one layer named `canvas-panels`, and CSS orders layers by first appearance — so with no `@layer` statement the order falls out of import order, which is a decision nobody made and is wrong in both directions. Declare it once in the entry stylesheet, above every `@import`.

**Server-safe vs client.** Only `/core`, `/next/server`, and `/testing` are server-safe. Every other subpath carries `"use client"`. Importing `/ui` into a Server Component is the most common Next.js failure here.

**A nested Workspace must declare `ownership: "memory"`.** React commits effects child-first, so a Workspace inside a Panel would otherwise claim the History Namespace before its host. The first claimant wins; a refused claim is reported, never thrown.

**F6 is the only key the Canvas claims.** F6 and Shift+F6 cycle Panel Regions. Tab order is left as the DOM defines it and no arrow or letter shortcut is registered globally — so do not add arrow-key panel navigation "to match"; it will fight the DOM and break the accessibility contract.

**Focus does not select a Panel.** Clicking or tabbing into a retained Panel focuses it and nothing more: it does not become the Active Panel, so it keeps its retained width and every hook that defaults to the Active Panel resolves elsewhere. For master–detail behaviour pass `activateOnFocus` to `Module.Workspace` — it defaults to off — or call `activate` yourself.

**Guards are the package's, not yours.** Report `dirty` through the Panel Editor lifecycle and let the package run the Save / Discard / Stay dialog. Do not write your own `beforeunload` or confirm dialog.

## Unsaved changes

`/extensions/editor` turns what you report about your own editing into the one lifecycle the Panel registers:

```tsx
const editor = usePanelEditor({
  dirty: form.isDirty,
  loading: query.isLoading,
  save: async ({ signal }) => form.submit({ signal }),
  discard: async () => form.reset(),
  reload: async ({ signal }) => query.refetch({ signal }),
});
Module.useLifecycle(editor.lifecycle);
```

A write in flight blocks a transition; reading never does; unsaved work asks a human; a settled editor allows. One Editor Operation runs at a time. It owns no form, schema, repository, or server action.

## Deep links in Next.js

Decode on the server, seed before first client render — otherwise a deep-linked stack flashes the Root Panel:

- Server Component: `readCanvasNavigationState(await searchParams)` from `/next/server`, passed as a prop.
- Client component: build the engine inside `useState(() => …)`, call `seedCanvasNavigation(engine, initialState)` **before** returning it, then `useCanvasNavigationSync({ engine, initialState, location })`.

`useCanvasNavigationSync` writes through the History API rather than the router on purpose: Next rewrites `history.state` after `router.push`, which would strip the Canvas History Entry off the entry it just created.

Panels only persist into a URL if their definition says so — the default `transient` mode keeps a Panel and its descendants out of Navigation Documents entirely. Persisting needs a descriptor version plus `encode`, `validate`, `decode`, and a complete ordered migration chain. Encode the minimal identifier and view state only: never editor buffers, fetched records, or credentials.

## Testing

Use `/testing` — runner-neutral fakes and builders that import no test runner and register no global hook, so they work under `node:test`, Vitest, or Jest. There is a fake or builder for every published seam; reach for those before mocking the package.

`buildNavigationDocument` is the only way to construct a *historical* descriptor version from outside the engine. Pin each historical version with a test that migrates it forward — that test is the fixture, and it is what makes "never remove a migration" checkable.

## Before you call it done

- [ ] Every import names a subpath; nothing imports the bare package name.
- [ ] The stylesheet is imported once, and the layer order is stated if the app uses layers.
- [ ] No Server Component imports a client subpath.
- [ ] Navigation goes through `useNavigation()`, not the router.
- [ ] Unsaved state is reported through the editor lifecycle; no hand-rolled confirm dialog.
- [ ] No arrow-key or letter shortcut was added for panel movement.
- [ ] Any panel meant to survive a reload declares its persistence mode and codec.
- [ ] The version is pinned exactly.
