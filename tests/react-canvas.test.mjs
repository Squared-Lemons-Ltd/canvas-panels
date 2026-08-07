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
