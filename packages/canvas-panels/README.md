# @squaredlemons/canvas-panels

Reusable Canvas Panels interaction framework for React 19 and Next.js applications. MIT licensed.

A **Canvas Workspace** presents an ordered **Panel Stack**: a permanent Root Panel followed by the contextual Panels a user opened from it. The package owns navigation, guarded removal, accessibility, presentation, and URL synchronisation. It owns no data fetching, cache, repository, permission model, or domain schema.

**[Live demo →](https://canvas-panels-demo.vercel.app)** — a sample CRM built on this package. Open an account, follow a contact out of it, edit something and try to close the Panel; copy the URL into a new tab to see the whole stack restored.

## Installation

```sh
npm  install @squaredlemons/canvas-panels
pnpm add     @squaredlemons/canvas-panels
yarn add     @squaredlemons/canvas-panels
bun  add     @squaredlemons/canvas-panels
```

That is the whole instruction. The package is published to the public npm registry, so there is no `.npmrc` to write, no registry to map a scope to, and no token — in the consuming repository or in its CI.

React 19 and React DOM are required peers at `>=19 <20`; Next.js is an optional one at `>=15 <17`. An existing React application already satisfies them. Only if you are starting from nothing:

```sh
npm install react@^19 react-dom@^19
```

**Pin an exact version while the package is `0.x`.** A minor release may contain a breaking change before 1.0 (see [Migration](#migration)), so `"@squaredlemons/canvas-panels": "0.2.0"` and a deliberate upgrade is the supported arrangement; a caret range is not.

Prereleases are published to the `next` dist-tag and never to `latest`, so they are reached only by asking for them — `pnpm add @squaredlemons/canvas-panels@next` — and never resolved by a range.

Inside this repository the fixtures depend on the package directly, which is what keeps them honest about the workspace copy rather than a published one:

```json
{ "dependencies": { "@squaredlemons/canvas-panels": "workspace:*" } }
```

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
- `Canvas.Action`, `useHeader`, and `useLifecycle` register semantic actions, visual titles, dirty labels, and focus targets against the current Panel instance, and clean up on unmount. An Action is either a button or application content — see "Header Actions".
- `useContextSignal` and `useContextTarget` exchange an opaque application-typed value once the module is created with `context: defineCanvasContext<Signal>()`. A published signal is **held and compared one level deep** — the same value, or two plain objects or arrays with the same own entries, each compared by identity — so an inline literal of primitives is cheap and republishes only when a field actually changes. Nothing recurses, so a cyclic signal is safe; a nested object, `Date`, `Map`, or function is compared by identity, so a signal that rebuilds one every render republishes every render, and that is the case `useMemo` at the call site is still for.

The Bound module deliberately exposes no engine and no raw snapshot. Hosts that need one construct it with `createPanelEngine` from `@squaredlemons/canvas-panels/core`, and may pass `onSubscriberError` to report subscriber failures; a failing subscriber never blocks the others or changes the result of a command whose snapshot has already been published.

A Panel Kind may declare its own width, beside the definition that names the Kind rather than in a stylesheet somewhere else:

```ts
const classPanel = definePanel({
  kind: "class",
  title: (input: { name: string }) => input.name,
  width: { resting: "28rem", active: "min(48rem, 92vw)" },
});
```

`resting` is the Panel's width in the stack and `active` is its width as the Active Panel. The two are separate properties, so each half is optional on its own — declare one and the other stays themed — but a `width` that declares neither is a type error rather than a declaration that quietly does nothing. Values are CSS lengths, percentages, `calc()`, `min()`, `max()`, `clamp()`, or `var()` references; anything else — a declaration separator, a quote, a comment, a `url()`, an unbalanced bracket, or more than 128 characters — throws a `TypeError` from `definePanel`, on the line that wrote it rather than on the first surface that opens that Panel.

**A declared width wins over the stylesheet for that Kind.** The package resolves it onto `--canvas-panel-width` and `--canvas-panel-active-width` on the Panel element itself, and a value declared on an element beats one inherited into it from `:root`, from an ancestor, or from the Workspace element. Declare a Kind's width, or theme it in CSS, not both. Two things still outrank it, and both should: the narrow presentations, which set `flex-basis` directly so a wide Kind never carries its desktop column onto a phone, and a Panel Separator drag, because a person moved it. `defineRootPanel` takes no `width`; a Root Panel is themed in CSS.

The Root Panel is permanent and never closable. A Child definition can set `closable: false`; any command or Branch Replacement that would remove it rejects atomically. Each Panel Kind chooses `reuse`, `replace`, or `allow-many`; the first two require a registered semantic Panel Key. Panel inputs are copied into deeply immutable read models and must contain only structured-cloneable plain objects, arrays, and primitives.

Updates use each definition's typed update union and a pure reducer, validate both the payload and the complete result, and reject semantic Panel Key changes. They never shallow-merge arbitrary patches.

Renderer exceptions are isolated inside their Panel body: package chrome stays available, the host receives only `{ kind, panel }`, and Retry remounts that renderer without replacing its Panel instance.

### Header Actions

The package renders a Panel's header controls itself, and `Canvas.Action` is how a Panel registers one. It takes one of two shapes, and the compiler holds them apart: a registration carrying both a `label`/`onSelect` pair and `content`, or neither, does not compile.

| Shape | Props | What the package renders |
| --- | --- | --- |
| button | `id`, `label`, `onSelect`, and optionally `priority`, `disabled`, `destructive`, `icon`, `description` | a `button` the package owns completely |
| content | `id`, `content`, and optionally `priority` | whatever the application passed, in a wrapper the package lays out |

```tsx
function ClassRenderer({ descriptor }: ClassProps) {
  const enrolment = useEnrolmentJob(descriptor.classId);
  return (
    <>
      <ClassesCanvas.Action id="rename" label="Rename" onSelect={rename} />
      {/* A state icon, a label, a ticking duration, and its own Cancel
          button — none of which is a label and a handler. */}
      <ClassesCanvas.Action
        id="enrolment-job"
        priority={10}
        content={enrolment ? <EnrolmentJobStatus job={enrolment} /> : null}
      />
    </>
  );
}
```

Both shapes come out of one sorted row — `priority` descending, ties broken by `id` — so a readout takes its place among the buttons rather than being parked at one end. `id` is unique per Panel across both shapes, and a duplicate throws.

**A button Action may carry an icon and an accessible description.** Both are optional, both belong to the button shape alone, and absent them a button renders exactly as it always has.

```tsx
<Canvas.Action
  id="publish"
  label="Publish"
  icon={<PublishIcon />}
  disabled={!canPublish}
  description={canPublish ? undefined : "Add a summary before publishing."}
  onSelect={publish}
/>
```

- **`icon?: ReactNode`** renders inside the button, before the label, in a `span` the package marks `aria-hidden` and names `data-canvas-action-icon`. **`label` stays a `string`, and it stays the whole accessible name** — the button's name is its `aria-label`, so an icon cannot join it, get read as content of its own, or be relied on to say anything. Style the glyph through the attribute; the package sets only the gap and the optical alignment, and `currentColor` carries the disabled and destructive treatment into it. The button keeps its layout, its place in the row, and the pointer target the row protects.
- **`description?: string`** renders as the button's accessible description: a visually-hidden element named `data-canvas-action-description`, which the button points `aria-describedby` at. It is announced as a description rather than as part of the name, it is reachable by keyboard and by touch, and it is not a `title` tooltip, which is neither. **It is rendered whenever it is supplied, not only while the Action is `disabled`.** A disabled Action is the case that most needs one — "Publish" greyed out with no reason is a dead end — but the description of a control is not a state of it, and one that vanished the moment the control became available would be a change the application never asked for. An application that wants the disabled-only behaviour passes `undefined` when the Action is enabled, as above.

**Content is registered, not portalled.** It reaches the header through the same registration a button uses, so the package renders it as part of its own tree and nothing races the package's re-renders. Three consequences follow, and each is part of the contract:

- **Re-rendering content re-registers nothing.** The content of the moment is held in a store the registration owns, so a readout that ticks once a second costs one small re-render of its own slot. Registration identity moves only when `id` or `priority` does.
- **React context resolves at the header, not at the Panel body.** Providers above the Workspace reach content; a provider an application renders *inside* a Panel renderer does not. Pass what the content needs into the element itself, or lift the provider above the Workspace.
- **Content renders inside its own Panel's scope.** `useNavigation`, `usePanel`, and `usePresentation` called inside content default to the Panel that registered it, not to the Active Panel — so a control in a background Panel's header acts on that Panel. Content may not register anything further: a nested `Action`, `useHeader`, or `useLifecycle` inside content throws.

Content that has nothing to show renders `null`; `undefined` is not a value `content` accepts, because the presence of `content` is what tells the two shapes apart. Content that throws is dropped from the row and reported through `onRendererError` exactly as a body failure is — the header shows no notice, the rest of the Canvas is untouched, and the next content the application renders is attempted again.

**This is a constrained escape hatch, not a header slot.** It exists for the one header control that no label string describes: a live readout, a status composite, something with its own embedded button — the case the reporter of [#59](https://github.com/Squared-Lemons-Ltd/canvas-panels/issues/59) found once in forty-odd controls. Everything that reduces to a label and a handler should stay a button Action, which the package can lay out, disable, mark destructive, name for a screen reader, describe, put a glyph in front of, and keep as a pointer target. There is no ref, no portal target, and no way to reach the rest of the header: the package still decides where a control goes, and content that wants to be a Panel's main UI belongs in the Panel body.

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
- While the Guarded Transition dialog is open, application content is `inert`, focus is contained, and Escape means Stay. However the transition then resolves — Save, Discard, or Stay — focus lands back **inside the Workspace**: on the control that initiated it while that control is still somewhere focus can go, and on the retained Active Panel's own heading otherwise. It is never left on the document body, which is what keeps Escape working in an Overlay Workspace once a dialog has been answered.
- A button Action is named by its `label` and by nothing else: the name is an `aria-label`, so a registered `icon` cannot reach it, and the icon's wrapper is `aria-hidden` so the glyph is not read as content of its own either. A registered `description` is announced as the button's accessible description through `aria-describedby`, which is reachable by keyboard and by touch — deliberately not a `title` tooltip, which is neither.
- A content Action's wrapper is a plain `div` with no ARIA role, no label, and no `tabIndex`. It adds nothing to the header's semantics and claims nothing from the Panel Focus Owner, so interactive content inside it is reachable in ordinary Tab order at the position the row gives it, and a Panel the presentation is hiding takes its header content into `inert` with the rest of the Panel. Naming that content, and keeping its own pointer targets large enough, is the application's job — the package cannot name what it did not render.
- The Panel Separator resizes a Panel by pointer or by keyboard through one sizing engine, so the two cannot disagree about clamping; a resize is announced only once it settles.
- Motion honours `prefers-reduced-motion`.

**Manual verification status.** Automated checks cover roles, names, focus order, live-region wiring, and axe-clean rendering in Chromium. A full WCAG 2.2 AA sign-off additionally requires a manual VoiceOver and Safari pass, which has not yet been performed for this release.

## Navigation

Each Child Panel definition declares a persistence mode. The default, `transient`, keeps the Panel and every descendant out of Navigation Documents. `navigation` adds a positive descriptor version plus `encode`, `validate`, `decode`, and a complete ordered migration for every historical version. `navigation-with-loader` adds an asynchronous `restore(input, { signal })` availability check.

Application-owned codecs must encode only the minimal identifier and view state needed to reconstruct context — not editor buffers, fetched records, credentials, or arbitrary application state.

- `engine.encodeNavigationDocument()` produces canonical JSON with sorted keys and the newest outer and per-kind schema versions. The Root Panel is implicit and is never serialised.
- `engine.decodeNavigationDocument(encoded)` returns either immutable typed Panel references or a path-scoped safe diagnostic. Decoding never mutates the stack and never touches URLs, history, React, or the DOM.
- `engine.restoreNavigationDocument(encoded, { signal })` validates the whole document, then runs availability loaders in stack order. Loaders return only `available`, `unavailable`, or `denied`; fetching stays renderer-owned. An unavailable, denied, throwing, or aborted ancestor stops restoration and never reparents or loads descendants, returning a package-owned Recovery Panel intent.
- `engine.restoreStack({ references })` moves the stack to a named set of Panels as one Guarded Transition. Panels shared with the current stack keep their identity and are never guarded. Sharing is decided on persisted identity — Kind, semantic Panel Key, and encoded descriptor — so a live Panel input that carries more than its codec persists, as the rule above requires it to, is still the same Panel. A transient Kind has no descriptor, and there the whole input is the identity.

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
  --canvas-body-padding: 1rem;
  --canvas-surface: Canvas;
  --canvas-text-muted: GrayText;
  --canvas-border: color-mix(in srgb, CanvasText 20%, transparent);
  --canvas-radius: 0.5rem;
  --canvas-transition-duration: 150ms;
}
```

This is the complete list, and it is part of the Public Contract: a token the package reads and this table does not name is a defect, and the contract suite fails on one.

| Token | Default | What it sets |
| --- | --- | --- |
| `--canvas-surface` | `Canvas` | the Canvas bed and every Panel |
| `--canvas-surface-active` | `Canvas` | the Active Panel |
| `--canvas-surface-raised` | `Canvas` | what the package paints *above* the Canvas: the Guarded Transition dialog, and an Overlay Workspace |
| `--canvas-surface-overlay` | `rgb(0 0 0 / 45%)` | the scrim behind a modal overlay or dialog. The one token that is not a system colour — a translucent shade is the point — and the one the forced-colours block replaces |
| `--canvas-border` | `color-mix(in srgb, CanvasText 18%, transparent)` | Panel edges and header rules |
| `--canvas-text` | `CanvasText` | Canvas text |
| `--canvas-text-muted` | `color-mix(in srgb, CanvasText 65%, transparent)` | secondary text, and what an action's colour derives from |
| `--canvas-panel-width` | `min(24rem, 84vw)` | an inactive Panel, unless its Panel Kind declared a `width` |
| `--canvas-panel-active-width` | `min(36rem, 90vw)` | the Active Panel, unless its Panel Kind declared a `width` |
| `--canvas-panel-min-height` | `24rem` | the Canvas's own floor |
| `--canvas-panel-gap` | `0` | the gutter between Panels |
| `--canvas-header-min-height` | `3.5rem` | a Panel header |
| `--canvas-header-padding-inline` | `1.25rem` | a Panel header, and the narrow navigation bar |
| `--canvas-body-padding` | `0` | a Panel body |
| `--canvas-radius` | `0.75rem` | the dialog and the overlay Workspace |
| `--canvas-dialog-width` | `min(100%, 32rem)` | the Guarded Transition dialog |
| `--canvas-dialog-padding` | `1.5rem` | the Guarded Transition dialog |
| `--canvas-action-surface` | `transparent` | a Canvas Action at rest |
| `--canvas-action-surface-hover` | `color-mix(in srgb, CanvasText 10%, transparent)` | a Canvas Action under the pointer |
| `--canvas-action-text-destructive` | `color-mix(in srgb, red 70%, CanvasText)` | an Action the application declared destructive |
| `--canvas-action-radius` | `99px` | a Canvas Action |
| `--canvas-action-padding` | `0.4rem 0.7rem` | a Canvas Action |
| `--canvas-action-min-size` | `1.75rem` | the floor a Canvas Action keeps on both axes. Lowering it under `1.5rem` puts the control below what WCAG 2.5.8 asks of a pointer target |
| `--canvas-transition-duration` | `300ms` | Panel width transitions |
| `--canvas-transition-easing` | `ease` | Panel width transitions |
| `--canvas-action-text` | *derived from* `--canvas-text-muted` | a Canvas Action's colour |
| `--canvas-action-text-hover` | *derived from* `--canvas-text` | a Canvas Action's colour under the pointer |
| `--canvas-action-border` | *derived from* `--canvas-border` | a Canvas Action's edge |

The last three have no default of their own. Each derives from a more general token, and the derivation is resolved **on the action itself** rather than on `:root` — so recolouring the general token recolours the actions with it, and setting the specific one takes them out of the arrangement. A default written on `:root` could not do that: a `var()` inside a custom property is substituted where the property is declared, and every descendant then inherits the answer.

The two Panel width tokens have a second source, and it is nearer. A Panel Kind that declared a `width` on its `definePanel` call carries that value on its own Panel element, which beats these tokens wherever they were set — `:root`, an ancestor, or the Workspace itself. That is the trade for being able to keep a Kind's default presentation beside the Kind: for that Kind the stylesheet no longer sets the width. Theme the Kinds that declare nothing here, and leave the ones that declare a width to their definitions. What still applies to every Panel either way is everything else in this table, the narrow presentations, and a rule that sets `flex-basis` on `[data-canvas-panel][data-panel-kind="…"]` directly — a property, not a token, and so not something an inherited value competes with.

`--canvas-surface-raised` reaches two elements that render outside the Panel Stack — the dialog, inside the Workspace that raised it, and the overlay, in its own Workspace element under `[data-canvas-overlay]` — so a token set on `[data-canvas-workspace]`, on any ancestor, or on `:root` reaches both.

An override on an element — an ancestor, or the Workspace itself — wins whatever layer it is written in, because it is nearer to the Workspace than `:root` is. An override written **on `:root` itself** is a different matter: it meets the package's default on the same element, so layer order decides, and a layer sorted before `canvas-panels` loses. That includes Tailwind's `@theme`, which emits into the `theme` layer. Set Canvas tokens in unlayered CSS, in a layer sorted after `canvas-panels`, or on an ancestor element.

Structural state is exposed through data attributes rather than class names. The table below is the complete list, and every entry is part of the Public Contract — an attribute the package emits and this table does not name is a defect, and the contract suite fails on one.

| Attribute | On | Meaning |
| --- | --- | --- |
| `data-canvas-workspace` | the Workspace | the Canvas root |
| `data-canvas-breakpoint` | the Workspace | the current Declared Breakpoint |
| `data-canvas-resizing` | the Workspace | present while a resize is in progress |
| `data-canvas-announcer` | within the Workspace | the single polite live region |
| `data-canvas-application` | within the Workspace | the horizontally scrolling Panel Stack |
| `data-canvas-panel` | each Panel | one Panel Region |
| `data-canvas-panel-id` | each Panel | its Panel Instance ID |
| `data-panel-kind` | each Panel | its Panel Kind |
| `data-active` | the Active Panel | present only on the Active Panel |
| `data-canvas-panel-context` | a visible, non-Active Panel | `previous` |
| `data-canvas-panel-header`, `data-canvas-panel-body` | within a Panel | its two regions |
| `data-canvas-panel-title` | within a Panel's heading | the Panel title, present only while a registered visual title has taken its visible place |
| `data-canvas-visual-title` | within a Panel's heading | the visual title an application registered through `useHeader` |
| `data-canvas-dirty-label` | within a Panel's header | the label a Panel's lifecycle registered for unsaved work |
| `data-canvas-panel-separator` | the Panel Separator | the resize control |
| `data-canvas-panel-close` | the close control | present on a closable Panel's own close button |
| `data-canvas-action` | each Canvas Action — the button, or the wrapper around content | the `id` the application gave that Action |
| `data-canvas-action-content` | the wrapper around a content Action | present only on the wrapper the package puts around application-supplied header content |
| `data-canvas-action-icon` | the wrapper around a button Action's icon, inside the button | present only when that Action registered an `icon`; the wrapper is `aria-hidden` |
| `data-canvas-action-description` | a button Action's accessible description, inside the button | present only when that Action registered a `description`; visually hidden, and what the button's `aria-describedby` points at |
| `data-destructive` | a Canvas Action | present on an Action the application declared destructive |
| `data-canvas-panel-notice` | within a Panel body | the renderer failure notice that replaced it |
| `data-canvas-mobile-navigation` | within the Workspace | the narrow presentation's navigation bar |
| `data-canvas-breadcrumbs` | within that bar | the trail of retained Panels |
| `data-canvas-back` | within that bar | the control that returns to the previous Panel |
| `data-canvas-transition-backdrop`, `data-canvas-transition-dialog` | the Guarded Transition dialog | its scrim and its modal |
| `data-canvas-transition-actions` | within that dialog | the row holding its decisions |
| `data-canvas-transition-action` | each decision | `save`, `discard`, or `stay` |
| `data-canvas-overlay`, `data-canvas-overlay-modality` | the overlay layer | an Overlay Workspace and its modality |
| `data-canvas-overlay-main` | the application behind an overlay | the content a modal overlay makes `inert` |

`data-testid` attributes also appear in the rendered Canvas. They are **not** part of the Public Contract and may change in any release; use the attributes above.

A Panel that the current presentation does not show is `hidden` and `inert` rather than carrying a visibility attribute, so it is removed from the accessibility tree and from Tab order by the platform.

The narrow presentation's breadcrumb trail is **one line that scrolls within itself**, so its height is the same at every depth and however long the Panel titles are, and the document never gains a horizontal scrollbar because of it. Each crumb is clamped to a line and capped at `12rem`, and the trail rests at the crumb for the Active Panel; every crumb stays an ordinary button in Tab order, so focusing one scrolls it back into view. An application that wants more of a title visible raises the cap on the documented attribute: `[data-canvas-breadcrumbs] li button { max-inline-size: 20rem; }`.

A Panel Instance ID is numbered from one **within its own Panel Engine**, and that scope is the part of the Public Contract — the `canvas-panel-<n>` spelling is not, and may change. Because the numbering depends on nothing outside the Engine, a server render and the browser that hydrates it agree about which element is which Panel; a selector or a stored id written against the server's markup still names the same Panel afterwards. What it does not give you is a document-unique value: two Workspaces on one page each number their own Panels, so scope any lookup to the Workspace you mean rather than searching the document. For the same reason a bare Panel Instance ID passed to a different Panel Engine names *that* Engine's Panel at the same position rather than being refused — pass a Panel Instance Ref, which every command that can take one does, and which no other Engine will accept.

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

## Support

**The supported line is the newest published minor.** Fixes land on it and are released forward; there is no backport branch, and an older `0.x` receives nothing. That is affordable precisely because upgrading is a dependency change — the package holds no persistent state, and [Rollback](#rollback) is a reinstall. An application that cannot take the newest minor should say so before it is stranded rather than after.

**Deprecations are announced before they are removed.** A part of the Public Contract that is going away is marked deprecated in its own release — in the changelog, in this document, and with a `@deprecated` JSDoc tag where it is an export, so it surfaces in an editor and in `pnpm typecheck` rather than only in prose. It keeps working for at least one further minor release, and its removal is a breaking change described with the edit a consumer has to make. Nothing is removed in the same release that deprecates it.

**Known limitations**, none of which block a release, all of which are worth knowing before depending on the contract:

| Limitation | What is actually true |
| --- | --- |
| WCAG 2.2 AA sign-off is partial | Automated checks cover roles, names, focus order, live-region wiring, and axe-clean rendering in Chromium. A manual VoiceOver and Safari pass has not been performed. |
| One browser is automated | Chromium only. Firefox and WebKit are supported by declaration, from the standard features the package uses, and are not in an automated matrix. |
| The Next range is half-verified | The packed Next consumer builds against Next 16. `>=15` is supported by declaration rather than by an automated build. |
| Security and size are structural claims | The package declares no runtime dependency and no install script, and each optional subpath is proven absent from every bundle that does not import it. There is no vulnerability scanner and no size budget in the gate. |
| `dirty` does two jobs | It both arms the Transition Guard and renders the header's dirty label and the `beforeunload` prompt. A Panel that must block while otherwise clean has to report `dirty: true` and shows the label while it does. Splitting the two is a planned Panel Engine change. |
| The narrow presentations are verified by test, and once by eye | The mobile and tablet presentations are covered by the contract suite and by axe in a simulated viewport. A consumer has since rendered the **mobile** presentation at 390×844 against its own data, and most of it held: one Panel at a time, the retained Panels `hidden` and out of the Tab order, the Back control, and a document that never scrolls sideways. The breadcrumb trail did not — with real titles it wrapped to roughly a third of the viewport, and is now a single scrolling line. What remains unseen is the **tablet** presentation, a Guarded Transition dialog or an Overlay Workspace at either narrow width, and any of it on a real phone rather than a browser resized to one. |

## Migration

The package follows semantic versioning over its **Public Contract**: the documented exports, behaviours, schemas, accessibility guarantees, compatibility ranges, semantic styling hooks, and integration attributes described in this document. Undocumented implementation details are not part of that contract and may change in any release.

While the package is `0.x`, a minor version may contain a breaking change; each one is described in the changelog with the edit a consumer has to make.

Two things migrate independently of the package version:

- **Navigation Documents.** Each Panel Kind versions its own descriptor. When a descriptor shape changes, raise that Kind's `version` and add a migration from the previous one; the ordered migration chain must be complete back to version 1. An already-current document requests no history change, while a migrated one requests replace-history normalisation, so an old URL silently becomes a current one on first load. Never remove a historical migration: a bookmarked link may be arbitrarily old. Use `buildNavigationDocument` from `@squaredlemons/canvas-panels/testing` to pin each historical version with a test.
- **The Navigation Parameter.** Its own `v<n>.` prefix versions the transport. A parameter carrying an unrecognised version fails closed and produces a Recovery Panel rather than a partially reconstructed stack.

**Upgrading**, in the order that finds problems cheapest first:

```sh
pnpm add @squaredlemons/canvas-panels@<version>   # an exact version, not a range
pnpm install --frozen-lockfile
pnpm typecheck                                    # the package is strict; most contract changes are type errors
pnpm test
pnpm build
```

Read the changelog entry for every version between the two, not only the newest: while the package is `0.x` a minor may carry a breaking change, and each one names the edit to make. Then exercise the application's own Canvas — a Guarded Transition, a deep link restored from a URL, and the narrow presentation — because those are the three the type system cannot check for you.

If the upgrade crosses a Navigation Document change, keep an old URL to hand and load it: an old link is the one input that outlives every release, and [Rollback](#rollback) explains what it does when it cannot be restored.

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

## Licence

MIT. The full text ships inside the tarball as `LICENSE`, so the terms are readable from the installed artifact rather than from a repository a consumer may never visit.
