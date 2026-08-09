import assert from "node:assert/strict";
import test from "node:test";

import { act, fireEvent, render } from "@testing-library/react";
import { JSDOM } from "jsdom";
import { createElement } from "react";

import {
  definePanel,
  defineRootPanel,
} from "../packages/canvas-panels/dist/core/index.js";
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
  const Canvas = createCanvasModule({
    root,
    panels: [classPanel, learner],
    renderers: {
      classes: ({ open, panel }) =>
        createElement(
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
                onClick: () =>
                  open({
                    originId: panel.instanceId,
                    panel: classPanel.reference(input),
                  }),
              },
              `Open ${input.name}`,
            ),
          ),
        ),
      class: ({ open, panel }) =>
        createElement(
          "button",
          {
            type: "button",
            onClick: () =>
              open({
                originId: panel.instanceId,
                panel: learner.reference({
                  learnerId: "learner-a",
                  name: "Ada Lovelace",
                }),
              }),
          },
          "Open Ada Lovelace",
        ),
      learner: ({ panel }) =>
        createElement("p", null, `Learner record: ${panel.title}`),
    },
  });
  const engine = Canvas.createEngine();

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
  const ClassesCanvas = createCanvasModule({
    root: defineRootPanel({ kind: "classes", title: "Classes" }),
    panels: [classPanel],
    renderers: {
      classes: () => createElement("p", null, "Class list"),
      class: ({ panel }) => createElement("p", null, panel.title),
    },
  });
  const ReportsCanvas = createCanvasModule({
    root: defineRootPanel({ kind: "reports", title: "Reports" }),
    panels: [reportPanel],
    renderers: {
      reports: () => createElement("p", null, "Report list"),
      report: ({ panel }) => createElement("p", null, panel.title),
    },
  });
  const classesEngine = ClassesCanvas.createEngine();
  const reportsEngine = ReportsCanvas.createEngine();
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
  assert.notEqual(openedClass.instanceId, openedReport.instanceId);
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

test("nested Providers from one Bound Canvas route commands to their owning Workspace", () => {
  const classPanel = definePanel({
    kind: "class",
    title: ({ name }) => name,
  });
  const Canvas = createCanvasModule({
    root: defineRootPanel({ kind: "classes", title: "Classes" }),
    panels: [classPanel],
    renderers: {
      classes: () => createElement("p", null, "Class list"),
      class: ({ panel }) => createElement("p", null, panel.title),
    },
  });
  const parentEngine = Canvas.createEngine();
  const nestedEngine = Canvas.createEngine();
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
  const Canvas = createCanvasModule({
    root,
    panels: [editor],
    renderers: {
      root: ({ open, panel }) =>
        createElement(
          "button",
          {
            type: "button",
            onClick: () =>
              open({
                originId: panel.instanceId,
                panel: editor.reference({ name: "Dirty draft" }),
              }),
          },
          "Open draft",
        ),
      editor: () => {
        Canvas.useLifecycle({
          guard: () => ({
            status: "confirm",
            message: "Save your changes before closing?",
          }),
          save: async () => {
            saves.push("saved");
          },
          discard: async () => {},
        });
        return createElement("label", null, "Draft", createElement("input"));
      },
    },
  });
  const engine = Canvas.createEngine();
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
  assert.equal(rendered.getByText("Draft").textContent, "Draft");
  assert.equal(document.activeElement, closeButton);

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
