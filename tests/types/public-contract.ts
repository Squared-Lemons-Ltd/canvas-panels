import {
  createPanelEngine,
  definePanel,
  defineRootPanel,
  type PanelInstanceId,
  type PanelInstanceRef,
  type PanelKey,
  type PanelLifecycle,
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
const persistentStudent = definePanel({
  kind: "persistent-student",
  title: (input: { studentId: string; name: string }) => input.name,
  persistence: {
    mode: "navigation-with-loader",
    version: 1,
    codec: {
      encode: ({ studentId, name }) => ({ studentId, name }),
      validate: (
        value: unknown,
      ): value is { studentId: string; name: string } =>
        typeof value === "object" &&
        value !== null &&
        "studentId" in value &&
        typeof value.studentId === "string" &&
        "name" in value &&
        typeof value.name === "string",
      decode: (descriptor) => ({
        studentId: descriptor.studentId,
        name: descriptor.name,
      }),
      migrations: [],
    },
    restore: async (input, { signal }) => {
      const studentId: string = input.studentId;
      const aborted: boolean = signal.aborted;
      void studentId;
      void aborted;
      return { status: "available" };
    },
  },
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
  panels: [student, updatableStudent, pinnedStudent, persistentStudent],
  renderers: {
    classes: ({ descriptor, panel }) => {
      const rootInput: undefined = descriptor;
      const rootKind: "classes" = panel.kind;
      void rootInput;
      void rootKind;
      // @ts-expect-error Renderers receive no raw engine commands.
      panel.open;
      return null;
    },
    student: ({ descriptor, panel }) => {
      const studentName: string = descriptor.name;
      const studentKind: "student" = panel.kind;
      // @ts-expect-error A renderer receives only its registered Panel input.
      descriptor.identifier;
      void studentName;
      void studentKind;
      return null;
    },
    "updatable-student": () => null,
    "pinned-student": () => null,
    "persistent-student": ({ descriptor }) => {
      const studentId: string = descriptor.studentId;
      void studentId;
      return null;
    },
  },
});

function BoundConsumer() {
  const navigation = Canvas.useNavigation();
  navigation.open(student, { name: "Ada Lovelace" });
  navigation.update(updatableStudent, { type: "rename", name: "Grace Hopper" });
  // @ts-expect-error Bound navigation rejects foreign definitions.
  navigation.open(teacher, { name: "Katherine Johnson" });
  // @ts-expect-error Bound navigation infers the registered descriptor.
  navigation.open(student, { identifier: "student-1" });
  // @ts-expect-error Bound updates infer the definition's update union.
  navigation.update(updatableStudent, { name: "arbitrary merge" });
  // @ts-expect-error Non-updatable definitions accept no update value.
  navigation.update(student, { type: "noop" });
  const panel = Canvas.usePanel();
  const studentPanel = null as unknown as PanelInstanceRef &
    Readonly<{ kind: "student" }>;
  const typedStudent = Canvas.usePanel(student, studentPanel);
  if (typedStudent) {
    const studentName: string = typedStudent.descriptor.name;
    const studentKind: "student" = typedStudent.kind;
    void studentName;
    void studentKind;
  }
  // @ts-expect-error Definition and branded Panel Ref kinds must agree.
  Canvas.usePanel(updatableStudent, studentPanel);
  const stack = Canvas.useStack();
  const transition = Canvas.useTransitionStatus();
  const presentation = Canvas.usePresentation();
  void panel;
  void stack;
  void transition;
  void presentation;
  return null;
}
void BoundConsumer;
// @ts-expect-error Bound Canvas modules keep engine construction private.
Canvas.createEngine();
// @ts-expect-error Bound Canvas modules expose narrow hooks, not raw snapshots.
Canvas.useCanvas();

const engine = createPanelEngine({
  root,
  panels: [student, updatableStudent, pinnedStudent, persistentStudent],
});
const navigationDocument: string = engine.encodeNavigationDocument();
const decodedNavigation = engine.decodeNavigationDocument(navigationDocument);
if (decodedNavigation.status === "decoded") {
  const normalized: boolean = decodedNavigation.normalized;
  const kind:
    | "student"
    | "updatable-student"
    | "pinned-student"
    | "persistent-student"
    | undefined = decodedNavigation.references[0]?.kind;
  void normalized;
  void kind;
} else {
  const path: string = decodedNavigation.diagnostic.path;
  void path;
}
const restoredNavigation = engine.restoreNavigationDocument(
  navigationDocument,
  {
    signal: new AbortController().signal,
  },
);
restoredNavigation.then((outcome) => {
  const navigationIntent: "none" | "replace" = outcome.navigationIntent;
  if (outcome.status === "recovered") {
    const reason:
      | "invalid-document"
      | "unavailable"
      | "denied"
      | "loader-failed"
      | "aborted" = outcome.recovery.reason;
    const failedPanelIndex: number | null = outcome.recovery.failedPanelIndex;
    void reason;
    void failedPanelIndex;
  } else {
    const recovery: null = outcome.recovery;
    void recovery;
  }
  void navigationIntent;
});
const [rootPanel] = engine.getSnapshot().panels;
if (!rootPanel) throw new Error("Canvas Engine did not create its Root Panel");
const rootId: PanelInstanceId = rootPanel.instanceId;
const opened = engine.open({ originId: rootId, panel: studentReference });
if (
  opened.status === "opened" ||
  opened.status === "reused" ||
  opened.status === "replaced"
) {
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
    | "not-closable"
    | "transition-blocked"
    | "transition-in-progress" = closeOutcome.reason;
  void closeReason;
}
const lifecycle: PanelLifecycle = {
  dirty: true,
  guard: (transition) => {
    const command: "open" | "close" = transition.command;
    void command;
    return { status: "confirm", message: "Unsaved changes" };
  },
  save: async ({ signal, transition }) => {
    const abortSignal: AbortSignal = signal;
    const command: "open" | "close" = transition.command;
    void abortSignal;
    void command;
  },
  discard: async ({ signal }) => {
    const abortSignal: AbortSignal = signal;
    void abortSignal;
  },
};
const unregisterLifecycle = engine.registerLifecycle({
  target: rootPanel.instanceRef,
  lifecycle,
});
unregisterLifecycle();
void engine.resolveTransition({ decision: "stay" });
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
