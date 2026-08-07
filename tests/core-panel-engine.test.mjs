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

  assert.equal(snapshot.panels.length, 1);
  assert.deepEqual(snapshot.panels[0], {
    instanceId: "canvas-panel-1",
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
  const replacementId = engine.open({
    originId: rootId,
    panel: student.reference({ name: "Grace Hopper" }),
  });
  const snapshot = engine.getSnapshot();

  assert.equal(snapshot.panels.length, 2);
  assert.deepEqual(
    snapshot.panels.map(({ title }) => title),
    ["Classes", "Grace Hopper"],
  );
  assert.equal(snapshot.activePanelId, replacementId);
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

  const childId = engine.open({
    originId: engine.getSnapshot().activePanelId,
    panel: student.reference({ name: "Ada Lovelace" }),
  });
  assert.deepEqual(notifications, ["first", "second"]);
  assert.equal(engine.getSnapshot().panels.length, 2);
  assert.equal(engine.getSnapshot().activePanelId, childId);
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

  const childId = engine.open({
    originId: initialSnapshot.panels[0].instanceId,
    panel: student.reference({ name: "Ada Lovelace" }),
  });
  const openedSnapshot = engine.getSnapshot();

  assert.equal(childId, "canvas-panel-2");
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
