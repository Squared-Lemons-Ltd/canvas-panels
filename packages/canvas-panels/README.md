# @squaredlemons/canvas-panels

Private reusable Canvas Panels interaction framework for Squared Lemons applications.

The package is not yet published. Its first implemented vertical slice provides:

- branded Panel references, semantic Panel Keys, and runtime Panel Instance IDs;
- host-defined Root and Child Panel definitions;
- an immutable framework-neutral Panel Engine with subscriptions, typed outcomes, and deterministic Branch Replacement;
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

Hosts using `createPanelEngine` directly may provide `onSubscriberError` to report subscriber failures. A failing subscriber never blocks the remaining subscribers or changes the result of a command whose snapshot has already been published.
