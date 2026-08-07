import assert from "node:assert/strict";
import test from "node:test";

import { fireEvent, render } from "@testing-library/react";
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

test("a bound Canvas renders, opens, and closes an accessible Child while retaining Root", async () => {
  const root = defineRootPanel({ kind: "classes", title: "Classes" });
  const student = definePanel({
    kind: "student",
    title: ({ name }) => name,
  });
  const Canvas = createCanvasModule({
    root,
    panels: [student],
    renderers: {
      classes: ({ open, panel }) =>
        createElement(
          "button",
          {
            type: "button",
            onClick: () =>
              open({
                originId: panel.instanceId,
                panel: student.reference({ name: "Ada Lovelace" }),
              }),
          },
          "Open Ada Lovelace",
        ),
      student: ({ panel }) =>
        createElement("p", null, `Student record: ${panel.title}`),
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

  fireEvent.click(result.getByRole("button", { name: "Open Ada Lovelace" }));

  assert.equal(engine.getSnapshot().panels.length, 2);
  assert.ok(result.getByRole("region", { name: "Classes" }));
  assert.ok(result.getByRole("region", { name: "Ada Lovelace" }));
  assert.match(
    result.getByText("Student record: Ada Lovelace").textContent,
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

  fireEvent.click(result.getByRole("button", { name: "Close Ada Lovelace" }));

  assert.equal(engine.getSnapshot().panels.length, 1);
  assert.ok(result.getByRole("region", { name: "Classes" }));
  assert.equal(result.queryByRole("region", { name: "Ada Lovelace" }), null);
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

test("nested Bound Canvas Modules retain their own engines", () => {
  const ClassesCanvas = createCanvasModule({
    root: defineRootPanel({ kind: "classes", title: "Classes" }),
    panels: [],
    renderers: { classes: () => createElement("p", null, "Class list") },
  });
  const ReportsCanvas = createCanvasModule({
    root: defineRootPanel({ kind: "reports", title: "Reports" }),
    panels: [],
    renderers: { reports: () => createElement("p", null, "Report list") },
  });

  const result = render(
    createElement(
      ClassesCanvas.Provider,
      null,
      createElement(
        ReportsCanvas.Provider,
        null,
        createElement(ReportsCanvas.Workspace, { label: "Report records" }),
        createElement(ClassesCanvas.Workspace, { label: "Class records" }),
      ),
    ),
  );

  assert.ok(result.getByRole("region", { name: "Classes" }));
  assert.ok(result.getByRole("region", { name: "Reports" }));
  result.unmount();
});
