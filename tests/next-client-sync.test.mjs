import assert from "node:assert/strict";
import test from "node:test";

import { act, render } from "@testing-library/react";
import { JSDOM } from "jsdom";
import { createElement } from "react";

import {
  createPanelEngine,
  definePanel,
  defineRootPanel,
  encodeNavigationParameter,
} from "../packages/canvas-panels/dist/core/index.js";
import {
  seedCanvasNavigation,
  useCanvasNavigationSync,
} from "../packages/canvas-panels/dist/next/index.js";
import { readCanvasNavigationState } from "../packages/canvas-panels/dist/next/server.js";

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

function createWorkspace({ restore } = {}) {
  const root = defineRootPanel({ kind: "classes", title: "Classes" });
  const section = definePanel({
    kind: "section",
    title: ({ id }) => id,
    persistence: restore
      ? { mode: "navigation-with-loader", version: 1, codec, restore }
      : { mode: "navigation", version: 1, codec },
  });
  return {
    section,
    engine: createPanelEngine({ root, panels: [section] }),
  };
}

function documentFor(ids, { restore } = {}) {
  const { engine, section } = createWorkspace({ restore });
  for (const id of ids) {
    engine.open({
      originId: engine.getSnapshot().panels.at(-1).instanceId,
      panel: section.reference({ id }),
    });
  }
  return engine.encodeNavigationDocument();
}

function createRouter() {
  const calls = [];
  return {
    calls,
    router: {
      replace: (url) => calls.push({ method: "replace", url }),
      push: (url) => calls.push({ method: "push", url }),
    },
  };
}

function Harness(options) {
  useCanvasNavigationSync(options);
  return null;
}

test("seeding an absent navigation state leaves the Canvas at its Root Panel", () => {
  const { engine } = createWorkspace();

  assert.deepEqual(seedCanvasNavigation(engine, { status: "absent" }), {
    status: "absent",
  });
  assert.equal(engine.getSnapshot().panels.length, 1);
});

test("seeding reconstructs the complete contextual stack before first render", () => {
  const { engine } = createWorkspace();
  const document = documentFor(["section-a", "section-b"]);

  const outcome = seedCanvasNavigation(engine, { status: "decoded", document });

  assert.deepEqual(outcome, { status: "seeded", panelCount: 2 });
  assert.deepEqual(
    engine.getSnapshot().panels.map(({ kind }) => kind),
    ["classes", "section", "section"],
  );
  assert.equal(engine.encodeNavigationDocument(), document);
});

test("seeding a malformed navigation state recovers to the Root Panel", () => {
  const { engine } = createWorkspace();

  const outcome = seedCanvasNavigation(engine, {
    status: "rejected",
    diagnostic: { code: "invalid-base64url", path: "$" },
  });

  assert.equal(outcome.status, "recovered");
  assert.deepEqual(outcome.recovery, {
    kind: "recovery-panel",
    reason: "invalid-document",
    failedPanelIndex: null,
  });
  assert.equal(engine.getSnapshot().panels.length, 1);
});

test("seeding a document the registry cannot decode reports the failing Panel", () => {
  const { engine } = createWorkspace();
  const document =
    '{"panels":[{"descriptor":{"id":"section-a"},"kind":"section","version":1},{"descriptor":{"id":7},"kind":"section","version":1}],"version":1}';

  const outcome = seedCanvasNavigation(engine, {
    status: "decoded",
    document,
  });

  assert.equal(outcome.status, "recovered");
  assert.equal(outcome.recovery.failedPanelIndex, 1);
  assert.equal(engine.getSnapshot().panels.length, 1);
});

test("an unrelated route is delegated without the Canvas claiming the URL", () => {
  const { engine } = createWorkspace();
  const { router, calls } = createRouter();

  act(() => {
    render(
      createElement(Harness, {
        engine,
        router,
        location: { pathname: "/reports", search: "?tab=overview", hash: "" },
        initialState: { status: "absent" },
      }),
    );
  });

  assert.deepEqual(calls, []);
});

test("opening a Panel writes the navigation parameter beside unrelated query state", () => {
  const { engine, section } = createWorkspace();
  const { router, calls } = createRouter();

  act(() => {
    render(
      createElement(Harness, {
        engine,
        router,
        location: {
          pathname: "/classes",
          search: "?tab=overview",
          hash: "#roster",
        },
        initialState: { status: "absent" },
      }),
    );
  });
  act(() => {
    engine.open({
      originId: engine.getSnapshot().activePanelId,
      panel: section.reference({ id: "section-a" }),
    });
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "replace");
  const url = new URL(calls[0].url, "https://canvas-panels.test");
  assert.equal(url.pathname, "/classes");
  assert.equal(url.hash, "#roster");
  assert.equal(url.searchParams.get("tab"), "overview");
  assert.equal(
    readCanvasNavigationState(url.searchParams).document,
    engine.encodeNavigationDocument(),
  );
});

test("returning to the Root Panel removes the navigation parameter", () => {
  const { engine, section } = createWorkspace();
  const { router, calls } = createRouter();
  const opened = engine.open({
    originId: engine.getSnapshot().activePanelId,
    panel: section.reference({ id: "section-a" }),
  });

  act(() => {
    render(
      createElement(Harness, {
        engine,
        router,
        location: {
          pathname: "/classes",
          search: `?tab=overview&canvas=${encodeNavigationParameter(
            engine.encodeNavigationDocument(),
          )}`,
          hash: "",
        },
        initialState: { status: "absent" },
      }),
    );
  });
  act(() => {
    engine.close({
      target: engine
        .getSnapshot()
        .panels.find(({ instanceId }) => instanceId === opened.instanceId)
        .instanceRef,
    });
  });

  const last = calls.at(-1);
  const url = new URL(last.url, "https://canvas-panels.test");
  assert.equal(url.searchParams.has("canvas"), false);
  assert.equal(url.searchParams.get("tab"), "overview");
});

test("presentation changes alone never rewrite the URL", () => {
  const { engine, section } = createWorkspace();
  const { router, calls } = createRouter();
  engine.open({
    originId: engine.getSnapshot().activePanelId,
    panel: section.reference({ id: "section-a" }),
  });

  act(() => {
    render(
      createElement(Harness, {
        engine,
        router,
        location: {
          pathname: "/classes",
          search: `?canvas=${encodeNavigationParameter(
            engine.encodeNavigationDocument(),
          )}`,
          hash: "",
        },
        initialState: { status: "absent" },
      }),
    );
  });
  act(() => {
    engine.setPresentation({ breakpoint: "mobile" });
  });

  assert.deepEqual(calls, []);
});

test("an inaccessible restored Panel is recovered and the URL is normalized", async () => {
  const { engine } = createWorkspace({
    restore: async ({ id }) =>
      id === "section-b" ? { status: "denied" } : { status: "available" },
  });
  const document = documentFor(["section-a", "section-b"], {
    restore: async () => ({ status: "available" }),
  });
  seedCanvasNavigation(engine, { status: "decoded", document });
  const { router, calls } = createRouter();
  const recoveries = [];

  await act(async () => {
    render(
      createElement(Harness, {
        engine,
        router,
        location: {
          pathname: "/classes",
          search: `?canvas=${encodeNavigationParameter(document)}`,
          hash: "",
        },
        initialState: { status: "decoded", document },
        onRecovery: (intent) => recoveries.push(intent),
      }),
    );
  });

  assert.deepEqual(recoveries, [
    { kind: "recovery-panel", reason: "denied", failedPanelIndex: 1 },
  ]);
  assert.deepEqual(
    engine.getSnapshot().panels.map(({ kind }) => kind),
    ["classes", "section"],
  );
  const url = new URL(calls.at(-1).url, "https://canvas-panels.test");
  assert.equal(
    readCanvasNavigationState(url.searchParams).document,
    engine.encodeNavigationDocument(),
  );
});

test("a fully available restored stack is left untouched", async () => {
  const restore = async () => ({ status: "available" });
  const { engine } = createWorkspace({ restore });
  const document = documentFor(["section-a", "section-b"], { restore });
  seedCanvasNavigation(engine, { status: "decoded", document });
  const { router, calls } = createRouter();
  const recoveries = [];

  await act(async () => {
    render(
      createElement(Harness, {
        engine,
        router,
        location: {
          pathname: "/classes",
          search: `?canvas=${encodeNavigationParameter(document)}`,
          hash: "",
        },
        initialState: { status: "decoded", document },
        onRecovery: (intent) => recoveries.push(intent),
      }),
    );
  });

  assert.deepEqual(recoveries, []);
  assert.deepEqual(calls, []);
  assert.equal(engine.getSnapshot().panels.length, 3);
});

test("a malformed navigation parameter is normalized out of the address", () => {
  const { engine } = createWorkspace();
  const { router, calls } = createRouter();

  act(() => {
    render(
      createElement(Harness, {
        engine,
        router,
        location: {
          pathname: "/classes",
          search: "?tab=overview&canvas=not-a-canvas-value",
          hash: "",
        },
        initialState: {
          status: "rejected",
          diagnostic: { code: "missing-prefix", path: "$" },
        },
      }),
    );
  });

  assert.equal(calls.length, 1);
  const url = new URL(calls[0].url, "https://canvas-panels.test");
  assert.equal(url.searchParams.has("canvas"), false);
  assert.equal(url.searchParams.get("tab"), "overview");
});

test("a Canvas resting at its Root Panel does not rewrite the URL repeatedly", () => {
  const { engine, section } = createWorkspace();
  const { router, calls } = createRouter();

  act(() => {
    render(
      createElement(Harness, {
        engine,
        router,
        location: {
          pathname: "/classes",
          search: "?canvas=not-a-canvas-value",
          hash: "",
        },
        initialState: {
          status: "rejected",
          diagnostic: { code: "missing-prefix", path: "$" },
        },
      }),
    );
  });
  const afterNormalization = calls.length;

  act(() => {
    const opened = engine.open({
      originId: engine.getSnapshot().activePanelId,
      panel: section.reference({ id: "section-a" }),
    });
    engine.close({
      target: engine
        .getSnapshot()
        .panels.find(({ instanceId }) => instanceId === opened.instanceId)
        .instanceRef,
    });
  });
  const afterRoundTrip = calls.length;

  act(() => {
    engine.setPresentation({ breakpoint: "mobile" });
    engine.setPresentation({ breakpoint: "desktop" });
  });

  assert.equal(afterNormalization, 1);
  assert.equal(afterRoundTrip, 3);
  assert.equal(calls.length, afterRoundTrip, "resting at Root must be quiet");
});

test("a Panel Stack too large to encode leaves the address untouched", () => {
  const { engine } = createWorkspace();
  const { router, calls } = createRouter();
  const oversizedEngine = {
    ...engine,
    encodeNavigationDocument: () => {
      throw new RangeError("Navigation Document exceeds the byte limit");
    },
  };

  assert.doesNotThrow(() => {
    act(() => {
      render(
        createElement(Harness, {
          engine: oversizedEngine,
          router,
          location: { pathname: "/classes", search: "", hash: "" },
          initialState: { status: "absent" },
        }),
      );
    });
  });

  assert.deepEqual(calls, []);
});
