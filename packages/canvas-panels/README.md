# @squaredlemons/canvas-panels

Private reusable Canvas Panels interaction framework for Squared Lemons applications.

A **Canvas Workspace** presents an ordered **Panel Stack**: a permanent Root Panel followed by the contextual Panels a user opened from it. The package owns navigation, guarded removal, accessibility, presentation, and URL synchronisation. It owns no data fetching, cache, repository, permission model, or domain schema.

## Installation

**This package is not yet published.** It is marked `private`, and no release has been made to any registry, so `pnpm add @squaredlemons/canvas-panels` cannot resolve it yet. Until the first release, consume it one of two ways:

Inside this workspace, depend on it directly:

```json
{ "dependencies": { "@squaredlemons/canvas-panels": "workspace:*" } }
```

Outside it, install a tarball built from the package directory with `npm pack`:

```sh
pnpm add file:../canvas-panels/squaredlemons-canvas-panels-0.0.0.tgz
```

React 19 is a required peer; Next.js is an optional one. Install the peers the application actually uses:

```sh
pnpm add react@^19 react-dom@^19
```

Once the package is released to the Squared Lemons registry, installation becomes the ordinary `pnpm add @squaredlemons/canvas-panels` against an `.npmrc` that maps the `@squaredlemons` scope to that registry.

The package is ESM-only and ships no runtime dependencies, so it adds nothing to a lockfile beyond itself. Import the stylesheet once, as high in the application as the Canvas is rendered:

```ts
import "@squaredlemons/canvas-panels/styles.css";
```

## Architecture

The package is a set of independent entry points rather than one barrel. There is deliberately no root export: an application pays only for the subpaths it names.

| Subpath | Environment | Contains |
| --- | --- | --- |
| `@squaredlemons/canvas-panels/core` | server-safe | the framework-neutral Panel Engine, Panel definitions, Navigation Documents |
| `@squaredlemons/canvas-panels/react` | client | low-level React bindings over an engine |
| `@squaredlemons/canvas-panels/ui` | client | the Bound Canvas Module: providers, Workspace, hooks, dialog, interaction grammar |
| `@squaredlemons/canvas-panels/next` | client | the browser-history Navigation Adapter |
| `@squaredlemons/canvas-panels/next/server` | server-safe | reading and writing the Navigation Parameter in a Server Component |
| `@squaredlemons/canvas-panels/extensions/editor` | client | the optional Panel Editor coordinator |
| `@squaredlemons/canvas-panels/extensions/resources` | client | the optional Resource Exchange and Panel Resource |
| `@squaredlemons/canvas-panels/overlay` | client | the optional Overlay Workspace composition path |
| `@squaredlemons/canvas-panels/testing` | server-safe | runner-neutral fakes and builders |
| `@squaredlemons/canvas-panels/styles.css` | — | the compiled stylesheet |

The layer direction is enforced at build time: `core` depends on nothing, `react` on `core`, `ui` on `core` and `react`. The optional subpaths — the two extensions and the overlay — are unreachable from every base entry point, so importing the Canvas can never drag one in, and importing one costs an application nothing it had not already paid for.

Most applications need only `core`, `ui`, and the stylesheet. The lower-level bindings exist for a host that renders its own chrome instead of the package's Workspace:

```ts
import {
  CanvasProvider,
  createCanvasBindings,
  useCanvas,
} from "@squaredlemons/canvas-panels/react";
```

These give an engine's snapshot and commands as React hooks without the Bound Canvas Module's registry inference, its Workspace, its dialog, or its accessibility behaviour — all of which then become the host's responsibility. Prefer `createCanvasModule` unless you are replacing the chrome wholesale.

The **Panel Engine** is framework-neutral and has no React or DOM dependency. It owns Workspace state, commands, transitions, guards, and Navigation Documents. Every snapshot has a branded Workspace identity and a monotonically increasing version; successful mutations increment it once, while rejected and no-op commands retain snapshot identity.

## API

Define a Root Panel and the Panel Kinds that open from it, then close them into one Bound Canvas Module:

```tsx
import {
  definePanel,
  defineRootPanel,
} from "@squaredlemons/canvas-panels/core";
import "@squaredlemons/canvas-panels/styles.css";
import {
  type CanvasPanelRenderProps,
  createCanvasModule,
} from "@squaredlemons/canvas-panels/ui";

const root = defineRootPanel({ kind: "classes", title: "Classes" });
const classPanel = definePanel({
  kind: "class",
  deduplication: "reuse",
  key: (input: { classId: string; name: string }) => input.classId,
  title: (input: { classId: string; name: string }) => input.name,
  update: {
    validate: (value: unknown): value is { type: "rename"; name: string } =>
      typeof value === "object" &&
      value !== null &&
      "type" in value &&
      value.type === "rename" &&
      "name" in value &&
      typeof value.name === "string",
    validateResult: (
      value: unknown,
    ): value is { classId: string; name: string } =>
      typeof value === "object" &&
      value !== null &&
      "classId" in value &&
      typeof value.classId === "string" &&
      "name" in value &&
      typeof value.name === "string",
    apply: (current, update) => ({ ...current, name: update.name }),
    navigation: "replace",
  },
});
const learner = definePanel({
  kind: "learner",
  deduplication: "allow-many",
  title: (input: { name: string }) => input.name,
});

type ClassProps = CanvasPanelRenderProps<
  { classId: string; name: string },
  "class"
>;

function ClassesRenderer() {
  const navigation = ClassesCanvas.useNavigation();
  return (
    <button
      onClick={() =>
        navigation.open(classPanel, { classId: "class-a", name: "Class A" })
      }
      type="button"
    >
      Open Class A
    </button>
  );
}

function ClassRenderer({ descriptor }: ClassProps) {
  const navigation = ClassesCanvas.useNavigation();
  const current = ClassesCanvas.usePanel();
  ClassesCanvas.useHeader({ visualTitle: <strong>{descriptor.name}</strong> });
  return (
    <>
      <p>{current.title}</p>
      <ClassesCanvas.Action
        id="open-learner"
        label="Open learner"
        onSelect={() => navigation.open(learner, { name: "Ada Lovelace" })}
      />
    </>
  );
}

export const ClassesCanvas = createCanvasModule({
  root,
  panels: [classPanel, learner],
  renderers: {
    classes: ClassesRenderer,
    class: ClassRenderer,
    learner: ({ descriptor }) => <p>{descriptor.name}</p>,
  },
});
```

Render `ClassesCanvas.Provider` above `ClassesCanvas.Workspace`; each Provider owns an isolated engine. Renderers receive only their deeply readonly descriptor and Panel Ref.

- `useNavigation()` gives definition-bound `open`, `update`, `activate`, `collapse`, and `close` with full inference. Calls inside a renderer default their Origin and target to their own Panel; calls outside default to the Active Panel.
- `usePanel`, `useStack`, `useTransitionStatus`, and `usePresentation` each subscribe only to their selected read model, through `useSyncExternalStore`.
- `Canvas.Action`, `useHeader`, and `useLifecycle` register semantic actions, visual titles, dirty labels, and focus targets against the current Panel instance, and clean up on unmount.
- `useContextSignal` and `useContextTarget` exchange an opaque application-typed value once the module is created with `context: defineCanvasContext<Signal>()`.

The Bound module deliberately exposes no engine and no raw snapshot. Hosts that need one construct it with `createPanelEngine` from `@squaredlemons/canvas-panels/core`, and may pass `onSubscriberError` to report subscriber failures; a failing subscriber never blocks the others or changes the result of a command whose snapshot has already been published.

The Root Panel is permanent and never closable. A Child definition can set `closable: false`; any command or Branch Replacement that would remove it rejects atomically. Each Panel Kind chooses `reuse`, `replace`, or `allow-many`; the first two require a registered semantic Panel Key. Panel inputs are copied into deeply immutable read models and must contain only structured-cloneable plain objects, arrays, and primitives.

Updates use each definition's typed update union and a pure reducer, validate both the payload and the complete result, and reject semantic Panel Key changes. They never shallow-merge arbitrary patches.

Renderer exceptions are isolated inside their Panel body: package chrome stays available, the host receives only `{ kind, panel }`, and Retry remounts that renderer without replacing its Panel instance.

### Guarded Transitions

A destructive change — closing a Panel, or a Branch Replacement — collects the dirty Panels it would remove and evaluates their pure `allow`, `confirm`, or `block` guards deepest-first:

```tsx
function DraftRenderer() {
  const [dirty, setDirty] = useState(false);
  ClassesCanvas.useLifecycle({
    dirty,
    dirtyLabel: "Unsaved",
    guard: () =>
      dirty
        ? { status: "confirm", message: "Discard your unsaved changes?" }
        : { status: "allow" },
    save: async ({ signal }) => {
      await persist({ signal });
      setDirty(false);
    },
    discard: async () => setDirty(false),
  });
  return <Editor onChange={() => setDirty(true)} />;
}
```

Confirmations appear in one package-owned dialog. Save all and Discard all run the required operations deepest-first with a shared `AbortSignal` and commit the stack once, only after every operation succeeds. A failed operation surfaces as a rejection and leaves the transition open for retry without repeating what already completed. Stay and Escape abort the proposal.

Note that `dirty` currently does two jobs: it is both what arms the guard and what renders the header's dirty label and the `beforeunload` prompt. A Panel that must block a transition while it is otherwise clean — one that is mid-save, for example — has to report `dirty: true` and will show the dirty label while it does. Splitting the two meanings is a planned change to the Panel Engine.

## Accessibility

The package targets WCAG 2.2 AA and owns the structural accessibility of the Canvas.

- Every visible Panel is a labelled region. **F6** and **Shift+F6** cycle the Panel Regions the current presentation is showing, wrapping at both ends; a retained but hidden Panel is not a Region. Region cycling is the only key the Canvas claims — normal DOM Tab order is untouched and no arrow or letter shortcut is registered globally.
- Structural changes — a Panel opening or closing, a Branch Replacement, a change of presentation — are described in one polite live region. Activation, focus, and sizing are deliberately not announced: they are already conveyed by focus moving, or reported by the control that caused them. Every sentence comes from a replaceable template (`canvasAnnouncementTemplates`) so a Canvas can be localised.
- Focus for every appearance of a Panel body has exactly one owner: the Workspace. Activating a Panel gives focus to whatever that Panel registered as `initialFocus`; a Panel that registered nothing is left as the application left it. A renderer failure gives focus to the failure notice, and a retry to the Panel's own heading. Nothing rendered inside a Panel claims that moment.
- While the Guarded Transition dialog is open, application content is `inert`, focus is contained, and Escape means Stay. Focus returns to the initiating control or the retained Active Panel heading.
- The Panel Separator resizes a Panel by pointer or by keyboard through one sizing engine, so the two cannot disagree about clamping; a resize is announced only once it settles.
- Motion honours `prefers-reduced-motion`.

**Manual verification status.** Automated checks cover roles, names, focus order, live-region wiring, and axe-clean rendering in Chromium. A full WCAG 2.2 AA sign-off additionally requires a manual VoiceOver and Safari pass, which has not yet been performed for this release.

## Navigation

Each Child Panel definition declares a persistence mode. The default, `transient`, keeps the Panel and every descendant out of Navigation Documents. `navigation` adds a positive descriptor version plus `encode`, `validate`, `decode`, and a complete ordered migration for every historical version. `navigation-with-loader` adds an asynchronous `restore(input, { signal })` availability check.

Application-owned codecs must encode only the minimal identifier and view state needed to reconstruct context — not editor buffers, fetched records, credentials, or arbitrary application state.

- `engine.encodeNavigationDocument()` produces canonical JSON with sorted keys and the newest outer and per-kind schema versions. The Root Panel is implicit and is never serialised.
- `engine.decodeNavigationDocument(encoded)` returns either immutable typed Panel references or a path-scoped safe diagnostic. Decoding never mutates the stack and never touches URLs, history, React, or the DOM.
- `engine.restoreNavigationDocument(encoded, { signal })` validates the whole document, then runs availability loaders in stack order. Loaders return only `available`, `unavailable`, or `denied`; fetching stays renderer-owned. An unavailable, denied, throwing, or aborted ancestor stops restoration and never reparents or loads descendants, returning a package-owned Recovery Panel intent.
- `engine.restoreStack({ references })` moves the stack to a named set of Panels as one Guarded Transition. Panels shared with the current stack keep their identity and are never guarded.

Documents are limited to 16 KiB, 32 Panels, and 32 levels of descriptor nesting. Unknown fields, duplicate keys, unsafe property names, transient or unknown Kinds, unsupported future versions, malformed descriptors, and codec failures all fail closed, without including descriptor content or application exception messages in diagnostics.

The **Navigation Parameter** is the transport form: `v<n>.<base64url-canonical-json>`, written to the query string named by `navigationParameterName` (`canvas` by default). The first Workspace to claim a History Namespace owns it; a second Workspace on the page, or one nested inside a Panel, is refused and navigates in memory instead. A refused claim is reported, never thrown.

## Theming

### The cascade layer

The stylesheet is published as a single cascade layer named **`canvas-panels`**. Every rule the package emits is inside it and nothing else is, so an application rule written outside any layer wins without needing `!important` or higher specificity. Import it once:

```ts
import "@squaredlemons/canvas-panels/styles.css";
```

The layer's name is part of the Public Contract: an application may sort it, and the package will not rename it without a breaking change.

**Where the layer sorts is the application's decision, and an application that uses layers of its own has to state it.** CSS orders layers by first appearance, so with no `@layer` statement the order falls out of import order — which is a decision nobody made, and it is wrong in both directions. Import the package stylesheet last and `canvas-panels` sorts after the application's own layers, so every package rule outranks them; import it first and it sorts below the application's reset, so a preflight reaches into the Canvas and undoes it.

State the order once, in the entry stylesheet, above every `@import` — the first `@layer` statement is what fixes it:

```css
@layer theme, base, canvas-panels, components, utilities;

@import "tailwindcss";
@import "@squaredlemons/canvas-panels/styles.css";
```

That is the recipe for **Tailwind v4**, whose own layers are `theme`, `base`, `components`, and `utilities`. `canvas-panels` belongs after `base`, so Tailwind's preflight cannot reset the Canvas, and before `components` and `utilities`, so an application utility wins: with this statement in place, `class="text-primary"` on the Workspace element beats the package's own `color`.

Without Tailwind the rule is the same one: put `canvas-panels` **above any reset or preflight layer** — the package styles the Canvas and a reset must not land on top of it — and **below the layers holding the application's own component and utility rules**, so that application styling wins. An application with no layers at all needs no statement: unlayered CSS already beats every layered rule.

One rule in the layer is deliberately absolute. The `prefers-reduced-motion` block uses `!important`, and for important declarations the cascade inverts layer order, so it outranks application CSS whether layered or not. That is the only exception; everything else stays overridable as described.

### Custom properties

Presentation is driven by custom properties, which are the supported theming surface. Their defaults are declared on `:root` — never on the Workspace element — so the Workspace *inherits* every token. That is what makes all three overrides work, since a value declared on an element always beats one inherited into it:

| Override written on | Result |
| --- | --- |
| nothing | the Workspace inherits the package default from `:root` |
| any ancestor of the Workspace | wins over the default, however the ancestor rule is layered |
| the Workspace element itself | wins over both |

Override them on any ancestor of the Workspace:

```css
.app-canvas {
  --canvas-panel-width: 22rem;
  --canvas-panel-active-width: 32rem;
  --canvas-panel-gap: 1px;
  --canvas-panel-min-height: 0;
  --canvas-surface: Canvas;
  --canvas-surface-active: Canvas;
  --canvas-surface-overlay: Canvas;
  --canvas-text: CanvasText;
  --canvas-text-muted: GrayText;
  --canvas-border: color-mix(in srgb, CanvasText 20%, transparent);
  --canvas-radius: 0.5rem;
  --canvas-body-padding: 1rem;
  --canvas-header-padding-inline: 1rem;
  --canvas-header-min-height: 3rem;
  --canvas-transition-duration: 150ms;
  --canvas-transition-easing: ease;
}
```

Action, dialog, and separator styling have their own properties in the same family — `--canvas-action-*`, `--canvas-dialog-width`, `--canvas-dialog-padding`. Three of them have no default of their own and derive from a more general token instead: `--canvas-action-text` from `--canvas-text-muted`, `--canvas-action-text-hover` from `--canvas-text`, and `--canvas-action-border` from `--canvas-border`. The derivation is resolved on the action itself, so recolouring the general token recolours the actions with it, and setting the specific one takes them out of the arrangement.

An override on an element — an ancestor, or the Workspace itself — wins whatever layer it is written in, because it is nearer to the Workspace than `:root` is. An override written **on `:root` itself** is a different matter: it meets the package's default on the same element, so layer order decides, and a layer sorted before `canvas-panels` loses. That includes Tailwind's `@theme`, which emits into the `theme` layer. Set Canvas tokens in unlayered CSS, in a layer sorted after `canvas-panels`, or on an ancestor element.

Structural state is exposed through data attributes rather than class names, and these are part of the Public Contract:

| Attribute | On | Meaning |
| --- | --- | --- |
| `data-canvas-workspace` | the Workspace | the Canvas root |
| `data-canvas-breakpoint` | the Workspace | the current Declared Breakpoint |
| `data-canvas-panel` | each Panel | one Panel Region |
| `data-canvas-panel-id` | each Panel | its Panel Instance ID |
| `data-panel-kind` | each Panel | its Panel Kind |
| `data-active` | the Active Panel | present only on the Active Panel |
| `data-canvas-panel-context` | a visible, non-Active Panel | `previous` |
| `data-canvas-panel-header`, `data-canvas-panel-body` | within a Panel | its two regions |
| `data-canvas-panel-separator` | the Panel Separator | the resize control |
| `data-canvas-resizing` | the Workspace | present while a resize is in progress |
| `data-canvas-overlay`, `data-canvas-overlay-modality` | the overlay layer | an Overlay Workspace and its modality |

A Panel that the current presentation does not show is `hidden` and `inert` rather than carrying a visibility attribute, so it is removed from the accessibility tree and from Tab order by the platform.

The Declared Breakpoints are `mobile`, `tablet`, and `desktop`. Their media queries are exported as `canvasBreakpointQueries` from both `@squaredlemons/canvas-panels/core` and `@squaredlemons/canvas-panels/ui`, so an application can align its own layout with the presentation the Canvas selects. A Declared Breakpoint changes presentation only: it never alters Panel instances, logical order, the Active Panel, the Stack Version, or transition history. Environments without `matchMedia` — servers and pre-hydration renders — present the desktop Canvas, which the stylesheet mirrors so the first paint never flashes the wrong presentation.

## Next.js

A deep link is decoded on the server and seeded before the first client render, so the full contextual stack is present rather than flashing the Root Panel.

The route entry stays a Server Component:

```tsx
import { readCanvasNavigationState } from "@squaredlemons/canvas-panels/next/server";
import { ClassesCanvasClient } from "./classes-canvas";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const initialState = readCanvasNavigationState(await searchParams);
  return <ClassesCanvasClient initialState={initialState} />;
}
```

The client half seeds, then owns URL synchronisation:

```tsx
"use client";

import { createPanelEngine } from "@squaredlemons/canvas-panels/core";
import {
  seedCanvasNavigation,
  useCanvasNavigationSync,
} from "@squaredlemons/canvas-panels/next";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";

export function ClassesCanvasClient({ initialState }) {
  // Seeding happens with the engine, before the first render, so a deep-linked
  // stack paints in one pass instead of flashing the Root Panel.
  const [engine] = useState(() => {
    const created = createPanelEngine({
      root,
      panels: [classPanel, learner],
    });
    seedCanvasNavigation(created, initialState);
    return created;
  });
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useCanvasNavigationSync({
    engine,
    initialState,
    location: {
      pathname,
      search: searchParams.toString(),
      // The App Router never sees the fragment, so it is read from the browser.
      hash: typeof window === "undefined" ? "" : window.location.hash,
    },
  });

  return (
    <ClassesCanvas.Provider engine={engine}>
      <ClassesCanvas.Workspace label="Classes" />
    </ClassesCanvas.Provider>
  );
}
```

`useCanvasNavigationSync` writes through the History API rather than the router: Next rewrites `history.state` after `router.push`, which would strip the Canvas History Entry off the entry it just created. It stamps each entry with an opaque key and an index, which is what makes the direction and distance of a Back or Forward traversal derivable. An entry the Workspace did not stamp is left to the application's routing; an entry whose metadata is absent or malformed is treated as unrepairable and reported through `onHistoryFailure` rather than resolved by guessing.

A Workspace nested inside a Panel must declare `ownership: "memory"`: React commits effects child-first, so a nested Workspace left to claim the History Namespace would take it before its host.

Only `@squaredlemons/canvas-panels/core`, `@squaredlemons/canvas-panels/next/server`, and `@squaredlemons/canvas-panels/testing` are server-safe. Every other subpath carries `"use client"`.

## Extensions

Two optional coordinators live behind their own subpaths. Neither is reachable from a base entry point, and each composes with the Panel's ordinary lifecycle rather than registering one of its own.

### Panel Editor

`@squaredlemons/canvas-panels/extensions/editor` turns what an application reports about its own editing into the one lifecycle its Panel registers:

```tsx
import { usePanelEditor } from "@squaredlemons/canvas-panels/extensions/editor";

function ClassEditor({ descriptor }) {
  const editor = usePanelEditor({
    dirty: form.isDirty,
    loading: query.isLoading,
    save: async ({ signal }) => form.submit({ signal }),
    discard: async () => form.reset(),
    reload: async ({ signal }) => query.refetch({ signal }),
  });
  ClassesCanvas.useLifecycle(editor.lifecycle);
  return <Form {...form} />;
}
```

A write in flight blocks, because a transition must not commit over a half-written record. Reading never blocks. Otherwise unsaved work asks a human, and a settled editor allows. Only one Editor Operation runs at a time: one the coordinator wants and the application has already started is joined rather than run twice. A cancelled operation is not a failure. It owns no form, schema, repository, server action, permission, or domain content.

### Resource Exchange

`@squaredlemons/canvas-panels/extensions/resources` is where the Panels of one Workspace tell each other that something they both show has changed:

```tsx
import {
  createResourceExchange,
  ResourceExchangeProvider,
  usePanelResource,
} from "@squaredlemons/canvas-panels/extensions/resources";

const exchange = createResourceExchange();

// One exchange per Canvas Workspace, provided above it. A Workspace nested
// inside a Panel can be given its own, so nothing it publishes leaves it.
function App() {
  return (
    <ResourceExchangeProvider exchange={exchange}>
      <ClassesCanvas.Provider engine={engine}>
        <ClassesCanvas.Workspace label="Classes" />
      </ClassesCanvas.Provider>
    </ResourceExchangeProvider>
  );
}

function BriefPanel({ descriptor }) {
  const resource = usePanelResource({
    keys: [`projects/${descriptor.projectId}/briefs/*`],
    source: "brief-panel",
    // An operation part-way through is as much in the way as an unsaved draft.
    dirty: editor.dirty || editor.busy,
    reload: async (invalidation) => query.refetch(),
  });
  return <Brief deleted={resource.deleted} {...query.data} />;
}
```

A **Resource Key** is opaque and application-defined, written as `/`-separated segments; a subscription names either an exact key or a pattern in which `*` stands for exactly one segment. Canvas Panels compares keys and nothing else — it never parses a segment, resolves what one names, fetches it, caches it, or decides who may see it.

An invalidation carries the publisher's own token, so whoever made the change is not told to re-read it, and says whether nested keys are invalidated too. Propagation runs downward only. Recipients are fixed when an invalidation is published and delivered in publication order.

A change reaching a Panel with nothing to lose and a re-read to run is applied. Unsaved work is held, because an invalidation must never be the reason a human loses what they typed; the Panel's ordinary lifecycle settles the edit and the held read follows by itself. A deletion is held because it is a decision rather than a refresh. A read that failed is held rather than retried.

### Overlay Workspace

`@squaredlemons/canvas-panels/overlay` presents a Canvas Workspace above the application for global or modal Panels:

```tsx
import {
  createOverlayWorkspace,
  defineOverlayWorkspace,
} from "@squaredlemons/canvas-panels/overlay";

const help = createOverlayWorkspace({
  canvas: HelpCanvas,
  definition: defineOverlayWorkspace({ label: "Help", name: "help" }),
  engine: createPanelEngine({ root: helpRoot, panels: [shortcuts] }),
});
```

Routing is always explicit — there is no context, hook, or ambient global layer, and a Panel's own `useNavigation()` keeps going to its own Workspace whether an overlay is up or not. The overlay is presented exactly while something has been routed into it, and dismissing it is an ordinary close of the shallowest routed Panel, so guards run normally. Its persistence namespace is minted under a reserved prefix, so it can never take the Navigation Parameter a primary Canvas owns.

A modal overlay makes the main content `inert`, traps Tab, and returns focus to whatever it was taken from. Escape resolves innermost first: the Guarded Transition dialog, then application-owned Overlay Inner Layers registered through `useInnerLayer`, then the overlay itself.

## Testing

`@squaredlemons/canvas-panels/testing` provides runner-neutral fakes and builders. It imports no test runner and registers no global hook, so it works unchanged under `node:test`, Vitest, Jest, or anything else. It is server-safe and pulls in no React.

```ts
import {
  buildNavigationDocument,
  buildPanelStack,
  confirmTransition,
  createTestClock,
  createTestFocusTarget,
  createTestHistory,
  createTestIdentities,
  createTestLifecycle,
  createTestRestore,
  createTestViewport,
} from "@squaredlemons/canvas-panels/testing";
```

| Tool | Use |
| --- | --- |
| `createTestIdentities()` | Deterministic Workspace and Panel identities, numbered from one on every factory. The engine's own identities depend on how many engines a run built first. |
| `createTestClock()` | A clock for the application code around a Canvas — a debounce, a poll, a save timeout. `advance()` runs due timers at their own due point, including timers they schedule. |
| `allowTransition()`, `confirmTransition(message)`, `blockTransition(reason)` | The three Guard Outcomes. |
| `createTestLifecycle()` | A Panel Lifecycle that records the proposal it was given. In `mode: "manual"` each `save` and `discard` stays in flight until the test settles or fails it, which is how a transition is held open. |
| `createTestRestore()` | An availability loader reporting the outcomes the test listed, recording the descriptor and the `AbortSignal` it was given. |
| `buildNavigationDocument(panels)` | A canonical Navigation Document, including a *historical* descriptor version — the only way to exercise a migration from outside, since the engine can only encode the current one. |
| `createTestHistory()` | A session history that can actually be traversed, which jsdom cannot do. Movement the adapter performs is recorded as a write; movement the test performs is not. |
| `createTestFocusTarget()` | Somewhere a Panel can register `initialFocus` without a DOM. It records focus and never claims it. |
| `createTestViewport()` | The Declared Breakpoints as a resizable viewport, answering the package's own queries. |
| `buildPanelReadModel`, `buildPanelStack`, `buildTransitionStatus`, `buildPresentation` | Complete public read models, so a component under test reads a whole model even for fields the test did not mention. |

A worked example — holding a Guarded Transition open while a write is outstanding:

```ts
const editor = createTestLifecycle({
  guard: confirmTransition("Unsaved changes"),
  mode: "manual",
});
engine.registerLifecycle({ target, lifecycle: editor.lifecycle });
engine.close({ target });

const resolution = engine.resolveTransition({ decision: "save" });
await Promise.resolve();

// The write is in flight, so the stack has not committed.
assert.equal(editor.saves[0].settled, false);
assert.equal(engine.getSnapshot().panels.length, 2);

editor.saves[0].settle();
assert.equal((await resolution).status, "committed");
```

Identities mint Panel Instance Refs for read models only. The Panel Engine accepts just the refs it issued itself, so a fabricated ref addressed to a command is rejected as `invalid-panel-reference` — by design.

## Compatibility

| Requirement | Supported |
| --- | --- |
| Node.js | `^22` or `^24` |
| React | `>=19 <20` (required peer) |
| React DOM | `>=19 <20` (required peer) |
| Next.js | `>=15 <17` (optional peer; automated build covers Next 16 only) |
| Module format | ESM only, ES2022, no global polyfills |
| Browsers | current Chromium, Firefox, Safari and their mobile equivalents |

The package ships no CommonJS build and no runtime dependencies. Every entry point is a separate module with its own type declarations and source map. Continuous integration runs formatting, linting and boundary checks, typechecking, the contract suite, the build, and a clean pack-and-install of both a React and a Next consumer, on Node 22 and Node 24.

Browser support is stated from the standard features the package uses — `inert`, `structuredClone`, `AbortSignal`, CSS cascade layers, `color-mix()`, and `matchMedia` — and is verified automatically in Chromium only. Firefox and WebKit are not yet part of an automated matrix.

Two further limits are worth knowing before depending on the compatibility table. The packed Next consumer builds against Next 16, so the lower half of the declared Next range is supported by declaration rather than by an automated build. The security and bundle guarantees are structural — the package declares no runtime dependency and no install script, and each optional subpath is proven absent from every bundle that does not import it — rather than the output of a vulnerability scanner or a size budget.

## Migration

The package follows semantic versioning over its **Public Contract**: the documented exports, behaviours, schemas, accessibility guarantees, compatibility ranges, semantic styling hooks, and integration attributes described in this document. Undocumented implementation details are not part of that contract and may change in any release.

While the package is `0.x`, a minor version may contain a breaking change; each one is described in the changelog with the edit a consumer has to make.

Two things migrate independently of the package version:

- **Navigation Documents.** Each Panel Kind versions its own descriptor. When a descriptor shape changes, raise that Kind's `version` and add a migration from the previous one; the ordered migration chain must be complete back to version 1. An already-current document requests no history change, while a migrated one requests replace-history normalisation, so an old URL silently becomes a current one on first load. Never remove a historical migration: a bookmarked link may be arbitrarily old. Use `buildNavigationDocument` from `@squaredlemons/canvas-panels/testing` to pin each historical version with a test.
- **The Navigation Parameter.** Its own `v<n>.` prefix versions the transport. A parameter carrying an unrecognised version fails closed and produces a Recovery Panel rather than a partially reconstructed stack.

When upgrading, run the application's typecheck first: the package is strict, and most contract changes surface as type errors rather than runtime behaviour.

## Rollback

The package holds no persistent state of its own, so rolling back a version is a dependency change and nothing else:

```sh
pnpm add @squaredlemons/canvas-panels@<previous-version>
pnpm install --frozen-lockfile
```

Two things need checking when rolling back across a Navigation Document change:

1. **Descriptor versions are forward-incompatible by design.** A URL produced by a newer version may carry a descriptor version the older package does not know. It fails closed and shows a Recovery Panel rather than reconstructing a wrong stack, so a user holding such a link lands on the Root Panel with an explanation. This is safe but visible; if a rollback is likely, prefer keeping the descriptor version unchanged when shipping the forward change.
2. **Persisted links outlive the rollback.** Nothing in the package writes to storage, but application URLs are shared and bookmarked. Rolling back does not invalidate them; they simply degrade to recovery.

No database migration, cache invalidation, or data backfill is ever required to move between versions of this package. If a release is rolled back, no cleanup step is needed beyond reinstalling the previous version.
