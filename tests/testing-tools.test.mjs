import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import { act, cleanup, render } from "@testing-library/react";
import { JSDOM } from "jsdom";
import { createElement } from "react";

import {
  createPanelEngine,
  definePanel,
  defineRootPanel,
} from "../packages/canvas-panels/dist/core/index.js";
import { useCanvasNavigationSync } from "../packages/canvas-panels/dist/next/index.js";
import {
  allowTransition,
  blockTransition,
  buildNavigationDocument,
  buildPanelReadModel,
  buildPanelStack,
  buildPresentation,
  buildTransitionStatus,
  confirmTransition,
  createTestClock,
  createTestFocusTarget,
  createTestHistory,
  createTestIdentities,
  createTestLifecycle,
  createTestRestore,
  createTestViewport,
} from "../packages/canvas-panels/dist/testing/index.js";
import {
  canvasBreakpointQueries,
  createCanvasModule,
} from "../packages/canvas-panels/dist/ui/index.js";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://canvas-panels.test/",
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: dom.window.navigator,
});
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Node = dom.window.Node;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Unmounting releases the History Namespace a Workspace claimed.
afterEach(() => {
  act(() => {
    cleanup();
  });
});

/** A real two-Panel Canvas, so a fake is proven against the thing it stands in for. */
function openClassCanvas() {
  const root = defineRootPanel({ kind: "classes", title: "Classes" });
  const classPanel = definePanel({
    kind: "class",
    title: ({ name }) => name,
  });
  const engine = createPanelEngine({ root, panels: [classPanel] });
  const opened = engine.open({
    originId: engine.getSnapshot().activePanelId,
    panel: classPanel.reference({ name: "Class A" }),
  });
  assert.equal(opened.status, "opened");
  return { engine, target: engine.getSnapshot().panels[1].instanceRef };
}

test("identities are deterministic from the first call, independent of any other factory", () => {
  const first = createTestIdentities();
  const second = createTestIdentities();

  // Two factories built at different points in a run agree, which is what the
  // Panel Engine's own process-wide counter cannot promise: its Workspace
  // number depends on how many engines a test file happened to build first.
  assert.equal(first.workspace(), "test-workspace-1");
  assert.equal(second.workspace(), "test-workspace-1");
  assert.equal(first.panel(), "test-panel-1");
  assert.equal(first.panel(), "test-panel-2");
  assert.equal(second.panel(), "test-panel-1");
});

test("a Panel read model is built whole from its overrides", () => {
  const identities = createTestIdentities();
  const panel = buildPanelReadModel({
    identities,
    kind: "class",
    title: "Class A",
    descriptor: { classId: "class-a", name: "Class A" },
    active: true,
  });

  assert.equal(panel.kind, "class");
  assert.equal(panel.title, "Class A");
  assert.equal(panel.descriptor.classId, "class-a");
  assert.equal(panel.panel.kind, "class");
  assert.equal(panel.panel.instanceId, "test-panel-1");
  assert.equal(panel.panel.workspaceId, "test-workspace-1");
  assert.equal(panel.active, true);
  // Everything the Bound Canvas Module publishes is present, so a component
  // reading a field the test did not mention gets a value rather than crashing.
  assert.equal(panel.closable, true);
  assert.equal(panel.deepest, false);
  assert.equal(panel.visible, true);
  assert.equal(Object.isFrozen(panel), true);
});

test("a built stack numbers its Panels and marks the Root, Active and Deepest", () => {
  const stack = buildPanelStack([
    { kind: "classes", title: "Classes" },
    { kind: "class", title: "Class A" },
    { kind: "learner", title: "Ada Lovelace" },
  ]);

  assert.deepEqual(
    stack.map(({ title }) => title),
    ["Classes", "Class A", "Ada Lovelace"],
  );
  // A Root Panel is never closable and the deepest Panel is Active by default,
  // which is the state a Canvas is actually in after opening.
  assert.deepEqual(
    stack.map(({ closable }) => closable),
    [false, true, true],
  );
  assert.deepEqual(
    stack.map(({ deepest }) => deepest),
    [false, false, true],
  );
  assert.deepEqual(
    stack.map(({ active }) => active),
    [false, false, true],
  );
  // One Workspace, distinct Panels.
  assert.equal(new Set(stack.map(({ panel }) => panel.workspaceId)).size, 1);
  assert.equal(new Set(stack.map(({ panel }) => panel.instanceId)).size, 3);
});

test("the transition and presentation read models default to a settled Canvas", () => {
  assert.deepEqual(buildTransitionStatus(), {
    pending: false,
    command: null,
    panelCount: 0,
  });
  assert.deepEqual(buildTransitionStatus({ command: "close", panelCount: 2 }), {
    pending: true,
    command: "close",
    panelCount: 2,
  });
  assert.deepEqual(buildPresentation({ title: "Class A" }), {
    active: true,
    deepest: true,
    visible: true,
    closable: true,
    title: "Class A",
  });
});

test("the guard outcomes are the three the Panel Engine acts on", () => {
  assert.deepEqual(allowTransition(), { status: "allow" });
  assert.deepEqual(confirmTransition("Unsaved changes"), {
    status: "confirm",
    message: "Unsaved changes",
  });
  assert.deepEqual(blockTransition("Saving"), {
    status: "block",
    reason: "Saving",
  });
});

test("a test lifecycle drives a real Guarded Transition and records the proposal", async () => {
  const { engine, target } = openClassCanvas();
  const editor = createTestLifecycle({
    guard: confirmTransition("Unsaved changes"),
  });
  engine.registerLifecycle({ target, lifecycle: editor.lifecycle });

  const closed = engine.close({ target });

  assert.equal(closed.status, "confirmation-required");
  assert.equal(editor.guards.length, 1);
  assert.equal(editor.guards[0].command, "close");
  assert.deepEqual(editor.guards[0].removedPanelIds, [target.instanceId]);

  const resolved = await engine.resolveTransition({ decision: "discard" });

  assert.equal(resolved.status, "committed");
  assert.equal(editor.discards.length, 1);
  assert.equal(editor.saves.length, 0);
  // The engine hands every operation the transition that asked for it and the
  // signal that cancels it, so a fake that drops either hides a real bug.
  assert.equal(editor.discards[0].operation.transition.command, "close");
  assert.ok(editor.discards[0].operation.signal instanceof AbortSignal);
  assert.equal(engine.getSnapshot().panels.length, 1);
});

test("a manual lifecycle holds the transition open until the test settles the write", async () => {
  const { engine, target } = openClassCanvas();
  const editor = createTestLifecycle({
    guard: confirmTransition("Unsaved changes"),
    mode: "manual",
  });
  engine.registerLifecycle({ target, lifecycle: editor.lifecycle });
  engine.close({ target });

  const resolution = engine.resolveTransition({ decision: "save" });
  await Promise.resolve();

  // A write in flight must not commit: this is the seam an application needs in
  // order to test what its Panel does while it is saving.
  assert.equal(editor.saves.length, 1);
  assert.equal(editor.saves[0].settled, false);
  assert.equal(engine.getSnapshot().panels.length, 2);

  editor.saves[0].settle();

  assert.equal((await resolution).status, "committed");
  assert.equal(editor.saves[0].settled, true);
  assert.equal(engine.getSnapshot().panels.length, 1);
});

test("a failed write leaves the transition open for retry without repeating it", async () => {
  const { engine, target } = openClassCanvas();
  const editor = createTestLifecycle({
    guard: confirmTransition("Unsaved changes"),
    mode: "manual",
  });
  engine.registerLifecycle({ target, lifecycle: editor.lifecycle });
  engine.close({ target });

  const failing = engine.resolveTransition({ decision: "save" });
  await Promise.resolve();
  editor.saves[0].fail(new Error("Network down"));

  // A failed operation surfaces as a rejection and leaves the proposal open,
  // which is what makes the retry below a retry rather than a fresh close.
  await assert.rejects(failing, /Network down/);
  assert.equal(engine.getSnapshot().panels.length, 2);
  assert.ok(engine.getSnapshot().transition);

  const retry = engine.resolveTransition({ decision: "save" });
  await Promise.resolve();
  editor.saves[1].settle();

  assert.equal((await retry).status, "committed");
  assert.equal(engine.getSnapshot().panels.length, 1);
});

/** A Canvas whose Class Panel restores through an availability loader. */
function loaderCanvas(restore) {
  const root = defineRootPanel({ kind: "classes", title: "Classes" });
  const classPanel = definePanel({
    kind: "class",
    title: ({ name }) => name,
    persistence: {
      mode: "navigation-with-loader",
      version: 2,
      codec: {
        encode: ({ classId, name }) => ({ classId, name }),
        validate: (value) =>
          typeof value?.classId === "string" && typeof value?.name === "string",
        decode: ({ classId, name }) => ({ classId, name }),
        // A v1 descriptor carried only the identifier; the name arrived in v2.
        migrations: [
          {
            from: 1,
            to: 2,
            migrate: ({ classId }) => ({ classId, name: classId }),
          },
        ],
      },
      restore,
    },
  });
  return {
    classPanel,
    engine: createPanelEngine({ root, panels: [classPanel] }),
  };
}

test("a built Navigation Document is the canonical form the engine decodes", () => {
  const document = buildNavigationDocument([
    {
      kind: "class",
      version: 2,
      descriptor: { name: "Class A", classId: "class-a" },
    },
  ]);

  // Canonical JSON: sorted keys, outer schema version, no Root Panel.
  assert.equal(
    document,
    '{"panels":[{"descriptor":{"classId":"class-a","name":"Class A"},"kind":"class","version":2}],"version":1}',
  );
});

test("a built historical document migrates and restores through a test loader", async () => {
  const restore = createTestRestore();
  const { engine } = loaderCanvas(restore.restore);
  const historical = buildNavigationDocument([
    { kind: "class", version: 1, descriptor: { classId: "class-a" } },
  ]);

  const restored = await engine.restoreNavigationDocument(historical, {
    signal: new AbortController().signal,
  });

  assert.equal(restored.status, "restored");
  // A migrated document asks for replace-history normalization.
  assert.equal(restored.navigationIntent, "replace");
  assert.equal(restored.references.length, 1);
  assert.equal(restored.references[0].input.classId, "class-a");
  assert.equal(restore.calls.length, 1);
  assert.deepEqual(restore.calls[0].input, {
    classId: "class-a",
    name: "class-a",
  });
  assert.ok(restore.calls[0].signal instanceof AbortSignal);
});

test("a test loader reports the outcomes it was given, in order", async () => {
  const restore = createTestRestore({
    outcomes: [{ status: "unavailable" }, { status: "available" }],
  });
  const { engine } = loaderCanvas(restore.restore);
  const document = buildNavigationDocument([
    {
      kind: "class",
      version: 2,
      descriptor: { classId: "class-a", name: "Class A" },
    },
  ]);

  const first = await engine.restoreNavigationDocument(document, {
    signal: new AbortController().signal,
  });

  // An unavailable ancestor stops restoration and asks for a Recovery Panel.
  assert.equal(first.status, "recovered");
  assert.equal(first.recovery.reason, "unavailable");
  assert.equal(first.references.length, 0);

  const second = await engine.restoreNavigationDocument(document, {
    signal: new AbortController().signal,
  });

  assert.equal(second.status, "restored");
  assert.equal(restore.calls.length, 2);
});

test("a manual loader stays outstanding until the test settles it", async () => {
  const restore = createTestRestore({ mode: "manual" });
  const { engine } = loaderCanvas(restore.restore);
  const document = buildNavigationDocument([
    {
      kind: "class",
      version: 2,
      descriptor: { classId: "class-a", name: "Class A" },
    },
  ]);

  const pending = engine.restoreNavigationDocument(document, {
    signal: new AbortController().signal,
  });
  await Promise.resolve();

  assert.equal(restore.calls.length, 1);
  assert.equal(restore.calls[0].settled, false);

  restore.calls[0].settle({ status: "denied" });
  const outcome = await pending;

  assert.equal(outcome.status, "recovered");
  assert.equal(outcome.recovery.reason, "denied");
});

test("a test history traverses its own entries and separates writes from Back", () => {
  const history = createTestHistory({ url: "/classes" });

  history.port.push({ page: 1 }, "/classes?canvas=one");
  history.port.push({ page: 2 }, "/classes?canvas=two");

  assert.equal(history.entries.length, 3);
  assert.equal(history.index, 2);

  const seen = [];
  const unsubscribe = history.port.subscribe((event) => seen.push(event.url));
  history.back();

  // A traversal the user performs emits a popstate and moves the cursor, but is
  // not a write: an adapter asserting on what it wrote must not see it.
  assert.equal(history.index, 1);
  assert.deepEqual(seen, ["/classes?canvas=one"]);
  assert.deepEqual(history.writes, [
    { method: "push", url: "/classes?canvas=one" },
    { method: "push", url: "/classes?canvas=two" },
  ]);
  assert.deepEqual(history.port.getState(), { page: 1 });

  // A push discards whatever the user could previously go Forward to.
  history.port.push({ page: 3 }, "/classes?canvas=three");
  assert.equal(history.entries.length, 3);
  assert.equal(history.index, 2);

  unsubscribe();
  history.back();
  assert.deepEqual(seen, ["/classes?canvas=one"]);
});

test("a test history drives the real Navigation Adapter through Back", () => {
  const root = defineRootPanel({ kind: "classes", title: "Classes" });
  const section = definePanel({
    kind: "section",
    title: ({ id }) => id,
    persistence: {
      mode: "navigation",
      version: 1,
      codec: {
        encode: ({ id }) => ({ id }),
        validate: (value) => typeof value?.id === "string",
        decode: ({ id }) => ({ id }),
        migrations: [],
      },
    },
  });
  const engine = createPanelEngine({ root, panels: [section] });
  const history = createTestHistory({ url: "/classes" });

  function Harness() {
    useCanvasNavigationSync({
      engine,
      history: history.port,
      location: { pathname: "/classes", search: "", hash: "" },
    });
    return null;
  }
  act(() => {
    render(createElement(Harness));
  });

  act(() => {
    engine.open({
      originId: engine.getSnapshot().activePanelId,
      panel: section.reference({ id: "intro" }),
    });
  });

  // The adapter wrote the opened Panel into the address it was given.
  assert.equal(history.index, 1);
  assert.match(history.entries[1].url, /\?canvas=v1\./);
  assert.equal(engine.getSnapshot().panels.length, 2);

  act(() => {
    history.back();
  });

  // Back is a Stack Restoration the adapter applies, which is the whole reason
  // a test needs a session history it can actually traverse.
  assert.equal(engine.getSnapshot().panels.length, 1);
  assert.equal(history.index, 0);
});

/** A Bound Canvas Module whose Class renderer registers what the test gives it. */
function buildFocusCanvas(initialFocus) {
  const root = defineRootPanel({ kind: "classes", title: "Classes" });
  const classPanel = definePanel({ kind: "class", title: ({ name }) => name });
  const Canvas = createCanvasModule({
    root,
    panels: [classPanel],
    renderers: {
      classes: () => null,
      class: () => {
        Canvas.useLifecycle({ initialFocus });
        return null;
      },
    },
  });
  const engine = createPanelEngine({ root, panels: [classPanel] });
  return { Canvas, classPanel, engine };
}

test("a test focus target is the shape the Workspace's focus owner requires", () => {
  const target = createTestFocusTarget();
  const { Canvas, classPanel, engine } = buildFocusCanvas(target.ref);

  act(() => {
    render(
      createElement(
        Canvas.Provider,
        { engine },
        createElement(Canvas.Workspace, { label: "Classes" }),
      ),
    );
  });
  act(() => {
    engine.open({
      originId: engine.getSnapshot().activePanelId,
      panel: classPanel.reference({ name: "Class A" }),
    });
  });

  // Activating a Panel hands focus to what that Panel registered, exactly once.
  assert.equal(target.focusCount, 1);
  assert.equal(target.focused, true);
  assert.deepEqual(target.calls[0], { preventScroll: true });
});

test("a disconnected focus target is declined, as a detached element is", () => {
  const target = createTestFocusTarget();
  target.disconnect();
  const { Canvas, classPanel, engine } = buildFocusCanvas(target.ref);

  act(() => {
    render(
      createElement(
        Canvas.Provider,
        { engine },
        createElement(Canvas.Workspace, { label: "Classes" }),
      ),
    );
  });
  act(() => {
    engine.open({
      originId: engine.getSnapshot().activePanelId,
      panel: classPanel.reference({ name: "Class A" }),
    });
  });

  // The Workspace refuses to focus something no longer in the document, so a
  // stub that claimed to be connected would hide that rule rather than test it.
  assert.equal(target.focusCount, 0);
});

test("a test viewport reports the declared breakpoints the Canvas presents by", () => {
  const viewport = createTestViewport({ breakpoint: "mobile" });

  assert.deepEqual(viewport.queries, canvasBreakpointQueries);
  assert.equal(viewport.matchMedia("(max-width: 47.999rem)").matches, true);
  assert.equal(viewport.matchMedia("(min-width: 80rem)").matches, false);
});

test("a test viewport changes what a real Canvas presents without touching the stack", () => {
  const viewport = createTestViewport({ breakpoint: "desktop" });
  const restore = viewport.install(dom.window);

  try {
    const root = defineRootPanel({ kind: "classes", title: "Classes" });
    const classPanel = definePanel({
      kind: "class",
      title: ({ name }) => name,
    });
    const learner = definePanel({ kind: "learner", title: ({ name }) => name });
    const Canvas = createCanvasModule({
      root,
      panels: [classPanel, learner],
      renderers: {
        classes: () => null,
        class: () => null,
        learner: () => null,
      },
    });
    const engine = createPanelEngine({ root, panels: [classPanel, learner] });
    act(() => {
      engine.open({
        originId: engine.getSnapshot().activePanelId,
        panel: classPanel.reference({ name: "Class A" }),
      });
      engine.open({
        originId: engine.getSnapshot().activePanelId,
        panel: learner.reference({ name: "Ada Lovelace" }),
      });
    });
    act(() => {
      render(
        createElement(
          Canvas.Provider,
          { engine },
          createElement(Canvas.Workspace, { label: "Classes" }),
        ),
      );
    });

    assert.equal(engine.getSnapshot().breakpoint, "desktop");
    const visibleOnDesktop = engine.getSnapshot().visiblePanelIds.length;

    act(() => {
      viewport.resizeTo("mobile");
    });

    // A Declared Breakpoint changes presentation only: the logical Panel Stack,
    // its order and its Active Panel are untouched.
    assert.equal(engine.getSnapshot().breakpoint, "mobile");
    assert.ok(engine.getSnapshot().visiblePanelIds.length < visibleOnDesktop);
    assert.equal(engine.getSnapshot().panels.length, 3);
    assert.equal(
      engine.getSnapshot().activePanelId,
      engine.getSnapshot().deepestPanelId,
    );
  } finally {
    restore();
  }
});

test("a test clock runs due timers in due order, then insertion order", () => {
  const clock = createTestClock({ start: 1_000 });
  const ran = [];

  assert.equal(clock.now(), 1_000);
  clock.setTimeout(() => ran.push("late"), 50);
  clock.setTimeout(() => ran.push("early"), 10);
  clock.setTimeout(() => ran.push("same-first"), 10);
  const cancelled = clock.setTimeout(() => ran.push("cancelled"), 10);
  clock.clearTimeout(cancelled);

  assert.equal(clock.pending, 3);
  assert.equal(clock.advance(10), 2);
  assert.deepEqual(ran, ["early", "same-first"]);
  assert.equal(clock.now(), 1_010);

  // Time moves to each timer's own due point, not to the end of the advance,
  // so a callback reading the clock sees when it was actually due.
  const observed = [];
  clock.setTimeout(() => observed.push(clock.now()), 5);
  clock.advance(100);

  assert.deepEqual(observed, [1_015]);
  assert.deepEqual(ran, ["early", "same-first", "late"]);
  assert.equal(clock.now(), 1_110);
  assert.equal(clock.pending, 0);
});

test("a test clock refuses to run backwards", () => {
  const clock = createTestClock({ start: 100 });
  let ran = 0;
  clock.setTimeout(() => {
    ran += 1;
  }, 10);

  // Rewinding would put the clock behind timers it had already run, so the next
  // advance would fire them a second time.
  assert.throws(() => clock.advance(-50), RangeError);
  assert.equal(clock.now(), 100);
  assert.equal(ran, 0);
  assert.equal(clock.pending, 1);
});

test("the recorded logs a test reads cannot be rewritten through what it reads", () => {
  const history = createTestHistory({ url: "/classes" });
  history.port.push({ page: 1 }, "/classes?canvas=one");

  assert.throws(() => history.writes.push({ method: "push", url: "/forged" }));
  assert.throws(() => history.entries.push({ state: null, url: "/forged" }));
  assert.equal(history.writes.length, 1);
  assert.equal(history.entries.length, 2);
});

test("a test clock runs a timer scheduled by a timer within the same advance", () => {
  const clock = createTestClock();
  const ran = [];

  clock.setTimeout(() => {
    ran.push("first");
    clock.setTimeout(() => ran.push("chained"), 5);
  }, 5);
  clock.advance(10);

  assert.deepEqual(ran, ["first", "chained"]);
  assert.equal(clock.now(), 10);
});
