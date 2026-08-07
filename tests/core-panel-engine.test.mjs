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
  const studentReference = student.reference({ name: "Ada Lovelace" });
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
  assert.deepEqual(studentReference.input, { name: "Ada Lovelace" });
  assert.ok(Object.isFrozen(root));
  assert.ok(Object.isFrozen(student));
  assert.ok(Object.isFrozen(studentReference));
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.panels));
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
