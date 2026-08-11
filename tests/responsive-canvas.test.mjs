import assert from "node:assert/strict";
import test from "node:test";

import { act, render } from "@testing-library/react";
import { JSDOM } from "jsdom";
import { createElement } from "react";

import {
  createPanelEngine,
  definePanel,
  defineRootPanel,
} from "../packages/canvas-panels/dist/core/index.js";
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
globalThis.getComputedStyle = dom.window.getComputedStyle;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const queryFor = Object.fromEntries(canvasBreakpointQueries);

function installViewport(initial) {
  let current = initial;
  const listeners = new Map();
  dom.window.matchMedia = (query) => {
    const list = {
      media: query,
      get matches() {
        return queryFor[current] === query;
      },
      addEventListener: (_event, listener) => {
        listeners.set(listener, query);
      },
      removeEventListener: (listener) => {
        listeners.delete(listener);
      },
    };
    return list;
  };
  return {
    resizeTo(breakpoint) {
      current = breakpoint;
      for (const [listener] of listeners) {
        listener({ matches: queryFor[breakpoint] === listeners.get(listener) });
      }
    },
  };
}

function buildCanvas() {
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
  const engine = createPanelEngine({ root, panels: [classPanel, learner] });
  engine.open({
    originId: engine.getSnapshot().activePanelId,
    panel: classPanel.reference({ classId: "a", name: "Class A" }),
  });
  engine.open({
    originId: engine.getSnapshot().activePanelId,
    panel: learner.reference({ learnerId: "ada", name: "Ada Lovelace" }),
  });
  return { Canvas, engine };
}

function renderCanvas(breakpoint) {
  const viewport = installViewport(breakpoint);
  const { Canvas, engine } = buildCanvas();
  let result;
  act(() => {
    result = render(
      createElement(
        Canvas.Provider,
        { engine },
        createElement(Canvas.Workspace, { label: "Classes Canvas" }),
      ),
    );
  });
  return { ...result, engine, viewport };
}

function panels(container) {
  return [...container.querySelectorAll("[data-canvas-panel]")];
}

test("the declared breakpoints cover desktop, tablet, and mobile", () => {
  assert.deepEqual(
    canvasBreakpointQueries.map(([breakpoint]) => breakpoint),
    ["mobile", "tablet", "desktop"],
  );
  for (const [, query] of canvasBreakpointQueries) {
    assert.match(query, /width/);
  }
});

test("desktop presents the ordered horizontal multi-Panel Canvas", () => {
  const { container } = renderCanvas("desktop");
  const rendered = panels(container);

  assert.equal(rendered.length, 3);
  assert.deepEqual(
    rendered.map((panel) => panel.getAttribute("data-panel-kind")),
    ["classes", "class", "learner"],
  );
  for (const panel of rendered) {
    assert.equal(panel.hasAttribute("hidden"), false);
    assert.equal(panel.hasAttribute("inert"), false);
  }
});

test("tablet presents the focused Panel plus one previous-context Panel", () => {
  const { container } = renderCanvas("tablet");
  const rendered = panels(container);

  assert.equal(rendered.length, 3);
  assert.deepEqual(
    rendered.map((panel) => panel.hasAttribute("hidden")),
    [true, false, false],
  );
  assert.equal(
    rendered[1].getAttribute("data-canvas-panel-context"),
    "previous",
  );
});

test("mobile presents exactly one interactive focused Panel", () => {
  const { container } = renderCanvas("mobile");
  const rendered = panels(container);

  assert.equal(rendered.length, 3);
  assert.deepEqual(
    rendered.map((panel) => panel.hasAttribute("hidden")),
    [true, true, false],
  );
});

test("hidden retained Panels are inert and absent from the accessibility tree", () => {
  const { container } = renderCanvas("mobile");
  const [rootPanel, classPanel] = panels(container);

  for (const panel of [rootPanel, classPanel]) {
    assert.equal(panel.getAttribute("aria-hidden"), "true");
    assert.equal(panel.hasAttribute("inert"), true);
    assert.equal(panel.hasAttribute("hidden"), true);
  }
  assert.equal(
    classPanel.querySelector("button").closest("[inert]"),
    classPanel,
  );
});

test("resizing across breakpoints preserves instances, order, activation, and history", () => {
  const { container, engine, viewport } = renderCanvas("desktop");
  const before = engine.getSnapshot();
  const identities = panels(container).map((panel) =>
    panel.getAttribute("data-panel-kind"),
  );

  act(() => viewport.resizeTo("mobile"));
  act(() => viewport.resizeTo("tablet"));
  act(() => viewport.resizeTo("desktop"));

  const after = engine.getSnapshot();
  assert.equal(after.version, before.version);
  assert.equal(after.panels, before.panels);
  assert.equal(after.activePanelId, before.activePanelId);
  assert.equal(after.transition, before.transition);
  assert.deepEqual(
    panels(container).map((panel) => panel.getAttribute("data-panel-kind")),
    identities,
  );
});

test("a Panel that becomes hidden cannot retain focus", () => {
  const { container, viewport } = renderCanvas("desktop");
  const classAction = panels(container)[1].querySelector("button");

  act(() => classAction.focus());
  assert.equal(dom.window.document.activeElement, classAction);

  act(() => viewport.resizeTo("mobile"));

  assert.notEqual(dom.window.document.activeElement, classAction);
  assert.equal(
    dom.window.document.activeElement.closest("[data-canvas-panel]"),
    panels(container)[2],
  );
});

test("mobile offers an explicit Back control that activates the previous Panel", () => {
  const { container, engine } = renderCanvas("mobile");
  const back = container.querySelector("[data-canvas-back]");

  assert.ok(back, "mobile must render an explicit Back control");
  act(() => back.click());

  const snapshot = engine.getSnapshot();
  assert.equal(snapshot.activePanelId, snapshot.panels[1].instanceId);
  assert.equal(snapshot.panels.length, 3);
});

test("mobile renders complete breadcrumbs for the contextual stack", () => {
  const { container, engine } = renderCanvas("mobile");
  const breadcrumbs = container.querySelector("[data-canvas-breadcrumbs]");

  assert.ok(breadcrumbs);
  assert.deepEqual(
    [...breadcrumbs.querySelectorAll("li")].map((item) =>
      item.textContent.trim(),
    ),
    ["Classes", "Class A", "Ada Lovelace"],
  );

  act(() => breadcrumbs.querySelector("button").click());
  assert.equal(
    engine.getSnapshot().activePanelId,
    engine.getSnapshot().panels[0].instanceId,
  );
});

test("desktop presents no Back control or breadcrumb navigation", () => {
  const { container } = renderCanvas("desktop");

  assert.equal(container.querySelector("[data-canvas-back]"), null);
  assert.equal(container.querySelector("[data-canvas-breadcrumbs]"), null);
});

test("each Panel body is its own scroll container beneath a retained header", () => {
  const { container } = renderCanvas("desktop");

  for (const panel of panels(container)) {
    const header = panel.querySelector("[data-canvas-panel-header]");
    const body = panel.querySelector("[data-canvas-panel-body]");
    assert.ok(header, "every Panel keeps its header");
    assert.ok(body, "every Panel scrolls its own body");
    assert.equal(body.previousElementSibling, header);
  }
});

test("a Canvas without matchMedia presents the desktop Canvas", () => {
  const originalMatchMedia = dom.window.matchMedia;
  dom.window.matchMedia = undefined;
  const { Canvas, engine } = buildCanvas();

  let container;
  act(() => {
    ({ container } = render(
      createElement(
        Canvas.Provider,
        { engine },
        createElement(Canvas.Workspace, { label: "Classes Canvas" }),
      ),
    ));
  });

  assert.equal(engine.getSnapshot().breakpoint, "desktop");
  assert.deepEqual(
    panels(container).map((panel) => panel.hasAttribute("hidden")),
    [false, false, false],
  );
  dom.window.matchMedia = originalMatchMedia;
});
