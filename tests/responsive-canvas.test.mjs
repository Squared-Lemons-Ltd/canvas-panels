import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

const stylesheet = await readFile(
  new URL("../packages/canvas-panels/dist/styles.css", import.meta.url),
  "utf8",
);

/**
 * The declarations the built stylesheet writes for one selector.
 *
 * The selector has to start its own line, so a rule is never answered with a
 * mention of the same attribute inside another rule's comment or a descendant
 * selector — `[data-canvas-breadcrumbs]` and `[data-canvas-breadcrumbs] li`
 * are two different rules and this suite asserts about both.
 */
function declarationsFor(selector) {
  const escaped = selector.replace(/[[\]]/g, "\\$&");
  const rule = stylesheet.match(
    new RegExp(`^\\s*${escaped} \\{([^}]*)\\}`, "m"),
  );
  assert.ok(rule, `the stylesheet must style ${selector}`);
  return rule[1];
}

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

test("the breadcrumb trail is one scrolling line, whatever the titles are", () => {
  const bar = declarationsFor("[data-canvas-mobile-navigation]");
  const trail = declarationsFor("[data-canvas-breadcrumbs]");
  const crumb = declarationsFor("[data-canvas-breadcrumbs] li button");

  // jsdom does no layout, so this is asserted where the height actually comes
  // from. The trail used to be a wrapping flex row of full Panel titles, which
  // made its height unbounded in the length of those titles: measured in
  // Chromium at 390px with a real application's three-deep stack, the
  // navigation bar was 236px tall, and 54px once each crumb was clamped to a
  // line and the trail scrolled within itself.
  assert.match(trail, /flex-wrap:\s*nowrap;/);
  assert.match(trail, /overflow-x:\s*auto;/);
  // Both axes, stated: a `visible` axis computes to `auto` beside one that is
  // not, and a trail that scrolls vertically is the wrapping trail again.
  assert.match(trail, /overflow-y:\s*hidden;/);
  // What lets a flex item scroll instead of widening the bar past the Canvas.
  assert.match(trail, /min-width:\s*0;/);
  assert.match(bar, /flex-wrap:\s*nowrap;/);

  // One line per crumb, clamped, so depth costs scroll rather than height.
  assert.match(crumb, /white-space:\s*nowrap;/);
  assert.match(crumb, /overflow:\s*hidden;/);
  assert.match(crumb, /text-overflow:\s*ellipsis;/);
  assert.match(crumb, /max-inline-size:\s*[\d.]+rem;/);
});

test("the breadcrumb trail rests where the Active Panel's crumb is", () => {
  const { container } = renderCanvas("mobile");
  const trail = container.querySelector("[data-canvas-breadcrumbs]");
  const crumbs = [...trail.querySelectorAll("button")];

  // The crumb for the Active Panel is the last one the trail renders, which is
  // what makes the inline end the right place for a scrolling trail to rest: a
  // trail left at its inline start hides the crumb saying where you are.
  assert.equal(
    crumbs.filter((crumb) => crumb.hasAttribute("aria-current")).length,
    1,
  );
  assert.equal(crumbs.at(-1).getAttribute("aria-current"), "page");

  // jsdom has no layout, so a scrollable width is given to the trail rather
  // than measured from one — the assertion is that the Canvas writes the
  // inline-end offset when the Active Panel changes, not that a browser
  // scrolled anywhere.
  Object.defineProperty(trail, "scrollWidth", {
    configurable: true,
    value: 900,
  });
  assert.equal(trail.scrollLeft, 0);

  act(() => crumbs[0].click());

  assert.equal(trail.scrollLeft, 900);
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

test("a Panel body rounds with its Panel, whatever rounded the Panel", () => {
  const { container } = renderCanvas("desktop");
  const panel = declarationsFor("[data-canvas-panel]");
  const body = declarationsFor("[data-canvas-panel-body]");

  // The Panel takes its corner from the token.
  assert.match(panel, /border-radius:\s*var\(--canvas-panel-radius\);/);

  // The body takes its two bottom corners from the *Panel*, and deliberately
  // not from the token. `[data-canvas-panel]` is a documented attribute, so a
  // rule an application writes against it is a supported way to round a Panel —
  // or to square one again below an ancestor that set the token, which is what
  // a Canvas nested inside a Panel does. Reading `var(--canvas-panel-radius)`
  // here would follow only the token, leaving a square Panel clipping its
  // content on a curve; `inherit` follows whatever the Panel actually computed,
  // from any route.
  assert.match(body, /border-end-end-radius:\s*inherit;/);
  assert.match(body, /border-end-start-radius:\s*inherit;/);
  assert.doesNotMatch(body, /-radius:\s*var\(/);

  // Which holds only while the body is the Panel's own child: `inherit` takes
  // the parent's computed value, so a wrapper introduced between the two would
  // hand it some other element's corner and the clipping would silently stop
  // tracking. Asserted through the attributes rather than by comparing the two
  // elements, because a failing assertion on a pair of DOM nodes hangs this
  // runner with no output.
  for (const element of panels(container)) {
    const panelBody = element.querySelector("[data-canvas-panel-body]");
    assert.equal(
      panelBody.parentElement.hasAttribute("data-canvas-panel"),
      true,
      "a Panel body must be the Panel's own child",
    );
    assert.equal(
      panelBody.parentElement.getAttribute("data-canvas-panel-id"),
      element.getAttribute("data-canvas-panel-id"),
    );
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

test("a retained Panel keeps its vertical scroll across presentations", () => {
  const { container, viewport } = renderCanvas("desktop");
  const classBody = panels(container)[1].querySelector(
    "[data-canvas-panel-body]",
  );

  act(() => {
    classBody.scrollTop = 240;
    classBody.dispatchEvent(new dom.window.Event("scroll", { bubbles: true }));
  });
  act(() => viewport.resizeTo("mobile"));
  // Hiding the Panel with `display: none` resets the offset in a real browser.
  classBody.scrollTop = 0;
  act(() => viewport.resizeTo("desktop"));

  assert.equal(
    panels(container)[1].querySelector("[data-canvas-panel-body]").scrollTop,
    240,
  );
});

test("focus dropped to the body by a hidden Panel is reclaimed by the Canvas", () => {
  const { container, viewport } = renderCanvas("desktop");
  const classAction = panels(container)[1].querySelector("button");

  act(() => classAction.focus());
  act(() => {
    // A browser blurs a Panel it hides; jsdom implements neither `inert` nor
    // `display: none`, so the blur is simulated here.
    classAction.blur();
    viewport.resizeTo("mobile");
  });

  assert.equal(
    dom.window.document.activeElement.closest("[data-canvas-panel]"),
    panels(container)[2],
  );
});

test("a declared width is presentation-independent, and the stylesheet still decides the narrow ones", () => {
  const root = defineRootPanel({ kind: "classes", title: "Classes" });
  const record = definePanel({
    kind: "record",
    title: () => "Record",
    width: { resting: "30rem", active: "52rem" },
  });
  const Canvas = createCanvasModule({
    root,
    panels: [record],
    renderers: { classes: () => null, record: () => null },
  });
  const engine = createPanelEngine({ root, panels: [record] });
  engine.open({ panel: record.reference({}) });
  const viewport = installViewport("desktop");
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

  // The Canvas resolves a declared width once and leaves it there. It stays on
  // a Panel the presentation has hidden, so nothing has to be re-resolved when
  // that Panel comes back, and it is still only a custom property: the narrow
  // presentations set `flex-basis` directly, which is what keeps a wide Kind
  // from carrying its desktop column onto a phone.
  for (const breakpoint of ["tablet", "mobile", "desktop"]) {
    act(() => viewport.resizeTo(breakpoint));
    const panel = panels(result.container).at(-1);
    assert.equal(panel.getAttribute("data-panel-kind"), "record");
    assert.equal(panel.style.getPropertyValue("--canvas-panel-width"), "30rem");
    assert.equal(
      panel.style.getPropertyValue("--canvas-panel-active-width"),
      "52rem",
    );
  }
});
