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

const codec = {
  encode: ({ id }) => ({ id }),
  validate: (value) =>
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string",
  decode: (value) => ({ id: value.id }),
  migrations: [],
};

function createWorkspace() {
  const root = defineRootPanel({ kind: "classes", title: "Classes" });
  const section = definePanel({
    kind: "section",
    title: ({ id }) => id,
    persistence: { mode: "navigation", version: 1, codec },
  });
  const engine = createPanelEngine({ root, panels: [section] });
  const restores = [];
  return {
    section,
    restores,
    engine: {
      ...engine,
      restoreStack: (command) => {
        restores.push(command);
        return engine.restoreStack(command);
      },
    },
  };
}

/**
 * A session history a test can actually traverse: jsdom implements neither
 * `history.go` nor the entry list it would move through.
 */
function createSessionHistory(url = "/classes") {
  const entries = [{ state: null, url }];
  const listeners = new Set();
  const calls = [];
  let position = 0;

  const emit = (event) => {
    for (const listener of [...listeners]) listener(event);
  };

  // Movement the user performs and movement the adapter performs are the same
  // operation, so only the latter is recorded: a test asserting on repairs must
  // not see its own Back and Forward in the same list.
  const traverse = (delta) => {
    const target = position + delta;
    if (target < 0 || target >= entries.length) return;
    position = target;
    emit({ state: entries[position].state, url: entries[position].url });
  };

  const history = {
    getState: () => entries[position].state,
    push: (state, next) => {
      // A push discards whatever the user could previously go Forward to.
      entries.length = position + 1;
      entries.push({ state, url: next });
      position = entries.length - 1;
      calls.push({ method: "push", url: next });
    },
    replace: (state, next) => {
      entries[position] = { state, url: next };
      calls.push({ method: "replace", url: next });
    },
    go: (delta) => {
      calls.push({ method: "go", delta });
      traverse(delta);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  return {
    history,
    calls,
    entries,
    emit,
    at: () => position,
    repairs: () => calls.filter(({ method }) => method === "go"),
    writes: () =>
      calls.filter(({ method }) => method !== "go").map(({ method }) => method),
    back: () => traverse(-1),
    forward: () => traverse(1),
  };
}

function Harness(options) {
  useCanvasNavigationSync(options);
  return null;
}

function mount(options) {
  act(() => {
    render(createElement(Harness, options));
  });
}

function openSection(engine, section, id) {
  act(() => {
    engine.open({
      originId: engine.getSnapshot().activePanelId,
      panel: section.reference({ id }),
    });
  });
}

function kinds(engine) {
  return engine.getSnapshot().panels.map(({ kind }) => kind);
}

function guardPanel(engine, instanceId, message = "Unsaved changes") {
  const target = engine
    .getSnapshot()
    .panels.find((panel) => panel.instanceId === instanceId).instanceRef;
  const guards = [];
  engine.registerLifecycle({
    target,
    lifecycle: {
      dirty: true,
      guard: (transition) => {
        guards.push(transition);
        return { status: "confirm", message };
      },
      save: async () => {},
      discard: async () => {},
    },
  });
  return guards;
}

const location = { pathname: "/classes", search: "", hash: "" };

// Unmounting releases the History Namespace this Workspace claimed.
afterEach(() => {
  act(() => {
    cleanup();
  });
});

test("meaningful navigation pushes while activation and presentation do not", () => {
  const { engine, section } = createWorkspace();
  const session = createSessionHistory();
  mount({
    engine,
    history: session.history,
    location,
    initialState: { status: "absent" },
  });

  openSection(engine, section, "section-a");
  openSection(engine, section, "section-b");
  const afterOpening = session.writes();

  act(() => {
    // Activation reports a `replace` intent, but it moves no Panel in or out of
    // the stack, so there is nothing for the address to say differently.
    engine.activate({ target: engine.getSnapshot().panels[1].instanceRef });
    engine.setPresentation({ breakpoint: "mobile" });
    engine.setPresentation({ breakpoint: "desktop" });
  });

  // The first write stamps the entry the Canvas is leaving; each Panel then
  // pushes one entry of its own.
  assert.deepEqual(afterOpening, ["replace", "push", "push"]);
  assert.deepEqual(
    session.writes(),
    afterOpening,
    "transient UI must be quiet",
  );
});

test("collapsing away a contextual Panel is navigation, and pushes", () => {
  const { engine, section } = createWorkspace();
  const session = createSessionHistory();
  mount({
    engine,
    history: session.history,
    location,
    initialState: { status: "absent" },
  });
  openSection(engine, section, "section-a");
  openSection(engine, section, "section-b");

  act(() => {
    engine.collapse({ target: engine.getSnapshot().panels[1].instanceRef });
  });

  // Collapsing removes the Panels beyond it, so Back must be able to bring
  // them into view again.
  assert.deepEqual(kinds(engine), ["classes", "section"]);
  assert.deepEqual(session.writes(), ["replace", "push", "push", "push"]);
});

test("every Canvas entry carries opaque key and index metadata", () => {
  const { engine, section } = createWorkspace();
  const session = createSessionHistory();
  mount({
    engine,
    history: session.history,
    location,
    initialState: { status: "absent" },
  });

  openSection(engine, section, "section-a");
  openSection(engine, section, "section-b");

  const stamped = session.entries.map(
    ({ state }) => state.__canvasPanels.canvas,
  );
  assert.deepEqual(
    stamped.map(({ index }) => index),
    [0, 1, 2],
  );
  assert.equal(new Set(stamped.map(({ key }) => key)).size, 3);
  for (const entry of stamped) assert.equal(entry.namespace, "canvas");
});

test("Back restores the target stack without recording further history", () => {
  const { engine, section } = createWorkspace();
  const session = createSessionHistory();
  mount({
    engine,
    history: session.history,
    location,
    initialState: { status: "absent" },
  });
  openSection(engine, section, "section-a");
  openSection(engine, section, "section-b");
  const beforeTraversal = session.writes();

  act(() => {
    session.back();
  });

  assert.deepEqual(kinds(engine), ["classes", "section"]);
  assert.deepEqual(session.writes(), beforeTraversal);
});

test("Back to the entry preceding the Canvas closes every contextual Panel", () => {
  const { engine, section } = createWorkspace();
  const session = createSessionHistory();
  mount({
    engine,
    history: session.history,
    location,
    initialState: { status: "absent" },
  });
  openSection(engine, section, "section-a");

  act(() => {
    session.back();
  });

  assert.deepEqual(kinds(engine), ["classes"]);
  assert.equal(session.at(), 0);
});

test("Forward after Back returns to the deeper stack", () => {
  const { engine, section } = createWorkspace();
  const session = createSessionHistory();
  mount({
    engine,
    history: session.history,
    location,
    initialState: { status: "absent" },
  });
  openSection(engine, section, "section-a");
  openSection(engine, section, "section-b");

  act(() => {
    session.back();
  });
  act(() => {
    session.forward();
  });

  assert.deepEqual(kinds(engine), ["classes", "section", "section"]);
});

test("rapid traversal settles on the entry the browser finished at", () => {
  const { engine, section } = createWorkspace();
  const session = createSessionHistory();
  mount({
    engine,
    history: session.history,
    location,
    initialState: { status: "absent" },
  });
  openSection(engine, section, "section-a");
  openSection(engine, section, "section-b");
  const beforeTraversal = session.writes();

  act(() => {
    session.back();
    session.back();
  });

  assert.deepEqual(kinds(engine), ["classes"]);
  assert.equal(session.at(), 0);
  assert.deepEqual(
    session.writes(),
    beforeTraversal,
    "traversal writes nothing",
  );
});

test("a cancelled Back keeps the work and returns the browser where it was", async () => {
  const { engine, section, restores } = createWorkspace();
  const session = createSessionHistory();
  mount({
    engine,
    history: session.history,
    location,
    initialState: { status: "absent" },
  });
  openSection(engine, section, "section-a");
  const guards = guardPanel(engine, engine.getSnapshot().activePanelId);

  act(() => {
    session.back();
  });
  assert.notEqual(
    engine.getSnapshot().transition,
    null,
    "one Guarded Transition must be proposed",
  );

  await act(async () => {
    await engine.resolveTransition({ decision: "stay" });
  });

  assert.deepEqual(kinds(engine), ["classes", "section"], "work is kept");
  assert.equal(session.at(), 1, "the browser is put back where it was");
  assert.equal(guards.length, 1, "exactly one dialog");
  assert.equal(restores.length, 1, "exactly one transition proposed");
  assert.deepEqual(session.repairs(), [{ method: "go", delta: 1 }]);
});

test("a cancelled Forward returns the browser back the way it came", async () => {
  const { engine, section } = createWorkspace();
  const session = createSessionHistory();
  mount({
    engine,
    history: session.history,
    location,
    initialState: { status: "absent" },
  });
  // Going Forward only removes work when the later entry is the shallower one,
  // so the Panel is opened and then closed again before traversing.
  openSection(engine, section, "section-a");
  act(() => {
    engine.close({ target: engine.getSnapshot().panels[1].instanceRef });
  });
  act(() => {
    session.back();
  });
  assert.deepEqual(kinds(engine), ["classes", "section"]);
  const guards = guardPanel(engine, engine.getSnapshot().activePanelId);

  act(() => {
    session.forward();
  });
  await act(async () => {
    await engine.resolveTransition({ decision: "stay" });
  });

  assert.deepEqual(kinds(engine), ["classes", "section"], "work is kept");
  assert.equal(session.at(), 1, "the browser is put back where it was");
  assert.equal(guards.length, 1);
  assert.deepEqual(session.repairs(), [{ method: "go", delta: -1 }]);
});

test("a confirmed Back commits the traversal and leaves the browser alone", async () => {
  const { engine, section } = createWorkspace();
  const session = createSessionHistory();
  mount({
    engine,
    history: session.history,
    location,
    initialState: { status: "absent" },
  });
  openSection(engine, section, "section-a");
  guardPanel(engine, engine.getSnapshot().activePanelId);
  const beforeTraversal = session.writes();

  act(() => {
    session.back();
  });
  await act(async () => {
    await engine.resolveTransition({ decision: "discard" });
  });

  assert.deepEqual(kinds(engine), ["classes"]);
  assert.equal(session.at(), 0);
  assert.deepEqual(
    session.repairs(),
    [],
    "a committed traversal needs no repair",
  );
  assert.deepEqual(session.writes(), beforeTraversal);
});

test("the repair traversal itself never proposes a second transition", async () => {
  const { engine, section, restores } = createWorkspace();
  const session = createSessionHistory();
  mount({
    engine,
    history: session.history,
    location,
    initialState: { status: "absent" },
  });
  openSection(engine, section, "section-a");
  const guards = guardPanel(engine, engine.getSnapshot().activePanelId);

  act(() => {
    session.back();
  });
  await act(async () => {
    await engine.resolveTransition({ decision: "stay" });
  });

  // The repair lands on an entry this Workspace stamped, so it would look like
  // a traversal worth guarding if it were not recognised as our own.
  assert.equal(restores.length, 1);
  assert.equal(guards.length, 1);
  assert.equal(engine.getSnapshot().transition, null);
});

test("traversal to an entry the Canvas never stamped is delegated", () => {
  const { engine, section, restores } = createWorkspace();
  const session = createSessionHistory();
  mount({
    engine,
    history: session.history,
    location,
    initialState: { status: "absent" },
  });
  openSection(engine, section, "section-a");
  const beforeTraversal = session.writes();

  act(() => {
    session.emit({ state: { __NA: true }, url: "/reports?tab=overview" });
  });

  assert.deepEqual(kinds(engine), ["classes", "section"]);
  assert.deepEqual(restores, []);
  assert.deepEqual(session.writes(), beforeTraversal);
});

test("an entry whose Canvas metadata was clobbered is delegated, not guessed", () => {
  const { engine, section, restores } = createWorkspace();
  const session = createSessionHistory();
  mount({
    engine,
    history: session.history,
    location,
    initialState: { status: "absent" },
  });
  openSection(engine, section, "section-a");

  act(() => {
    // The shape Next.js leaves behind when it rewrites `history.state`.
    session.emit({
      state: {
        __NA: true,
        __canvasPanels: { canvas: { namespace: "canvas" } },
      },
      url: "/classes",
    });
  });

  assert.deepEqual(kinds(engine), ["classes", "section"]);
  assert.deepEqual(restores, []);
});

test("a cancelled traversal the browser cannot undo is reported, not guessed", async () => {
  const { engine, section } = createWorkspace();
  const session = createSessionHistory();
  const failures = [];
  mount({
    engine,
    history: session.history,
    location,
    initialState: { status: "absent" },
    onHistoryFailure: (failure) => failures.push(failure),
  });
  openSection(engine, section, "section-a");
  guardPanel(engine, engine.getSnapshot().activePanelId);

  act(() => {
    // A stamped entry claiming the position the Workspace is already on: no
    // distance can be derived from it, so no repair is possible.
    session.emit({
      state: {
        __canvasPanels: {
          canvas: { namespace: "canvas", key: "stale", index: 1 },
        },
      },
      url: "/classes",
    });
  });
  await act(async () => {
    await engine.resolveTransition({ decision: "stay" });
  });

  assert.deepEqual(kinds(engine), ["classes", "section"], "work is kept");
  assert.equal(failures.length, 1);
  assert.equal(failures[0].reason, "unrepairable-position");
  assert.equal(failures[0].actual.key, "stale");
  assert.deepEqual(
    session.repairs(),
    [],
    "an unrepairable position must not be traversed blindly",
  );
});

test("a second Workspace on the same namespace navigates in memory", () => {
  const primary = createWorkspace();
  const secondary = createWorkspace();
  const primarySession = createSessionHistory();
  const secondarySession = createSessionHistory();
  const ownership = [];

  mount({
    engine: primary.engine,
    history: primarySession.history,
    location,
    initialState: { status: "absent" },
    onOwnership: (value) => ownership.push(value),
  });
  mount({
    engine: secondary.engine,
    history: secondarySession.history,
    location,
    initialState: { status: "absent" },
    onOwnership: (value) => ownership.push(value),
  });

  openSection(primary.engine, primary.section, "section-a");
  openSection(secondary.engine, secondary.section, "section-b");

  assert.deepEqual(ownership, ["url", "memory"]);
  assert.deepEqual(primarySession.writes(), ["replace", "push"]);
  assert.deepEqual(secondarySession.writes(), [], "memory mode writes nothing");
  assert.deepEqual(kinds(secondary.engine), ["classes", "section"]);
});

test("a Workspace declaring memory leaves the namespace for its host", () => {
  const nested = createWorkspace();
  const host = createWorkspace();
  const nestedSession = createSessionHistory();
  const hostSession = createSessionHistory();
  const ownership = [];

  // React commits effects child-first, so the nested Workspace mounts first.
  // Declaring memory is what stops it taking the namespace from its host.
  mount({
    engine: nested.engine,
    history: nestedSession.history,
    location,
    ownership: "memory",
    initialState: { status: "absent" },
    onOwnership: (value) => ownership.push(value),
  });
  mount({
    engine: host.engine,
    history: hostSession.history,
    location,
    initialState: { status: "absent" },
    onOwnership: (value) => ownership.push(value),
  });

  openSection(nested.engine, nested.section, "section-a");
  openSection(host.engine, host.section, "section-b");

  assert.deepEqual(ownership, ["memory", "url"]);
  assert.deepEqual(nestedSession.writes(), []);
  assert.deepEqual(hostSession.writes(), ["replace", "push"]);
});

test("rapid traversal past an open dialog settles where the browser finished", async () => {
  const { engine, section, restores } = createWorkspace();
  const session = createSessionHistory();
  mount({
    engine,
    history: session.history,
    location,
    initialState: { status: "absent" },
  });
  openSection(engine, section, "section-a");
  openSection(engine, section, "section-b");
  const guards = guardPanel(engine, engine.getSnapshot().activePanelId);

  act(() => {
    session.back();
  });
  // A second Back while the dialog is still open. The engine has already staged
  // the first target, so this must not stage another.
  act(() => {
    session.back();
  });
  assert.equal(guards.length, 1, "the second traversal raises no new dialog");
  assert.equal(restores.length, 1);

  await act(async () => {
    await engine.resolveTransition({ decision: "discard" });
  });

  // The engine commits the stack it staged, so the browser is brought back to
  // the entry that stack belongs to rather than left two entries away.
  assert.deepEqual(kinds(engine), ["classes", "section"]);
  assert.equal(session.at(), 1);
  assert.deepEqual(session.repairs(), [{ method: "go", delta: 1 }]);
});

test("rapid traversal past a cancelled dialog returns to where the Canvas is", async () => {
  const { engine, section } = createWorkspace();
  const session = createSessionHistory();
  mount({
    engine,
    history: session.history,
    location,
    initialState: { status: "absent" },
  });
  openSection(engine, section, "section-a");
  openSection(engine, section, "section-b");
  const guards = guardPanel(engine, engine.getSnapshot().activePanelId);

  act(() => {
    session.back();
  });
  act(() => {
    session.back();
  });
  await act(async () => {
    await engine.resolveTransition({ decision: "stay" });
  });

  assert.deepEqual(kinds(engine), ["classes", "section", "section"]);
  assert.equal(session.at(), 2, "the browser returns the whole distance");
  assert.equal(guards.length, 1);
  assert.deepEqual(session.repairs(), [{ method: "go", delta: 2 }]);
});

test("a repair that never lands does not deafen the Workspace", async () => {
  const { engine, section } = createWorkspace();
  const session = createSessionHistory();
  mount({
    engine,
    history: session.history,
    location,
    initialState: { status: "absent" },
  });
  openSection(engine, section, "section-a");
  const guards = guardPanel(engine, engine.getSnapshot().activePanelId);

  act(() => {
    // A stamped entry claiming a position beyond anything the session holds, so
    // the repair traversal runs off the end and no `popstate` ever answers it.
    session.emit({
      state: {
        __canvasPanels: {
          canvas: { namespace: "canvas", key: "ghost", index: 0 },
        },
      },
      url: "/classes",
    });
  });
  await act(async () => {
    await engine.resolveTransition({ decision: "stay" });
  });
  assert.deepEqual(session.repairs(), [{ method: "go", delta: 1 }]);
  assert.equal(engine.getSnapshot().transition, null);

  // Back must still work: a repair left in flight cannot be allowed to swallow
  // every later traversal for the rest of the session.
  act(() => {
    session.back();
  });

  assert.notEqual(engine.getSnapshot().transition, null);
  assert.equal(guards.length, 2);
});

test("Workspaces on different namespaces each own their own parameter", () => {
  const first = createWorkspace();
  const second = createWorkspace();
  const firstSession = createSessionHistory();
  const secondSession = createSessionHistory();
  const ownership = [];

  mount({
    engine: first.engine,
    history: firstSession.history,
    location,
    initialState: { status: "absent" },
    onOwnership: (value) => ownership.push(value),
  });
  mount({
    engine: second.engine,
    history: secondSession.history,
    location,
    parameterName: "inspector",
    initialState: { status: "absent" },
    onOwnership: (value) => ownership.push(value),
  });

  openSection(first.engine, first.section, "section-a");
  openSection(second.engine, second.section, "section-b");

  assert.deepEqual(ownership, ["url", "url"]);
  assert.deepEqual(firstSession.writes(), ["replace", "push"]);
  assert.deepEqual(secondSession.writes(), ["replace", "push"]);
});
