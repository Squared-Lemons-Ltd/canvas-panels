import assert from "node:assert/strict";
import test from "node:test";

import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { JSDOM } from "jsdom";
import { createElement, Fragment, useRef, useState } from "react";

import {
  createPanelEngine,
  definePanel,
  defineRootPanel,
} from "../packages/canvas-panels/dist/core/index.js";
import {
  canvasPanelSizingBounds,
  createCanvasModule,
  defineCanvasContext,
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

test("a bound Canvas navigates Root to Class to Learner with semantic reuse and branch replacement", async () => {
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
  let Canvas;
  Canvas = createCanvasModule({
    root,
    panels: [classPanel, learner],
    renderers: {
      classes: () => {
        const navigation = Canvas.useNavigation();
        return createElement(
          "div",
          null,
          ...[
            { classId: "class-a", name: "Class A" },
            { classId: "class-b", name: "Class B" },
          ].map((input) =>
            createElement(
              "button",
              {
                key: input.classId,
                type: "button",
                onClick: () => navigation.open(classPanel, input),
              },
              `Open ${input.name}`,
            ),
          ),
        );
      },
      class: () => {
        const navigation = Canvas.useNavigation();
        return createElement(
          "button",
          {
            type: "button",
            onClick: () =>
              navigation.open(learner, {
                learnerId: "learner-a",
                name: "Ada Lovelace",
              }),
          },
          "Open Ada Lovelace",
        );
      },
      learner: ({ descriptor }) =>
        createElement("p", null, `Learner record: ${descriptor.name}`),
    },
  });
  const engine = createPanelEngine({ root, panels: [classPanel, learner] });

  const result = render(
    createElement(
      Canvas.Provider,
      { engine },
      createElement(Canvas.Workspace, { label: "Student records" }),
    ),
  );

  assert.ok(result.getByRole("region", { name: "Student records" }));
  assert.ok(result.getByRole("region", { name: "Classes" }));
  assert.equal(result.queryByRole("button", { name: /^Close / }), null);

  fireEvent.click(result.getByRole("button", { name: "Open Class A" }));

  assert.equal(engine.getSnapshot().panels.length, 2);
  const firstClassId = engine.getSnapshot().activePanelId;
  assert.ok(result.getByRole("region", { name: "Class A" }));

  fireEvent.click(result.getByRole("button", { name: "Open Ada Lovelace" }));

  assert.equal(engine.getSnapshot().panels.length, 3);
  assert.ok(result.getByRole("region", { name: "Classes" }));
  assert.ok(result.getByRole("region", { name: "Class A" }));
  assert.ok(result.getByRole("region", { name: "Ada Lovelace" }));
  assert.match(
    result.getByText("Learner record: Ada Lovelace").textContent,
    /Ada/,
  );

  const axe = (await import("axe-core")).default;
  const accessibility = await axe.run(result.container, {
    rules: { "color-contrast": { enabled: false } },
  });
  assert.deepEqual(
    accessibility.violations.map(({ id }) => id),
    [],
  );

  fireEvent.click(result.getByRole("button", { name: "Open Class A" }));

  assert.equal(engine.getSnapshot().panels.length, 2);
  assert.equal(engine.getSnapshot().activePanelId, firstClassId);
  assert.equal(result.queryByRole("region", { name: "Ada Lovelace" }), null);

  fireEvent.click(result.getByRole("button", { name: "Open Class B" }));

  assert.deepEqual(
    engine.getSnapshot().panels.map(({ title }) => title),
    ["Classes", "Class B"],
  );
  assert.equal(result.queryByRole("region", { name: "Class A" }), null);
  assert.ok(result.getByRole("region", { name: "Class B" }));

  fireEvent.click(result.getByRole("button", { name: "Close Class B" }));
  assert.equal(engine.getSnapshot().panels.length, 1);
  assert.ok(result.getByRole("region", { name: "Classes" }));
  result.unmount();
});

test("multiple Canvas Workspaces use unique heading relationships", () => {
  const root = defineRootPanel({ kind: "classes", title: "Classes" });
  const Canvas = createCanvasModule({
    root,
    panels: [],
    renderers: { classes: () => createElement("p", null, "Class list") },
  });
  const result = render(
    createElement(
      "div",
      null,
      createElement(
        Canvas.Provider,
        null,
        createElement(Canvas.Workspace, { label: "Primary classes" }),
      ),
      createElement(
        Canvas.Provider,
        null,
        createElement(Canvas.Workspace, { label: "Secondary classes" }),
      ),
    ),
  );
  const panelRegions = result.getAllByRole("region", { name: "Classes" });
  const headingIds = panelRegions.map((region) =>
    region.getAttribute("aria-labelledby"),
  );

  assert.equal(panelRegions.length, 2);
  assert.equal(new Set(headingIds).size, 2);
  for (const headingId of headingIds) {
    assert.ok(headingId);
    assert.ok(result.container.querySelector(`[id="${headingId}"]`));
  }
  result.unmount();
});

test("nested Bound Canvas Modules isolate commands, identities, subscriptions, Active state, and versions", () => {
  const classPanel = definePanel({
    kind: "class",
    title: ({ name }) => name,
  });
  const reportPanel = definePanel({
    kind: "report",
    title: ({ name }) => name,
  });
  const classesRoot = defineRootPanel({ kind: "classes", title: "Classes" });
  const reportsRoot = defineRootPanel({ kind: "reports", title: "Reports" });
  const ClassesCanvas = createCanvasModule({
    root: classesRoot,
    panels: [classPanel],
    renderers: {
      classes: () => createElement("p", null, "Class list"),
      class: ({ descriptor }) => createElement("p", null, descriptor.name),
    },
  });
  const ReportsCanvas = createCanvasModule({
    root: reportsRoot,
    panels: [reportPanel],
    renderers: {
      reports: () => createElement("p", null, "Report list"),
      report: ({ descriptor }) => createElement("p", null, descriptor.name),
    },
  });
  const classesEngine = createPanelEngine({
    root: classesRoot,
    panels: [classPanel],
  });
  const reportsEngine = createPanelEngine({
    root: reportsRoot,
    panels: [reportPanel],
  });
  let classNotifications = 0;
  let reportNotifications = 0;
  classesEngine.subscribe(() => classNotifications++);
  reportsEngine.subscribe(() => reportNotifications++);

  const result = render(
    createElement(
      ClassesCanvas.Provider,
      { engine: classesEngine },
      createElement(
        ReportsCanvas.Provider,
        { engine: reportsEngine },
        createElement(ReportsCanvas.Workspace, { label: "Report records" }),
        createElement(ClassesCanvas.Workspace, { label: "Class records" }),
      ),
    ),
  );

  assert.ok(result.getByRole("region", { name: "Classes" }));
  assert.ok(result.getByRole("region", { name: "Reports" }));
  let openedClass;
  act(() => {
    openedClass = classesEngine.open({
      panel: classPanel.reference({ name: "Class A" }),
    });
  });
  assert.equal(openedClass.status, "opened");
  assert.equal(classesEngine.getSnapshot().version, 1);
  assert.equal(reportsEngine.getSnapshot().version, 0);
  assert.equal(classNotifications, 1);
  assert.equal(reportNotifications, 0);
  assert.ok(result.getByRole("region", { name: "Class A" }));

  let openedReport;
  act(() => {
    openedReport = reportsEngine.open({
      panel: reportPanel.reference({ name: "Report A" }),
    });
  });
  assert.equal(openedReport.status, "opened");
  // Two engines number their own Panels, so the same position carries the same
  // id in both. Isolation is not what the identifier says — it is the Panel
  // Instance Ref, which the foreign command below is refused for holding.
  assert.equal(openedClass.instanceId, openedReport.instanceId);
  assert.equal(classesEngine.getSnapshot().version, 1);
  assert.equal(reportsEngine.getSnapshot().version, 1);
  assert.equal(classNotifications, 1);
  assert.equal(reportNotifications, 1);
  assert.ok(result.getByRole("region", { name: "Report A" }));

  const parentBeforeForeignCommand = classesEngine.getSnapshot();
  assert.deepEqual(
    classesEngine.close({
      target: reportsEngine.getSnapshot().panels[1].instanceRef,
    }),
    {
      status: "rejected",
      command: "close",
      reason: "foreign-workspace",
      panelId: openedReport.instanceId,
    },
  );
  assert.equal(classesEngine.getSnapshot(), parentBeforeForeignCommand);
  assert.equal(classNotifications, 1);
  assert.equal(
    reportsEngine.getSnapshot().activePanelId,
    openedReport.instanceId,
  );
  result.unmount();
});

test("a Workspace rendered inside a Panel keeps its Panel identities to itself", () => {
  // Two Workspaces number their own Panels, so both stacks below contain a
  // `canvas-panel-2`, and the nested one appears first in the document. Every
  // lookup either Workspace makes by that id has to answer with its own Panel.
  const bounds = Object.freeze({
    min: 240,
    max: 960,
    step: 16,
    coarseStep: 64,
  });
  const reportPanel = definePanel({
    kind: "report",
    title: ({ name }) => name,
  });
  const reportsRoot = defineRootPanel({ kind: "reports", title: "Reports" });
  const ReportsCanvas = createCanvasModule({
    root: reportsRoot,
    panels: [reportPanel],
    renderers: {
      reports: () => createElement("p", null, "Report list"),
      report: ({ descriptor }) => createElement("p", null, descriptor.name),
    },
  });
  const reportsEngine = createPanelEngine({
    root: reportsRoot,
    panels: [reportPanel],
  });

  const classPanel = definePanel({ kind: "class", title: ({ name }) => name });
  const classesRoot = defineRootPanel({ kind: "classes", title: "Classes" });
  const ClassesCanvas = createCanvasModule({
    root: classesRoot,
    panels: [classPanel],
    renderers: {
      // The nested Workspace lives inside the outer Root Panel, so its Panels
      // precede every other outer Panel in the document.
      classes: () =>
        createElement(
          ReportsCanvas.Provider,
          { engine: reportsEngine },
          createElement(ReportsCanvas.Workspace, {
            label: "Report records",
            sizing: bounds,
          }),
        ),
      class: ({ descriptor }) => createElement("p", null, descriptor.name),
    },
  });
  const classesEngine = createPanelEngine({
    root: classesRoot,
    panels: [classPanel],
  });
  for (const name of ["Class A", "Class B"]) {
    classesEngine.open({ panel: classPanel.reference({ name }) });
  }
  reportsEngine.open({ panel: reportPanel.reference({ name: "Report A" }) });

  const result = render(
    createElement(
      ClassesCanvas.Provider,
      { engine: classesEngine },
      createElement(ClassesCanvas.Workspace, {
        label: "Class records",
        sizing: bounds,
      }),
    ),
  );

  const [outerApplication, innerApplication] = [
    ...result.container.querySelectorAll("[data-canvas-application]"),
  ];
  const ownPanels = (application) =>
    [...application.children].filter((child) =>
      child.hasAttribute("data-canvas-panel"),
    );
  assert.deepEqual(
    ownPanels(innerApplication).map((panel) =>
      panel.getAttribute("data-canvas-panel-id"),
    ),
    ownPanels(outerApplication)
      .map((panel) => panel.getAttribute("data-canvas-panel-id"))
      .slice(0, 2),
    "the fixture needs both Workspaces to reuse the same identities",
  );

  // A width per Panel, so an answer from the wrong Workspace is visible.
  const widths = new Map();
  for (const application of [outerApplication, innerApplication]) {
    for (const panel of ownPanels(application)) {
      const width = bounds.min + 64 * (widths.size + 1);
      widths.set(panel, width);
      Object.defineProperty(panel, "offsetWidth", {
        configurable: true,
        value: width,
      });
    }
  }
  // Panels are measured as the presentation reveals them, so move it away and
  // back rather than asking for the one already on screen.
  for (const engine of [classesEngine, reportsEngine]) {
    act(() => engine.setPresentation({ breakpoint: "mobile" }));
    act(() => engine.setPresentation({ breakpoint: "desktop" }));
  }

  for (const separator of result.container.querySelectorAll(
    "[data-canvas-panel-separator]",
  )) {
    assert.equal(
      Number(separator.getAttribute("aria-valuenow")),
      widths.get(separator.closest("[data-canvas-panel]")),
    );
  }

  // F6 in the outer Workspace, from focus inside the nested one. The nested
  // Panel's id names an outer Panel too, and reading it as one would send F6
  // to the Panel after it instead of entering at the outer Workspace's start.
  const outerHeadings = ownPanels(outerApplication).map((panel) =>
    panel.querySelector("h2"),
  );
  act(() => {
    ownPanels(innerApplication)[1].querySelector("h2").focus();
  });
  act(() => {
    fireEvent.keyDown(outerApplication.closest("[data-canvas-workspace]"), {
      key: "F6",
    });
  });

  assert.equal(
    outerHeadings.indexOf(dom.window.document.activeElement),
    0,
    "F6 entered the outer Workspace somewhere other than its first region",
  );
  result.unmount();
});

test("nested Providers from one Bound Canvas route commands to their owning Workspace", () => {
  const classPanel = definePanel({
    kind: "class",
    title: ({ name }) => name,
  });
  const root = defineRootPanel({ kind: "classes", title: "Classes" });
  const Canvas = createCanvasModule({
    root,
    panels: [classPanel],
    renderers: {
      classes: () => createElement("p", null, "Class list"),
      class: ({ descriptor }) => createElement("p", null, descriptor.name),
    },
  });
  const parentEngine = createPanelEngine({ root, panels: [classPanel] });
  const nestedEngine = createPanelEngine({ root, panels: [classPanel] });
  let parentNotifications = 0;
  let nestedNotifications = 0;
  parentEngine.subscribe(() => parentNotifications++);
  nestedEngine.subscribe(() => nestedNotifications++);

  const result = render(
    createElement(
      Canvas.Provider,
      { engine: parentEngine },
      createElement(Canvas.Workspace, { label: "Parent classes" }),
      createElement(
        Canvas.Provider,
        { engine: nestedEngine },
        createElement(Canvas.Workspace, { label: "Nested classes" }),
      ),
    ),
  );
  let parentOpen;
  let nestedOpen;
  act(() => {
    parentOpen = parentEngine.open({
      panel: classPanel.reference({ name: "Parent Class" }),
    });
    nestedOpen = nestedEngine.open({
      panel: classPanel.reference({ name: "Nested Class" }),
    });
  });
  if (parentOpen.status !== "opened" || nestedOpen.status !== "opened") {
    throw new Error("Expected isolated classes to open");
  }

  assert.notEqual(
    parentEngine.getSnapshot().workspaceId,
    nestedEngine.getSnapshot().workspaceId,
  );
  assert.equal(parentEngine.getSnapshot().version, 1);
  assert.equal(nestedEngine.getSnapshot().version, 1);
  assert.equal(parentNotifications, 1);
  assert.equal(nestedNotifications, 1);
  assert.ok(result.getByRole("region", { name: "Parent Class" }));
  assert.ok(result.getByRole("region", { name: "Nested Class" }));

  const parentBeforeForeign = parentEngine.getSnapshot();
  assert.deepEqual(
    parentEngine.collapse({
      target: nestedEngine.getSnapshot().panels[1].instanceRef,
    }),
    {
      status: "rejected",
      command: "collapse",
      reason: "foreign-workspace",
      panelId: nestedOpen.instanceId,
    },
  );
  assert.equal(parentEngine.getSnapshot(), parentBeforeForeign);
  assert.equal(parentNotifications, 1);
  assert.equal(nestedNotifications, 1);
  result.unmount();
});

test("the guarded transition dialog keeps dirty work on Stay and saves before close", async () => {
  const root = defineRootPanel({ kind: "root", title: "Documents" });
  const editor = definePanel({ kind: "editor", title: ({ name }) => name });
  const saves = [];
  let Canvas;
  Canvas = createCanvasModule({
    root,
    panels: [editor],
    renderers: {
      root: () => {
        const navigation = Canvas.useNavigation();
        const [showTransientOpen, setShowTransientOpen] = useState(true);
        return createElement(
          Fragment,
          null,
          createElement(
            "button",
            {
              type: "button",
              onClick: () => navigation.open(editor, { name: "Dirty draft" }),
            },
            "Open draft",
          ),
          createElement(
            "button",
            {
              type: "button",
              onClick: () => navigation.open(editor, { name: "Other draft" }),
            },
            "Open other draft",
          ),
          showTransientOpen
            ? createElement(
                "button",
                {
                  type: "button",
                  onClick: () => {
                    setShowTransientOpen(false);
                    navigation.open(editor, { name: "Transient draft" });
                  },
                },
                "Open transient draft",
              )
            : null,
        );
      },
      editor: () => {
        const fallbackFocus = useRef(null);
        Canvas.useLifecycle({
          guard: () => ({
            status: "confirm",
            message: "Save your changes before closing?",
          }),
          save: async () => {
            saves.push("saved");
          },
          discard: async () => {},
          fallbackFocus,
        });
        return createElement(
          "div",
          null,
          "Draft",
          createElement(
            "button",
            { ref: fallbackFocus, type: "button" },
            "Fallback focus target",
          ),
        );
      },
    },
  });
  const engine = createPanelEngine({ root, panels: [editor] });
  const rendered = render(
    createElement(Canvas.Provider, { engine }, createElement(Canvas.Workspace)),
  );

  fireEvent.click(rendered.getByRole("button", { name: "Open draft" }));
  const closeButton = rendered.getByRole("button", {
    name: "Close Dirty draft",
  });
  closeButton.focus();
  fireEvent.click(closeButton);

  const dialog = await rendered.findByRole("alertdialog", {
    name: "Unsaved changes in Dirty draft",
  });
  const stayButton = rendered.getByRole("button", { name: "Stay" });
  assert.equal(document.activeElement, stayButton);
  fireEvent.keyDown(dialog, { key: "Tab" });
  const saveButton = rendered.getByRole("button", { name: "Save" });
  assert.equal(document.activeElement, saveButton);
  fireEvent.keyDown(saveButton, { key: "Tab", shiftKey: true });
  assert.equal(document.activeElement, stayButton);
  assert.equal(
    rendered.getByTestId("canvas-panels-application").hasAttribute("inert"),
    true,
  );
  fireEvent.mouseDown(
    rendered.getByTestId("canvas-panels-transition-backdrop"),
  );
  assert.equal(rendered.getByRole("alertdialog"), dialog);

  await act(async () => {
    fireEvent.keyDown(dialog, { key: "Escape" });
  });
  assert.equal(rendered.queryByRole("alertdialog"), null);
  assert.ok(rendered.getByText("Draft"));
  assert.equal(document.activeElement, closeButton);

  const openOtherButton = rendered.getByRole("button", {
    name: "Open other draft",
  });
  openOtherButton.focus();
  fireEvent.click(openOtherButton);
  await rendered.findByRole("alertdialog");
  fireEvent.click(rendered.getByRole("button", { name: "Stay" }));
  await waitFor(() => assert.equal(rendered.queryByRole("alertdialog"), null));
  assert.equal(document.activeElement, openOtherButton);

  const transientOpenButton = rendered.getByRole("button", {
    name: "Open transient draft",
  });
  transientOpenButton.focus();
  fireEvent.click(transientOpenButton);
  await rendered.findByRole("alertdialog");
  fireEvent.click(rendered.getByRole("button", { name: "Stay" }));
  await waitFor(() => assert.equal(rendered.queryByRole("alertdialog"), null));
  assert.equal(
    document.activeElement,
    rendered.getByRole("button", { name: "Fallback focus target" }),
  );

  closeButton.focus();
  fireEvent.click(closeButton);
  await rendered.findByRole("alertdialog");
  await act(async () => {
    fireEvent.click(rendered.getByRole("button", { name: "Save" }));
  });
  assert.deepEqual(saves, ["saved"]);
  assert.equal(rendered.queryByRole("alertdialog"), null);
  assert.equal(rendered.queryByText("Draft"), null);
  assert.equal(
    document.activeElement,
    rendered.getByRole("heading", { level: 2 }),
  );
});

test("one aggregate dialog saves multiple dirty Panels deepest-first", async () => {
  const root = defineRootPanel({ kind: "root", title: "Documents" });
  const editor = definePanel({ kind: "editor", title: ({ name }) => name });
  const operations = [];
  let Canvas;
  const Editor = ({ descriptor }) => {
    Canvas.useLifecycle({
      dirty: true,
      guard: () => ({
        status: "confirm",
        message: `Save ${descriptor.name}?`,
      }),
      save: async () => operations.push(`save:${descriptor.name}`),
      discard: async () => operations.push(`discard:${descriptor.name}`),
    });
    return createElement("p", null, `${descriptor.name} contents`);
  };
  Canvas = createCanvasModule({
    root,
    panels: [editor],
    renderers: {
      root: () => createElement("p", null, "Document list"),
      editor: Editor,
    },
  });
  const engine = createPanelEngine({ root, panels: [editor] });
  const parent = engine.open({ panel: editor.reference({ name: "Parent" }) });
  if (parent.status !== "opened") throw new Error("Expected parent");
  const child = engine.open({
    originId: parent.instanceId,
    panel: editor.reference({ name: "Child" }),
  });
  if (child.status !== "opened") throw new Error("Expected child");
  const rendered = render(
    createElement(Canvas.Provider, { engine }, createElement(Canvas.Workspace)),
  );

  fireEvent.click(rendered.getByRole("button", { name: "Close Parent" }));
  const dialog = await rendered.findByRole("alertdialog", {
    name: "Unsaved changes in 2 panels",
  });
  assert.equal(rendered.getAllByRole("alertdialog").length, 1);
  assert.match(dialog.textContent, /Child: Save Child\?/);
  assert.match(dialog.textContent, /Parent: Save Parent\?/);
  await act(async () => {
    fireEvent.click(rendered.getByRole("button", { name: "Save all" }));
  });
  assert.deepEqual(operations, ["save:Child", "save:Parent"]);
  assert.equal(engine.getSnapshot().panels.length, 1);
  rendered.unmount();
});

test("the dialog names a Panel once when only one Panel is dirty", async () => {
  const root = defineRootPanel({ kind: "root", title: "Documents" });
  const editor = definePanel({ kind: "editor", title: ({ name }) => name });
  let Canvas;
  const Editor = ({ descriptor }) => {
    Canvas.useLifecycle({
      dirty: true,
      guard: () => ({
        status: "confirm",
        message: `Save ${descriptor.name}?`,
      }),
      save: async () => {},
      discard: async () => {},
    });
    return createElement("p", null, `${descriptor.name} contents`);
  };
  Canvas = createCanvasModule({
    root,
    panels: [editor],
    renderers: { root: () => null, editor: Editor },
  });
  const engine = createPanelEngine({ root, panels: [editor] });
  const parent = engine.open({ panel: editor.reference({ name: "Parent" }) });
  if (parent.status !== "opened") throw new Error("Expected parent");
  const child = engine.open({
    originId: parent.instanceId,
    panel: editor.reference({ name: "Child" }),
  });
  if (child.status !== "opened") throw new Error("Expected child");
  const rendered = render(
    createElement(Canvas.Provider, { engine }, createElement(Canvas.Workspace)),
  );

  const describedText = (dialog) =>
    dom.window.document.getElementById(dialog.getAttribute("aria-describedby"))
      .textContent;

  // Several Panels: the heading can only count them, so each line has to say
  // which Panel it is about.
  fireEvent.click(rendered.getByRole("button", { name: "Close Parent" }));
  const aggregate = await rendered.findByRole("alertdialog", {
    name: "Unsaved changes in 2 panels",
  });
  assert.equal(
    describedText(aggregate),
    "Child: Save Child?Parent: Save Parent?",
  );
  fireEvent.click(rendered.getByRole("button", { name: "Stay" }));
  await waitFor(() => assert.equal(rendered.queryByRole("alertdialog"), null));

  // One Panel: the heading has already named it. A Panel title is a record
  // name, so a prefix here would repeat it on screen and read it out twice.
  fireEvent.click(rendered.getByRole("button", { name: "Close Child" }));
  const single = await rendered.findByRole("alertdialog", {
    name: "Unsaved changes in Child",
  });
  assert.equal(describedText(single), "Save Child?");
  fireEvent.click(rendered.getByRole("button", { name: "Stay" }));
  await waitFor(() => assert.equal(rendered.queryByRole("alertdialog"), null));
  rendered.unmount();
});

test("a conflicting decision after a failed save keeps the dialog retryable", async () => {
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
    renderers: {
      root: () => {
        const navigation = Canvas.useNavigation();
        return createElement(
          "button",
          {
            type: "button",
            onClick: () => navigation.open(editor, { name: "Draft" }),
          },
          "Open Draft",
        );
      },
      editor: Editor,
    },
  });
  const rendered = render(
    createElement(
      Canvas.Provider,
      null,
      createElement(Canvas.Workspace, { label: "Retry Workspace" }),
    ),
  );
  fireEvent.click(rendered.getByRole("button", { name: "Open Draft" }));
  fireEvent.click(rendered.getByRole("button", { name: "Close Draft" }));
  fireEvent.click(rendered.getByRole("button", { name: "Save" }));
  await rendered.findByRole("alert");

  fireEvent.click(rendered.getByRole("button", { name: "Discard" }));
  assert.match(
    (await rendered.findByRole("alert")).textContent ?? "",
    /Retry the original Save or Discard decision/,
  );
  assert.equal(rendered.getByRole("button", { name: "Save" }).disabled, false);
  assert.equal(rendered.getByRole("button", { name: "Stay" }).disabled, false);
  fireEvent.click(rendered.getByRole("button", { name: "Stay" }));
  await waitFor(() => assert.equal(rendered.queryByRole("alertdialog"), null));
  assert.ok(rendered.getByRole("heading", { name: "Draft" }));
  rendered.unmount();
});

test("beforeunload is prevented only while a mounted Panel reports dirty work", async () => {
  const root = defineRootPanel({ kind: "root", title: "Documents" });
  const editor = definePanel({ kind: "editor", title: ({ name }) => name });
  let Canvas;
  const Editor = () => {
    const [dirty, setDirty] = useState(false);
    Canvas.useLifecycle({
      dirty,
      guard: () => ({ status: "confirm", message: "Save draft?" }),
      save: async () => setDirty(false),
      discard: async () => setDirty(false),
    });
    return createElement(
      "button",
      { type: "button", onClick: () => setDirty((current) => !current) },
      dirty ? "Mark clean" : "Mark dirty",
    );
  };
  Canvas = createCanvasModule({
    root,
    panels: [editor],
    renderers: {
      root: () => null,
      editor: Editor,
    },
  });
  const engine = createPanelEngine({ root, panels: [editor] });
  engine.open({ panel: editor.reference({ name: "Draft" }) });
  const rendered = render(
    createElement(Canvas.Provider, { engine }, createElement(Canvas.Workspace)),
  );
  const dispatchUnload = () => {
    const event = new window.Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  };

  assert.equal(dispatchUnload(), false);
  fireEvent.click(rendered.getByRole("button", { name: "Mark dirty" }));
  assert.equal(dispatchUnload(), true);
  fireEvent.click(rendered.getByRole("button", { name: "Mark clean" }));
  assert.equal(dispatchUnload(), false);
  rendered.unmount();
  assert.equal(dispatchUnload(), false);
});

test("Escape resolves only the innermost pending Workspace transition", async () => {
  const innerRoot = defineRootPanel({ kind: "inner-root", title: "Inner" });
  const innerEditor = definePanel({
    kind: "inner-editor",
    title: ({ name }) => name,
  });
  let InnerCanvas;
  const InnerEditor = () => {
    InnerCanvas.useLifecycle({
      dirty: true,
      guard: () => ({ status: "confirm", message: "Save inner draft?" }),
      save: async () => {},
      discard: async () => {},
    });
    return createElement("p", null, "Inner draft contents");
  };
  InnerCanvas = createCanvasModule({
    root: innerRoot,
    panels: [innerEditor],
    renderers: {
      "inner-root": () => {
        const navigation = InnerCanvas.useNavigation();
        return createElement(
          "button",
          {
            onClick: () =>
              navigation.open(innerEditor, { name: "Inner draft" }),
            type: "button",
          },
          "Open Inner Draft",
        );
      },
      "inner-editor": InnerEditor,
    },
  });

  const outerRoot = defineRootPanel({ kind: "outer-root", title: "Outer" });
  const outerEditor = definePanel({
    kind: "outer-editor",
    title: ({ name }) => name,
  });
  const innerEngine = createPanelEngine({
    root: innerRoot,
    panels: [innerEditor],
  });
  let OuterCanvas;
  const OuterEditor = () => {
    OuterCanvas.useLifecycle({
      dirty: true,
      guard: () => ({ status: "confirm", message: "Save outer draft?" }),
      save: async () => {},
      discard: async () => {},
    });
    return createElement(
      InnerCanvas.Provider,
      { engine: innerEngine },
      createElement(InnerCanvas.Workspace, { label: "Inner workspace" }),
    );
  };
  OuterCanvas = createCanvasModule({
    root: outerRoot,
    panels: [outerEditor],
    renderers: { "outer-root": () => null, "outer-editor": OuterEditor },
  });
  const outerEngine = createPanelEngine({
    root: outerRoot,
    panels: [outerEditor],
  });
  const openedOuter = outerEngine.open({
    panel: outerEditor.reference({ name: "Outer draft" }),
  });
  if (openedOuter.status !== "opened") throw new Error("Expected outer draft");
  const rendered = render(
    createElement(
      OuterCanvas.Provider,
      { engine: outerEngine },
      createElement(OuterCanvas.Workspace, { label: "Outer workspace" }),
    ),
  );
  fireEvent.click(rendered.getByRole("button", { name: "Open Inner Draft" }));
  fireEvent.click(rendered.getByRole("button", { name: "Close Inner draft" }));
  await rendered.findByRole("alertdialog", { name: /Inner draft/ });
  const outerTarget = outerEngine
    .getSnapshot()
    .panels.find(
      ({ instanceId }) => instanceId === openedOuter.instanceId,
    )?.instanceRef;
  if (!outerTarget) throw new Error("Outer draft disappeared");
  await act(async () => {
    outerEngine.close({ target: outerTarget });
  });
  assert.equal(rendered.getAllByRole("alertdialog").length, 1);
  assert.ok(rendered.getByRole("alertdialog", { name: /Inner draft/ }));
  assert.ok(outerEngine.getSnapshot().transition);
  assert.ok(innerEngine.getSnapshot().transition);
  assert.equal(outerEngine.getSnapshot().transition?.panels.length, 1);
  assert.equal(innerEngine.getSnapshot().transition?.panels.length, 1);

  await act(async () =>
    fireEvent.keyDown(rendered.getByRole("alertdialog"), { key: "Escape" }),
  );
  await rendered.findByRole("alertdialog", { name: /Outer draft/ });
  assert.equal(innerEngine.getSnapshot().transition, null);
  assert.ok(outerEngine.getSnapshot().transition);
  await act(async () =>
    fireEvent.keyDown(rendered.getByRole("alertdialog"), { key: "Escape" }),
  );
  await waitFor(() => assert.equal(rendered.queryByRole("alertdialog"), null));
  assert.equal(outerEngine.getSnapshot().transition, null);
  rendered.unmount();
});

test("bound hooks infer renderer scope and expose safe navigation read models", () => {
  const root = defineRootPanel({ kind: "root", title: "Documents" });
  const editor = definePanel({
    kind: "editor",
    title: ({ name }) => name,
    update: {
      validate: (value) =>
        typeof value === "object" &&
        value !== null &&
        typeof value.name === "string",
      validateResult: (value) =>
        typeof value === "object" &&
        value !== null &&
        typeof value.name === "string",
      apply: (current, update) => ({ ...current, name: update.name }),
      navigation: "replace",
    },
  });
  let Canvas;
  let transitionRenders = 0;

  function TransitionObserver() {
    transitionRenders += 1;
    const transition = Canvas.useTransitionStatus();
    return createElement("output", null, String(transition.pending));
  }

  function RootRenderer({ descriptor, panel }) {
    const navigation = Canvas.useNavigation();
    assert.equal(descriptor, undefined);
    assert.equal(panel.kind, "root");
    return createElement(
      "button",
      {
        onClick: () => navigation.open(editor, { name: "Draft" }),
        type: "button",
      },
      "Open typed draft",
    );
  }

  function EditorRenderer({ descriptor, panel }) {
    const current = Canvas.usePanel();
    const typedCurrent = Canvas.usePanel(editor, panel);
    const wrongDefinition = Canvas.usePanel(root, panel);
    const stack = Canvas.useStack();
    const transition = Canvas.useTransitionStatus();
    const presentation = Canvas.usePresentation();
    const navigation = Canvas.useNavigation();
    assert.equal(descriptor.name, current.descriptor.name);
    assert.equal(typedCurrent.descriptor.name, descriptor.name);
    assert.equal(wrongDefinition, null);
    assert.equal(panel.instanceId, current.panel.instanceId);
    return createElement(
      "div",
      null,
      createElement(
        "p",
        null,
        `${descriptor.name}:${stack.length}:${transition.pending}:${presentation.active}`,
      ),
      createElement(
        "button",
        {
          onClick: () => navigation.update(editor, { name: "Renamed" }),
          type: "button",
        },
        "Rename typed draft",
      ),
    );
  }

  Canvas = createCanvasModule({
    root,
    panels: [editor],
    renderers: { root: RootRenderer, editor: EditorRenderer },
  });
  const rendered = render(
    createElement(
      Canvas.Provider,
      null,
      createElement(TransitionObserver),
      createElement(Canvas.Workspace),
    ),
  );

  fireEvent.click(rendered.getByRole("button", { name: "Open typed draft" }));
  assert.equal(
    rendered.getByText("Draft:2:false:true").textContent,
    "Draft:2:false:true",
  );
  fireEvent.click(rendered.getByRole("button", { name: "Rename typed draft" }));
  assert.equal(
    rendered.getByText("Renamed:2:false:true").textContent,
    "Renamed:2:false:true",
  );
  assert.equal(transitionRenders, 1);
  rendered.unmount();
});

test("useStack publishes descriptor-only updates without subscribing to raw snapshots", () => {
  const root = defineRootPanel({ kind: "root", title: "Documents" });
  const editor = definePanel({
    kind: "editor",
    title: ({ name }) => name,
    update: {
      validate: (value) =>
        typeof value === "object" &&
        value !== null &&
        typeof value.note === "string",
      validateResult: (value) =>
        typeof value === "object" &&
        value !== null &&
        typeof value.name === "string" &&
        typeof value.note === "string",
      apply: (current, update) => ({ ...current, note: update.note }),
      navigation: "none",
    },
  });
  let Canvas;
  let presentationRenders = 0;
  function RootRenderer() {
    const navigation = Canvas.useNavigation();
    return createElement(
      "button",
      {
        onClick: () =>
          navigation.open(editor, { name: "Draft", note: "first" }),
        type: "button",
      },
      "Open noted draft",
    );
  }
  function EditorRenderer() {
    const navigation = Canvas.useNavigation();
    return createElement(
      "button",
      {
        onClick: () => navigation.update(editor, { note: "second" }),
        type: "button",
      },
      "Update note",
    );
  }
  function StackObserver() {
    const stack = Canvas.useStack();
    return createElement("output", null, stack[1]?.descriptor.note ?? "none");
  }
  function PresentationObserver() {
    Canvas.usePresentation();
    presentationRenders += 1;
    return null;
  }
  Canvas = createCanvasModule({
    root,
    panels: [editor],
    renderers: { root: RootRenderer, editor: EditorRenderer },
  });
  const rendered = render(
    createElement(
      Canvas.Provider,
      null,
      createElement(StackObserver),
      createElement(PresentationObserver),
      createElement(Canvas.Workspace),
    ),
  );
  fireEvent.click(rendered.getByRole("button", { name: "Open noted draft" }));
  assert.equal(rendered.getByRole("status").textContent, "first");
  const rendersBeforeDescriptorUpdate = presentationRenders;
  fireEvent.click(rendered.getByRole("button", { name: "Update note" }));
  assert.equal(rendered.getByRole("status").textContent, "second");
  assert.equal(presentationRenders, rendersBeforeDescriptorUpdate);
  rendered.unmount();
});

test("selected reads recompute when a hook target changes without an engine publication", () => {
  const root = defineRootPanel({ kind: "root", title: "Documents" });
  const editor = definePanel({ kind: "editor", title: ({ name }) => name });
  const engine = createPanelEngine({ root, panels: [editor] });
  engine.open({ panel: editor.reference({ name: "Draft" }) });
  const [rootPanel, editorPanel] = engine.getSnapshot().panels;
  let Canvas;
  function TargetObserver() {
    const [target, setTarget] = useState(rootPanel.instanceRef);
    const panel = Canvas.usePanel(target);
    return createElement(
      "div",
      null,
      createElement("output", null, panel.title),
      createElement(
        "button",
        { onClick: () => setTarget(editorPanel.instanceRef), type: "button" },
        "Observe editor",
      ),
    );
  }
  Canvas = createCanvasModule({
    root,
    panels: [editor],
    renderers: {
      root: () => createElement("p", null, "Document list"),
      editor: () => createElement("p", null, "Editor body"),
    },
  });
  const rendered = render(
    createElement(
      Canvas.Provider,
      { engine },
      createElement(TargetObserver),
      createElement(Canvas.Workspace),
    ),
  );
  assert.equal(rendered.getByRole("status").textContent, "Documents");
  fireEvent.click(rendered.getByRole("button", { name: "Observe editor" }));
  assert.equal(rendered.getByRole("status").textContent, "Draft");
  rendered.unmount();
});

test("renderer failures preserve package chrome and retry only the Panel body", () => {
  const broken = definePanel({ kind: "broken", title: ({ name }) => name });
  const root = defineRootPanel({ kind: "root", title: "Home" });
  const reports = [];
  let recover = false;
  let Canvas;
  Canvas = createCanvasModule({
    root,
    panels: [broken],
    onRendererError: (report) => reports.push(report),
    renderers: {
      root: () => {
        const navigation = Canvas.useNavigation();
        return createElement(
          "button",
          {
            onClick: () => navigation.open(broken, { name: "Broken panel" }),
            type: "button",
          },
          "Open broken panel",
        );
      },
      broken: () => {
        if (!recover) throw new Error("secret renderer details");
        return createElement("p", null, "Recovered body");
      },
    },
  });
  const engine = createPanelEngine({ root, panels: [broken] });
  const rendered = render(
    createElement(
      Canvas.Provider,
      { engine },
      createElement(Canvas.Workspace, { label: "Errors" }),
    ),
  );

  const originalConsoleError = console.error;
  const caughtRendererLogs = [];
  console.error = (...arguments_) => caughtRendererLogs.push(arguments_);
  try {
    fireEvent.click(
      rendered.getByRole("button", { name: "Open broken panel" }),
    );
  } finally {
    console.error = originalConsoleError;
  }
  assert.ok(caughtRendererLogs.length > 0);
  const failedPanel = engine.getSnapshot().panels[1];
  const failedPanelId = failedPanel.instanceId;
  assert.ok(rendered.getByRole("heading", { name: "Broken panel" }));
  assert.ok(rendered.getByRole("button", { name: "Close Broken panel" }));
  assert.match(
    rendered.getByRole("alert").textContent ?? "",
    /could not be displayed/i,
  );
  assert.doesNotMatch(
    rendered.container.textContent ?? "",
    /secret renderer details/,
  );
  assert.deepEqual(reports, [
    { kind: "broken", panel: failedPanel.instanceRef },
  ]);

  recover = true;
  fireEvent.click(rendered.getByRole("button", { name: "Retry panel" }));
  assert.ok(rendered.getByText("Recovered body"));
  assert.equal(engine.getSnapshot().panels[1].instanceId, failedPanelId);
  rendered.unmount();
});

test("every header action stays individually reachable however many there are", () => {
  const root = defineRootPanel({ kind: "root", title: "Home" });
  let Canvas;
  Canvas = createCanvasModule({
    root,
    panels: [],
    renderers: {
      root: () =>
        createElement(
          Fragment,
          null,
          // Far more actions than a header can lay out, which is the condition
          // overflow has to survive.
          ...Array.from({ length: 12 }, (_, index) =>
            createElement(Canvas.Action, {
              id: `action-${index}`,
              key: index,
              label: `Action ${index}`,
              onSelect: () => {},
            }),
          ),
        ),
    },
  });
  const engine = createPanelEngine({ root, panels: [] });
  const rendered = render(
    createElement(
      Canvas.Provider,
      { engine },
      createElement(Canvas.Workspace, { label: "Actions" }),
    ),
  );

  const header = rendered.container.querySelector("[data-canvas-panel-header]");
  const buttons = [...header.querySelectorAll("button")];
  const named = buttons.filter((button) =>
    /^Action \d+$/.test(button.getAttribute("aria-label") ?? ""),
  );

  assert.equal(named.length, 12, "no action may be dropped from the header");
  // Overflow is a presentation problem; it must never become a reachability
  // one, so each action keeps its own accessible name and stays exposed.
  assert.equal(
    new Set(named.map((button) => button.getAttribute("aria-label"))).size,
    12,
  );
  for (const button of named) {
    assert.equal(button.hasAttribute("aria-hidden"), false);
    assert.equal(button.hasAttribute("disabled"), false);
  }
  rendered.unmount();
});

test("scoped composition registers actions, titles, focus targets, lifecycle labels, and context signals", async () => {
  const editor = definePanel({ kind: "editor", title: ({ name }) => name });
  const selections = [];
  let Canvas;

  function ContextConsumer() {
    const target = Canvas.useContextTarget("active");
    return createElement(
      "output",
      null,
      target.signal?.resource ?? "No context",
    );
  }

  function FocusedContextConsumer() {
    const target = Canvas.useContextTarget("focused");
    return createElement(
      "div",
      { "data-testid": "focused-context" },
      target.signal?.resource ?? "No focused context",
    );
  }

  function Editor({ descriptor }) {
    const initialFocus = useRef(null);
    const [dirty, setDirty] = useState(true);
    Canvas.useLifecycle({
      dirty,
      dirtyLabel: "Unsaved",
      initialFocus,
      guard: () => ({ status: "allow" }),
      save: async () => {},
      discard: async () => {},
    });
    Canvas.useHeader({ visualTitle: `Editing ${descriptor.name}` });
    Canvas.useContextSignal({ resource: descriptor.name });
    return createElement(
      "div",
      null,
      createElement(Canvas.Action, {
        id: "save-draft",
        label: "Save draft",
        priority: 10,
        onSelect: () => selections.push(descriptor.name),
      }),
      createElement(
        "button",
        { ref: initialFocus, type: "button" },
        "Draft focus target",
      ),
      createElement(
        "button",
        { onClick: () => setDirty(false), type: "button" },
        "Mark saved",
      ),
    );
  }

  Canvas = createCanvasModule({
    context: defineCanvasContext(),
    root: defineRootPanel({ kind: "root", title: "Home" }),
    panels: [editor],
    renderers: {
      root: () => {
        const navigation = Canvas.useNavigation();
        return createElement(
          "button",
          {
            onClick: () => navigation.open(editor, { name: "Draft" }),
            type: "button",
          },
          "Open composed editor",
        );
      },
      editor: Editor,
    },
  });
  const rendered = render(
    createElement(
      Canvas.Provider,
      null,
      createElement(ContextConsumer),
      createElement(FocusedContextConsumer),
      createElement("button", { type: "button" }, "Outside workspace"),
      createElement(Canvas.Workspace, { label: "Composition" }),
    ),
  );

  fireEvent.click(
    rendered.getByRole("button", { name: "Open composed editor" }),
  );
  await waitFor(() =>
    assert.equal(
      document.activeElement,
      rendered.getByRole("button", { name: "Draft focus target" }),
    ),
  );
  assert.ok(rendered.getByText("Editing Draft"));
  assert.ok(rendered.getByText("Unsaved"));
  assert.equal(rendered.getByRole("status").textContent, "Draft");
  assert.equal(rendered.getByTestId("focused-context").textContent, "Draft");
  act(() => {
    rendered.getByRole("button", { name: "Outside workspace" }).focus();
  });
  assert.equal(
    rendered.getByTestId("focused-context").textContent,
    "No focused context",
  );
  act(() => {
    rendered.getByRole("button", { name: "Draft focus target" }).focus();
  });
  assert.equal(rendered.getByTestId("focused-context").textContent, "Draft");
  const markSaved = rendered.getByRole("button", { name: "Mark saved" });
  act(() => markSaved.focus());
  fireEvent.click(markSaved);
  assert.equal(rendered.queryByText("Unsaved"), null);
  assert.equal(document.activeElement, markSaved);
  fireEvent.click(rendered.getByRole("button", { name: "Save draft" }));
  assert.deepEqual(selections, ["Draft"]);
  fireEvent.click(rendered.getByRole("button", { name: "Close Draft" }));
  await waitFor(() =>
    assert.equal(rendered.getByRole("status").textContent, "No context"),
  );
  assert.equal(
    rendered.getByTestId("focused-context").textContent,
    "No focused context",
  );
  assert.equal(rendered.queryByRole("button", { name: "Save draft" }), null);
  rendered.unmount();
});

test("a Context Signal built inline wakes a Context Target only when its own entries change", async () => {
  const editor = definePanel({ kind: "editor", title: ({ name }) => name });
  let Canvas;
  let readerRenders = 0;

  function Reader() {
    readerRenders += 1;
    const target = Canvas.useContextTarget("active");
    return createElement(
      "output",
      null,
      target.signal
        ? `${target.signal.entityId}: ${target.signal.title}`
        : "No context",
    );
  }

  function Editor({ descriptor }) {
    const [keystrokes, setKeystrokes] = useState(0);
    const [title, setTitle] = useState("Ada Lovelace");
    // The shape the defect was filed about: a fresh object literal every
    // render, built from props and local state, holding only primitives.
    // Nothing about it is memoised, and nothing about it needs to be.
    Canvas.useContextSignal({
      entityType: "contact",
      entityId: descriptor.name,
      title,
    });
    return createElement(
      "div",
      null,
      createElement(
        "button",
        { onClick: () => setKeystrokes((count) => count + 1), type: "button" },
        "Type a keystroke",
      ),
      createElement("span", { "data-testid": "keystrokes" }, `${keystrokes}`),
      createElement(
        "button",
        { onClick: () => setTitle("Grace Hopper"), type: "button" },
        "Rename",
      ),
    );
  }

  Canvas = createCanvasModule({
    context: defineCanvasContext(),
    root: defineRootPanel({ kind: "root", title: "Home" }),
    panels: [editor],
    renderers: {
      root: () => {
        const navigation = Canvas.useNavigation();
        return createElement(
          "button",
          {
            onClick: () => navigation.open(editor, { name: "Draft" }),
            type: "button",
          },
          "Open editor",
        );
      },
      editor: Editor,
    },
  });
  const rendered = render(
    createElement(
      Canvas.Provider,
      null,
      createElement(Reader),
      createElement(Canvas.Workspace, { label: "Signals" }),
    ),
  );

  fireEvent.click(rendered.getByRole("button", { name: "Open editor" }));
  await waitFor(() =>
    assert.equal(
      rendered.getByRole("status").textContent,
      "Draft: Ada Lovelace",
    ),
  );

  // The measurement the defect is about. Re-rendering the publishing Panel —
  // one keystroke in a field the Context Target knows nothing about — used to
  // republish the signal and wake every reader, because the effect was keyed on
  // the literal's object identity.
  readerRenders = 0;
  for (let count = 0; count < 3; count += 1) {
    fireEvent.click(rendered.getByRole("button", { name: "Type a keystroke" }));
  }
  assert.equal(rendered.getByTestId("keystrokes").textContent, "3");
  assert.equal(readerRenders, 0);
  assert.equal(rendered.getByRole("status").textContent, "Draft: Ada Lovelace");

  // A value that genuinely changed still publishes, promptly.
  fireEvent.click(rendered.getByRole("button", { name: "Rename" }));
  await waitFor(() =>
    assert.equal(
      rendered.getByRole("status").textContent,
      "Draft: Grace Hopper",
    ),
  );
  assert.ok(readerRenders > 0);

  // And holding the signal must not cost the unpublish: the effect still
  // returns the store's own cleanup, so closing the Panel clears the Context
  // Target rather than leaving a signal behind for an unmounted Panel.
  fireEvent.click(rendered.getByRole("button", { name: "Close Draft" }));
  await waitFor(() =>
    assert.equal(rendered.getByRole("status").textContent, "No context"),
  );
  rendered.unmount();
});

test("a Context Signal is compared one level deep, so cycles are safe and rebuilt values republish", async () => {
  const editor = definePanel({ kind: "editor", title: ({ name }) => name });
  // Cyclic, and published every render. Nothing in the comparison recurses, so
  // this is compared and dismissed by identity rather than walked.
  const cyclic = { label: "Cyclic" };
  cyclic.self = cyclic;
  const signals = {
    cyclic: () => cyclic,
    // A fresh array literal of primitives every render: the same own entries,
    // so the same signal.
    array: () => ["array", "Ada Lovelace"],
    // Non-plain values, rebuilt every render. Each is compared by identity, so
    // this signal is a different signal every time — the documented cost, and
    // the case `useMemo` at the call site is still for.
    rebuilt: () => ({ label: "Rebuilt", at: new Date(0), open: () => {} }),
  };
  const describe = (signal) =>
    signal === undefined
      ? "No context"
      : Array.isArray(signal)
        ? signal.join(": ")
        : signal.label;
  let Canvas;
  let readerRenders = 0;

  function Reader() {
    readerRenders += 1;
    const target = Canvas.useContextTarget("active");
    return createElement("output", null, describe(target.signal));
  }

  function Editor() {
    const [mode, setMode] = useState("cyclic");
    const [tick, setTick] = useState(0);
    Canvas.useContextSignal(signals[mode]());
    return createElement(
      "div",
      null,
      createElement("span", { "data-testid": "ticks" }, `${tick}`),
      createElement(
        "button",
        { onClick: () => setTick((count) => count + 1), type: "button" },
        "Re-render",
      ),
      ...Object.keys(signals).map((name) =>
        createElement(
          "button",
          { key: name, onClick: () => setMode(name), type: "button" },
          `Publish ${name}`,
        ),
      ),
    );
  }

  Canvas = createCanvasModule({
    context: defineCanvasContext(),
    root: defineRootPanel({ kind: "root", title: "Home" }),
    panels: [editor],
    renderers: {
      root: () => {
        const navigation = Canvas.useNavigation();
        return createElement(
          "button",
          {
            onClick: () => navigation.open(editor, { name: "Draft" }),
            type: "button",
          },
          "Open editor",
        );
      },
      editor: Editor,
    },
  });
  const rendered = render(
    createElement(
      Canvas.Provider,
      null,
      createElement(Reader),
      createElement(Canvas.Workspace, { label: "Signals" }),
    ),
  );

  const rerenderPanel = (times) => {
    readerRenders = 0;
    for (let count = 0; count < times; count += 1) {
      fireEvent.click(rendered.getByRole("button", { name: "Re-render" }));
    }
  };

  fireEvent.click(rendered.getByRole("button", { name: "Open editor" }));
  await waitFor(() =>
    assert.equal(rendered.getByRole("status").textContent, "Cyclic"),
  );

  // Reaching the assertion at all is most of the point: a comparison that
  // walked the value would not return from the first render.
  rerenderPanel(3);
  assert.equal(rendered.getByTestId("ticks").textContent, "3");
  assert.equal(readerRenders, 0);
  assert.equal(rendered.getByRole("status").textContent, "Cyclic");

  fireEvent.click(rendered.getByRole("button", { name: "Publish array" }));
  await waitFor(() =>
    assert.equal(
      rendered.getByRole("status").textContent,
      "array: Ada Lovelace",
    ),
  );
  rerenderPanel(3);
  assert.equal(readerRenders, 0);

  fireEvent.click(rendered.getByRole("button", { name: "Publish rebuilt" }));
  await waitFor(() =>
    assert.equal(rendered.getByRole("status").textContent, "Rebuilt"),
  );
  // Documented rather than silently different: a `Date` and a function are
  // compared by identity, so a signal that rebuilds them republishes on every
  // render, exactly as it did before the comparison landed.
  rerenderPanel(3);
  assert.ok(readerRenders >= 3);
  assert.equal(rendered.getByRole("status").textContent, "Rebuilt");
  rendered.unmount();
});

test("an inline visual title updates without keeping the Panel renderer alive", async () => {
  const root = defineRootPanel({ kind: "root", title: "Home" });
  let renders = 0;
  let Canvas;

  function RootRenderer() {
    renders += 1;
    if (renders > 10) {
      throw new Error("inline visual title kept the Panel renderer alive");
    }
    const [revision, setRevision] = useState(1);
    Canvas.useHeader({
      visualTitle: createElement("strong", null, `Revision ${revision}`),
    });
    return createElement(
      "button",
      { onClick: () => setRevision(2), type: "button" },
      "Update title",
    );
  }

  Canvas = createCanvasModule({
    root,
    panels: [],
    renderers: { root: RootRenderer },
  });
  const rendered = render(
    createElement(
      Canvas.Provider,
      null,
      createElement(Canvas.Workspace, { label: "Inline title" }),
    ),
  );

  await waitFor(() =>
    assert.equal(
      rendered.container.querySelector("[data-canvas-visual-title]")
        ?.textContent,
      "Revision 1",
    ),
  );
  const settledAfterMount = renders;
  await act(async () => {});
  assert.equal(renders, settledAfterMount);

  fireEvent.click(rendered.getByRole("button", { name: "Update title" }));
  await waitFor(() =>
    assert.equal(
      rendered.container.querySelector("[data-canvas-visual-title]")
        ?.textContent,
      "Revision 2",
    ),
  );
  assert.ok(renders <= settledAfterMount + 1);
  rendered.unmount();
});

test("a registered visual title replaces the heading rather than printing beside it", () => {
  const editor = definePanel({ kind: "editor", title: ({ name }) => name });
  let Canvas;

  function Editor({ descriptor }) {
    // The two strings are deliberately different. The defect this guards
    // against is the record's name printing twice, and an application that
    // registers exactly its Panel title would agree with a swapped pair, a
    // duplicated span, or the accessible name coming from the ornament —
    // every arrangement this is meant to tell apart.
    Canvas.useHeader({ visualTitle: `Editing ${descriptor.name}` });
    return createElement("p", null, "Draft body");
  }

  Canvas = createCanvasModule({
    root: defineRootPanel({ kind: "root", title: "Home" }),
    panels: [editor],
    renderers: {
      root: () => {
        const navigation = Canvas.useNavigation();
        return createElement(
          "button",
          {
            onClick: () => navigation.open(editor, { name: "Ada Lovelace" }),
            type: "button",
          },
          "Open editor",
        );
      },
      editor: Editor,
    },
  });
  const rendered = render(
    createElement(
      Canvas.Provider,
      null,
      createElement(Canvas.Workspace, { label: "Editors" }),
    ),
  );
  fireEvent.click(rendered.getByRole("button", { name: "Open editor" }));

  const heading = rendered.container.querySelector(
    "[data-canvas-panel][data-active] [data-canvas-panel-header] h2",
  );
  assert.ok(heading, "the Panel must keep its heading");

  // One visible title, and it is the registered one. Everything the heading
  // shows a sighted reader — every node but the hidden Panel title — reads
  // exactly the string the application asked for, so a second copy of either
  // title anywhere in the header fails here.
  const shown = [...heading.childNodes]
    .filter(
      (node) =>
        !(node.nodeType === 1 && node.hasAttribute("data-canvas-panel-title")),
    )
    .map((node) => node.textContent)
    .join("");
  assert.equal(shown, "Editing Ada Lovelace");
  assert.equal(
    heading.closest("[data-canvas-panel-header]").textContent,
    "Ada LovelaceEditing Ada LovelaceClose",
  );
  assert.equal(heading.querySelectorAll("[data-canvas-panel-title]").length, 1);
  assert.equal(
    heading.querySelector("[data-canvas-panel-title]").textContent,
    "Ada Lovelace",
  );
  assert.equal(
    heading
      .querySelector("[data-canvas-visual-title]")
      .getAttribute("aria-hidden"),
    "true",
  );

  // And the heading is still the whole heading: the Panel's accessible name is
  // the Panel's title and not the ornament, the region points at it, and it is
  // a focus target rather than 1px of nothing.
  assert.ok(rendered.getByRole("heading", { name: "Ada Lovelace" }));
  assert.equal(
    rendered.queryByRole("heading", { name: "Editing Ada Lovelace" }),
    null,
  );
  assert.equal(heading.tabIndex, -1);
  const region = heading.closest("[data-canvas-panel]");
  assert.equal(region.getAttribute("aria-labelledby"), heading.id);
  rendered.unmount();
});

test("duplicate renderer lifecycle registration fails inside that Panel boundary", async () => {
  let Canvas;
  const reports = [];
  function DuplicateLifecycleRenderer() {
    const lifecycle = {
      dirty: false,
      guard: () => ({ status: "allow" }),
    };
    Canvas.useLifecycle(lifecycle);
    Canvas.useLifecycle(lifecycle);
    return createElement("p", null, "Invalid duplicate lifecycle");
  }
  Canvas = createCanvasModule({
    root: defineRootPanel({ kind: "root", title: "Home" }),
    panels: [],
    onRendererError: (report) => reports.push(report),
    renderers: { root: DuplicateLifecycleRenderer },
  });
  const originalConsoleError = console.error;
  console.error = () => {};
  const rendered = render(
    createElement(
      Canvas.Provider,
      null,
      createElement(Canvas.Workspace, { label: "Duplicates" }),
    ),
  );
  try {
    await rendered.findByRole("alert");
  } finally {
    console.error = originalConsoleError;
  }
  assert.match(
    rendered.getByRole("alert").textContent,
    /could not be displayed/i,
  );
  assert.equal(reports.length, 1);
  assert.equal(reports[0].kind, "root");
  rendered.unmount();
});

test("a renderer failure takes focus to its notice and a retry hands it back to the Panel body", async () => {
  const broken = definePanel({ kind: "broken", title: ({ name }) => name });
  const root = defineRootPanel({ kind: "root", title: "Home" });
  let recover = false;
  let Canvas;

  function BrokenRenderer() {
    const initialFocus = useRef(null);
    Canvas.useLifecycle({
      dirty: false,
      initialFocus,
      guard: () => ({ status: "allow" }),
      save: async () => {},
      discard: async () => {},
    });
    if (!recover) throw new Error("secret renderer details");
    return createElement(
      "button",
      { ref: initialFocus, type: "button" },
      "Recovered focus target",
    );
  }

  Canvas = createCanvasModule({
    root,
    panels: [broken],
    renderers: {
      root: () => {
        const navigation = Canvas.useNavigation();
        const initialFocus = useRef(null);
        Canvas.useLifecycle({
          dirty: false,
          initialFocus,
          guard: () => ({ status: "allow" }),
          save: async () => {},
          discard: async () => {},
        });
        return createElement(
          "button",
          {
            onClick: () => navigation.open(broken, { name: "Broken panel" }),
            ref: initialFocus,
            type: "button",
          },
          "Open broken panel",
        );
      },
      broken: BrokenRenderer,
    },
  });
  const engine = createPanelEngine({ root, panels: [broken] });
  const rendered = render(
    createElement(
      Canvas.Provider,
      { engine },
      createElement(Canvas.Workspace, { label: "Failures" }),
    ),
  );

  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    fireEvent.click(
      rendered.getByRole("button", { name: "Open broken panel" }),
    );
    await rendered.findByRole("alert");
  } finally {
    console.error = originalConsoleError;
  }

  // The notice replaced the body a keyboard user was on their way into, so it
  // has to be the thing they land on, and it has to name itself when they do.
  const notice = rendered.getByRole("alert", {
    name: /could not be displayed/i,
  });
  await waitFor(() => assert.equal(document.activeElement, notice));
  assert.equal(notice.getAttribute("tabindex"), "-1");

  // A retry restores the body, and the notice the user was standing on
  // disappears underneath them: focus must land somewhere deliberate.
  recover = true;
  fireEvent.click(rendered.getByRole("button", { name: "Retry panel" }));
  await rendered.findByRole("button", { name: "Recovered focus target" });
  // The Panel's own heading is where a restored body starts, so the user is
  // put at the top of what came back rather than left on the document body.
  const heading = rendered.getByRole("heading", { name: "Broken panel" });
  await waitFor(() => assert.equal(document.activeElement, heading));

  // Having recovered once must not cost the Panel its declared initial focus
  // for the rest of its life: activating it again is an ordinary activation,
  // not another body replacement.
  act(() => {
    engine.activate({ target: engine.getSnapshot().panels[0].instanceRef });
  });
  await waitFor(() =>
    assert.equal(
      document.activeElement,
      rendered.getByRole("button", { name: "Open broken panel" }),
    ),
  );
  act(() => {
    engine.activate({ target: engine.getSnapshot().panels[1].instanceRef });
  });
  await waitFor(() =>
    assert.equal(
      document.activeElement,
      rendered.getByRole("button", { name: "Recovered focus target" }),
    ),
  );
  rendered.unmount();
});

test("focus inside a Panel settles the Workspace instead of re-opening its focus claim", async () => {
  const editor = definePanel({ kind: "editor", title: ({ name }) => name });
  const root = defineRootPanel({ kind: "root", title: "Home" });
  let renders = 0;
  let Canvas;

  function FocusedContextConsumer() {
    const target = Canvas.useContextTarget("focused");
    return createElement(
      "div",
      { "data-testid": "focused-context" },
      target.panel ? "In a Panel" : "Outside",
    );
  }

  function Editor({ descriptor }) {
    renders += 1;
    const initialFocus = useRef(null);
    const [revision, setRevision] = useState(0);
    Canvas.useLifecycle({
      dirty: false,
      initialFocus,
      guard: () => ({ status: "allow" }),
      save: async () => {},
      discard: async () => {},
    });
    // Re-registering the header is what makes the Workspace re-render and look
    // at its focus claim again, which is the loop this guards against.
    Canvas.useHeader({ visualTitle: `${descriptor.name} ${revision}` });
    return createElement(
      "div",
      null,
      createElement(
        "button",
        { ref: initialFocus, type: "button" },
        "Start here",
      ),
      createElement("button", { type: "button" }, "Somewhere else"),
      createElement(
        "button",
        { onClick: () => setRevision((value) => value + 1), type: "button" },
        "Re-register header",
      ),
    );
  }

  Canvas = createCanvasModule({
    context: defineCanvasContext(),
    root,
    panels: [editor],
    renderers: {
      root: () => {
        const navigation = Canvas.useNavigation();
        return createElement(
          "button",
          {
            onClick: () => navigation.open(editor, { name: "Draft" }),
            type: "button",
          },
          "Open editor",
        );
      },
      editor: Editor,
    },
  });
  const rendered = render(
    createElement(
      Canvas.Provider,
      null,
      createElement(FocusedContextConsumer),
      createElement(Canvas.Workspace, { label: "Settling" }),
    ),
  );

  fireEvent.click(rendered.getByRole("button", { name: "Open editor" }));
  const start = rendered.getByRole("button", { name: "Start here" });
  await waitFor(() => assert.equal(document.activeElement, start));

  // Moving focus within the Panel publishes the DOM-Focused Panel, so the
  // Context Signal store definitely fired — and the Workspace still must not
  // treat that as a fresh claim on focus.
  const elsewhere = rendered.getByRole("button", { name: "Somewhere else" });
  const beforeFocusMove = renders;
  act(() => elsewhere.focus());
  await act(async () => {});
  assert.equal(document.activeElement, elsewhere);
  assert.equal(
    rendered.getByTestId("focused-context").textContent,
    "In a Panel",
  );
  assert.ok(
    renders - beforeFocusMove <= 1,
    `focusing inside a Panel re-rendered it ${renders - beforeFocusMove} times`,
  );

  fireEvent.click(rendered.getByRole("button", { name: "Re-register header" }));
  await act(async () => {});
  // The claim for this body was honoured once and is not re-opened by a
  // re-render, so the Panel does not snatch focus back to where it started.
  assert.equal(document.activeElement, elsewhere);

  const settled = renders;
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 25));
  });
  assert.equal(
    renders,
    settled,
    "the Workspace kept re-rendering instead of settling",
  );
  assert.equal(document.activeElement, elsewhere);
  rendered.unmount();
});

// A Canvas whose Panels each register an `initialFocus` and have somewhere
// else inside them to click, which is what makes "activating because focus
// arrived must not move that focus" a question with a wrong answer.
function renderActivationCanvas({ activateOnFocus } = {}) {
  const root = defineRootPanel({ kind: "root", title: "Home" });
  const draft = definePanel({
    kind: "draft",
    deduplication: "allow-many",
    title: ({ name }) => name,
  });
  let Canvas;

  function Draft({ descriptor }) {
    const initialFocus = useRef(null);
    const [dirty, setDirty] = useState(false);
    const navigation = Canvas.useNavigation();
    Canvas.useLifecycle({
      dirty,
      initialFocus,
      guard: () =>
        dirty
          ? { status: "confirm", message: "Discard your unsaved changes?" }
          : { status: "allow" },
      save: async () => setDirty(false),
      discard: async () => setDirty(false),
    });
    return createElement(
      Fragment,
      null,
      createElement(
        "button",
        {
          "data-testid": `start-${descriptor.name}`,
          ref: initialFocus,
          type: "button",
        },
        `Start ${descriptor.name}`,
      ),
      // Where the user clicks, which is deliberately not the control this
      // Panel registered as its `initialFocus`. A button rather than a text
      // field only because this file's React was initialized before its
      // document existed, which sends every focused `input` down React's
      // legacy change polyfill and reports an uncaught `detachEvent`.
      createElement(
        "button",
        { "data-testid": `notes-${descriptor.name}`, type: "button" },
        `Notes ${descriptor.name}`,
      ),
      createElement(
        "button",
        {
          "data-testid": `soil-${descriptor.name}`,
          onClick: () => setDirty(true),
          type: "button",
        },
        `Soil ${descriptor.name}`,
      ),
      createElement(
        "button",
        {
          "data-testid": `open-from-${descriptor.name}`,
          onClick: () => navigation.open(draft, { name: "three" }),
          type: "button",
        },
        `Open from ${descriptor.name}`,
      ),
    );
  }

  Canvas = createCanvasModule({
    root,
    panels: [draft],
    renderers: { root: () => null, draft: Draft },
  });

  // Read outside every renderer, where the Bound module's hooks answer for the
  // Active Panel — which is exactly the resolution the reporter watched land on
  // the wrong Panel.
  function ActivePanelProbe() {
    return createElement(
      "p",
      { "data-testid": "active-panel" },
      Canvas.usePanel().title,
    );
  }

  const engine = createPanelEngine({ root, panels: [draft] });
  const rendered = render(
    createElement(
      Canvas.Provider,
      { engine },
      createElement(ActivePanelProbe),
      createElement(Canvas.Workspace, { activateOnFocus, label: "Drafts" }),
    ),
  );
  for (const name of ["one", "two"]) {
    act(() => {
      engine.open({
        originId: engine.getSnapshot().activePanelId,
        panel: draft.reference({ name }),
      });
    });
  }
  return {
    activePanelTitle: () => rendered.getByTestId("active-panel").textContent,
    engine,
    // Deliberately a string rather than the element: a failed comparison of two
    // DOM nodes in this runner hangs the file instead of reporting.
    focusedTestId: () =>
      document.activeElement?.getAttribute("data-testid") ?? null,
    rendered,
  };
}

test("focus alone does not make a retained Panel the Active Panel", async () => {
  const canvas = renderActivationCanvas();
  const notes = canvas.rendered.getByTestId("notes-one");

  act(() => notes.focus());
  await act(async () => {});

  // The standing rule: focus records the DOM-Focused Panel and stops there.
  assert.equal(canvas.activePanelTitle(), "two");
  assert.equal(canvas.focusedTestId(), "notes-one");
  canvas.rendered.unmount();
});

test("a Canvas that activates on focus follows the user into a retained Panel", async () => {
  const canvas = renderActivationCanvas({ activateOnFocus: true });
  const notes = canvas.rendered.getByTestId("notes-one");
  assert.equal(canvas.activePanelTitle(), "two");

  act(() => notes.focus());
  await act(async () => {});

  assert.equal(canvas.activePanelTitle(), "one");
  canvas.rendered.unmount();
});

test("activating a Panel because focus arrived inside it never moves that focus", async () => {
  const canvas = renderActivationCanvas({ activateOnFocus: true });
  const notes = canvas.rendered.getByTestId("notes-one");

  act(() => notes.focus());
  await act(async () => {});

  // The Panel registered an `initialFocus`, and activation ordinarily hands
  // focus to it. Not this activation: focus is already inside the Panel, so
  // sending it anywhere else would take the caret out of the field the user
  // has just clicked into.
  assert.equal(canvas.activePanelTitle(), "one");
  assert.equal(canvas.focusedTestId(), "notes-one");

  // And it is not taken a tick later, once the Workspace has settled.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 25));
  });
  assert.equal(canvas.focusedTestId(), "notes-one");
  canvas.rendered.unmount();
});

test("focus the Canvas restores after a Guarded Transition activates nothing", async () => {
  const canvas = renderActivationCanvas({ activateOnFocus: true });
  const { rendered } = canvas;
  // Draft two has unsaved work, so opening from draft one must guard it.
  fireEvent.click(rendered.getByTestId("soil-two"));

  const opener = rendered.getByTestId("open-from-one");
  act(() => opener.focus());
  await act(async () => {});
  assert.equal(canvas.activePanelTitle(), "one");

  fireEvent.click(opener);
  await rendered.findByRole("alertdialog");
  await act(async () => {
    fireEvent.click(rendered.getByRole("button", { name: "Discard" }));
  });
  await waitFor(() => assert.equal(rendered.queryByRole("alertdialog"), null));

  // Focus went back to the control that started the transition, and that
  // control is in a Panel which is no longer the active one. The Canvas put it
  // there, so it is a repair rather than an arrival, and it must not undo the
  // move the user just made.
  assert.equal(canvas.activePanelTitle(), "three");
  rendered.unmount();
});

function renderDeclaredWidthCanvas() {
  const root = defineRootPanel({ kind: "classes", title: "Classes" });
  const wide = definePanel({
    kind: "wide",
    title: () => "Wide",
    width: { resting: "28rem", active: "min(48rem, 92vw)" },
  });
  const restingOnly = definePanel({
    kind: "resting-only",
    title: () => "Resting only",
    width: { resting: "22rem" },
  });
  const activeOnly = definePanel({
    kind: "active-only",
    title: () => "Active only",
    width: { active: "40rem" },
  });
  const themed = definePanel({ kind: "themed", title: () => "Themed" });
  const panels = [wide, restingOnly, activeOnly, themed];
  const Canvas = createCanvasModule({
    root,
    panels,
    renderers: {
      classes: () => null,
      wide: () => null,
      "resting-only": () => null,
      "active-only": () => null,
      themed: () => null,
    },
  });
  const engine = createPanelEngine({ root, panels });
  const result = render(
    createElement(
      Canvas.Provider,
      { engine },
      createElement(Canvas.Workspace, { label: "Classes Canvas" }),
    ),
  );
  for (const definition of panels) {
    act(() => {
      engine.open({ panel: definition.reference({}) });
    });
  }
  const panelFor = (kind) =>
    result.container.querySelector(`[data-panel-kind="${kind}"]`);
  return { engine, panelFor, result };
}

test("a Panel Kind that declares a width renders at it", () => {
  const { panelFor } = renderDeclaredWidthCanvas();

  // Resolved onto the two custom properties the stylesheet already reads, on
  // the Panel element itself, so the width the Kind declared is the width the
  // Panel rules see.
  const wide = panelFor("wide");
  assert.equal(wide.style.getPropertyValue("--canvas-panel-width"), "28rem");
  assert.equal(
    wide.style.getPropertyValue("--canvas-panel-active-width"),
    "min(48rem, 92vw)",
  );

  // Each half is independent: declaring one leaves the other inherited, so the
  // stylesheet still answers for it.
  const restingOnly = panelFor("resting-only");
  assert.equal(
    restingOnly.style.getPropertyValue("--canvas-panel-width"),
    "22rem",
  );
  assert.equal(
    restingOnly.style.getPropertyValue("--canvas-panel-active-width"),
    "",
  );

  const activeOnly = panelFor("active-only");
  assert.equal(activeOnly.style.getPropertyValue("--canvas-panel-width"), "");
  assert.equal(
    activeOnly.style.getPropertyValue("--canvas-panel-active-width"),
    "40rem",
  );
});

test("a Panel Kind that declares no width is unchanged", () => {
  const { panelFor } = renderDeclaredWidthCanvas();

  // No style attribute at all — not an empty one — so a Canvas whose Kinds say
  // nothing about presentation produces exactly the markup it always has, and
  // the only width seam is still the stylesheet.
  for (const kind of ["classes", "themed"]) {
    assert.equal(panelFor(kind).hasAttribute("style"), false);
  }
});

test("a Panel Separator drag still outranks the width its Kind declared", () => {
  const { panelFor } = renderDeclaredWidthCanvas();
  const panel = panelFor("wide");
  const handle = panel.querySelector("[data-canvas-panel-separator]");

  act(() => {
    fireEvent.keyDown(handle, { key: "End" });
  });

  assert.equal(panel.style.flexBasis, `${canvasPanelSizingBounds.max}px`);
  // The declaration stays where it was: a drag replaces the resolved width, not
  // the Kind's own default, so releasing it would restore the declared one.
  assert.equal(panel.style.getPropertyValue("--canvas-panel-width"), "28rem");
});

test("a content Action renders application content in the header action row, interleaved with buttons by priority", () => {
  const detail = definePanel({
    kind: "detail",
    deduplication: "allow-many",
    title: () => "Detail",
  });
  const cancellations = [];
  let detailRenders = 0;
  let Canvas;

  // The case the label-and-handler shape cannot express: a state label, a
  // ticking duration, and an embedded control, which hides itself when there
  // is no job to report.
  function JobReadout({ elapsed }) {
    return createElement(
      Fragment,
      null,
      createElement(
        "span",
        { "data-testid": "job-elapsed" },
        `Encoding, ${elapsed}s elapsed`,
      ),
      createElement(
        "button",
        { onClick: () => cancellations.push(elapsed), type: "button" },
        "Cancel job",
      ),
    );
  }

  function Root() {
    const navigation = Canvas.useNavigation();
    const [elapsed, setElapsed] = useState(0);
    const [running, setRunning] = useState(true);
    return createElement(
      Fragment,
      null,
      createElement(Canvas.Action, {
        id: "alpha",
        label: "Alpha",
        onSelect: () => {},
        priority: 20,
      }),
      createElement(Canvas.Action, {
        content: running
          ? createElement(JobReadout, { elapsed })
          : // A content Action with nothing to show says so with `null`.
            null,
        id: "job-status",
        priority: 10,
      }),
      createElement(Canvas.Action, {
        id: "zulu",
        label: "Zulu",
        onSelect: () => {},
        priority: 5,
      }),
      createElement(
        "button",
        { onClick: () => setElapsed((current) => current + 1), type: "button" },
        "Tick",
      ),
      createElement(
        "button",
        { onClick: () => setRunning(false), type: "button" },
        "Finish job",
      ),
      createElement(
        "button",
        { onClick: () => navigation.open(detail, { id: "d" }), type: "button" },
        "Open detail",
      ),
    );
  }

  Canvas = createCanvasModule({
    root: defineRootPanel({ kind: "root", title: "Home" }),
    panels: [detail],
    renderers: {
      root: Root,
      detail: () => {
        detailRenders += 1;
        return createElement("p", null, "Detail body");
      },
    },
  });
  const rendered = render(
    createElement(
      Canvas.Provider,
      null,
      createElement(Canvas.Workspace, { label: "Jobs" }),
    ),
  );

  const header = rendered.container.querySelector("[data-canvas-panel-header]");
  const row = () =>
    [...header.children]
      .filter((element) => element.hasAttribute("data-canvas-action"))
      .map(
        (element) =>
          `${element.tagName.toLowerCase()}:${element.getAttribute("data-canvas-action")}`,
      );

  // One sorted row, both shapes in it: the readout takes the place its
  // priority earned rather than being parked at either end.
  assert.deepEqual(row(), ["button:alpha", "div:job-status", "button:zulu"]);
  assert.equal(
    rendered.getByTestId("job-elapsed").textContent,
    "Encoding, 0s elapsed",
  );
  assert.equal(
    rendered
      .getByTestId("job-elapsed")
      .closest("[data-canvas-panel-header]")
      ?.hasAttribute("data-canvas-panel-header"),
    true,
    "content must render inside the Panel header",
  );

  // The wrapper says only which Action it belongs to. It claims no role, no
  // name, and no place in the focus order of its own.
  const wrapper = header.querySelector("[data-canvas-action-content]");
  assert.equal(wrapper.getAttribute("data-canvas-action"), "job-status");
  assert.equal(wrapper.hasAttribute("role"), false);
  assert.equal(wrapper.hasAttribute("tabindex"), false);
  assert.equal(wrapper.hasAttribute("aria-hidden"), false);

  fireEvent.click(rendered.getByRole("button", { name: "Open detail" }));
  const registeredRenders = detailRenders;

  // Application content changes on every render by nature. If it re-registered
  // the Action, the Workspace's registration state would move and every Panel
  // renderer would run again — which is what this counts.
  for (const expected of [1, 2, 3]) {
    fireEvent.click(rendered.getByRole("button", { name: "Tick" }));
    assert.equal(
      rendered.getByTestId("job-elapsed").textContent,
      `Encoding, ${expected}s elapsed`,
    );
  }
  assert.equal(
    detailRenders,
    registeredRenders,
    "re-rendering content re-registered the Action",
  );
  assert.deepEqual(row(), ["button:alpha", "div:job-status", "button:zulu"]);

  // The embedded control is an ordinary button in the header, reachable and
  // wired to the application's own handler.
  fireEvent.click(rendered.getByRole("button", { name: "Cancel job" }));
  assert.deepEqual(cancellations, [3]);

  fireEvent.click(rendered.getByRole("button", { name: "Finish job" }));
  assert.equal(rendered.queryByTestId("job-elapsed"), null);
  assert.equal(rendered.queryByRole("button", { name: "Cancel job" }), null);
  // Self-hiding is the content going away, not the registration: the Action is
  // still registered and still holds its place in the row.
  assert.deepEqual(row(), ["button:alpha", "div:job-status", "button:zulu"]);
  rendered.unmount();
});

test("content in a background Panel's header acts on the Panel that registered it", async () => {
  const editor = definePanel({
    kind: "editor",
    deduplication: "allow-many",
    title: ({ name }) => name,
  });
  let Canvas;

  function CloseFromHeader() {
    const navigation = Canvas.useNavigation();
    const panel = Canvas.usePanel();
    return createElement(
      "button",
      { onClick: () => navigation.close(), type: "button" },
      `Dismiss ${panel.title}`,
    );
  }

  Canvas = createCanvasModule({
    root: defineRootPanel({ kind: "root", title: "Home" }),
    panels: [editor],
    renderers: {
      root: () => {
        const navigation = Canvas.useNavigation();
        return createElement(
          "button",
          {
            onClick: () => navigation.open(editor, { name: "Draft" }),
            type: "button",
          },
          "Open editor",
        );
      },
      editor: ({ descriptor }) => {
        const navigation = Canvas.useNavigation();
        return createElement(
          Fragment,
          null,
          createElement(Canvas.Action, {
            content: createElement(CloseFromHeader),
            id: "dismiss",
          }),
          createElement("p", null, `Editing ${descriptor.name}`),
          createElement(
            "button",
            {
              onClick: () => navigation.open(editor, { name: "Second" }),
              type: "button",
            },
            `Open a Panel beside ${descriptor.name}`,
          ),
        );
      },
    },
  });
  const rendered = render(
    createElement(
      Canvas.Provider,
      null,
      createElement(Canvas.Workspace, { label: "Scoped content" }),
    ),
  );

  const openPanels = () =>
    rendered.container.querySelectorAll("[data-canvas-panel]").length;

  fireEvent.click(rendered.getByRole("button", { name: "Open editor" }));
  fireEvent.click(
    rendered.getByRole("button", { name: "Open a Panel beside Draft" }),
  );
  await act(async () => {});
  assert.equal(openPanels(), 3);

  // "Second" is the Active Panel, and the read models inside "Draft"'s header
  // content still resolve to the Panel that registered the Action.
  const dismiss = rendered.getByRole("button", { name: "Dismiss Draft" });
  assert.equal(
    dismiss.closest("[data-canvas-panel]").dataset.panelKind,
    "editor",
  );
  assert.ok(rendered.getByRole("button", { name: "Dismiss Second" }));

  // Navigation from header content targets its own Panel too: closing "Draft"
  // takes the Panel opened beside it, not the other way round.
  fireEvent.click(dismiss);
  await act(async () => {});
  assert.equal(rendered.queryByRole("button", { name: "Dismiss Draft" }), null);
  assert.equal(
    rendered.queryByRole("button", { name: "Dismiss Second" }),
    null,
  );
  assert.equal(openPanels(), 1);
  rendered.unmount();
});

test("a content Action's failure is dropped from the row rather than taking the Canvas down", async () => {
  const reports = [];
  let Canvas;

  function Explodes({ broken }) {
    if (broken) throw new Error("readout failed");
    return createElement("span", { "data-testid": "readout" }, "Idle");
  }

  function Root() {
    const [broken, setBroken] = useState(false);
    return createElement(
      Fragment,
      null,
      createElement(Canvas.Action, {
        content: createElement(Explodes, { broken }),
        id: "readout",
      }),
      createElement(Canvas.Action, {
        id: "rename",
        label: "Rename",
        onSelect: () => {},
      }),
      createElement(
        "button",
        { onClick: () => setBroken(true), type: "button" },
        "Break readout",
      ),
      createElement(
        "button",
        { onClick: () => setBroken(false), type: "button" },
        "Mend readout",
      ),
    );
  }

  Canvas = createCanvasModule({
    onRendererError: (report) => reports.push(report.kind),
    root: defineRootPanel({ kind: "root", title: "Home" }),
    panels: [],
    renderers: { root: Root },
  });
  const rendered = render(
    createElement(
      Canvas.Provider,
      null,
      createElement(Canvas.Workspace, { label: "Failing content" }),
    ),
  );

  assert.equal(rendered.getByTestId("readout").textContent, "Idle");
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    fireEvent.click(rendered.getByRole("button", { name: "Break readout" }));
    await act(async () => {});
  } finally {
    console.error = originalConsoleError;
  }

  // The Canvas is still standing: the chrome, the other Action, and the Panel
  // body are all where they were, and the host heard about the failure.
  assert.equal(rendered.queryByTestId("readout"), null);
  assert.ok(rendered.getByRole("button", { name: "Rename" }));
  assert.ok(rendered.getByRole("region", { name: "Home" }));
  assert.deepEqual(reports, ["root"]);

  // The next content the application renders is tried again.
  fireEvent.click(rendered.getByRole("button", { name: "Mend readout" }));
  await act(async () => {});
  assert.equal(rendered.getByTestId("readout").textContent, "Idle");
  rendered.unmount();
});

test("content may not register a header registration of its own", async () => {
  const reports = [];
  let Canvas;

  // A registration that re-runs whenever the content it sits in re-renders is
  // a loop, and content re-renders by nature. It is refused with a sentence
  // rather than left to spin.
  function NestedRegistration() {
    Canvas.useHeader({ visualTitle: "From inside the header" });
    return createElement("span", null, "Never rendered");
  }

  Canvas = createCanvasModule({
    onRendererError: (report) => reports.push(report.kind),
    root: defineRootPanel({ kind: "root", title: "Home" }),
    panels: [],
    renderers: {
      root: () =>
        createElement(Canvas.Action, {
          content: createElement(NestedRegistration),
          id: "nested",
        }),
    },
  });

  const originalConsoleError = console.error;
  console.error = () => {};
  let rendered;
  try {
    rendered = render(
      createElement(
        Canvas.Provider,
        null,
        createElement(Canvas.Workspace, { label: "Nested registration" }),
      ),
    );
    await act(async () => {});
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(rendered.queryByText("Never rendered"), null);
  // Every attempt is reported, and every report names the Panel whose content
  // it was: the registration settling hands the boundary a new element, which
  // is a new attempt rather than the same failure counted twice.
  assert.ok(reports.length > 0, "the refusal must reach the host");
  assert.deepEqual(new Set(reports), new Set(["root"]));
  assert.ok(rendered.getByRole("region", { name: "Home" }));
  rendered.unmount();
});

test("a button Action renders an icon before its label and a description the button points at", () => {
  const detail = definePanel({
    kind: "detail",
    deduplication: "allow-many",
    title: () => "Detail",
  });
  let detailRenders = 0;
  let Canvas;

  function Root() {
    const navigation = Canvas.useNavigation();
    const [summarised, setSummarised] = useState(false);
    const [redraws, setRedraws] = useState(0);
    return createElement(
      Fragment,
      null,
      // The Action that registers neither field: it must render exactly as it
      // did before either existed.
      createElement(Canvas.Action, {
        id: "preview",
        label: "Preview",
        onSelect: () => {},
        priority: 30,
      }),
      createElement(Canvas.Action, {
        description: summarised
          ? "Publishing replaces the live page."
          : "Add a summary before publishing.",
        disabled: !summarised,
        // Written inline at the call site, which is what an application does
        // and what makes it a new element on every render.
        icon: createElement("svg", {
          "data-testid": `publish-icon-${redraws}`,
          viewBox: "0 0 16 16",
        }),
        id: "publish",
        label: "Publish",
        onSelect: () => {},
        priority: 20,
      }),
      createElement(
        "button",
        { onClick: () => setSummarised(true), type: "button" },
        "Add summary",
      ),
      createElement(
        "button",
        { onClick: () => setRedraws((current) => current + 1), type: "button" },
        "Redraw icon",
      ),
      createElement(
        "button",
        { onClick: () => navigation.open(detail, { id: "d" }), type: "button" },
        "Open detail",
      ),
    );
  }

  Canvas = createCanvasModule({
    root: defineRootPanel({ kind: "root", title: "Home" }),
    panels: [detail],
    renderers: {
      root: Root,
      detail: () => {
        detailRenders += 1;
        return createElement("p", null, "Detail body");
      },
    },
  });
  const rendered = render(
    createElement(
      Canvas.Provider,
      null,
      createElement(Canvas.Workspace, { label: "Publishing" }),
    ),
  );

  const header = rendered.container.querySelector("[data-canvas-panel-header]");
  const action = (id) =>
    header.querySelector(`button[data-canvas-action="${id}"]`);

  // Absent both fields, nothing about the button has moved: its label is still
  // its only child, and there is nothing for it to point at.
  assert.equal(action("preview").innerHTML, "Preview");
  assert.equal(action("preview").hasAttribute("aria-describedby"), false);
  assert.equal(
    action("preview").querySelectorAll("[data-canvas-action-icon]").length,
    0,
  );

  // The icon comes first, the label after it, the description last — all three
  // inside the button, which is what keeps the row's direct-child adjacency
  // intact and the button a single pointer target.
  assert.deepEqual(
    [...action("publish").childNodes].map((node) =>
      node.nodeType === 1
        ? node
            .getAttributeNames()
            .find((name) => name.startsWith("data-canvas-"))
        : `#text:${node.textContent}`,
    ),
    [
      "data-canvas-action-icon",
      "#text:Publish",
      "data-canvas-action-description",
    ],
  );
  assert.deepEqual(
    [...header.children]
      .filter((element) => element.hasAttribute("data-canvas-action"))
      .map(
        (element) =>
          `${element.tagName.toLowerCase()}:${element.getAttribute("data-canvas-action")}`,
      ),
    ["button:preview", "button:publish"],
  );

  // The accessible name is the label and nothing else. The glyph is decoration
  // beside a name that already exists, and says so.
  assert.ok(rendered.getByRole("button", { name: "Publish" }));
  assert.equal(action("publish").getAttribute("aria-label"), "Publish");
  const icon = action("publish").querySelector("[data-canvas-action-icon]");
  assert.equal(icon.tagName.toLowerCase(), "span");
  assert.equal(icon.getAttribute("aria-hidden"), "true");
  assert.equal(icon.firstElementChild.tagName.toLowerCase(), "svg");

  // The description is announced as a description: a real element the button
  // points at, not a `title` a keyboard or a touch screen cannot reach.
  const describedBy = action("publish").getAttribute("aria-describedby");
  assert.equal(typeof describedBy, "string");
  const description = dom.window.document.getElementById(describedBy);
  assert.equal(description.textContent, "Add a summary before publishing.");
  assert.equal(description.getAttribute("data-canvas-action-description"), "");
  assert.equal(
    description.parentElement.getAttribute("data-canvas-action"),
    "publish",
  );

  // A description is not a state of the control. Enabling the Action does not
  // withdraw it; the application decides what it says, or whether to say
  // anything, by what it registers.
  fireEvent.click(rendered.getByRole("button", { name: "Add summary" }));
  assert.equal(action("publish").hasAttribute("disabled"), false);
  assert.equal(
    dom.window.document.getElementById(
      action("publish").getAttribute("aria-describedby"),
    ).textContent,
    "Publishing replaces the live page.",
  );

  fireEvent.click(rendered.getByRole("button", { name: "Open detail" }));
  const registeredRenders = detailRenders;

  // An icon written inline is a new element on every render. If it re-registered
  // the Action, the Workspace's registration state would move and every Panel
  // renderer would run again — which is what this counts.
  for (const redraw of [1, 2, 3]) {
    fireEvent.click(rendered.getByRole("button", { name: "Redraw icon" }));
    assert.equal(
      action("publish")
        .querySelector("[data-canvas-action-icon]")
        .firstElementChild.getAttribute("data-testid"),
      `publish-icon-${redraw}`,
    );
  }
  assert.equal(
    detailRenders,
    registeredRenders,
    "re-rendering an icon re-registered the Action",
  );
  assert.equal(action("publish").getAttribute("aria-label"), "Publish");
  rendered.unmount();
});
