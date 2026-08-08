# @squaredlemons/canvas-panels

Private reusable Canvas Panels interaction framework for Squared Lemons applications.

The package is not yet published. Its first implemented vertical slice provides:

- branded Panel references, semantic Panel Keys, and runtime Panel Instance IDs;
- host-defined Root and Child Panel definitions;
- an immutable framework-neutral Panel Engine with subscriptions, typed outcomes, and deterministic Branch Replacement;
- typed `update`, `activate`, `close`, and `collapse` commands with Workspace-scoped versions;
- React bindings based on `useSyncExternalStore`; and
- a minimal Bound Canvas Module with labelled Workspace and Panel regions.

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

Render `ClassesCanvas.Provider` above `ClassesCanvas.Workspace`. The Root Panel is permanent: closing a Child restores its retained predecessor, while opening from an earlier Panel replaces its existing descendant branch atomically. Each Panel Kind chooses `reuse`, `replace`, or `allow-many`; `reuse` and `replace` require a registered semantic key. `open` returns a discriminated `opened`, `reused`, `replaced`, or `rejected` outcome. Omitting the Origin defaults to Active; stale or foreign Origins, foreign Panel references, and deduplication conflicts reject without changing the stack. Treat Panel Instance IDs and Panel Keys as distinct opaque values and create Panel references only through their registered definitions. Panel inputs are copied into deeply immutable read models and must contain only structured-cloneable plain objects, arrays, and primitive values.

Every Engine snapshot has a branded Workspace identity and monotonically increasing version. Pass a Panel's `instanceRef` to `update`, `activate`, `close`, or `collapse`; stale references and references owned by another Workspace reject without publication. Successful mutations increment the owning Workspace once, while rejected and no-op commands retain snapshot identity and version. Updates use each Panel definition's typed update union and pure reducer, validate both the update payload and complete reducer result, and reject semantic Panel Key changes. They never shallow-merge arbitrary patches.

Root is always non-closable. A Child definition can set `closable: false`; any command or Branch Replacement that would remove that Panel rejects atomically, including closing an ancestor or collapsing/opening above it. Nested Providers—even from the same Bound Canvas Module—own independent stacks, Instance references, subscriptions, Active state, and versions, so commands cannot cross Workspace boundaries.

Hosts using `createPanelEngine` directly may provide `onSubscriberError` to report subscriber failures. A failing subscriber never blocks the remaining subscribers or changes the result of a command whose snapshot has already been published.
