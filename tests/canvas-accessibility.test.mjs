import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { act, fireEvent, render } from "@testing-library/react";
import { JSDOM } from "jsdom";
import { createElement } from "react";

import {
  createPanelEngine,
  definePanel,
  defineRootPanel,
} from "../packages/canvas-panels/dist/core/index.js";
import {
  canvasAnnouncementTemplates,
  canvasBreakpointQueries,
  createCanvasModule,
} from "../packages/canvas-panels/dist/ui/index.js";

// Read before a single `test()` is registered, and deliberately not further
// down beside the tests that use it. A top-level `await` suspends module
// evaluation, and the runner is free to start tests that were already
// registered while it waits — so a binding declared after the await is still in
// its temporal dead zone when an earlier test reaches for it. That failed as
// `ReferenceError: Cannot access 'stylesheet' before initialization`, on one
// Node version, in one run out of several, from a file that had not changed.
const stylesheet = await readFile(
  new URL("../packages/canvas-panels/dist/styles.css", import.meta.url),
  "utf8",
);

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
  dom.window.matchMedia = (query) => ({
    media: query,
    get matches() {
      return queryFor[current] === query;
    },
    addEventListener: (_event, listener) => listeners.set(listener, query),
    removeEventListener: (listener) => listeners.delete(listener),
  });
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
  return { Canvas, classPanel, engine, learner };
}

const bounds = Object.freeze({
  min: 240,
  max: 960,
  step: 16,
  coarseStep: 64,
});

function renderCanvas({ breakpoint = "desktop", announcements, sizing } = {}) {
  const viewport = installViewport(breakpoint);
  const built = buildCanvas();
  let result;
  act(() => {
    result = render(
      createElement(
        built.Canvas.Provider,
        { engine: built.engine },
        createElement(built.Canvas.Workspace, {
          label: "Classes Canvas",
          announcements,
          sizing,
        }),
      ),
    );
  });
  return { ...result, ...built, viewport };
}

function openClassAndLearner({ engine, classPanel, learner }) {
  act(() => {
    engine.open({
      originId: engine.getSnapshot().activePanelId,
      panel: classPanel.reference({ classId: "a", name: "Class A" }),
    });
  });
  act(() => {
    engine.open({
      originId: engine.getSnapshot().activePanelId,
      panel: learner.reference({ learnerId: "ada", name: "Ada Lovelace" }),
    });
  });
}

function headings(container) {
  return [...container.querySelectorAll("[data-canvas-panel] h2")];
}

function focusedHeading(container) {
  return headings(container).find(
    (heading) => heading === dom.window.document.activeElement,
  );
}

function announcer(container) {
  return container.querySelector("[data-canvas-announcer]");
}

function pressF6(container, { shiftKey = false } = {}) {
  act(() => {
    fireEvent.keyDown(container.querySelector("[data-canvas-workspace]"), {
      key: "F6",
      shiftKey,
    });
  });
}

test("the Canvas exposes exactly one polite live region", () => {
  const { container } = renderCanvas();

  const regions = container.querySelectorAll("[aria-live]");
  assert.equal(regions.length, 1);
  assert.equal(regions[0].getAttribute("aria-live"), "polite");
  assert.equal(regions[0].getAttribute("aria-atomic"), "true");
});

test("the live region does not claim a role applications query for", () => {
  const { container } = renderCanvas();

  // `role="status"` would mean every application's own `getByRole("status")`
  // suddenly matched two elements.
  assert.equal(announcer(container).hasAttribute("role"), false);
});

test("the live region is empty until something structural happens", () => {
  const { container } = renderCanvas();

  assert.equal(announcer(container).textContent, "");
});

test("opening and closing Panels is announced", () => {
  const canvas = renderCanvas();
  openClassAndLearner(canvas);

  assert.equal(
    announcer(canvas.container).textContent,
    "Ada Lovelace opened. Panel 3 of 3.",
  );

  act(() => {
    canvas.engine.close({
      target: canvas.engine.getSnapshot().panels.at(-1).instanceRef,
    });
  });

  assert.equal(
    announcer(canvas.container).textContent,
    "Ada Lovelace closed. Showing Class A. Panel 2 of 2.",
  );
});

test("activating a Panel announces nothing new", () => {
  const canvas = renderCanvas();
  openClassAndLearner(canvas);
  const afterOpening = announcer(canvas.container).textContent;

  act(() => {
    canvas.engine.activate({
      target: canvas.engine.getSnapshot().panels[1].instanceRef,
    });
  });

  assert.equal(announcer(canvas.container).textContent, afterOpening);
});

test("a breakpoint change announces the new presentation", () => {
  const canvas = renderCanvas();
  openClassAndLearner(canvas);

  act(() => {
    canvas.viewport.resizeTo("mobile");
  });

  assert.equal(
    announcer(canvas.container).textContent,
    "Mobile layout. Showing 1 of 3 panels.",
  );
});

test("announcement templates can be replaced for localization", () => {
  const canvas = renderCanvas({
    announcements: {
      ...canvasAnnouncementTemplates,
      opened: ({ title, position, total }) =>
        `${title} ouvert. Panneau ${position} sur ${total}.`,
    },
  });
  openClassAndLearner(canvas);

  assert.equal(
    announcer(canvas.container).textContent,
    "Ada Lovelace ouvert. Panneau 3 sur 3.",
  );
});

test("F6 cycles forward through the visible Panel regions", () => {
  const canvas = renderCanvas();
  openClassAndLearner(canvas);
  const [classes, classA, ada] = headings(canvas.container);

  act(() => {
    classes.focus();
  });
  pressF6(canvas.container);
  assert.equal(focusedHeading(canvas.container), classA);

  pressF6(canvas.container);
  assert.equal(focusedHeading(canvas.container), ada);

  // And wraps.
  pressF6(canvas.container);
  assert.equal(focusedHeading(canvas.container), classes);
});

test("Shift+F6 cycles backward through the visible Panel regions", () => {
  const canvas = renderCanvas();
  openClassAndLearner(canvas);
  const [classes, , ada] = headings(canvas.container);

  act(() => {
    classes.focus();
  });
  pressF6(canvas.container, { shiftKey: true });

  assert.equal(focusedHeading(canvas.container), ada);
});

test("F6 from outside the Canvas enters at the first region", () => {
  const canvas = renderCanvas();
  openClassAndLearner(canvas);
  const [classes] = headings(canvas.container);

  act(() => {
    dom.window.document.body.focus();
  });
  pressF6(canvas.container);

  assert.equal(focusedHeading(canvas.container), classes);
});

test("F6 never lands on a Panel the presentation is hiding", () => {
  const canvas = renderCanvas();
  openClassAndLearner(canvas);
  act(() => {
    canvas.viewport.resizeTo("mobile");
  });

  const visible = headings(canvas.container).filter(
    (heading) => !heading.closest("[data-canvas-panel]").hasAttribute("hidden"),
  );
  assert.equal(visible.length, 1);

  pressF6(canvas.container);
  pressF6(canvas.container);

  assert.equal(focusedHeading(canvas.container), visible[0]);
});

test("the Canvas claims no key other than F6", () => {
  const canvas = renderCanvas();
  openClassAndLearner(canvas);
  const [classes] = headings(canvas.container);
  act(() => {
    classes.focus();
  });

  for (const key of ["ArrowRight", "ArrowLeft", "Tab", "a", "j", "Escape"]) {
    const workspace = canvas.container.querySelector("[data-canvas-workspace]");
    let defaultPrevented;
    act(() => {
      defaultPrevented = !fireEvent.keyDown(workspace, { key });
    });
    assert.equal(defaultPrevented, false, `${key} must be left alone`);
    assert.equal(focusedHeading(canvas.container), classes);
  }
});

for (const breakpoint of ["desktop", "tablet", "mobile"]) {
  test(`the ${breakpoint} presentation passes automated accessibility checks`, async () => {
    const canvas = renderCanvas({ breakpoint });
    openClassAndLearner(canvas);

    const axe = (await import("axe-core")).default;
    // Contrast is a theming concern the application owns through the documented
    // `--canvas-*` tokens, and jsdom applies no stylesheet to measure anyway.
    const { violations } = await axe.run(canvas.container, {
      rules: { "color-contrast": { enabled: false } },
    });

    assert.deepEqual(
      violations.map(({ id }) => id),
      [],
    );
  });
}

test("a Panel title long enough to wrap stays intact and labelled", () => {
  const canvas = renderCanvas();
  const title = `${"Extremely long class name ".repeat(40)}end`;
  act(() => {
    canvas.engine.open({
      originId: canvas.engine.getSnapshot().activePanelId,
      panel: canvas.classPanel.reference({ classId: "a", name: title }),
    });
  });

  const heading = headings(canvas.container).at(-1);
  assert.equal(heading.textContent, title);
  const region = heading.closest("[data-canvas-panel]");
  assert.equal(region.getAttribute("aria-labelledby"), heading.id);
});

test("more actions than a header can show remain individually reachable", () => {
  const canvas = renderCanvas();
  openClassAndLearner(canvas);
  const header = canvas.container
    .querySelector("[data-canvas-panel][data-active]")
    .querySelector("[data-canvas-panel-header]");

  const labels = [...header.querySelectorAll("button")].map((button) =>
    button.getAttribute("aria-label"),
  );

  // Every rendered action is a real button with its own accessible name, so
  // overflow is a presentation problem and never a reachability one.
  assert.equal(new Set(labels).size, labels.length);
  for (const button of header.querySelectorAll("button")) {
    assert.equal(button.hasAttribute("aria-hidden"), false);
    assert.ok(button.getAttribute("aria-label") || button.textContent);
  }
});

test("mounting inside a hidden subtree does not throw or steal focus", () => {
  const host = dom.window.document.createElement("div");
  host.hidden = true;
  dom.window.document.body.append(host);
  const previouslyFocused = dom.window.document.activeElement;
  installViewport("desktop");
  const { Canvas, engine } = buildCanvas();

  assert.doesNotThrow(() => {
    act(() => {
      render(
        createElement(
          Canvas.Provider,
          { engine },
          createElement(Canvas.Workspace, { label: "Hidden Canvas" }),
        ),
        { container: host },
      );
    });
  });

  assert.equal(dom.window.document.activeElement, previouslyFocused);
  host.remove();
});

test("every breakpoint keeps the same logical stack", () => {
  const canvas = renderCanvas({ breakpoint: "desktop" });
  openClassAndLearner(canvas);
  const logical = canvas.engine
    .getSnapshot()
    .panels.map(({ instanceId }) => instanceId);

  for (const breakpoint of ["tablet", "mobile", "desktop"]) {
    act(() => {
      canvas.viewport.resizeTo(breakpoint);
    });
    assert.deepEqual(
      canvas.engine.getSnapshot().panels.map(({ instanceId }) => instanceId),
      logical,
      `${breakpoint} must not mutate the stack`,
    );
  }
});

function separators(container) {
  return [...container.querySelectorAll("[data-canvas-panel-separator]")];
}

function pressOn(element, key, { shiftKey = false } = {}) {
  act(() => {
    fireEvent.keyDown(element, { key, shiftKey });
  });
}

test("each resizable Panel exposes a labelled ARIA separator", () => {
  const canvas = renderCanvas();
  openClassAndLearner(canvas);

  const handles = separators(canvas.container);
  // Three visible Panels, each sizing itself — including the deepest, which is
  // the one the reader is most often in.
  assert.equal(handles.length, 3);
  for (const handle of handles) {
    assert.equal(handle.getAttribute("role"), "separator");
    assert.equal(handle.getAttribute("aria-orientation"), "vertical");
    assert.equal(handle.getAttribute("tabindex"), "0");
    assert.match(handle.getAttribute("aria-label"), /^Resize /);
    assert.ok(handle.hasAttribute("aria-valuenow"));
    assert.ok(handle.hasAttribute("aria-valuemin"));
    assert.ok(handle.hasAttribute("aria-valuemax"));
  }
});

test("the resize handle is a large enough pointer target", () => {
  const rule = stylesheet.match(
    /\[data-canvas-panel-separator\] \{([\s\S]*?)\}/,
  );
  assert.ok(rule);

  // WCAG 2.5.8 wants 24px; jsdom lays nothing out, so the declared size is
  // what can be checked here. A hairline handle is the classic failure.
  const size = rule[1].match(/inline-size:\s*([\d.]+)rem/);
  assert.ok(size, "the handle must declare an explicit inline size");
  assert.ok(
    Number(size[1]) * 16 >= 24,
    `handle is ${Number(size[1]) * 16}px, below the 24px target minimum`,
  );
});

test("F6 reads focus from the document, not from a Panel's focus handler", () => {
  const canvas = renderCanvas();
  openClassAndLearner(canvas);
  const [, classA, ada] = headings(canvas.container);

  // Focus moved by something other than a Panel's own focus handler — the
  // Canvas repositioning it, or the browser restoring it. F6 must still cycle
  // from where focus actually is, not from the first region.
  act(() => {
    ada.focus();
  });
  pressF6(canvas.container, { shiftKey: true });

  assert.equal(focusedHeading(canvas.container), classA);
});

test("a separator reports the width its Panel actually has", () => {
  const canvas = renderCanvas({ sizing: bounds });
  openClassAndLearner(canvas);
  const [handle] = separators(canvas.container);
  const panel = handle.closest("[data-canvas-panel]");

  // jsdom lays nothing out, so the measured width is 0 and the reported value
  // falls back to the minimum. What must hold either way is that the value
  // tracks the Panel rather than being pinned to a constant.
  Object.defineProperty(panel, "offsetWidth", {
    configurable: true,
    value: 512,
  });
  // Re-measurement happens when the visible set changes, so move the
  // presentation away and back rather than asking for the one it already has.
  act(() => {
    canvas.viewport.resizeTo("mobile");
  });
  act(() => {
    canvas.viewport.resizeTo("desktop");
  });

  assert.equal(
    Number(separators(canvas.container)[0].getAttribute("aria-valuenow")),
    512,
  );
});

test("a presentation showing one Panel offers nothing to resize", () => {
  const canvas = renderCanvas();
  openClassAndLearner(canvas);
  act(() => {
    canvas.viewport.resizeTo("mobile");
  });

  assert.deepEqual(separators(canvas.container), []);
});

test("Arrow keys resize and announce the settled size", () => {
  const canvas = renderCanvas({ sizing: bounds });
  openClassAndLearner(canvas);
  const [handle] = separators(canvas.container);

  pressOn(handle, "ArrowRight");
  const afterFirst = Number(handle.getAttribute("aria-valuenow"));
  assert.equal(afterFirst, bounds.min);
  assert.match(
    announcer(canvas.container).textContent,
    /^Classes resized to \d+ pixels\.$/,
  );

  pressOn(handle, "ArrowRight");
  assert.equal(
    Number(handle.getAttribute("aria-valuenow")),
    afterFirst + bounds.step,
  );

  pressOn(handle, "ArrowRight", { shiftKey: true });
  assert.equal(
    Number(handle.getAttribute("aria-valuenow")),
    afterFirst + bounds.step + bounds.coarseStep,
  );
});

test("Home and End move to the declared bounds", () => {
  const canvas = renderCanvas({ sizing: bounds });
  openClassAndLearner(canvas);
  const [handle] = separators(canvas.container);

  pressOn(handle, "End");
  assert.equal(Number(handle.getAttribute("aria-valuenow")), bounds.max);

  pressOn(handle, "Home");
  assert.equal(Number(handle.getAttribute("aria-valuenow")), bounds.min);
});

test("a separator at its bound announces nothing further", () => {
  const canvas = renderCanvas({ sizing: bounds });
  openClassAndLearner(canvas);
  const [handle] = separators(canvas.container);
  pressOn(handle, "End");
  const settled = announcer(canvas.container).textContent;

  act(() => {
    announcer(canvas.container).textContent = "";
  });
  pressOn(handle, "ArrowRight");

  assert.match(settled, /resized to/);
  assert.equal(announcer(canvas.container).textContent, "");
});

test("the resized Panel actually takes the chosen width", () => {
  const canvas = renderCanvas({ sizing: bounds });
  openClassAndLearner(canvas);
  const [handle] = separators(canvas.container);

  pressOn(handle, "End");

  const panel = handle.closest("[data-canvas-panel]");
  assert.equal(panel.style.flexBasis, `${bounds.max}px`);
});

test("a press that moves nothing does not claim a resize", () => {
  const canvas = renderCanvas({ sizing: bounds });
  openClassAndLearner(canvas);
  const [handle] = separators(canvas.container);
  // jsdom implements neither half of the pointer capture API.
  handle.setPointerCapture = () => {};
  handle.releasePointerCapture = () => {};
  const before = announcer(canvas.container).textContent;

  act(() => {
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 100 });
  });
  act(() => {
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 100 });
  });

  // Announcing here would report a width the Panel never had.
  assert.equal(announcer(canvas.container).textContent, before);
});

test("a drag announces the width it settled on", () => {
  const canvas = renderCanvas({ sizing: bounds });
  openClassAndLearner(canvas);
  const [handle] = separators(canvas.container);
  handle.setPointerCapture = () => {};
  handle.releasePointerCapture = () => {};

  act(() => {
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 100 });
  });
  act(() => {
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 400 });
  });
  act(() => {
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 400 });
  });

  const settled = Number(handle.getAttribute("aria-valuenow"));
  assert.equal(
    announcer(canvas.container).textContent,
    `Classes resized to ${settled} pixels.`,
  );
});

test("the resize handle's name is localizable like every other sentence", () => {
  const canvas = renderCanvas({
    announcements: {
      ...canvasAnnouncementTemplates,
      resizeLabel: ({ title }) => `Redimensionner ${title}`,
    },
  });
  openClassAndLearner(canvas);

  assert.equal(
    separators(canvas.container)[0].getAttribute("aria-label"),
    "Redimensionner Classes",
  );
});

test("the separator leaves keys it does not own to the application", () => {
  const canvas = renderCanvas({ sizing: bounds });
  openClassAndLearner(canvas);
  const [handle] = separators(canvas.container);
  pressOn(handle, "End");
  const before = handle.getAttribute("aria-valuenow");

  for (const key of ["ArrowUp", "ArrowDown", "a", "Escape"]) {
    pressOn(handle, key);
    assert.equal(handle.getAttribute("aria-valuenow"), before);
  }
});

test("a failed decision moves focus to the explanation", async () => {
  const root = defineRootPanel({ kind: "root", title: "Documents" });
  const editor = definePanel({ kind: "editor", title: ({ name }) => name });
  let Canvas;
  const Editor = ({ descriptor }) => {
    Canvas.useLifecycle({
      dirty: true,
      guard: () => ({ status: "confirm", message: "Unsaved draft" }),
      save: async () => {
        throw new Error("Save failed");
      },
      discard: async () => {},
    });
    return createElement("p", null, descriptor.name);
  };
  Canvas = createCanvasModule({
    root,
    panels: [editor],
    renderers: { root: () => null, editor: Editor },
  });
  const engine = createPanelEngine({ root, panels: [editor] });
  installViewport("desktop");
  let rendered;
  act(() => {
    rendered = render(
      createElement(
        Canvas.Provider,
        { engine },
        createElement(Canvas.Workspace, { label: "Documents Canvas" }),
      ),
    );
  });
  act(() => {
    engine.open({
      originId: engine.getSnapshot().activePanelId,
      panel: editor.reference({ name: "Draft" }),
    });
  });
  act(() => {
    engine.close({ target: engine.getSnapshot().panels[1].instanceRef });
  });

  await act(async () => {
    fireEvent.click(rendered.getByRole("button", { name: "Save" }));
  });

  const alert = rendered.container.querySelector(
    '[data-canvas-transition-dialog] [role="alert"]',
  );
  assert.ok(alert, "a failed decision must explain itself");
  // Every button is disabled while deciding, so without this the browser drops
  // focus to the body and strands the user outside the modal.
  assert.equal(dom.window.document.activeElement, alert);
  rendered.unmount();
});

test("a reduced-motion preference cannot be overridden by the application", () => {
  const block = stylesheet.match(
    /@media \(prefers-reduced-motion: reduce\) \{[^}]*\{([^}]*)\}/,
  );
  assert.ok(block, "the stylesheet must honour prefers-reduced-motion");

  // Important declarations invert layer order, so an important rule inside the
  // Canvas layer outranks anything the application writes. Without `!important`
  // any unlayered application rule would reinstate the motion.
  for (const property of [
    "animation-duration",
    "transition-duration",
    "scroll-behavior",
  ]) {
    assert.match(block[1], new RegExp(`${property}:[^;]*!important`));
  }
});

test("no animation can delay Canvas state, guards, focus, or history", async () => {
  const sources = await Promise.all(
    [
      "core/index.js",
      "react/index.js",
      "ui/index.js",
      "ui/interaction.js",
      "next/index.js",
    ].map((file) =>
      readFile(
        new URL(`../packages/canvas-panels/dist/${file}`, import.meta.url),
        "utf8",
      ),
    ),
  );

  // Nothing in the package waits on a timer or an animation before committing:
  // presentation can lag, but state, guards, focus, and history never do.
  for (const source of sources) {
    for (const gate of [
      "setTimeout",
      "requestAnimationFrame",
      "transitionend",
      "animationend",
    ]) {
      assert.equal(source.includes(gate), false, `${gate} must not gate state`);
    }
  }
});

test("colours come from system keywords so forced-colours modes survive", () => {
  const tokens = stylesheet.match(/--canvas-[a-z-]+:[^;]+;/g) ?? [];
  const surfaces = tokens.filter((token) =>
    /--canvas-(surface|border|text)/.test(token),
  );

  assert.ok(surfaces.length > 0);
  for (const token of surfaces) {
    // `Canvas`, `CanvasText`, and friends are remapped by the OS in forced
    // colours; a literal hex or rgb() would survive it and break contrast. The
    // modal scrim is the documented exception — a translucent shade cannot be a
    // system colour — and is replaced in the forced-colours block instead.
    if (token.startsWith("--canvas-surface-overlay")) continue;
    assert.match(
      token,
      // A token may also defer to another Canvas token, which resolves to a
      // system colour by the same rule.
      /Canvas|CanvasText|Highlight|HighlightText|LinkText|ButtonFace|ButtonText|transparent|currentColor|var\(--canvas-/,
      `${token} must derive from a system colour`,
    );
  }
});

test("a Canvas action keeps its pointer target beside a title that grows", () => {
  const rule = stylesheet.match(
    /\[data-canvas-panel-header\] button,[^{]*\{([^}]*)\}/,
  );
  assert.ok(rule, "the stylesheet must style the Canvas actions");

  // Every one of these is a flex item beside something that grows — a Panel
  // title that ellipsises, a breadcrumb trail that wraps — and the initial
  // `flex-shrink: 1` let the growing thing take the space: a Close button
  // asking for 28px was measured at 16px, under the 24px WCAG 2.5.8 wants.
  assert.match(rule[1], /flex:\s*0 0 auto;/);
  assert.match(rule[1], /min-block-size:\s*var\(--canvas-action-min-size\);/);
  assert.match(rule[1], /min-inline-size:\s*var\(--canvas-action-min-size\);/);

  const size = stylesheet.match(/--canvas-action-min-size:\s*([^;]+);/);
  assert.ok(size, "the target size must be a token an application can read");
  // Read the unit rather than assuming one: a correct `24px` would fail a
  // check that divided every value by the root font size, and a `1.5em` would
  // pass one — the assertion has to know which it is looking at.
  const [, amount, unit] = size[1].trim().match(/^([\d.]+)(rem|px)$/) ?? [];
  assert.ok(unit, `${size[1]} must be an absolute rem or px length`);
  assert.ok(
    Number(amount) * (unit === "rem" ? 16 : 1) >= 24,
    `${size[1]} is under the 24px WCAG 2.5.8 asks of a pointer target`,
  );

  // Save, Discard, and Stay are the most consequential controls the package
  // renders and used to ship no styling at all, so under an application
  // preflight they arrived as bare text with no hit target.
  assert.match(rule[0], /\[data-canvas-transition-actions\] button/);
});

test("the dialog names its three decisions so an application can style them", async () => {
  const canvas = renderCanvas();
  openClassAndLearner(canvas);
  act(() => {
    canvas.engine.registerLifecycle({
      target: canvas.engine.getSnapshot().panels[1].instanceRef,
      lifecycle: {
        dirty: true,
        guard: () => ({ status: "confirm", message: "Unsaved changes" }),
        save: async () => {},
        discard: async () => {},
      },
    });
  });
  act(() => {
    canvas.engine.close({
      target: canvas.engine.getSnapshot().panels[1].instanceRef,
    });
  });

  const decisions = [
    ...canvas.container.querySelectorAll("[data-canvas-transition-action]"),
  ].map((button) => button.getAttribute("data-canvas-transition-action"));

  assert.deepEqual(decisions, ["save", "discard", "stay"]);
  canvas.unmount();
});

test("Panel widths are viewport-capped so a 320px viewport cannot overflow", () => {
  const widths = [
    ...stylesheet.matchAll(/--canvas-panel(?:-active)?-width:\s*([^;]+);/g),
  ].map(([, value]) => value.trim());

  assert.equal(widths.length, 2, "both Panel widths must be declared");
  for (const width of widths) {
    // WCAG 1.4.10 wants content at a 320px viewport without horizontal
    // scrolling. A fixed rem width would exceed that; capping every width
    // against `vw` is what makes the Canvas reflow rather than overflow.
    const cap = width.match(/min\([^,]+,\s*(\d+)vw\s*\)/);
    assert.ok(cap, `${width} must be capped against the viewport`);
    assert.ok(
      Number(cap[1]) <= 100,
      `${width} may not exceed the viewport itself`,
    );
  }
});

test("the narrowest presentation shows a single Panel so nothing sits off-screen", () => {
  const canvas = renderCanvas({ breakpoint: "mobile" });
  openClassAndLearner(canvas);

  const visible = [
    ...canvas.container.querySelectorAll("[data-canvas-panel]"),
  ].filter((panel) => !panel.hasAttribute("hidden"));

  // Reflow at 320px depends on there being exactly one Panel to lay out; the
  // rest are retained but take no space.
  assert.equal(visible.length, 1);
  assert.equal(canvas.engine.getSnapshot().panels.length, 3);
});

test("forced colours restore the separation that shadows provided", () => {
  const block = stylesheet.match(
    /@media \(forced-colors: active\) \{([\s\S]*?)\n {2}\}/,
  );
  assert.ok(block, "the stylesheet must handle forced-colours modes");

  // Shadows are dropped outright in forced colours, so Panel edges have to be
  // real borders, and the scrim must not be forced into an opaque block.
  assert.match(block[1], /\[data-canvas-panel\][\s\S]*border:[^;]*CanvasText/);
  assert.match(
    block[1],
    /\[data-canvas-transition-backdrop\][\s\S]*background:\s*Canvas/,
  );
});

test("F6 with a modifier is left to the browser", () => {
  const canvas = renderCanvas();
  openClassAndLearner(canvas);
  const [classes] = headings(canvas.container);
  act(() => {
    classes.focus();
  });

  act(() => {
    fireEvent.keyDown(
      canvas.container.querySelector("[data-canvas-workspace]"),
      { ctrlKey: true, key: "F6" },
    );
  });

  assert.equal(focusedHeading(canvas.container), classes);
});

function buildContentActionCanvas() {
  const root = defineRootPanel({ kind: "classes", title: "Classes" });
  const classPanel = definePanel({
    kind: "class",
    deduplication: "reuse",
    key: ({ classId }) => classId,
    title: ({ name }) => name,
  });
  let Canvas;
  Canvas = createCanvasModule({
    root,
    panels: [classPanel],
    renderers: {
      classes: () => createElement("p", null, "Class list"),
      class: () =>
        createElement(
          "div",
          null,
          createElement(Canvas.Action, {
            content: createElement(
              "div",
              null,
              createElement("span", null, "Encoding, 41s elapsed"),
              createElement(
                "button",
                { type: "button" },
                "Cancel encoding job",
              ),
            ),
            id: "job-status",
            priority: 10,
          }),
          createElement(Canvas.Action, {
            id: "rename",
            label: "Rename class",
            onSelect: () => {},
            priority: 20,
          }),
          createElement("button", { type: "button" }, "Class action"),
        ),
    },
  });
  const engine = createPanelEngine({ root, panels: [classPanel] });
  installViewport("desktop");
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
  act(() => {
    engine.open({
      originId: engine.getSnapshot().activePanelId,
      panel: classPanel.reference({ classId: "a", name: "Class A" }),
    });
  });
  return result;
}

test("application content in a header passes automated accessibility checks", async () => {
  const canvas = buildContentActionCanvas();

  const axe = (await import("axe-core")).default;
  // Contrast is a theming concern the application owns through the documented
  // `--canvas-*` tokens, and jsdom applies no stylesheet to measure anyway.
  const { violations } = await axe.run(canvas.container, {
    rules: { "color-contrast": { enabled: false } },
  });

  assert.deepEqual(
    violations.map(({ id }) => id),
    [],
  );
  canvas.unmount();
});

test("a content Action adds nothing to the header's semantics or its focus order", () => {
  const canvas = buildContentActionCanvas();
  const header = canvas.container
    .querySelector("[data-canvas-panel][data-active]")
    .querySelector("[data-canvas-panel-header]");
  const wrapper = header.querySelector("[data-canvas-action-content]");

  // The wrapper is a plain element: no role to reinterpret the header, no name
  // of its own to read out, and no place in Tab order that the application did
  // not put there.
  assert.equal(wrapper.tagName.toLowerCase(), "div");
  for (const attribute of [
    "role",
    "tabindex",
    "aria-hidden",
    "aria-label",
    "aria-labelledby",
    "inert",
  ]) {
    assert.equal(
      wrapper.hasAttribute(attribute),
      false,
      `the content wrapper must not carry ${attribute}`,
    );
  }

  // Interactive content inside it is reachable in ordinary Tab order, at the
  // place in the row its priority earned.
  const focusable = [...header.querySelectorAll("button")].map(
    (button) => button.getAttribute("aria-label") ?? button.textContent,
  );
  assert.deepEqual(focusable, [
    "Rename class",
    "Cancel encoding job",
    "Close Class A",
  ]);
  for (const button of header.querySelectorAll("button")) {
    assert.equal(button.hasAttribute("aria-hidden"), false);
  }
  canvas.unmount();
});

test("the action row lays itself out without reaching inside application content", () => {
  const row = stylesheet.match(
    /\[data-canvas-panel-header\] > button \{([^}]*)\}/,
  );

  // A descendant selector here would hand the row's automatic margin to a
  // button the application rendered inside its own content, pushing that
  // control to the far side of the readout it belongs to.
  assert.ok(row, "the action row must lay out its direct children only");
  assert.match(row[1], /margin-inline-start:\s*auto;/);
  assert.doesNotMatch(
    stylesheet,
    /\[data-canvas-panel-header\] button \{/,
    "the row's own layout must not reach past its direct children",
  );

  const content = stylesheet.match(
    /\[data-canvas-panel-header\] > \[data-canvas-action-content\] \{([^}]*)\}/,
  );
  assert.ok(content, "the content wrapper must be laid out by the package");
  // Unlike a button, content may shrink: a readout that cannot shrink pushes
  // the row off the end of the header, and truncating its own text is what
  // this kind of content is for.
  assert.match(content[1], /flex:\s*0 1 auto;/);
  assert.match(content[1], /min-inline-size:\s*0;/);
});
