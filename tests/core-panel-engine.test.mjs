import assert from "node:assert/strict";
import test from "node:test";

import {
  createPanelEngine,
  definePanel,
  defineRootPanel,
} from "../packages/canvas-panels/dist/core/index.js";

test("the engine starts with one permanent host-defined Root Panel", () => {
  const root = defineRootPanel({ kind: "classes", title: "Classes" });
  const student = definePanel({
    kind: "student",
    title: ({ name }) => name,
  });
  const studentInput = {
    name: "Ada Lovelace",
    metadata: { source: "fixture" },
  };
  const studentReference = student.reference(studentInput);
  studentInput.name = "Mutated outside Canvas";
  studentInput.metadata.source = "mutated outside Canvas";
  const engine = createPanelEngine({ root, panels: [student] });
  const snapshot = engine.getSnapshot();
  const rootId = snapshot.activePanelId;

  assert.equal(snapshot.panels.length, 1);
  assert.match(rootId, /^canvas-panel-\d+-1$/);
  assert.deepEqual(snapshot.panels[0], {
    instanceId: rootId,
    kind: "classes",
    title: "Classes",
    isRoot: true,
    reference: root.reference,
  });
  assert.equal(snapshot.activePanelId, snapshot.panels[0].instanceId);
  assert.equal(studentReference.kind, "student");
  assert.deepEqual(studentReference.input, {
    name: "Ada Lovelace",
    metadata: { source: "fixture" },
  });
  assert.ok(Object.isFrozen(root));
  assert.ok(Object.isFrozen(student));
  assert.ok(Object.isFrozen(studentReference));
  assert.ok(Object.isFrozen(studentReference.input));
  assert.ok(Object.isFrozen(studentReference.input.metadata));
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.panels));
});

test("opening from an earlier Panel replaces its existing descendant branch", () => {
  const root = defineRootPanel({ kind: "classes", title: "Classes" });
  const student = definePanel({
    kind: "student",
    title: ({ name }) => name,
  });
  const engine = createPanelEngine({ root, panels: [student] });
  const rootId = engine.getSnapshot().activePanelId;

  engine.open({
    originId: rootId,
    panel: student.reference({ name: "Ada Lovelace" }),
  });
  const replacement = engine.open({
    originId: rootId,
    panel: student.reference({ name: "Grace Hopper" }),
  });
  const snapshot = engine.getSnapshot();

  assert.equal(replacement.status, "opened");
  assert.equal(snapshot.panels.length, 2);
  assert.deepEqual(
    snapshot.panels.map(({ title }) => title),
    ["Classes", "Grace Hopper"],
  );
  assert.equal(snapshot.activePanelId, replacement.instanceId);
});

test("a Panel registry rejects duplicate semantic Panel Kinds", () => {
  const root = defineRootPanel({ kind: "classes", title: "Classes" });
  const firstStudent = definePanel({
    kind: "student",
    title: ({ name }) => name,
  });
  const secondStudent = definePanel({
    kind: "student",
    title: ({ identifier }) => identifier,
  });

  assert.throws(
    () => createPanelEngine({ root, panels: [firstStudent, secondStudent] }),
    /Duplicate Panel Kind: student/,
  );
  assert.throws(
    () =>
      createPanelEngine({
        root,
        panels: [
          definePanel({
            kind: "classes",
            title: ({ name }) => name,
          }),
        ],
      }),
    /Duplicate Panel Kind: classes/,
  );
});

test("Panel references reject non-plain input objects", () => {
  class StudentInput {
    constructor(name) {
      this.name = name;
    }
  }
  const student = definePanel({
    kind: "student",
    title: ({ name }) => name,
  });

  assert.throws(
    () => student.reference(new StudentInput("Ada Lovelace")),
    /Panel input may contain only plain objects and arrays/,
  );

  const metadata = Symbol("metadata");
  assert.throws(
    () =>
      student.reference({
        name: "Ada Lovelace",
        [metadata]: "must not be dropped",
      }),
    /Panel input may not contain symbol-keyed properties/,
  );

  const invalidKey = definePanel({
    kind: "invalid-key",
    deduplication: "reuse",
    key: () => 42,
    title: ({ name }) => name,
  });
  assert.throws(
    () => invalidKey.reference({ name: "Ada Lovelace" }),
    /Panel Keys must be non-empty strings/,
  );
});

test("one failing subscriber cannot prevent the remaining subscribers", () => {
  const root = defineRootPanel({ kind: "classes", title: "Classes" });
  const student = definePanel({
    kind: "student",
    title: ({ name }) => name,
  });
  let subscriberError;
  const engine = createPanelEngine({
    root,
    panels: [student],
    onSubscriberError: (error) => {
      subscriberError = error;
    },
  });
  const notifications = [];
  engine.subscribe(() => {
    notifications.push("first");
    throw new Error("first subscriber failed");
  });
  engine.subscribe(() => notifications.push("second"));

  const child = engine.open({
    originId: engine.getSnapshot().activePanelId,
    panel: student.reference({ name: "Ada Lovelace" }),
  });
  assert.equal(child.status, "opened");
  assert.deepEqual(notifications, ["first", "second"]);
  assert.equal(engine.getSnapshot().panels.length, 2);
  assert.equal(engine.getSnapshot().activePanelId, child.instanceId);
  assert.ok(subscriberError instanceof AggregateError);
  assert.match(subscriberError.message, /Panel Engine subscriber failed/);
});

test("publication notifies the subscriber set captured at its start", () => {
  const root = defineRootPanel({ kind: "classes", title: "Classes" });
  const student = definePanel({
    kind: "student",
    title: ({ name }) => name,
  });
  const engine = createPanelEngine({ root, panels: [student] });
  const notifications = [];
  let unsubscribeSecond = () => {};

  engine.subscribe(() => {
    notifications.push("first");
    unsubscribeSecond();
    engine.subscribe(() => notifications.push("late"));
  });
  unsubscribeSecond = engine.subscribe(() => notifications.push("second"));

  engine.open({
    originId: engine.getSnapshot().activePanelId,
    panel: student.reference({ name: "Ada Lovelace" }),
  });

  assert.deepEqual(notifications, ["first", "second"]);
});

test("open and close publish immutable snapshots while preserving Root", () => {
  const root = defineRootPanel({ kind: "classes", title: "Classes" });
  const student = definePanel({
    kind: "student",
    title: ({ name }) => name,
  });
  const engine = createPanelEngine({ root, panels: [student] });
  const initialSnapshot = engine.getSnapshot();
  const notifications = [];
  const unsubscribe = engine.subscribe(() => {
    notifications.push(engine.getSnapshot());
  });

  const openedChild = engine.open({
    originId: initialSnapshot.panels[0].instanceId,
    panel: student.reference({ name: "Ada Lovelace" }),
  });
  assert.equal(openedChild.status, "opened");
  const childId = openedChild.instanceId;
  const openedSnapshot = engine.getSnapshot();

  assert.notEqual(childId, initialSnapshot.activePanelId);
  assert.notEqual(openedSnapshot, initialSnapshot);
  assert.equal(openedSnapshot.panels.length, 2);
  assert.deepEqual(openedSnapshot.panels[1], {
    instanceId: childId,
    kind: "student",
    title: "Ada Lovelace",
    isRoot: false,
    reference: student.reference({ name: "Ada Lovelace" }),
  });
  assert.equal(openedSnapshot.activePanelId, childId);
  assert.ok(Object.isFrozen(openedSnapshot));
  assert.ok(Object.isFrozen(openedSnapshot.panels));
  assert.equal(notifications.length, 1);

  assert.equal(engine.close(childId), true);
  const closedSnapshot = engine.getSnapshot();
  assert.equal(closedSnapshot.panels.length, 1);
  assert.equal(
    closedSnapshot.panels[0].instanceId,
    initialSnapshot.panels[0].instanceId,
  );
  assert.equal(
    closedSnapshot.activePanelId,
    initialSnapshot.panels[0].instanceId,
  );
  assert.equal(notifications.length, 2);

  assert.equal(engine.close(initialSnapshot.panels[0].instanceId), false);
  assert.equal(engine.getSnapshot(), closedSnapshot);
  assert.equal(notifications.length, 2);

  unsubscribe();
  engine.open({
    originId: initialSnapshot.panels[0].instanceId,
    panel: student.reference({ name: "Grace Hopper" }),
  });
  assert.equal(notifications.length, 2);
});

test("reuse navigates to a matching semantic Panel and removes its dependent suffix", () => {
  const root = defineRootPanel({ kind: "classes", title: "Classes" });
  const classPanel = definePanel({
    kind: "class",
    deduplication: "reuse",
    key: ({ classId }) => classId,
    title: ({ name }) => name,
  });
  const learner = definePanel({
    kind: "learner",
    deduplication: "allow-many",
    title: ({ name }) => name,
  });
  const engine = createPanelEngine({ root, panels: [classPanel, learner] });
  const rootId = engine.getSnapshot().activePanelId;

  const openedClass = engine.open({
    originId: rootId,
    panel: classPanel.reference({ classId: "class-a", name: "Class A" }),
  });
  assert.equal(openedClass.status, "opened");
  const classId = openedClass.instanceId;
  const openedLearner = engine.open({
    originId: classId,
    panel: learner.reference({ learnerId: "learner-a", name: "Ada" }),
  });
  assert.equal(openedLearner.status, "opened");

  const reusedClass = engine.open({
    originId: rootId,
    panel: classPanel.reference({ classId: "class-a", name: "Class A" }),
  });
  const snapshot = engine.getSnapshot();

  assert.deepEqual(reusedClass, {
    status: "reused",
    instanceId: classId,
    removedPanelIds: [openedLearner.instanceId],
  });
  assert.equal(snapshot.panels.length, 2);
  assert.equal(snapshot.activePanelId, classId);
  assert.equal(snapshot.deepestPanelId, classId);
  assert.deepEqual(snapshot.visiblePanelIds, [rootId, classId]);
  assert.equal(snapshot.panels[1].panelKey, "class-a");
});

test("replace creates a fresh instance for a matching semantic Panel", () => {
  const root = defineRootPanel({ kind: "tools", title: "Tools" });
  const uploader = definePanel({
    kind: "uploader",
    deduplication: "replace",
    key: ({ slot }) => slot,
    title: ({ name }) => name,
  });
  const engine = createPanelEngine({ root, panels: [uploader] });
  const rootId = engine.getSnapshot().activePanelId;
  const first = engine.open({
    originId: rootId,
    panel: uploader.reference({ slot: "primary", name: "First upload" }),
  });
  assert.equal(first.status, "opened");

  const replacement = engine.open({
    originId: rootId,
    panel: uploader.reference({ slot: "primary", name: "Fresh upload" }),
  });

  assert.equal(replacement.status, "replaced");
  assert.equal(replacement.replacedInstanceId, first.instanceId);
  assert.notEqual(replacement.instanceId, first.instanceId);
  assert.deepEqual(replacement.removedPanelIds, [first.instanceId]);
  assert.deepEqual(
    engine.getSnapshot().panels.map(({ title }) => title),
    ["Tools", "Fresh upload"],
  );
});

test("allow-many permits matching semantic Panels with distinct Instance IDs", () => {
  const root = defineRootPanel({ kind: "drafts", title: "Drafts" });
  const draft = definePanel({
    kind: "draft",
    deduplication: "allow-many",
    key: ({ template }) => template,
    title: ({ name }) => name,
  });
  const engine = createPanelEngine({ root, panels: [draft] });
  const first = engine.open({
    panel: draft.reference({ template: "blank", name: "First draft" }),
  });
  assert.equal(first.status, "opened");
  const second = engine.open({
    originId: first.instanceId,
    panel: draft.reference({ template: "blank", name: "Second draft" }),
  });

  assert.equal(second.status, "opened");
  assert.notEqual(second.instanceId, first.instanceId);
  assert.deepEqual(
    engine.getSnapshot().panels.map(({ panelKey }) => panelKey),
    [undefined, "blank", "blank"],
  );
});

test("stale and invalid Origins return typed rejections without publishing", () => {
  const root = defineRootPanel({ kind: "classes", title: "Classes" });
  const classPanel = definePanel({
    kind: "class",
    deduplication: "reuse",
    key: ({ classId }) => classId,
    title: ({ name }) => name,
  });
  const engine = createPanelEngine({ root, panels: [classPanel] });
  const rootId = engine.getSnapshot().activePanelId;
  const first = engine.open({
    originId: rootId,
    panel: classPanel.reference({ classId: "class-a", name: "Class A" }),
  });
  assert.equal(first.status, "opened");
  const second = engine.open({
    originId: rootId,
    panel: classPanel.reference({ classId: "class-b", name: "Class B" }),
  });
  assert.equal(second.status, "opened");
  const beforeRejections = engine.getSnapshot();

  assert.deepEqual(
    engine.open({
      originId: first.instanceId,
      panel: classPanel.reference({ classId: "class-c", name: "Class C" }),
    }),
    {
      status: "rejected",
      reason: "stale-origin",
      originId: first.instanceId,
    },
  );
  assert.deepEqual(
    engine.open({
      originId: "foreign-panel-id",
      panel: classPanel.reference({ classId: "class-c", name: "Class C" }),
    }),
    {
      status: "rejected",
      reason: "invalid-origin",
      originId: "foreign-panel-id",
    },
  );
  assert.equal(engine.getSnapshot(), beforeRejections);
});

test("Panel Instance IDs distinguish separate engine runtimes", () => {
  const root = defineRootPanel({ kind: "classes", title: "Classes" });
  const classPanel = definePanel({
    kind: "class",
    title: ({ name }) => name,
  });
  const firstEngine = createPanelEngine({ root, panels: [classPanel] });
  const secondEngine = createPanelEngine({ root, panels: [classPanel] });
  const firstRootId = firstEngine.getSnapshot().activePanelId;
  const secondRootId = secondEngine.getSnapshot().activePanelId;

  assert.notEqual(firstRootId, secondRootId);
  assert.deepEqual(
    secondEngine.open({
      originId: firstRootId,
      panel: classPanel.reference({ name: "Class A" }),
    }),
    {
      status: "rejected",
      reason: "invalid-origin",
      originId: firstRootId,
    },
  );
});

test("an engine rejects a same-kind reference from another Panel definition", () => {
  const root = defineRootPanel({ kind: "classes", title: "Classes" });
  const registeredClass = definePanel({
    kind: "class",
    deduplication: "reuse",
    key: ({ classId }) => classId,
    title: ({ name }) => name,
  });
  const foreignClass = definePanel({
    kind: "class",
    deduplication: "allow-many",
    title: ({ name }) => name,
  });
  const engine = createPanelEngine({ root, panels: [registeredClass] });
  const beforeRejection = engine.getSnapshot();

  assert.deepEqual(
    engine.open({ panel: foreignClass.reference({ name: "Class A" }) }),
    {
      status: "rejected",
      reason: "invalid-panel-reference",
      originId: beforeRejection.activePanelId,
      panelKind: "class",
    },
  );
  assert.equal(engine.getSnapshot(), beforeRejection);
});

test("reuse preserves an Origin below the match and distinguishes Active from Deepest", () => {
  const root = defineRootPanel({ kind: "classes", title: "Classes" });
  const classPanel = definePanel({
    kind: "class",
    deduplication: "reuse",
    key: ({ classId }) => classId,
    title: ({ name }) => name,
  });
  const learner = definePanel({
    kind: "learner",
    title: ({ name }) => name,
  });
  const engine = createPanelEngine({ root, panels: [classPanel, learner] });
  const openedClass = engine.open({
    panel: classPanel.reference({ classId: "class-a", name: "Class A" }),
  });
  assert.equal(openedClass.status, "opened");
  const openedLearner = engine.open({
    originId: openedClass.instanceId,
    panel: learner.reference({ name: "Ada Lovelace" }),
  });
  assert.equal(openedLearner.status, "opened");

  const reusedClass = engine.open({
    originId: openedLearner.instanceId,
    panel: classPanel.reference({ classId: "class-a", name: "Class A" }),
  });
  const snapshot = engine.getSnapshot();

  assert.deepEqual(reusedClass, {
    status: "reused",
    instanceId: openedClass.instanceId,
    removedPanelIds: [],
  });
  assert.equal(snapshot.panels.length, 3);
  assert.equal(snapshot.activePanelId, openedClass.instanceId);
  assert.equal(snapshot.deepestPanelId, openedLearner.instanceId);
  assert.deepEqual(snapshot.visiblePanelIds, [
    snapshot.panels[0].instanceId,
    openedClass.instanceId,
    openedLearner.instanceId,
  ]);
});

test("replace rejects a matching semantic identity at or before its Origin", () => {
  const root = defineRootPanel({ kind: "tools", title: "Tools" });
  const uploader = definePanel({
    kind: "uploader",
    deduplication: "replace",
    key: ({ slot }) => slot,
    title: ({ name }) => name,
  });
  const details = definePanel({
    kind: "details",
    title: ({ name }) => name,
  });
  const engine = createPanelEngine({ root, panels: [uploader, details] });
  const openedUploader = engine.open({
    panel: uploader.reference({ slot: "primary", name: "Uploader" }),
  });
  assert.equal(openedUploader.status, "opened");
  const openedDetails = engine.open({
    originId: openedUploader.instanceId,
    panel: details.reference({ name: "Upload details" }),
  });
  assert.equal(openedDetails.status, "opened");
  const beforeRejection = engine.getSnapshot();

  assert.deepEqual(
    engine.open({
      originId: openedDetails.instanceId,
      panel: uploader.reference({ slot: "primary", name: "Fresh uploader" }),
    }),
    {
      status: "rejected",
      reason: "deduplication-conflict",
      originId: openedDetails.instanceId,
      panelKind: "uploader",
      panelKey: "primary",
    },
  );
  assert.equal(engine.getSnapshot(), beforeRejection);
});
