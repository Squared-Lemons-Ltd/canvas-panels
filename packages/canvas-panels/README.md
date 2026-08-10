# @squaredlemons/canvas-panels

Private reusable Canvas Panels interaction framework for Squared Lemons applications.

The package is not yet published. Its first implemented vertical slice provides:

- branded Panel references, semantic Panel Keys, and runtime Panel Instance IDs;
- host-defined Root and Child Panel definitions;
- an immutable framework-neutral Panel Engine with subscriptions, typed outcomes, and deterministic Branch Replacement;
- typed `update`, `activate`, `close`, and `collapse` commands with Workspace-scoped versions;
- canonical, independently versioned Navigation Documents for persistent stacks;
- React bindings based on `useSyncExternalStore`;
- scoped `useLifecycle` registration for guarded dirty Panels; and
- a Bound Canvas Module with labelled regions and an accessible Save/Discard/Stay dialog.

```tsx
import {
  definePanel,
  defineRootPanel,
} from "@squaredlemons/canvas-panels/core";
import "@squaredlemons/canvas-panels/styles.css";
import { createCanvasModule } from "@squaredlemons/canvas-panels/ui";

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

export const ClassesCanvas = createCanvasModule({
  root,
  panels: [classPanel, learner],
  renderers: {
    classes: ({ open, panel }) => (
      <button
        onClick={() =>
          open({
            originId: panel.instanceId,
            panel: classPanel.reference({
              classId: "class-a",
              name: "Class A",
            }),
          })
        }
        type="button"
      >
        Open Class A
      </button>
    ),
    class: ({ open, panel }) => (
      <button
        onClick={() =>
          open({
            originId: panel.instanceId,
            panel: learner.reference({ name: "Ada Lovelace" }),
          })
        }
        type="button"
      >
        Open learner
      </button>
    ),
    learner: ({ panel }) => <p>{panel.title}</p>,
  },
});
```

Render `ClassesCanvas.Provider` above `ClassesCanvas.Workspace`. The Root Panel is permanent: closing a Child restores its retained predecessor, while opening from an earlier Panel replaces its existing descendant branch atomically. Each Panel Kind chooses `reuse`, `replace`, or `allow-many`; `reuse` and `replace` require a registered semantic key. `open` returns a discriminated `opened`, `reused`, `replaced`, `confirmation-required`, or `rejected` outcome. Omitting the Origin defaults to Active; stale or foreign Origins, foreign Panel references, and deduplication conflicts reject without changing the stack. Treat Panel Instance IDs and Panel Keys as distinct opaque values and create Panel references only through their registered definitions. Panel inputs are copied into deeply immutable read models and must contain only structured-cloneable plain objects, arrays, and primitive values.

Every Engine snapshot has a branded Workspace identity and monotonically increasing version. Pass a Panel's `instanceRef` to `update`, `activate`, `close`, or `collapse`; stale references and references owned by another Workspace reject without publication. Successful mutations increment the owning Workspace once, while rejected and no-op commands retain snapshot identity and version. Updates use each Panel definition's typed update union and pure reducer, validate both the update payload and complete reducer result, and reject semantic Panel Key changes. They never shallow-merge arbitrary patches.

Root is always non-closable. A Child definition can set `closable: false`; any command or Branch Replacement that would remove that Panel rejects atomically, including closing an ancestor or collapsing/opening above it. Nested Providers—even from the same Bound Canvas Module—own independent stacks, Instance references, subscriptions, Active state, and versions, so commands cannot cross Workspace boundaries.

Each Child Panel definition has a persistence mode. The default, `transient`, keeps the Panel and every descendant after it out of Navigation Documents so persistent descendants are never silently reparented. `navigation` adds a current positive descriptor version plus `encode`, `validate`, `decode`, and a complete ordered migration for every historical version. `navigation-with-loader` has the same codec contract and adds an asynchronous `restore(input, { signal })` availability check for restoration workflows. Application-owned codecs must encode only the minimal identifier and view state needed to reconstruct context—not editor buffers, fetched records, credentials, or arbitrary application state.

Call `engine.encodeNavigationDocument()` to produce canonical JSON with sorted object keys and the newest outer and per-kind schema versions. Call `engine.decodeNavigationDocument(encoded)` to obtain either immutable typed Panel references or a path-scoped safe diagnostic; decoding does not mutate the stack or depend on URLs, browser history, React, or the DOM. Historical descriptors migrate one version at a time before final validation and decoding. Documents are limited to 16 KiB, 32 Panels, and 32 levels of descriptor nesting. Unknown fields, duplicate object keys, unsafe property names, non-JSON values, transient or unknown Kinds, unsupported future versions, malformed descriptors, and codec failures fail closed without including descriptor content or application exception messages in diagnostics. The Root Panel is implicit and is never serialized.

Call `engine.restoreNavigationDocument(encoded, { signal })` to validate the complete document before running `navigation-with-loader` availability checks in stack order. Loaders return only `available`, `unavailable`, or `denied`; content fetching remains renderer-owned. Restoration never mutates the Engine stack. It returns typed references for the deepest valid contextual prefix plus either a complete result or a package-owned Recovery Panel intent. An unavailable, denied, throwing, aborted, or malformed ancestor stops restoration and never reparents or loads descendants. Loader exceptions and descriptor values are omitted from recovery output. Migrated documents and every recovery outcome request replace-history normalization; an already-current complete document requests no history change.

A mounted renderer can call its Bound Canvas Module's `useLifecycle({ dirty, guard, save, discard })` hook. Set `dirty` from application-owned editor state; omitted values retain the pre-aggregation behavior and are treated as dirty. Destructive close and Branch Replacement collect dirty Panels and evaluate their pure `allow`, `confirm`, or `block` guards deepest-first. Confirmations are shown in one package-owned dialog. Save all and Discard all run the required asynchronous operations deepest-first with a shared `AbortSignal`, then commit the stack once only after every operation succeeds. A failed operation leaves the transition open for retry without repeating completed operations. Stay and Escape abort the proposal and preserve the branch. Identical pending commands coalesce, conflicting commands reject with `transition-in-progress`, and a changed stack version aborts in-flight work and cancels the stale proposal before another lifecycle operation starts. Nested Workspaces keep dirty aggregation scoped to their owning Engine; when several genuinely nested Workspaces are pending, only the deepest dialog is active and Escape reveals the next owning Workspace's dialog. While dirty work is mounted, the Workspace conditionally installs a native `beforeunload` prompt and never attempts asynchronous unload saving. While the package dialog is open, application content is inert and focus remains contained before returning to the initiating control or retained Active Panel heading.

Hosts using `createPanelEngine` directly may provide `onSubscriberError` to report subscriber failures. A failing subscriber never blocks the remaining subscribers or changes the result of a command whose snapshot has already been published.
