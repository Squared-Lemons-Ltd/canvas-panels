import assert from "node:assert/strict";
import test from "node:test";

import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
} from "@testing-library/react";
import { JSDOM } from "jsdom";
import { createElement, StrictMode, useRef, useState } from "react";

import {
  createPanelEngine,
  definePanel,
  defineRootPanel,
  navigationParameterName,
} from "../packages/canvas-panels/dist/core/index.js";
import { claimHistoryNamespace } from "../packages/canvas-panels/dist/next/history.js";
import {
  createOverlayWorkspace,
  defineOverlayWorkspace,
  overlayNavigationParameterPrefix,
  overlayPresentation,
  resolveOverlayEscape,
} from "../packages/canvas-panels/dist/overlay/index.js";
import { createCanvasModule } from "../packages/canvas-panels/dist/ui/index.js";

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

test("an overlay Workspace namespace is explicit and reserved away from the primary Canvas", () => {
  const help = defineOverlayWorkspace({ label: "Help", name: "help" });

  assert.equal(help.name, "help");
  assert.equal(help.namespace, `${overlayNavigationParameterPrefix}help`);
  assert.notEqual(help.namespace, "canvas");
  assert.equal(help.modality, "modal");
});

test("an overlay namespace that would take the primary Canvas namespace is refused", () => {
  assert.throws(
    () =>
      defineOverlayWorkspace({
        label: "Help",
        name: "help",
        primaryNamespace: `${overlayNavigationParameterPrefix}help`,
      }),
    /must not collide with the primary Canvas namespace/,
  );
  for (const name of ["", " ", "Help", "help topic", "../canvas"]) {
    assert.throws(
      () => defineOverlayWorkspace({ label: "Help", name }),
      /must be lowercase, URL-safe, and non-empty/,
      `expected ${JSON.stringify(name)} to be refused`,
    );
  }
});

test("an overlay presents exactly what has been routed into it", () => {
  const rootOnly = {
    panels: [{ instanceRef: { instanceId: "root" } }],
  };
  const routed = {
    panels: [
      { instanceRef: { instanceId: "root" } },
      { instanceRef: { instanceId: "help" } },
      { instanceRef: { instanceId: "help-detail" } },
    ],
  };

  assert.deepEqual(overlayPresentation(rootOnly), {
    dismissTarget: null,
    panelCount: 0,
    presented: false,
  });
  const presentation = overlayPresentation(routed);
  assert.equal(presentation.presented, true);
  assert.equal(presentation.panelCount, 2);
  // Dismissal closes the shallowest routed Panel, which takes everything
  // opened from it with it in one ordinary guarded close.
  assert.equal(presentation.dismissTarget.instanceId, "help");
});

test("Escape inside an overlay runs innermost first: dialog, then inner layers, then the overlay", () => {
  const context = (overrides) => ({
    innerLayers: 0,
    transitionPending: false,
    ...overrides,
  });

  // A dialog outranks an inner layer even with inner layers open: the dialog
  // has made everything behind it inert, so nothing back there can be closed.
  assert.equal(
    resolveOverlayEscape(context({ innerLayers: 2, transitionPending: true })),
    "guarded-transition",
  );
  assert.equal(
    resolveOverlayEscape(context({ innerLayers: 1 })),
    "inner-layer",
  );
  assert.equal(resolveOverlayEscape(context({})), "dismiss-overlay");
});

test("an overlay namespace claims history alongside the primary Canvas rather than against it", () => {
  const help = defineOverlayWorkspace({ label: "Help", name: "help" });
  const primary = claimHistoryNamespace(navigationParameterName);
  const overlayClaim = claimHistoryNamespace(help.namespace);

  try {
    // Both are first claimants, which is only possible because the minted
    // namespace is not the one a primary Canvas Workspace owns.
    assert.equal(primary.status, "primary");
    assert.equal(overlayClaim.status, "primary");
    // And the overlay's own namespace is a History Namespace like any other:
    // a second claim on it is refused rather than allowed to overwrite.
    assert.equal(claimHistoryNamespace(help.namespace).status, "secondary");
  } finally {
    primary.release();
    overlayClaim.release();
  }
});

/**
 * A primary Canvas with a record Panel, plus an overlay Workspace of its own,
 * composed exactly the way an application would compose them.
 */
function buildOverlayFixture(options = {}) {
  cleanup();
  const mainRoot = defineRootPanel({ kind: "records", title: "Records" });
  const record = definePanel({ kind: "record", title: ({ name }) => name });
  let MainCanvas;
  function RecordsRenderer() {
    const navigation = MainCanvas.useNavigation();
    return createElement(
      "button",
      {
        onClick: () => navigation.open(record, { name: "Record A" }),
        type: "button",
      },
      "Open Record A",
    );
  }
  MainCanvas = createCanvasModule({
    root: mainRoot,
    panels: [record],
    renderers: {
      records: RecordsRenderer,
      record: () => createElement("button", { type: "button" }, "Edit record"),
    },
  });
  const mainEngine = createPanelEngine({ root: mainRoot, panels: [record] });

  const overlayRoot = defineRootPanel({
    kind: "overlay-root",
    title: "Overlay root",
  });
  const help = definePanel({ kind: "help", title: ({ topic }) => topic });
  let OverlayCanvas;
  let overlay;
  function HelpRenderer({ descriptor }) {
    const initialFocus = useRef(null);
    const [menuOpen, setMenuOpen] = useState(false);
    OverlayCanvas.useLifecycle({
      dirty: options.dirtyHelp ?? false,
      initialFocus,
      guard: () =>
        options.dirtyHelp
          ? { status: "confirm", message: "Finish the help form?" }
          : { status: "allow" },
      save: async () => {},
      discard: async () => {},
    });
    // The application's own transient layer, which takes Escape ahead of the
    // overlay for exactly as long as it is open.
    overlay.useInnerLayer({
      open: menuOpen,
      onEscape: () => setMenuOpen(false),
    });
    return createElement(
      "div",
      null,
      createElement(
        "button",
        { ref: initialFocus, type: "button" },
        `Help: ${descriptor.topic}`,
      ),
      createElement(
        "button",
        { onClick: () => setMenuOpen(true), type: "button" },
        "Open help menu",
      ),
      menuOpen
        ? createElement("div", { role: "menu" }, "Help menu contents")
        : null,
      createElement(
        "button",
        {
          onClick: () => overlay.open(help.reference({ topic: "Deeper" })),
          type: "button",
        },
        "Open deeper help",
      ),
      createElement("button", { type: "button" }, "Help footer"),
    );
  }
  OverlayCanvas = createCanvasModule({
    root: overlayRoot,
    panels: [help],
    renderers: { "overlay-root": () => null, help: HelpRenderer },
  });
  const overlayEngine = createPanelEngine({
    root: overlayRoot,
    panels: [help],
  });
  overlay = createOverlayWorkspace({
    canvas: OverlayCanvas,
    definition: defineOverlayWorkspace({
      label: "Help",
      modality: options.modality ?? "modal",
      name: "help",
    }),
    engine: overlayEngine,
  });

  // What the application can read about the overlay without being able to
  // route into it: a read model, and nothing that opens or closes anything.
  function PresentationProbe() {
    const presentation = overlay.usePresentation();
    return createElement(
      "p",
      { "data-testid": "overlay-presentation" },
      `${presentation.presented ? "presented" : "hidden"} ${presentation.panelCount}`,
    );
  }

  // Everything the overlay does not claim reaches the application, which is
  // what keeps Escape usable once the overlay has gone.
  const applicationKeys = [];
  const application = createElement(
    "div",
    { onKeyDown: (event) => applicationKeys.push(event.key) },
    createElement(PresentationProbe),
    createElement(
      overlay.Host,
      null,
      createElement(
        MainCanvas.Provider,
        { engine: mainEngine },
        createElement(MainCanvas.Workspace, { label: "Records" }),
      ),
    ),
  );
  const rendered = render(
    options.strict ? createElement(StrictMode, null, application) : application,
  );

  return {
    applicationKeys,
    help,
    mainEngine,
    overlay,
    overlayEngine,
    record,
    rendered,
  };
}

test("routing a Panel into a modal overlay presents it and makes the main Canvas inert", async () => {
  const { help, overlay, rendered } = buildOverlayFixture();

  const main = rendered.container.querySelector("[data-canvas-overlay-main]");
  assert.ok(main, "the overlay Host must wrap the main Canvas");
  assert.equal(main.hasAttribute("inert"), false);
  assert.equal(rendered.queryByRole("dialog"), null);
  assert.equal(
    rendered.getByTestId("overlay-presentation").textContent,
    "hidden 0",
  );

  await act(async () => {
    overlay.open(help.reference({ topic: "Shortcuts" }));
  });

  assert.ok(rendered.getByRole("dialog", { name: "Help" }));
  assert.equal(main.hasAttribute("inert"), true);
  assert.equal(main.getAttribute("aria-hidden"), "true");
  assert.ok(rendered.getByRole("button", { name: "Help: Shortcuts" }));
  assert.equal(
    rendered.getByTestId("overlay-presentation").textContent,
    "presented 1",
  );

  // The layer a modal overlay renders has to stand up on its own: it is the
  // only thing left in the accessibility tree while it is up.
  const axe = (await import("axe-core")).default;
  const { violations } = await axe.run(rendered.container, {
    // Contrast is a theming concern the application owns through the
    // documented `--canvas-*` tokens, and jsdom applies no stylesheet anyway.
    rules: { "color-contrast": { enabled: false } },
  });
  assert.deepEqual(
    violations.map(({ id }) => id),
    [],
  );

  rendered.unmount();
});

test("a modal overlay traps focus and hands it back to where it came from", async () => {
  const { help, overlay, rendered } = buildOverlayFixture();

  const opener = rendered.getByRole("button", { name: "Open Record A" });
  act(() => opener.focus());
  assert.equal(document.activeElement, opener);

  await act(async () => {
    overlay.open(help.reference({ topic: "Shortcuts" }));
  });

  // The overlay does not place focus itself when its own Canvas Workspace has
  // already claimed the Panel body that appeared: one owner, one claim.
  const helpButton = rendered.getByRole("button", { name: "Help: Shortcuts" });
  // Compared through a small value rather than the node: a failed node-to-node
  // comparison makes `assert` serialize two whole jsdom trees, which exhausts
  // the runner's memory instead of reporting anything.
  await waitFor(() =>
    assert.equal(document.activeElement?.textContent, "Help: Shortcuts"),
  );
  assert.equal(document.activeElement === helpButton, true);

  // Tab off the end of the layer comes back round rather than reaching the
  // main Canvas, which is inert behind it.
  const layer = rendered.container.querySelector("[data-canvas-overlay]");
  const main = rendered.container.querySelector("[data-canvas-overlay-main]");
  const footer = rendered.getByRole("button", { name: "Help footer" });
  act(() => footer.focus());
  fireEvent.keyDown(footer, { key: "Tab" });
  assert.equal(layer.contains(document.activeElement), true);
  assert.equal(main.contains(document.activeElement), false);
  assert.equal(document.activeElement === footer, false);

  // And backwards off the front of it.
  fireEvent.keyDown(layer, { key: "Tab", shiftKey: true });
  assert.equal(layer.contains(document.activeElement), true);
  assert.equal(main.contains(document.activeElement), false);

  await act(async () => {
    overlay.dismiss();
  });

  assert.equal(rendered.queryByRole("dialog"), null);
  assert.equal(document.activeElement === opener, true);

  rendered.unmount();
});

test("focus comes back from a modal overlay even under Strict Mode and a real inert subtree", async () => {
  // Two things a plain jsdom render cannot see, both of which shipped working
  // here and did nothing whatsoever in Chrome.
  //
  // jsdom does not implement `inert`, so the rule a browser applies — focusing
  // an element inside an inert subtree is refused outright — is applied here
  // explicitly. Without it, restoring focus while the main content is still
  // inert looks correct and silently does nothing.
  //
  // And Strict Mode runs a mount effect's cleanup once at mount. A restore that
  // consumes the recorded element in that cleanup leaves the real dismissal
  // with nothing to return to.
  const { focus } = dom.window.HTMLElement.prototype;
  dom.window.HTMLElement.prototype.focus = function refuseInsideInert(...args) {
    if (this.closest("[inert]")) return undefined;
    return focus.apply(this, args);
  };
  try {
    const { help, overlay, rendered } = buildOverlayFixture({ strict: true });
    const opener = rendered.getByRole("button", { name: "Open Record A" });
    act(() => opener.focus());
    assert.equal(document.activeElement === opener, true);

    await act(async () => {
      overlay.open(help.reference({ topic: "Shortcuts" }));
    });
    assert.equal(document.activeElement === opener, false);

    await act(async () => {
      overlay.dismiss();
    });
    assert.equal(rendered.queryByRole("dialog"), null);
    assert.equal(document.activeElement === opener, true);

    rendered.unmount();
  } finally {
    dom.window.HTMLElement.prototype.focus = focus;
  }
});

test("a non-modal overlay leaves Tab order and the main Canvas exactly as they were", async () => {
  const { help, overlay, rendered } = buildOverlayFixture({
    modality: "non-modal",
  });

  const opener = rendered.getByRole("button", { name: "Open Record A" });
  act(() => opener.focus());
  await act(async () => {
    overlay.open(help.reference({ topic: "Shortcuts" }));
  });

  const main = rendered.container.querySelector("[data-canvas-overlay-main]");
  assert.equal(main.hasAttribute("inert"), false);
  assert.equal(main.hasAttribute("aria-hidden"), false);
  assert.equal(rendered.queryByRole("dialog"), null);
  assert.ok(rendered.getByRole("group", { name: "Help" }));

  // Tab is the browser's, all the way through and out the other side.
  const footer = rendered.getByRole("button", { name: "Help footer" });
  act(() => footer.focus());
  assert.equal(fireEvent.keyDown(footer, { key: "Tab" }), true);
  assert.equal(document.activeElement === footer, true);

  rendered.unmount();
});

test("Escape closes an inner menu, then the overlay, and is left to the application after that", async () => {
  const { applicationKeys, help, overlay, rendered } = buildOverlayFixture();

  const opener = rendered.getByRole("button", { name: "Open Record A" });
  fireEvent.keyDown(opener, { key: "Escape" });
  assert.deepEqual(applicationKeys, ["Escape"]);

  await act(async () => {
    overlay.open(help.reference({ topic: "Shortcuts" }));
  });
  const layer = rendered.container.querySelector("[data-canvas-overlay]");
  fireEvent.click(rendered.getByRole("button", { name: "Open help menu" }));
  assert.ok(rendered.getByRole("menu"));

  // The innermost thing open takes the key, and the overlay stays up.
  await act(async () => {
    fireEvent.keyDown(layer, { key: "Escape" });
  });
  assert.equal(rendered.queryByRole("menu"), null);
  assert.ok(rendered.getByRole("dialog", { name: "Help" }));
  assert.deepEqual(applicationKeys, ["Escape"]);

  // With nothing left inside it, the same key dismisses the overlay itself.
  await act(async () => {
    fireEvent.keyDown(layer, { key: "Escape" });
  });
  assert.equal(rendered.queryByRole("dialog"), null);
  assert.deepEqual(applicationKeys, ["Escape"]);

  // And once the overlay has gone the key belongs to the Canvas again.
  fireEvent.keyDown(opener, { key: "Escape" });
  assert.deepEqual(applicationKeys, ["Escape", "Escape"]);

  rendered.unmount();
});

test("dismissing an overlay runs the ordinary guards, and the dialog owns Escape while it decides", async () => {
  const { applicationKeys, help, overlay, overlayEngine, rendered } =
    buildOverlayFixture({ dirtyHelp: true });

  await act(async () => {
    overlay.open(help.reference({ topic: "Shortcuts" }));
  });
  const layer = rendered.container.querySelector("[data-canvas-overlay]");

  await act(async () => {
    fireEvent.keyDown(layer, { key: "Escape" });
  });
  const dialog = await rendered.findByRole("alertdialog", {
    name: /Shortcuts/,
  });
  assert.ok(rendered.getByRole("dialog", { name: "Help" }));
  await waitFor(() =>
    assert.equal(document.activeElement?.textContent, "Stay"),
  );

  // Escape reaching the layer while a decision is pending belongs to the
  // dialog, not to the overlay: dismissing again would re-request the very
  // transition the dialog exists to settle.
  await act(async () => {
    fireEvent.keyDown(layer, { key: "Escape" });
  });
  assert.ok(rendered.getByRole("alertdialog", { name: /Shortcuts/ }));
  assert.deepEqual(applicationKeys, ["Escape"]);

  // Nor may the overlay's trap run while the dialog has made the Panels behind
  // it inert; the dialog keeps its own focus.
  assert.equal(fireEvent.keyDown(layer, { key: "Tab" }), true);
  assert.equal(document.activeElement?.textContent, "Stay");

  // Stay leaves the overlay exactly where it was.
  await act(async () => {
    fireEvent.keyDown(dialog, { key: "Escape" });
  });
  await waitFor(() => assert.equal(rendered.queryByRole("alertdialog"), null));
  assert.ok(rendered.getByRole("dialog", { name: "Help" }));
  assert.equal(overlayEngine.getSnapshot().panels.length, 2);

  // Discarding commits the dismissal the guard was holding up.
  await act(async () => {
    fireEvent.keyDown(layer, { key: "Escape" });
  });
  await rendered.findByRole("alertdialog", { name: /Shortcuts/ });
  await act(async () => {
    fireEvent.click(rendered.getByRole("button", { name: "Discard" }));
  });
  await waitFor(() => assert.equal(rendered.queryByRole("dialog"), null));
  assert.equal(overlayEngine.getSnapshot().panels.length, 1);

  rendered.unmount();
});

test("routing is explicit in both directions: neither Workspace can reach the other's stack", async () => {
  const { help, mainEngine, overlay, overlayEngine, rendered } =
    buildOverlayFixture();

  // Held before the overlay presents, because a modal overlay takes the main
  // Canvas out of the accessibility tree and out of role queries with it.
  const opener = rendered.getByRole("button", { name: "Open Record A" });
  await act(async () => {
    overlay.open(help.reference({ topic: "Shortcuts" }));
  });
  assert.equal(overlayEngine.getSnapshot().panels.length, 2);
  assert.equal(mainEngine.getSnapshot().panels.length, 1);

  // A Panel already inside the overlay routes further Panels through the same
  // named handle, so nesting stays explicit too.
  await act(async () => {
    fireEvent.click(
      rendered.getAllByRole("button", { name: "Open deeper help" })[0],
    );
  });
  assert.equal(overlayEngine.getSnapshot().panels.length, 3);
  assert.equal(mainEngine.getSnapshot().panels.length, 1);

  // The primary Canvas keeps routing to itself while an overlay is presented.
  // Nothing about a global layer being up changes where `useNavigation` goes.
  await act(async () => {
    fireEvent.click(opener);
  });
  assert.equal(mainEngine.getSnapshot().panels.length, 2);
  assert.equal(overlayEngine.getSnapshot().panels.length, 3);

  rendered.unmount();
});

test("focus inside a presented overlay settles instead of re-opening its focus claim", async () => {
  const { help, overlay, overlayEngine, rendered } = buildOverlayFixture();

  const opener = rendered.getByRole("button", { name: "Open Record A" });
  await act(async () => {
    overlay.open(help.reference({ topic: "Shortcuts" }));
  });
  await waitFor(() =>
    assert.equal(document.activeElement?.textContent, "Help: Shortcuts"),
  );

  // Focus put somewhere the overlay did not choose — and, in jsdom, somewhere
  // a real browser's `inert` would have refused — must stay there. Presenting
  // the overlay was one claim, and it has been honoured.
  act(() => opener.focus());
  for (const breakpoint of ["tablet", "desktop"]) {
    await act(async () => {
      overlayEngine.setPresentation({ breakpoint });
    });
  }
  await act(async () => {
    fireEvent.click(rendered.getByRole("button", { name: "Open help menu" }));
  });
  await act(async () => {});

  assert.equal(document.activeElement === opener, true);
  assert.ok(rendered.getByRole("dialog", { name: "Help" }));

  rendered.unmount();
});
