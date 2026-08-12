import assert from "node:assert/strict";
import test from "node:test";

import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { JSDOM } from "jsdom";
import { createElement, StrictMode } from "react";
import { renderToString } from "react-dom/server";

import {
  createPanelEngine,
  definePanel,
  defineRootPanel,
} from "../packages/canvas-panels/dist/core/index.js";
import {
  canvasBreakpointQueries,
  createCanvasModule,
} from "../packages/canvas-panels/dist/ui/index.js";

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

const Canvas = createCanvasModule({
  root,
  panels: [classPanel, learner],
  renderers: {
    classes: () => createElement("p", null, "Class list"),
    class: () => createElement("button", { type: "button" }, "Class action"),
    learner: () =>
      createElement("button", { type: "button" }, "Learner action"),
  },
});

const bounds = Object.freeze({
  min: 240,
  max: 960,
  step: 16,
  coarseStep: 64,
});

/** The stack a deep link rebuilds, seeded identically on both sides. */
function seededEngine() {
  const engine = createPanelEngine({ root, panels: [classPanel, learner] });
  const outcome = engine.restoreStack({
    references: [
      classPanel.reference({ classId: "a", name: "Class A" }),
      learner.reference({ learnerId: "ada", name: "Ada Lovelace" }),
    ],
  });
  assert.notEqual(outcome.status, "rejected");
  return engine;
}

const canvasTree = (engine) =>
  createElement(
    Canvas.Provider,
    { engine },
    createElement(Canvas.Workspace, {
      label: "Classes Canvas",
      sizing: bounds,
    }),
  );

// The server render happens before any DOM global exists, which is the only
// honest way to reproduce what a Next.js request does: a process that has
// rendered other requests already, and no `window` to read a breakpoint from.
const serverEngine = seededEngine();
const serverHtml = renderToString(canvasTree(serverEngine));
const serverPanelIds = [
  ...serverHtml.matchAll(/data-canvas-panel-id="([^"]*)"/g),
].map(([, id]) => id);

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
globalThis.getComputedStyle = dom.window.getComputedStyle;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const queryFor = Object.fromEntries(canvasBreakpointQueries);
dom.window.matchMedia = (query) => ({
  media: query,
  matches: queryFor.desktop === query,
  addEventListener: () => {},
  removeEventListener: () => {},
});

/**
 * Hydrates the server's markup with a freshly created client engine, exactly
 * as a browser does, and reports anything React logged while doing it.
 */
function hydrate({ measure, strict = false } = {}) {
  // Each hydration starts from an empty document: a Workspace left mounted by
  // an earlier test is still watching for stranded focus and would answer for
  // focus moves this one makes.
  cleanup();
  dom.window.document.body.replaceChildren();
  const container = dom.window.document.createElement("div");
  container.innerHTML = serverHtml;
  dom.window.document.body.append(container);
  const measured = new Map();
  if (measure) {
    // A width per Panel, not one width for all of them: a lookup that answered
    // with the wrong Panel would still report the right number otherwise.
    for (const [index, panel] of [
      ...container.querySelectorAll("[data-canvas-panel]"),
    ].entries()) {
      const width = measure + index * 64;
      measured.set(panel, width);
      Object.defineProperty(panel, "offsetWidth", {
        configurable: true,
        value: width,
      });
    }
  }
  const engine = seededEngine();
  const logged = [];
  const consoleError = console.error;
  const consoleWarn = console.warn;
  console.error = (...args) => logged.push(args.map(String).join(" "));
  console.warn = (...args) => logged.push(args.map(String).join(" "));
  const tree = canvasTree(engine);
  try {
    act(() => {
      render(strict ? createElement(StrictMode, null, tree) : tree, {
        container,
        hydrate: true,
      });
    });
  } finally {
    console.error = consoleError;
    console.warn = consoleWarn;
  }
  return { container, engine, logged, measured };
}

const panels = (container) => [
  ...container.querySelectorAll("[data-canvas-panel]"),
];

const visibleHeadings = (container) => [
  ...container.querySelectorAll("[data-canvas-panel]:not([hidden]) h2"),
];

function pressF6(container, { shiftKey = false } = {}) {
  act(() => {
    fireEvent.keyDown(container.querySelector("[data-canvas-workspace]"), {
      key: "F6",
      shiftKey,
    });
  });
}

test("two Panel Engines in one process mint the same Panel Instance IDs", () => {
  // The root cause of every failure below: a server process creates one Engine
  // per request, a browser creates its first. If the identifier depends on how
  // many Engines came before it, the two can never agree.
  const first = seededEngine();
  const second = seededEngine();

  assert.deepEqual(
    second.getSnapshot().panels.map(({ instanceId }) => instanceId),
    first.getSnapshot().panels.map(({ instanceId }) => instanceId),
  );
});

test("a hydrated Canvas agrees with its client Engine about every Panel's DOM identity", () => {
  const { container, engine, logged } = hydrate();

  assert.equal(serverPanelIds.length, 3);
  assert.deepEqual(
    panels(container).map((panel) =>
      panel.getAttribute("data-canvas-panel-id"),
    ),
    engine.getSnapshot().panels.map(({ instanceId }) => instanceId),
  );
  assert.deepEqual(
    logged.filter((message) => /hydrat/i.test(message)),
    [],
  );
});

test("Strict Mode's double-invocation does not disturb a hydrated Canvas", () => {
  // Strict Mode runs the Provider's state initialiser twice, so it creates and
  // throws away a Panel Engine before keeping one. An identity that counted
  // Engines would be one behind from that alone, hydration or no hydration.
  const { container, engine, logged } = hydrate({ strict: true });

  assert.deepEqual(
    panels(container).map((panel) =>
      panel.getAttribute("data-canvas-panel-id"),
    ),
    engine.getSnapshot().panels.map(({ instanceId }) => instanceId),
  );
  assert.deepEqual(
    logged.filter((message) => /hydrat/i.test(message)),
    [],
  );
});

test("F6 cycles through every Panel after hydration", () => {
  const { container } = hydrate();
  const headings = visibleHeadings(container);
  assert.equal(headings.length, 3, "the fixture needs three visible Panels");
  // Compared by position rather than by element: a failed comparison of two
  // jsdom nodes spends longer building its diff than the suite has.
  const focusedIndex = () =>
    headings.indexOf(dom.window.document.activeElement);

  act(() => {
    headings[0].focus();
  });

  // All the way round, so every Panel is reached and the wrap is proven.
  for (const expected of [1, 2, 0]) {
    pressF6(container);
    assert.equal(focusedIndex(), expected);
  }
  for (const expected of [2, 1, 0]) {
    pressF6(container, { shiftKey: true });
    assert.equal(focusedIndex(), expected);
  }
});

test("a separator reports its own Panel's real width after hydration", () => {
  const { container, measured } = hydrate({ measure: 542 });

  const separators = [
    ...container.querySelectorAll("[data-canvas-panel-separator]"),
  ];
  assert.ok(separators.length >= 1, "the fixture needs a resizable Panel");
  for (const separator of separators) {
    const panel = separator.closest("[data-canvas-panel]");
    assert.equal(
      Number(separator.getAttribute("aria-valuenow")),
      measured.get(panel),
    );
  }
});
