# @squaredlemons/canvas-panels

Private reusable Canvas Panels interaction framework for Squared Lemons applications.

The package is not yet published. Its first implemented vertical slice provides:

- branded Panel references and runtime Panel Instance IDs;
- host-defined Root and Child Panel definitions;
- an immutable framework-neutral Panel Engine with subscriptions and typed open/close commands;
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
const student = definePanel({
  kind: "student",
  title: (input: { name: string }) => input.name,
});

export const ClassesCanvas = createCanvasModule({
  root,
  panels: [student],
  renderers: {
    classes: ({ open, panel }) => (
      <button
        onClick={() =>
          open({
            originId: panel.instanceId,
            panel: student.reference({ name: "Ada Lovelace" }),
          })
        }
        type="button"
      >
        Open student
      </button>
    ),
    student: ({ panel }) => <p>{panel.title}</p>,
  },
});
```

Render `ClassesCanvas.Provider` above `ClassesCanvas.Workspace`. The Root Panel is permanent: closing a Child restores Root as the active Panel. Treat Panel Instance IDs as opaque runtime values and create Panel references only through their definitions.
