import {
  definePanel,
  defineRootPanel,
  type PanelInstanceId,
} from "../../packages/canvas-panels/dist/core/index.js";
import { createCanvasModule } from "../../packages/canvas-panels/dist/ui/index.js";

const root = defineRootPanel({ kind: "classes", title: "Classes" });
const student = definePanel({
  kind: "student",
  title: (input: { name: string }) => input.name,
});
const teacher = definePanel({
  kind: "teacher",
  title: (input: { name: string }) => input.name,
});

const studentReference = student.reference({ name: "Ada Lovelace" });
// @ts-expect-error Panel references retain their definition's input contract.
student.reference({ identifier: "student-1" });
// @ts-expect-error Panel references expose immutable input read models.
studentReference.input.name = "Mutated";

const Canvas = createCanvasModule({
  root,
  panels: [student],
  renderers: {
    classes: ({ open, panel }) => {
      const rootInput: undefined = panel.reference.input;
      void rootInput;
      open({ originId: panel.instanceId, panel: studentReference });
      open({
        originId: panel.instanceId,
        // @ts-expect-error A Bound Canvas rejects references outside its registry.
        panel: teacher.reference({ name: "Katherine Johnson" }),
      });
      // @ts-expect-error Root references cannot be opened as Child Panels.
      open({ originId: panel.instanceId, panel: root.reference });
      return null;
    },
    student: ({ panel }) => {
      const studentName: string = panel.reference.input.name;
      // @ts-expect-error A renderer receives only its registered Panel input.
      panel.reference.input.identifier;
      void studentName;
      return null;
    },
  },
});

const engine = Canvas.createEngine();
const [rootPanel] = engine.getSnapshot().panels;
if (!rootPanel) throw new Error("Canvas Engine did not create its Root Panel");
const rootId: PanelInstanceId = rootPanel.instanceId;
engine.open({ originId: rootId, panel: studentReference });
engine.close(rootId);

// @ts-expect-error Panel Instance IDs are branded runtime identities.
const invalidId: PanelInstanceId = "canvas-panel-1";
// @ts-expect-error Commands do not accept unbranded strings as instance IDs.
engine.close("canvas-panel-1");

void invalidId;
