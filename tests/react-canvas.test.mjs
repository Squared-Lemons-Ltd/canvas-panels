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
