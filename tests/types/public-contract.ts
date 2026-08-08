import {
  definePanel,
  defineRootPanel,
  type PanelInstanceId,
  type PanelKey,
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
type StudentUpdate =
  | Readonly<{ type: "rename"; name: string }>
  | Readonly<{ type: "noop" }>;
const updatableStudent = definePanel({
  kind: "updatable-student",
  title: (input: { name: string }) => input.name,
  update: {
    validate: (update: unknown): update is StudentUpdate =>
      typeof update === "object" && update !== null && "type" in update,
    validateResult: (value: unknown): value is { name: string } =>
      typeof value === "object" &&
      value !== null &&
      "name" in value &&
      typeof value.name === "string",
    apply: (current, update: StudentUpdate) =>
      update.type === "noop" ? current : { ...current, name: update.name },
    navigation: "replace",
  },
});
const pinnedStudent = definePanel({
  kind: "pinned-student",
  closable: false,
  title: (input: { name: string }) => input.name,
});
const reusableClass = definePanel({
  kind: "class",
  deduplication: "reuse",
  key: (input: { classId: string; name: string }) => input.classId,
  title: (input: { classId: string; name: string }) => input.name,
});
// @ts-expect-error Reusable Panels require a registered semantic Panel Key.
definePanel({
  kind: "invalid-reusable",
  deduplication: "reuse",
  title: (input: { name: string }) => input.name,
});

const studentReference = student.reference({ name: "Ada Lovelace" });
// @ts-expect-error Panel references retain their definition's input contract.
student.reference({ identifier: "student-1" });
// @ts-expect-error Panel references expose immutable input read models.
studentReference.input.name = "Mutated";

const Canvas = createCanvasModule({
  root,
  panels: [student, updatableStudent, pinnedStudent],
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
    "updatable-student": () => null,
    "pinned-student": () => null,
  },
});

const engine = Canvas.createEngine();
const [rootPanel] = engine.getSnapshot().panels;
if (!rootPanel) throw new Error("Canvas Engine did not create its Root Panel");
const rootId: PanelInstanceId = rootPanel.instanceId;
const opened = engine.open({ originId: rootId, panel: studentReference });
if (opened.status !== "rejected") {
  const openedId: PanelInstanceId = opened.instanceId;
  void openedId;
}
const classReference = reusableClass.reference({
  classId: "class-a",
  name: "Class A",
});
const semanticKey: PanelKey | undefined = classReference.panelKey;
void semanticKey;
// @ts-expect-error Semantic Panel Keys are branded separately from strings.
const invalidPanelKey: PanelKey = "class-a";
const closeOutcome = engine.close({
  target: rootPanel.instanceRef,
});
if (closeOutcome.status === "rejected") {
  const closeReason:
    | "stale-panel"
    | "invalid-panel"
    | "invalid-panel-reference"
    | "foreign-workspace"
    | "root-panel"
    | "not-closable" = closeOutcome.reason;
  void closeReason;
}
const updateOutcome = engine.update({
  definition: updatableStudent,
  target: rootPanel.instanceRef,
  update: { type: "rename", name: "Grace Hopper" },
});
if (updateOutcome.status === "updated") {
  const intent: "replace" | "none" = updateOutcome.navigationIntent;
  void intent;
} else if (updateOutcome.status === "unchanged") {
  const command: "update" = updateOutcome.command;
  void command;
} else {
  const command: "update" = updateOutcome.command;
  void command;
}
const activateOutcome = engine.activate({ target: rootPanel.instanceRef });
if (activateOutcome.status === "activated") {
  const intent: "replace" = activateOutcome.navigationIntent;
  void intent;
} else {
  const command: "activate" = activateOutcome.command;
  void command;
}
const collapseOutcome = engine.collapse({ target: rootPanel.instanceRef });
if (collapseOutcome.status === "collapsed") {
  const intent: "push" = collapseOutcome.navigationIntent;
  void intent;
} else {
  const command: "collapse" = collapseOutcome.command;
  void command;
}
engine.update({
  definition: updatableStudent,
  target: rootPanel.instanceRef,
  // @ts-expect-error Updates must belong to the definition's registered union.
  update: { name: "arbitrary merge" },
});
engine.update({
  definition: student,
  target: rootPanel.instanceRef,
  // @ts-expect-error Panel Kinds without update policies cannot be updated.
  update: { type: "noop" },
});

// @ts-expect-error Root definitions cannot declare closability.
defineRootPanel({ kind: "invalid-root", title: "Invalid", closable: true });

// @ts-expect-error Panel Instance IDs are branded runtime identities.
const invalidId: PanelInstanceId = "canvas-panel-1";
engine.close({
  target: {
    ...rootPanel.instanceRef,
    // @ts-expect-error Commands do not accept unbranded strings as instance IDs.
    instanceId: "canvas-panel-1",
  },
});

void invalidId;
void invalidPanelKey;
