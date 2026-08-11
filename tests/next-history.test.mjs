import assert from "node:assert/strict";
import test from "node:test";

import {
  canvasHistorySlot,
  claimHistoryNamespace,
  createCanvasHistoryEntry,
  planCanvasHistoryRepair,
  readCanvasHistoryEntry,
  writeCanvasHistoryEntry,
} from "../packages/canvas-panels/dist/next/history.js";

const namespace = "canvas";

test("a Canvas History Entry is frozen and carries its namespace, key, and index", () => {
  const entry = createCanvasHistoryEntry({ namespace, key: "a", index: 0 });

  assert.deepEqual(entry, { namespace, key: "a", index: 0 });
  assert.equal(Object.isFrozen(entry), true);
});

test("writing an entry preserves every other key on the history state", () => {
  const state = { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: ["tree"] };
  const entry = createCanvasHistoryEntry({ namespace, key: "a", index: 0 });

  const written = writeCanvasHistoryEntry(state, entry);

  assert.equal(written.__NA, true);
  assert.deepEqual(written.__PRIVATE_NEXTJS_INTERNALS_TREE, ["tree"]);
  assert.deepEqual(written[canvasHistorySlot][namespace], entry);
  assert.equal(
    state[canvasHistorySlot],
    undefined,
    "must not mutate the input",
  );
});

test("writing an entry leaves a foreign namespace's entry intact", () => {
  const foreign = createCanvasHistoryEntry({
    namespace: "sidebar",
    key: "s1",
    index: 3,
  });
  const state = writeCanvasHistoryEntry({}, foreign);
  const entry = createCanvasHistoryEntry({ namespace, key: "a", index: 0 });

  const written = writeCanvasHistoryEntry(state, entry);

  assert.deepEqual(written[canvasHistorySlot].sidebar, foreign);
  assert.deepEqual(written[canvasHistorySlot][namespace], entry);
});

test("reading returns the entry stamped for the requested namespace", () => {
  const entry = createCanvasHistoryEntry({ namespace, key: "a", index: 2 });
  const state = writeCanvasHistoryEntry({ __NA: true }, entry);

  assert.deepEqual(readCanvasHistoryEntry(state, namespace), entry);
});

test("reading a namespace the entry does not claim reports nothing", () => {
  const state = writeCanvasHistoryEntry(
    {},
    createCanvasHistoryEntry({ namespace: "sidebar", key: "s1", index: 1 }),
  );

  assert.equal(readCanvasHistoryEntry(state, namespace), null);
});

test("reading a history state the Canvas never stamped reports nothing", () => {
  for (const state of [
    null,
    undefined,
    "a string",
    7,
    {},
    { __NA: true },
    { [canvasHistorySlot]: null },
    { [canvasHistorySlot]: "not an object" },
  ]) {
    assert.equal(readCanvasHistoryEntry(state, namespace), null);
  }
});

test("reading a malformed entry reports nothing rather than guessing", () => {
  for (const malformed of [
    { namespace, key: "a" },
    { namespace, index: 0 },
    { namespace, key: "a", index: "0" },
    { namespace, key: 7, index: 0 },
    { namespace, key: "a", index: 1.5 },
    { namespace, key: "a", index: -1 },
    { namespace, key: "", index: 0 },
  ]) {
    const state = { [canvasHistorySlot]: { [namespace]: malformed } };
    assert.equal(readCanvasHistoryEntry(state, namespace), null);
  }
});

test("repairing from an entry to itself is already settled", () => {
  const entry = createCanvasHistoryEntry({ namespace, key: "a", index: 2 });

  assert.deepEqual(planCanvasHistoryRepair(entry, entry), {
    status: "settled",
  });
});

test("repairing a cancelled Back returns forward by the traversed distance", () => {
  const from = createCanvasHistoryEntry({ namespace, key: "c", index: 4 });
  const to = createCanvasHistoryEntry({ namespace, key: "a", index: 1 });

  assert.deepEqual(planCanvasHistoryRepair(from, to), {
    status: "repair",
    delta: 3,
  });
});

test("repairing a cancelled Forward returns back by the traversed distance", () => {
  const from = createCanvasHistoryEntry({ namespace, key: "a", index: 1 });
  const to = createCanvasHistoryEntry({ namespace, key: "c", index: 4 });

  assert.deepEqual(planCanvasHistoryRepair(from, to), {
    status: "repair",
    delta: -3,
  });
});

test("a missing entry on either side is unrepairable rather than a guessed direction", () => {
  const entry = createCanvasHistoryEntry({ namespace, key: "a", index: 1 });

  assert.deepEqual(planCanvasHistoryRepair(entry, null), {
    status: "unrepairable",
  });
  assert.deepEqual(planCanvasHistoryRepair(null, entry), {
    status: "unrepairable",
  });
  assert.deepEqual(planCanvasHistoryRepair(null, null), {
    status: "unrepairable",
  });
});

test("two entries sharing an index but not a key are unrepairable", () => {
  const from = createCanvasHistoryEntry({ namespace, key: "a", index: 2 });
  const to = createCanvasHistoryEntry({ namespace, key: "b", index: 2 });

  assert.deepEqual(planCanvasHistoryRepair(from, to), {
    status: "unrepairable",
  });
});

test("the first Workspace to claim a namespace owns the URL", () => {
  const claim = claimHistoryNamespace("owned-once");

  assert.equal(claim.status, "primary");
  claim.release();
});

test("a second Workspace claiming the same namespace falls back to memory", () => {
  const primary = claimHistoryNamespace("owned-twice");
  const secondary = claimHistoryNamespace("owned-twice");

  assert.equal(primary.status, "primary");
  assert.deepEqual(secondary, {
    status: "secondary",
    reason: "namespace-claimed",
  });

  primary.release();
});

test("Workspaces on different namespaces each own their own URL", () => {
  const first = claimHistoryNamespace("namespace-a");
  const second = claimHistoryNamespace("namespace-b");

  assert.equal(first.status, "primary");
  assert.equal(second.status, "primary");

  first.release();
  second.release();
});

test("releasing a namespace lets the next Workspace claim it", () => {
  const first = claimHistoryNamespace("handed-over");
  first.release();

  const second = claimHistoryNamespace("handed-over");

  assert.equal(second.status, "primary");
  second.release();
});

test("releasing twice does not hand the namespace away from its current owner", () => {
  const first = claimHistoryNamespace("released-twice");
  first.release();
  const second = claimHistoryNamespace("released-twice");
  // A StrictMode double-invoked cleanup must not evict the Workspace that has
  // since taken ownership.
  first.release();

  const third = claimHistoryNamespace("released-twice");

  assert.equal(second.status, "primary");
  assert.deepEqual(third, { status: "secondary", reason: "namespace-claimed" });
  second.release();
});
