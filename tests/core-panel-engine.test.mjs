import assert from "node:assert/strict";
import test from "node:test";

import {
  createPanelEngine,
  definePanel,
  defineRootPanel,
} from "../packages/canvas-panels/dist/core/index.js";

function targetFor(engine, panelId) {
  const panel = engine
    .getSnapshot()
    .panels.find((candidate) => candidate.instanceId === panelId);
  if (!panel) throw new Error(`Missing command target: ${panelId}`);
  return panel.instanceRef;
}

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
    instanceRef: snapshot.panels[0].instanceRef,
    kind: "classes",
    title: "Classes",
    isRoot: true,
    closable: false,
    reference: root.reference,
  });
  assert.equal(snapshot.activePanelId, snapshot.panels[0].instanceId);
  assert.match(snapshot.workspaceId, /^canvas-workspace-\d+$/);
  assert.equal(snapshot.version, 0);
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
    instanceRef: openedSnapshot.panels[1].instanceRef,
    kind: "student",
    title: "Ada Lovelace",
    isRoot: false,
    closable: true,
    reference: student.reference({ name: "Ada Lovelace" }),
  });
  assert.equal(openedSnapshot.activePanelId, childId);
  assert.ok(Object.isFrozen(openedSnapshot));
  assert.ok(Object.isFrozen(openedSnapshot.panels));
  assert.equal(notifications.length, 1);

  assert.deepEqual(
    engine.close({
      target: targetFor(engine, childId),
    }),
    {
      status: "closed",
      panelId: childId,
      removedPanelIds: [childId],
      activePanelId: initialSnapshot.panels[0].instanceId,
      navigationIntent: "push",
    },
  );
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

  assert.deepEqual(
    engine.close({
      target: targetFor(engine, initialSnapshot.panels[0].instanceId),
    }),
    {
      status: "rejected",
      command: "close",
      reason: "root-panel",
      panelId: initialSnapshot.panels[0].instanceId,
    },
  );
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

test("an engine rejects references from unregistered Panel definitions", () => {
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
  const foreignReport = definePanel({
    kind: "report",
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
  assert.deepEqual(
    engine.open({ panel: foreignReport.reference({ name: "Report A" }) }),
    {
      status: "rejected",
      reason: "invalid-panel-reference",
      originId: beforeRejection.activePanelId,
      panelKind: "report",
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

test("a Panel update policy validates typed updates and commits complete descriptors atomically", () => {
  const root = defineRootPanel({ kind: "classes", title: "Classes" });
  const classPanel = definePanel({
    kind: "class",
    title: ({ name }) => name,
    update: {
      validate: (update) =>
        typeof update === "object" &&
        update !== null &&
        "type" in update &&
        (update.type === "rename" || update.type === "noop") &&
        (update.type !== "rename" ||
          ("name" in update && typeof update.name === "string")),
      validateResult: (value) =>
        typeof value === "object" &&
        value !== null &&
        "classId" in value &&
        typeof value.classId === "string" &&
        "name" in value &&
        typeof value.name === "string",
      apply: (current, update) =>
        update.type === "noop" ? current : { ...current, name: update.name },
      navigation: "replace",
    },
  });
  const engine = createPanelEngine({ root, panels: [classPanel] });
  const opened = engine.open({
    panel: classPanel.reference({ classId: "class-a", name: "Class A" }),
  });
  assert.equal(opened.status, "opened");
  if (opened.status !== "opened") throw new Error("Expected opened Class");

  assert.deepEqual(
    engine.update({
      definition: classPanel,
      target: targetFor(engine, opened.instanceId),
      update: { type: "rename", name: "Class Alpha" },
    }),
    {
      status: "updated",
      panelId: opened.instanceId,
      navigationIntent: "replace",
    },
  );
  const updatedSnapshot = engine.getSnapshot();
  assert.equal(updatedSnapshot.version, 2);
  assert.equal(updatedSnapshot.panels[1].title, "Class Alpha");
  assert.deepEqual(updatedSnapshot.panels[1].reference.input, {
    classId: "class-a",
    name: "Class Alpha",
  });
  assert.equal(updatedSnapshot.panels[1].instanceId, opened.instanceId);

  assert.deepEqual(
    engine.update({
      definition: classPanel,
      target: targetFor(engine, opened.instanceId),
      update: { type: "noop" },
    }),
    {
      status: "unchanged",
      command: "update",
      panelId: opened.instanceId,
      navigationIntent: "none",
    },
  );
  assert.equal(engine.getSnapshot(), updatedSnapshot);

  assert.deepEqual(
    engine.update({
      definition: classPanel,
      target: targetFor(engine, opened.instanceId),
      update: { name: "arbitrary shallow merge" },
    }),
    {
      status: "rejected",
      command: "update",
      reason: "invalid-update",
      panelId: opened.instanceId,
    },
  );
  assert.equal(engine.getSnapshot(), updatedSnapshot);

  const foreignClassPanel = definePanel({
    kind: "class",
    title: ({ name }) => name,
  });
  assert.deepEqual(
    engine.update({
      definition: foreignClassPanel,
      target: targetFor(engine, opened.instanceId),
      update: { type: "noop" },
    }),
    {
      status: "rejected",
      command: "update",
      reason: "invalid-panel-reference",
      panelId: opened.instanceId,
    },
  );
  assert.equal(engine.getSnapshot(), updatedSnapshot);
});

test("Panel definitions capture immutable update policies at registration", () => {
  const policy = {
    validate: (update) => update?.type === "rename",
    validateResult: (value) => typeof value?.name === "string",
    apply: (current, update) => ({ ...current, name: update.name }),
    navigation: "replace",
  };
  const root = defineRootPanel({ kind: "root", title: "Root" });
  const record = definePanel({
    kind: "record",
    title: ({ name }) => name,
    update: policy,
  });
  assert.ok(Object.isFrozen(record.update));
  assert.notEqual(record.update, policy);
  policy.apply = () => ({ name: "Mutated policy" });

  const engine = createPanelEngine({ root, panels: [record] });
  const opened = engine.open({ panel: record.reference({ name: "Original" }) });
  if (opened.status !== "opened") throw new Error("Expected opened Record");
  assert.deepEqual(
    engine.update({
      definition: record,
      target: targetFor(engine, opened.instanceId),
      update: { type: "rename", name: "Updated" },
    }),
    {
      status: "updated",
      panelId: opened.instanceId,
      navigationIntent: "replace",
    },
  );
  assert.equal(engine.getSnapshot().panels[1].title, "Updated");
});

test("activate changes Active without collapsing Deepest and reports no-op activation", () => {
  const root = defineRootPanel({ kind: "classes", title: "Classes" });
  const classPanel = definePanel({
    kind: "class",
    title: ({ name }) => name,
  });
  const learner = definePanel({
    kind: "learner",
    title: ({ name }) => name,
  });
  const engine = createPanelEngine({ root, panels: [classPanel, learner] });
  const openedClass = engine.open({
    panel: classPanel.reference({ name: "Class A" }),
  });
  const openedLearner = engine.open({
    panel: learner.reference({ name: "Learner A" }),
  });
  assert.equal(openedClass.status, "opened");
  assert.equal(openedLearner.status, "opened");
  if (openedClass.status !== "opened" || openedLearner.status !== "opened") {
    throw new Error("Expected open outcomes");
  }

  assert.deepEqual(
    engine.activate({
      target: targetFor(engine, openedClass.instanceId),
    }),
    {
      status: "activated",
      panelId: openedClass.instanceId,
      navigationIntent: "replace",
    },
  );
  const activated = engine.getSnapshot();
  assert.equal(activated.version, 3);
  assert.equal(activated.activePanelId, openedClass.instanceId);
  assert.equal(activated.deepestPanelId, openedLearner.instanceId);

  assert.deepEqual(
    engine.activate({
      target: targetFor(engine, openedClass.instanceId),
    }),
    {
      status: "unchanged",
      command: "activate",
      panelId: openedClass.instanceId,
      navigationIntent: "none",
    },
  );
  assert.equal(engine.getSnapshot(), activated);
});

test("collapse retains its target, removes descendants, and rejects stale targets atomically", () => {
  const root = defineRootPanel({ kind: "classes", title: "Classes" });
  const classPanel = definePanel({
    kind: "class",
    title: ({ name }) => name,
  });
  const learner = definePanel({
    kind: "learner",
    title: ({ name }) => name,
  });
  const engine = createPanelEngine({ root, panels: [classPanel, learner] });
  const openedClass = engine.open({
    panel: classPanel.reference({ name: "Class A" }),
  });
  const openedLearner = engine.open({
    panel: learner.reference({ name: "Learner A" }),
  });
  if (openedClass.status !== "opened" || openedLearner.status !== "opened") {
    throw new Error("Expected open outcomes");
  }

  const beforeNoop = engine.getSnapshot();
  const learnerTarget = targetFor(engine, openedLearner.instanceId);
  assert.deepEqual(
    engine.collapse({
      target: learnerTarget,
    }),
    {
      status: "unchanged",
      command: "collapse",
      panelId: openedLearner.instanceId,
      navigationIntent: "none",
    },
  );
  assert.equal(engine.getSnapshot(), beforeNoop);

  assert.deepEqual(
    engine.collapse({
      target: targetFor(engine, openedClass.instanceId),
    }),
    {
      status: "collapsed",
      panelId: openedClass.instanceId,
      removedPanelIds: [openedLearner.instanceId],
      navigationIntent: "push",
    },
  );
  const collapsed = engine.getSnapshot();
  assert.equal(collapsed.version, 3);
  assert.equal(collapsed.activePanelId, openedClass.instanceId);
  assert.equal(collapsed.deepestPanelId, openedClass.instanceId);

  assert.deepEqual(
    engine.collapse({
      target: learnerTarget,
    }),
    {
      status: "rejected",
      command: "collapse",
      reason: "stale-panel",
      panelId: openedLearner.instanceId,
    },
  );
  assert.equal(engine.getSnapshot(), collapsed);
});

test("close removes a dependent suffix while enforcing Root and definition closability", () => {
  const root = defineRootPanel({ kind: "classes", title: "Classes" });
  const pinned = definePanel({
    kind: "pinned",
    closable: false,
    title: ({ name }) => name,
  });
  const details = definePanel({
    kind: "details",
    title: ({ name }) => name,
  });
  const engine = createPanelEngine({ root, panels: [pinned, details] });
  const openedPinned = engine.open({
    panel: pinned.reference({ name: "Pinned" }),
  });
  const openedDetails = engine.open({
    panel: details.reference({ name: "Details" }),
  });
  if (openedPinned.status !== "opened" || openedDetails.status !== "opened") {
    throw new Error("Expected open outcomes");
  }
  const beforeRejections = engine.getSnapshot();

  assert.deepEqual(
    engine.close({
      target: beforeRejections.panels[0].instanceRef,
    }),
    {
      status: "rejected",
      command: "close",
      reason: "root-panel",
      panelId: beforeRejections.panels[0].instanceId,
    },
  );
  assert.deepEqual(
    engine.close({
      target: targetFor(engine, openedPinned.instanceId),
    }),
    {
      status: "rejected",
      command: "close",
      reason: "not-closable",
      panelId: openedPinned.instanceId,
    },
  );
  assert.equal(engine.getSnapshot(), beforeRejections);

  assert.deepEqual(engine.close(), {
    status: "closed",
    panelId: openedDetails.instanceId,
    removedPanelIds: [openedDetails.instanceId],
    activePanelId: openedPinned.instanceId,
    navigationIntent: "push",
  });
  assert.equal(engine.getSnapshot().version, 3);
  assert.equal(engine.getSnapshot().deepestPanelId, openedPinned.instanceId);
});

test("update failures reject without publishing partially validated descriptors", () => {
  const root = defineRootPanel({ kind: "root", title: "Root" });
  const editor = definePanel({
    kind: "editor",
    deduplication: "reuse",
    key: ({ id }) => id,
    title: ({ name }) => {
      if (name === "invalid") throw new Error("invalid title input");
      return name;
    },
    update: {
      validate: (update) => {
        if (update?.type === "validator-failure") {
          throw new Error("validator failure");
        }
        return typeof update?.type === "string";
      },
      validateResult: (value) =>
        typeof value === "object" &&
        value !== null &&
        "id" in value &&
        typeof value.id === "string" &&
        "name" in value &&
        typeof value.name === "string",
      apply: (current, update) =>
        update.type === "change-identity"
          ? { ...current, id: "changed" }
          : { ...current, name: update.name },
      navigation: "none",
    },
  });
  const engine = createPanelEngine({ root, panels: [editor] });
  const opened = engine.open({
    panel: editor.reference({ id: "editor-a", name: "Editor A" }),
  });
  if (opened.status !== "opened") throw new Error("Expected opened Editor");
  const beforeFailures = engine.getSnapshot();

  for (const [update, reason] of [
    [{ type: "validator-failure" }, "invalid-update"],
    [{ type: "rename", name: "invalid" }, "invalid-update"],
    [{ type: "invalid-result" }, "invalid-update"],
    [{ type: "change-identity" }, "identity-change"],
  ]) {
    assert.deepEqual(
      engine.update({
        definition: editor,
        target: targetFor(engine, opened.instanceId),
        update,
      }),
      {
        status: "rejected",
        command: "update",
        reason,
        panelId: opened.instanceId,
      },
    );
    assert.equal(engine.getSnapshot(), beforeFailures);
  }
});

test("versioned commands isolate Workspaces and cannot remove non-closable descendants", () => {
  const root = defineRootPanel({ kind: "root", title: "Root" });
  const branch = definePanel({
    kind: "branch",
    deduplication: "reuse",
    key: ({ id }) => id,
    title: ({ name }) => name,
  });
  const pinned = definePanel({
    kind: "pinned",
    closable: false,
    title: ({ name }) => name,
  });
  const leaf = definePanel({
    kind: "leaf",
    title: ({ name }) => name,
  });
  const engine = createPanelEngine({ root, panels: [branch, pinned, leaf] });
  const openedBranch = engine.open({
    panel: branch.reference({ id: "branch-a", name: "Branch A" }),
  });
  const openedPinned = engine.open({
    panel: pinned.reference({ name: "Pinned" }),
  });
  const openedLeaf = engine.open({ panel: leaf.reference({ name: "Leaf" }) });
  if (
    openedBranch.status !== "opened" ||
    openedPinned.status !== "opened" ||
    openedLeaf.status !== "opened"
  ) {
    throw new Error("Expected branch fixture to open");
  }
  const branchTarget = targetFor(engine, openedBranch.instanceId);
  const pinnedTarget = targetFor(engine, openedPinned.instanceId);
  const beforeRejections = engine.getSnapshot();
  let rejectionNotifications = 0;
  const unsubscribe = engine.subscribe(() => rejectionNotifications++);

  const forgedTarget = Object.freeze({ ...branchTarget });
  assert.deepEqual(engine.activate({ target: forgedTarget }), {
    status: "rejected",
    command: "activate",
    reason: "invalid-panel-reference",
    panelId: openedBranch.instanceId,
  });
  assert.deepEqual(
    engine.update({
      definition: branch,
      target: forgedTarget,
      update: {},
    }),
    {
      status: "rejected",
      command: "update",
      reason: "invalid-panel-reference",
      panelId: openedBranch.instanceId,
    },
  );
  assert.deepEqual(engine.collapse({ target: forgedTarget }), {
    status: "rejected",
    command: "collapse",
    reason: "invalid-panel-reference",
    panelId: openedBranch.instanceId,
  });
  assert.deepEqual(engine.close({ target: forgedTarget }), {
    status: "rejected",
    command: "close",
    reason: "invalid-panel-reference",
    panelId: openedBranch.instanceId,
  });
  assert.deepEqual(
    engine.activate({
      target: { ...branchTarget, kind: "forged-kind" },
    }),
    {
      status: "rejected",
      command: "activate",
      reason: "invalid-panel-reference",
      panelId: openedBranch.instanceId,
    },
  );
  assert.deepEqual(
    engine.close({
      target: branchTarget,
    }),
    {
      status: "rejected",
      command: "close",
      reason: "not-closable",
      panelId: openedPinned.instanceId,
    },
  );
  assert.deepEqual(
    engine.collapse({
      target: branchTarget,
    }),
    {
      status: "rejected",
      command: "collapse",
      reason: "not-closable",
      panelId: openedPinned.instanceId,
    },
  );
  assert.deepEqual(
    engine.open({
      originId: openedBranch.instanceId,
      panel: leaf.reference({ name: "Replacement" }),
    }),
    {
      status: "rejected",
      reason: "not-closable",
      originId: openedBranch.instanceId,
      panelId: openedPinned.instanceId,
    },
  );
  assert.deepEqual(
    engine.open({
      originId: beforeRejections.panels[0].instanceId,
      panel: branch.reference({ id: "branch-a", name: "Branch A" }),
    }),
    {
      status: "rejected",
      reason: "not-closable",
      originId: beforeRejections.panels[0].instanceId,
      panelId: openedPinned.instanceId,
    },
  );
  assert.equal(engine.getSnapshot(), beforeRejections);
  assert.equal(rejectionNotifications, 0);
  unsubscribe();

  const foreign = createPanelEngine({ root, panels: [branch, pinned, leaf] });
  assert.deepEqual(
    foreign.close({
      target: pinnedTarget,
    }),
    {
      status: "rejected",
      command: "close",
      reason: "foreign-workspace",
      panelId: openedPinned.instanceId,
    },
  );
  assert.equal(foreign.getSnapshot().version, 0);
});

test("a dirty Panel stages close confirmation and Stay preserves its work", async () => {
  const root = defineRootPanel({ kind: "root", title: "Root" });
  const editor = definePanel({
    kind: "editor",
    title: ({ name }) => name,
  });
  const engine = createPanelEngine({ root, panels: [editor] });
  const opened = engine.open({
    panel: editor.reference({ name: "Draft article" }),
  });
  if (opened.status !== "opened") throw new Error("Expected editor to open");
  const target = targetFor(engine, opened.instanceId);
  const guardCalls = [];
  engine.registerLifecycle({
    target,
    lifecycle: {
      guard: (transition) => {
        guardCalls.push(transition);
        return {
          status: "confirm",
          message: "Save changes before closing?",
        };
      },
      save: async () => {},
      discard: async () => {},
    },
  });
  const beforeClose = engine.getSnapshot();

  assert.deepEqual(engine.close({ target }), {
    status: "confirmation-required",
    command: "close",
    panelIds: [opened.instanceId],
  });
  const awaitingDecision = engine.getSnapshot();
  assert.equal(awaitingDecision.version, beforeClose.version);
  assert.equal(awaitingDecision.panels, beforeClose.panels);
  assert.deepEqual(awaitingDecision.transition, {
    command: "close",
    panels: [
      {
        panelId: opened.instanceId,
        panelTitle: "Draft article",
        message: "Save changes before closing?",
      },
    ],
  });
  assert.deepEqual(guardCalls, [
    {
      command: "close",
      removedPanelIds: [opened.instanceId],
    },
  ]);

  assert.deepEqual(await engine.resolveTransition({ decision: "stay" }), {
    status: "stayed",
    command: "close",
    panelIds: [opened.instanceId],
  });
  const stayed = engine.getSnapshot();
  assert.equal(stayed.version, beforeClose.version);
  assert.equal(stayed.panels, beforeClose.panels);
  assert.equal(stayed.transition, null);
});

test("Save and Discard each run their lifecycle operation and commit close once", async () => {
  for (const decision of ["save", "discard"]) {
    const root = defineRootPanel({ kind: "root", title: "Root" });
    const editor = definePanel({
      kind: "editor",
      title: ({ name }) => name,
    });
    const engine = createPanelEngine({ root, panels: [editor] });
    const opened = engine.open({
      panel: editor.reference({ name: `${decision} draft` }),
    });
    if (opened.status !== "opened") throw new Error("Expected editor to open");
    const target = targetFor(engine, opened.instanceId);
    const operations = [];
    engine.registerLifecycle({
      target,
      lifecycle: {
        guard: () => ({ status: "confirm", message: "Unsaved changes" }),
        save: async () => operations.push("save"),
        discard: async () => operations.push("discard"),
      },
    });
    const beforeClose = engine.getSnapshot();
    engine.close({ target });

    const resolution = await engine.resolveTransition({ decision });
    assert.equal(resolution.status, "committed");
    assert.equal(resolution.decision, decision);
    assert.equal(resolution.command, "close");
    assert.deepEqual(resolution.panelIds, [opened.instanceId]);
    assert.equal(resolution.outcome.status, "closed");
    assert.equal(operations.length, 1);
    assert.equal(operations[0], decision);
    assert.equal(engine.getSnapshot().panels.length, 1);
    assert.equal(engine.getSnapshot().version, beforeClose.version + 1);
    assert.equal(engine.getSnapshot().transition, null);
    assert.deepEqual(await engine.resolveTransition({ decision }), {
      status: "rejected",
      reason: "no-pending-transition",
    });
  }
});

test("multiple dirty Panels are confirmed and saved deepest-first before one atomic close", async () => {
  const root = defineRootPanel({ kind: "root", title: "Root" });
  const editor = definePanel({ kind: "editor", title: ({ name }) => name });
  const engine = createPanelEngine({ root, panels: [editor] });
  const parent = engine.open({
    panel: editor.reference({ name: "Parent draft" }),
  });
  if (parent.status !== "opened") throw new Error("Expected parent editor");
  const child = engine.open({
    originId: parent.instanceId,
    panel: editor.reference({ name: "Child draft" }),
  });
  if (child.status !== "opened") throw new Error("Expected child editor");
  const calls = [];

  for (const [opened, title] of [
    [parent, "Parent draft"],
    [child, "Child draft"],
  ]) {
    engine.registerLifecycle({
      target: targetFor(engine, opened.instanceId),
      lifecycle: {
        dirty: true,
        guard: () => {
          calls.push(`guard:${title}`);
          return { status: "confirm", message: `Save ${title}?` };
        },
        save: async () => calls.push(`save:${title}`),
        discard: async () => calls.push(`discard:${title}`),
      },
    });
  }
  const before = engine.getSnapshot();

  assert.deepEqual(
    engine.close({ target: targetFor(engine, parent.instanceId) }),
    {
      status: "confirmation-required",
      command: "close",
      panelIds: [child.instanceId, parent.instanceId],
    },
  );
  assert.deepEqual(calls, ["guard:Child draft", "guard:Parent draft"]);
  assert.deepEqual(engine.getSnapshot().transition, {
    command: "close",
    panels: [
      {
        panelId: child.instanceId,
        panelTitle: "Child draft",
        message: "Save Child draft?",
      },
      {
        panelId: parent.instanceId,
        panelTitle: "Parent draft",
        message: "Save Parent draft?",
      },
    ],
  });
  assert.equal(engine.getSnapshot().version, before.version);
  assert.equal(engine.getSnapshot().panels, before.panels);

  const resolution = await engine.resolveTransition({ decision: "save" });
  assert.equal(resolution.status, "committed");
  assert.deepEqual(resolution.panelIds, [child.instanceId, parent.instanceId]);
  assert.deepEqual(calls, [
    "guard:Child draft",
    "guard:Parent draft",
    "save:Child draft",
    "save:Parent draft",
  ]);
  assert.equal(engine.getSnapshot().panels.length, 1);
  assert.equal(engine.getSnapshot().version, before.version + 1);
});

test("a failed aggregate save keeps the stack pending and retries only unfinished work with one AbortSignal", async () => {
  const root = defineRootPanel({ kind: "root", title: "Root" });
  const editor = definePanel({ kind: "editor", title: ({ name }) => name });
  const engine = createPanelEngine({ root, panels: [editor] });
  const parent = engine.open({ panel: editor.reference({ name: "Parent" }) });
  if (parent.status !== "opened") throw new Error("Expected parent");
  const child = engine.open({
    originId: parent.instanceId,
    panel: editor.reference({ name: "Child" }),
  });
  if (child.status !== "opened") throw new Error("Expected child");
  const calls = [];
  const signals = [];
  let parentAttempts = 0;

  engine.registerLifecycle({
    target: targetFor(engine, parent.instanceId),
    lifecycle: {
      dirty: true,
      guard: () => ({ status: "confirm", message: "Save Parent?" }),
      save: async ({ signal }) => {
        signals.push(signal);
        calls.push("save:Parent");
        parentAttempts += 1;
        if (parentAttempts === 1) throw new Error("Parent save failed");
      },
      discard: async () => {},
    },
  });
  engine.registerLifecycle({
    target: targetFor(engine, child.instanceId),
    lifecycle: {
      dirty: true,
      guard: () => ({ status: "confirm", message: "Save Child?" }),
      save: async ({ signal }) => {
        signals.push(signal);
        calls.push("save:Child");
      },
      discard: async () => {},
    },
  });
  const before = engine.getSnapshot();
  engine.close({ target: targetFor(engine, parent.instanceId) });

  await assert.rejects(
    engine.resolveTransition({ decision: "save" }),
    /Parent save failed/,
  );
  assert.deepEqual(calls, ["save:Child", "save:Parent"]);
  assert.equal(engine.getSnapshot().panels, before.panels);
  assert.equal(engine.getSnapshot().version, before.version);
  assert.ok(engine.getSnapshot().transition);
  assert.equal(signals[0], signals[1]);
  assert.equal(signals[0].aborted, false);

  const resolution = await engine.resolveTransition({ decision: "save" });
  assert.equal(resolution.status, "committed");
  assert.deepEqual(calls, ["save:Child", "save:Parent", "save:Parent"]);
  assert.equal(signals[0], signals[2]);
  assert.equal(engine.getSnapshot().panels.length, 1);
});

test("identical destructive commands coalesce while different commands reject during confirmation", async () => {
  const root = defineRootPanel({ kind: "root", title: "Root" });
  const editor = definePanel({ kind: "editor", title: ({ name }) => name });
  const report = definePanel({ kind: "report", title: ({ name }) => name });
  const engine = createPanelEngine({ root, panels: [editor, report] });
  const opened = engine.open({ panel: editor.reference({ name: "Draft" }) });
  if (opened.status !== "opened") throw new Error("Expected editor");
  const target = targetFor(engine, opened.instanceId);
  let guardCalls = 0;
  let notifications = 0;
  engine.registerLifecycle({
    target,
    lifecycle: {
      dirty: true,
      guard: () => {
        guardCalls += 1;
        return { status: "confirm", message: "Save Draft?" };
      },
      save: async () => {},
      discard: async () => {},
    },
  });
  engine.subscribe(() => notifications++);

  const staged = engine.close({ target });
  assert.deepEqual(engine.close({ target }), staged);
  assert.equal(guardCalls, 1);
  assert.equal(notifications, 1);
  assert.deepEqual(engine.close({ target: { ...target, kind: "forged" } }), {
    status: "rejected",
    command: "close",
    reason: "invalid-panel-reference",
    panelId: target.instanceId,
  });
  const rootTarget = engine.getSnapshot().panels[0].instanceRef;
  assert.deepEqual(engine.collapse({ target: rootTarget }), {
    status: "rejected",
    command: "collapse",
    reason: "transition-in-progress",
    panelId: rootTarget.instanceId,
  });
  assert.deepEqual(
    engine.open({
      originId: engine.getSnapshot().panels[0].instanceId,
      panel: report.reference({ name: "Report" }),
    }),
    {
      status: "rejected",
      reason: "transition-in-progress",
      originId: engine.getSnapshot().panels[0].instanceId,
    },
  );
  assert.equal(guardCalls, 1);
  assert.equal(notifications, 1);
});

test("a stack version change cancels a stale pending transition before lifecycle work", async () => {
  const root = defineRootPanel({ kind: "root", title: "Root" });
  const editor = definePanel({ kind: "editor", title: ({ name }) => name });
  const engine = createPanelEngine({ root, panels: [editor] });
  const opened = engine.open({ panel: editor.reference({ name: "Draft" }) });
  if (opened.status !== "opened") throw new Error("Expected editor");
  const target = targetFor(engine, opened.instanceId);
  let saves = 0;
  engine.registerLifecycle({
    target,
    lifecycle: {
      dirty: true,
      guard: () => ({ status: "confirm", message: "Save Draft?" }),
      save: async () => {
        saves += 1;
      },
      discard: async () => {},
    },
  });
  engine.close({ target });
  const stagedVersion = engine.getSnapshot().version;

  assert.equal(
    engine.activate({ target: engine.getSnapshot().panels[0].instanceRef })
      .status,
    "activated",
  );
  assert.equal(engine.getSnapshot().version, stagedVersion + 1);
  assert.ok(engine.getSnapshot().transition);
  assert.deepEqual(await engine.resolveTransition({ decision: "save" }), {
    status: "cancelled",
    command: "close",
    reason: "stale-transition",
    panelIds: [opened.instanceId],
  });
  assert.equal(saves, 0);
  assert.equal(engine.getSnapshot().panels.length, 2);
  assert.equal(engine.getSnapshot().transition, null);
});

test("an asynchronous resolution keeps the transition lock until it settles", async () => {
  const root = defineRootPanel({ kind: "root", title: "Root" });
  const editor = definePanel({ kind: "editor", title: ({ name }) => name });
  const report = definePanel({ kind: "report", title: ({ name }) => name });
  const engine = createPanelEngine({ root, panels: [editor, report] });
  const opened = engine.open({ panel: editor.reference({ name: "Draft" }) });
  if (opened.status !== "opened") throw new Error("Expected editor");
  const target = targetFor(engine, opened.instanceId);
  let releaseSave;
  const saveGate = new Promise((resolve) => {
    releaseSave = resolve;
  });
  engine.registerLifecycle({
    target,
    lifecycle: {
      dirty: true,
      guard: () => ({ status: "confirm", message: "Save Draft?" }),
      save: async () => saveGate,
      discard: async () => {
        throw new Error("Discard must not race Save");
      },
    },
  });
  engine.close({ target });
  const resolving = engine.resolveTransition({ decision: "save" });

  assert.deepEqual(await engine.resolveTransition({ decision: "discard" }), {
    status: "rejected",
    reason: "transition-in-progress",
  });
  assert.deepEqual(
    engine.open({
      originId: engine.getSnapshot().panels[0].instanceId,
      panel: report.reference({ name: "Report" }),
    }),
    {
      status: "rejected",
      reason: "transition-in-progress",
      originId: engine.getSnapshot().panels[0].instanceId,
    },
  );
  releaseSave();
  assert.equal((await resolving).status, "committed");
  assert.equal(engine.getSnapshot().panels.length, 1);
});

test("a version change aborts in-flight lifecycle work and skips the remaining aggregate", async () => {
  const root = defineRootPanel({ kind: "root", title: "Root" });
  const editor = definePanel({ kind: "editor", title: ({ name }) => name });
  const engine = createPanelEngine({ root, panels: [editor] });
  const parent = engine.open({ panel: editor.reference({ name: "Parent" }) });
  if (parent.status !== "opened") throw new Error("Expected parent");
  const child = engine.open({
    originId: parent.instanceId,
    panel: editor.reference({ name: "Child" }),
  });
  if (child.status !== "opened") throw new Error("Expected child");
  const calls = [];
  let operationSignal;
  let releaseChild;
  const childGate = new Promise((resolve) => {
    releaseChild = resolve;
  });
  engine.registerLifecycle({
    target: targetFor(engine, parent.instanceId),
    lifecycle: {
      dirty: true,
      guard: () => ({ status: "confirm", message: "Save Parent?" }),
      save: async () => calls.push("save:Parent"),
      discard: async () => {},
    },
  });
  engine.registerLifecycle({
    target: targetFor(engine, child.instanceId),
    lifecycle: {
      dirty: true,
      guard: () => ({ status: "confirm", message: "Save Child?" }),
      save: async ({ signal }) => {
        operationSignal = signal;
        calls.push("save:Child");
        await childGate;
      },
      discard: async () => {},
    },
  });
  engine.close({ target: targetFor(engine, parent.instanceId) });
  const resolving = engine.resolveTransition({ decision: "save" });
  await Promise.resolve();

  engine.activate({ target: engine.getSnapshot().panels[0].instanceRef });
  const abortedDuringOperation = operationSignal.aborted;
  releaseChild();
  const resolution = await resolving;

  assert.equal(abortedDuringOperation, true);
  assert.equal(resolution.status, "cancelled");
  assert.deepEqual(calls, ["save:Child"]);
  assert.equal(engine.getSnapshot().panels.length, 3);
});

test("Branch Replacement confirms before removing a dirty Panel", async () => {
  const root = defineRootPanel({ kind: "root", title: "Root" });
  const editor = definePanel({
    kind: "editor",
    title: ({ name }) => name,
  });
  const report = definePanel({
    kind: "report",
    title: ({ name }) => name,
  });
  const engine = createPanelEngine({ root, panels: [editor, report] });
  const openedEditor = engine.open({
    panel: editor.reference({ name: "Dirty draft" }),
  });
  if (openedEditor.status !== "opened") throw new Error("Expected editor");
  const guardCalls = [];
  engine.registerLifecycle({
    target: targetFor(engine, openedEditor.instanceId),
    lifecycle: {
      guard: (proposal) => {
        guardCalls.push(proposal);
        return { status: "confirm", message: "Replace dirty draft?" };
      },
      save: async () => {},
      discard: async () => {},
    },
  });
  const beforeReplacement = engine.getSnapshot();

  assert.deepEqual(
    engine.open({
      originId: beforeReplacement.panels[0].instanceId,
      panel: report.reference({ name: "Attendance report" }),
    }),
    {
      status: "confirmation-required",
      command: "open",
      panelIds: [openedEditor.instanceId],
    },
  );
  assert.equal(engine.getSnapshot().version, beforeReplacement.version);
  assert.equal(engine.getSnapshot().panels, beforeReplacement.panels);
  assert.deepEqual(guardCalls, [
    { command: "open", removedPanelIds: [openedEditor.instanceId] },
  ]);

  const resolution = await engine.resolveTransition({ decision: "discard" });
  assert.equal(resolution.status, "committed");
  assert.equal(resolution.decision, "discard");
  assert.equal(resolution.command, "open");
  assert.deepEqual(resolution.panelIds, [openedEditor.instanceId]);
  assert.equal(resolution.outcome.status, "opened");
  assert.deepEqual(
    engine.getSnapshot().panels.map(({ title }) => title),
    ["Root", "Attendance report"],
  );
  assert.equal(engine.getSnapshot().version, beforeReplacement.version + 1);
});

test("Branch Replacement evaluates every dirty Panel deepest-first and aggregates confirmations", async () => {
  const root = defineRootPanel({ kind: "root", title: "Root" });
  const editor = definePanel({ kind: "editor", title: ({ name }) => name });
  const report = definePanel({ kind: "report", title: ({ name }) => name });
  const engine = createPanelEngine({ root, panels: [editor, report] });
  const parent = engine.open({ panel: editor.reference({ name: "Parent" }) });
  if (parent.status !== "opened") throw new Error("Expected parent");
  const child = engine.open({
    originId: parent.instanceId,
    panel: editor.reference({ name: "Child" }),
  });
  if (child.status !== "opened") throw new Error("Expected child");
  const calls = [];
  const parentTarget = targetFor(engine, parent.instanceId);
  const childTarget = targetFor(engine, child.instanceId);
  const childLifecycle = {
    dirty: true,
    guard: () => {
      calls.push("guard:Child");
      return { status: "confirm", message: "Save Child?" };
    },
    save: async () => calls.push("save:Child"),
    discard: async () => calls.push("discard:Child"),
  };
  engine.registerLifecycle({ target: childTarget, lifecycle: childLifecycle });
  engine.registerLifecycle({
    target: parentTarget,
    lifecycle: {
      dirty: true,
      guard: () => {
        calls.push("guard:Parent");
        return { status: "block", reason: "Parent is locked" };
      },
      save: async () => {},
      discard: async () => {},
    },
  });
  const before = engine.getSnapshot();
  const command = {
    originId: before.panels[0].instanceId,
    panel: report.reference({ name: "Report" }),
  };

  assert.deepEqual(engine.open(command), {
    status: "rejected",
    reason: "transition-blocked",
    originId: command.originId,
    panelId: parent.instanceId,
  });
  assert.deepEqual(calls, ["guard:Child", "guard:Parent"]);
  assert.equal(engine.getSnapshot(), before);

  calls.length = 0;
  engine.registerLifecycle({
    target: parentTarget,
    lifecycle: {
      dirty: true,
      guard: () => {
        calls.push("guard:Parent");
        return { status: "confirm", message: "Save Parent?" };
      },
      save: async () => calls.push("save:Parent"),
      discard: async () => calls.push("discard:Parent"),
    },
  });
  assert.deepEqual(engine.open(command), {
    status: "confirmation-required",
    command: "open",
    panelIds: [child.instanceId, parent.instanceId],
  });
  assert.deepEqual(calls, ["guard:Child", "guard:Parent"]);
  assert.deepEqual(
    engine.getSnapshot().transition.panels.map(({ panelTitle }) => panelTitle),
    ["Child", "Parent"],
  );
  await engine.resolveTransition({ decision: "discard" });
  assert.deepEqual(calls, [
    "guard:Child",
    "guard:Parent",
    "discard:Child",
    "discard:Parent",
  ]);
  assert.deepEqual(
    engine.getSnapshot().panels.map(({ title }) => title),
    ["Root", "Report"],
  );
});

test("malformed lifecycle contracts and Guard Outcomes fail closed", () => {
  const root = defineRootPanel({ kind: "root", title: "Root" });
  const editor = definePanel({ kind: "editor", title: ({ name }) => name });
  const engine = createPanelEngine({ root, panels: [editor] });
  const opened = engine.open({ panel: editor.reference({ name: "Draft" }) });
  if (opened.status !== "opened") throw new Error("Expected editor");
  const target = targetFor(engine, opened.instanceId);

  assert.throws(
    () => engine.registerLifecycle({ target, lifecycle: {} }),
    /requires guard, save, and discard functions/,
  );
  assert.throws(
    () =>
      engine.registerLifecycle({
        target,
        lifecycle: {
          dirty: "yes",
          guard: () => ({ status: "allow" }),
          save: async () => {},
          discard: async () => {},
        },
      }),
    /dirty must be a boolean/,
  );

  for (const malformed of [
    null,
    { status: "typo" },
    { status: "confirm", message: "" },
    { status: "block", reason: "" },
  ]) {
    const unregister = engine.registerLifecycle({
      target,
      lifecycle: {
        guard: () => malformed,
        save: async () => {},
        discard: async () => {},
      },
    });
    const before = engine.getSnapshot();
    assert.deepEqual(engine.close({ target }), {
      status: "rejected",
      command: "close",
      reason: "transition-blocked",
      panelId: opened.instanceId,
    });
    assert.equal(engine.getSnapshot(), before);
    unregister();
  }
});

test("Branch Replacement validates its new descriptor before saving dirty work", () => {
  const root = defineRootPanel({ kind: "root", title: "Root" });
  const editor = definePanel({ kind: "editor", title: ({ name }) => name });
  const invalid = definePanel({
    kind: "invalid",
    title: () => {
      throw new Error("invalid replacement title");
    },
  });
  const engine = createPanelEngine({ root, panels: [editor, invalid] });
  const opened = engine.open({ panel: editor.reference({ name: "Draft" }) });
  if (opened.status !== "opened") throw new Error("Expected editor");
  let saves = 0;
  engine.registerLifecycle({
    target: targetFor(engine, opened.instanceId),
    lifecycle: {
      guard: () => ({ status: "confirm", message: "Unsaved" }),
      save: async () => {
        saves += 1;
      },
      discard: async () => {},
    },
  });
  const before = engine.getSnapshot();

  assert.throws(
    () =>
      engine.open({
        originId: before.panels[0].instanceId,
        panel: invalid.reference({}),
      }),
    /invalid replacement title/,
  );
  assert.equal(saves, 0);
  assert.equal(engine.getSnapshot(), before);
});
