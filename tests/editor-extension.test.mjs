import assert from "node:assert/strict";
import test from "node:test";

import {
  createPanelEditor,
  editorGuardMessages,
  resolveEditorGuard,
} from "../packages/canvas-panels/dist/extensions/editor.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolveDeferred, rejectDeferred) => {
    resolve = resolveDeferred;
    reject = rejectDeferred;
  });
  return { promise, reject, resolve };
}

function recordingSource(overrides = {}) {
  const calls = [];
  return {
    calls,
    source: {
      dirty: false,
      discard: async (operation) => {
        calls.push({ kind: "discard", operation });
      },
      save: async (operation) => {
        calls.push({ kind: "save", operation });
      },
      ...overrides,
    },
  };
}

const transitionProposal = Object.freeze({
  command: "close",
  removedPanelIds: Object.freeze(["panel-1"]),
});

function coordinatorOperation(controller = new AbortController()) {
  return { signal: controller.signal, transition: transitionProposal };
}

test("a clean idle editor allows a destructive transition", () => {
  assert.deepEqual(resolveEditorGuard({ dirty: false, status: "idle" }), {
    status: "allow",
  });
});

test("a dirty editor asks for a human decision", () => {
  assert.deepEqual(resolveEditorGuard({ dirty: true, status: "idle" }), {
    status: "confirm",
    message: editorGuardMessages.unsavedChanges,
  });
});

test("a dirty editor still loading its record asks for a decision", () => {
  assert.deepEqual(resolveEditorGuard({ dirty: true, status: "loading" }), {
    status: "confirm",
    message: editorGuardMessages.unsavedChanges,
  });
});

test("an editor mid-write blocks rather than confirming", () => {
  for (const [status, message] of [
    ["saving", editorGuardMessages.saving],
    ["discarding", editorGuardMessages.discarding],
  ]) {
    assert.deepEqual(
      resolveEditorGuard({ dirty: true, status }),
      { status: "block", reason: message },
      `${status} must block`,
    );
    assert.deepEqual(
      resolveEditorGuard({ dirty: false, status }),
      { status: "block", reason: message },
      `${status} must block a clean editor too`,
    );
  }
});

// Reading is not writing: a reload replaces the record it is reading into, so
// it has nothing of its own to lose and must leave the decision where it was.
test("a reloading editor decides on its unsaved work alone", () => {
  assert.deepEqual(resolveEditorGuard({ dirty: false, status: "reloading" }), {
    status: "allow",
  });
  assert.deepEqual(resolveEditorGuard({ dirty: true, status: "reloading" }), {
    status: "confirm",
    message: editorGuardMessages.unsavedChanges,
  });
});

test("guard sentences are replaceable for localization", () => {
  const messages = {
    ...editorGuardMessages,
    unsavedChanges: "Ce panneau a des modifications non enregistrées.",
  };

  assert.deepEqual(
    resolveEditorGuard({ dirty: true, messages, status: "idle" }),
    {
      status: "confirm",
      message: "Ce panneau a des modifications non enregistrées.",
    },
  );
  assert.deepEqual(
    resolveEditorGuard({ dirty: true, messages, status: "saving" }),
    { status: "block", reason: editorGuardMessages.saving },
  );
});

test("a new editor is idle, clean, and unregistered as dirty", () => {
  const { source } = recordingSource();
  const editor = createPanelEditor(source);

  assert.deepEqual(editor.getState(), {
    busy: false,
    dirty: false,
    failure: null,
    operation: null,
    status: "idle",
  });
  assert.equal(editor.getLifecycle().dirty, false);
  assert.equal(editor.getState(), editor.getState());
});

test("a declared loading record reports a loading status without a running operation", () => {
  const { source } = recordingSource({ loading: true });
  const editor = createPanelEditor(source);

  assert.equal(editor.getState().status, "loading");
  assert.equal(editor.getState().operation, null);
  assert.equal(editor.getState().busy, true);
  assert.equal(editor.getLifecycle().dirty, false);
});

test("the registered lifecycle reports the application's dirty state", () => {
  const { source } = recordingSource({ dirty: true });
  const editor = createPanelEditor(source);

  assert.equal(editor.getLifecycle().dirty, true);
  assert.deepEqual(editor.getLifecycle().guard(transitionProposal), {
    status: "confirm",
    message: editorGuardMessages.unsavedChanges,
  });
});

test("an application save reports its progress and clears on success", async () => {
  const pending = deferred();
  const { calls, source } = recordingSource({
    save: async (operation) => {
      calls.push({ kind: "save", operation });
      await pending.promise;
    },
  });
  const editor = createPanelEditor(source);
  const states = [];
  editor.subscribe(() => states.push(editor.getState().status));

  const running = editor.save();
  assert.equal(editor.getState().status, "saving");
  assert.equal(editor.getState().operation, "save");
  assert.equal(editor.getState().busy, true);

  pending.resolve();
  assert.deepEqual(await running, { operation: "save", status: "completed" });
  assert.equal(editor.getState().status, "idle");
  assert.deepEqual(states, ["saving", "idle"]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].operation.kind, "save");
  assert.equal(calls[0].operation.transition, null);
  assert.ok(calls[0].operation.signal instanceof AbortSignal);
});

test("an application operation reports failure without throwing", async () => {
  const error = new Error("the record could not be written");
  const { source } = recordingSource({
    save: async () => {
      throw error;
    },
  });
  const editor = createPanelEditor(source);

  assert.deepEqual(await editor.save(), {
    error,
    operation: "save",
    status: "failed",
  });
  assert.deepEqual(editor.getState().failure, { error, operation: "save" });
  assert.equal(editor.getState().status, "idle");

  editor.dismissFailure();
  assert.equal(editor.getState().failure, null);
});

test("a coordinated save records the failure and rethrows for the dialog", async () => {
  const error = new Error("the record could not be written");
  const { source } = recordingSource({
    dirty: true,
    save: async () => {
      throw error;
    },
  });
  const editor = createPanelEditor(source);

  await assert.rejects(
    editor.getLifecycle().save(coordinatorOperation()),
    (thrown) => thrown === error,
  );
  assert.deepEqual(editor.getState().failure, { error, operation: "save" });
  assert.equal(editor.getState().status, "idle");
});

test("a coordinated operation receives the Guarded Transition that requested it", async () => {
  const { calls, source } = recordingSource({ dirty: true });
  const editor = createPanelEditor(source);
  const controller = new AbortController();

  await editor.getLifecycle().discard(coordinatorOperation(controller));

  assert.equal(calls.length, 1);
  assert.equal(calls[0].operation.kind, "discard");
  assert.equal(calls[0].operation.transition, transitionProposal);
  assert.equal(calls[0].operation.signal, controller.signal);
});

test("a running operation succeeding clears an earlier failure", async () => {
  let fail = true;
  const { source } = recordingSource({
    save: async () => {
      if (fail) throw new Error("first attempt failed");
    },
  });
  const editor = createPanelEditor(source);

  await editor.save();
  assert.notEqual(editor.getState().failure, null);

  fail = false;
  await editor.save();
  assert.equal(editor.getState().failure, null);
});

test("the application cannot start a second operation while one is running", async () => {
  const pending = deferred();
  const { source } = recordingSource({
    save: async () => {
      await pending.promise;
    },
    reload: async () => {},
  });
  const editor = createPanelEditor(source);

  const running = editor.save();
  assert.deepEqual(await editor.discard(), {
    operation: "discard",
    reason: "operation-in-progress",
    status: "rejected",
  });
  assert.deepEqual(await editor.reload(), {
    operation: "reload",
    reason: "operation-in-progress",
    status: "rejected",
  });

  pending.resolve();
  await running;
});

test("a coordinated save joins an application save already in flight", async () => {
  const pending = deferred();
  const { calls, source } = recordingSource({
    dirty: true,
    save: async (operation) => {
      calls.push({ kind: "save", operation });
      await pending.promise;
    },
  });
  const editor = createPanelEditor(source);

  const applicationSave = editor.save();
  const coordinatedSave = editor.getLifecycle().save(coordinatorOperation());

  pending.resolve();
  await Promise.all([applicationSave, coordinatedSave]);

  assert.equal(calls.length, 1, "the record must not be written twice");
});

test("a coordinated save joining a failed application save rejects", async () => {
  const error = new Error("the record could not be written");
  const pending = deferred();
  const { source } = recordingSource({
    dirty: true,
    save: async () => {
      await pending.promise;
    },
  });
  const editor = createPanelEditor(source);

  const applicationSave = editor.save();
  const coordinatedSave = editor.getLifecycle().save(coordinatorOperation());

  pending.reject(error);
  assert.deepEqual(await applicationSave, {
    error,
    operation: "save",
    status: "failed",
  });
  await assert.rejects(coordinatedSave, (thrown) => thrown === error);
});

test("a coordinated discard waits for a different operation to settle", async () => {
  const pending = deferred();
  const order = [];
  const { source } = recordingSource({
    dirty: true,
    discard: async () => {
      order.push("discard");
    },
    save: async () => {
      order.push("save-start");
      await pending.promise;
      order.push("save-end");
    },
  });
  const editor = createPanelEditor(source);

  const applicationSave = editor.save();
  const coordinatedDiscard = editor
    .getLifecycle()
    .discard(coordinatorOperation());

  assert.deepEqual(order, ["save-start"]);
  pending.resolve();
  await Promise.all([applicationSave, coordinatedDiscard]);

  assert.deepEqual(order, ["save-start", "save-end", "discard"]);
});

test("an editor without a reload rejects the request as unsupported", async () => {
  const { source } = recordingSource();
  const editor = createPanelEditor(source);

  assert.deepEqual(await editor.reload(), {
    operation: "reload",
    reason: "unsupported",
    status: "rejected",
  });
});

test("reloading a dirty editor needs an explicit decision to discard", async () => {
  let reloaded = 0;
  const { source } = recordingSource({
    dirty: true,
    reload: async () => {
      reloaded += 1;
    },
  });
  const editor = createPanelEditor(source);

  assert.deepEqual(await editor.reload(), {
    operation: "reload",
    reason: "unsaved-changes",
    status: "rejected",
  });
  assert.equal(reloaded, 0);

  assert.deepEqual(await editor.reload({ discardChanges: true }), {
    operation: "reload",
    status: "completed",
  });
  assert.equal(reloaded, 1);
});

test("a write in flight keeps the Panel guarded even once the draft is clean", async () => {
  const pending = deferred();
  const { source } = recordingSource({
    save: async () => {
      await pending.promise;
    },
  });
  const editor = createPanelEditor(source);

  const running = editor.save();
  assert.equal(
    editor.getLifecycle().dirty,
    true,
    "a Panel writing its record must not be torn down",
  );
  assert.deepEqual(editor.getLifecycle().guard(transitionProposal), {
    status: "block",
    reason: editorGuardMessages.saving,
  });

  pending.resolve();
  await running;
  assert.equal(editor.getLifecycle().dirty, false);
});

test("reloading a clean editor leaves the Panel free to close", async () => {
  const pending = deferred();
  const { source } = recordingSource({
    reload: async () => {
      await pending.promise;
    },
  });
  const editor = createPanelEditor(source);

  const running = editor.reload();
  assert.equal(editor.getState().status, "reloading");
  assert.equal(
    editor.getLifecycle().dirty,
    false,
    "a read has nothing to lose and must not block navigation",
  );

  pending.resolve();
  await running;
});

test("reloading over unsaved work still asks about the work, not the reload", async () => {
  const pending = deferred();
  const { source } = recordingSource({
    dirty: true,
    reload: async () => {
      await pending.promise;
    },
  });
  const editor = createPanelEditor(source);

  const running = editor.reload({ discardChanges: true });
  assert.equal(editor.getState().status, "reloading");
  assert.deepEqual(
    editor.getLifecycle().guard(transitionProposal),
    { status: "confirm", message: editorGuardMessages.unsavedChanges },
    "a reload must never leave a Panel with no way out",
  );

  pending.resolve();
  await running;
});

test("a transition the coordinator abandons leaves no failure behind", async () => {
  const controller = new AbortController();
  const { source } = recordingSource({
    dirty: true,
    save: ({ signal }) =>
      new Promise((_settle, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
      }),
  });
  const editor = createPanelEditor(source);

  const coordinated = editor
    .getLifecycle()
    .save(coordinatorOperation(controller));
  controller.abort();

  await assert.rejects(coordinated);
  assert.equal(editor.getState().failure, null);
  assert.equal(editor.getState().status, "idle");
});

test("aborting an operation reports an abort rather than a failure", async () => {
  const { source } = recordingSource({
    // Waits for the abort and nothing else, the way a cancelled request would.
    save: async ({ signal }) => {
      await new Promise((_settle, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
      });
    },
  });
  const editor = createPanelEditor(source);

  const running = editor.save();
  editor.abort();

  assert.deepEqual(await running, { operation: "save", status: "aborted" });
  assert.equal(editor.getState().failure, null);
  assert.equal(editor.getState().status, "idle");
});

test("refreshing the source replaces the dirty state and the callbacks", async () => {
  const { source } = recordingSource();
  const editor = createPanelEditor(source);
  let saved = 0;

  editor.update({
    ...source,
    dirty: true,
    save: async () => {
      saved += 1;
    },
  });

  assert.equal(editor.getState().dirty, true);
  assert.equal(editor.getLifecycle().dirty, true);
  await editor.save();
  assert.equal(saved, 1);
});

test("subscribers are notified once per settled change and read a stable state", async () => {
  const { source } = recordingSource();
  const editor = createPanelEditor(source);
  let notifications = 0;
  const stop = editor.subscribe(() => {
    notifications += 1;
  });

  const before = editor.getState();
  editor.update(source);
  assert.equal(editor.getState(), before, "an unchanged source must not churn");
  assert.equal(notifications, 0);

  await editor.save();
  assert.equal(notifications, 2);

  stop();
  await editor.save();
  assert.equal(notifications, 2);
});
