import assert from "node:assert/strict";
import test from "node:test";

import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { JSDOM } from "jsdom";
import { createElement, StrictMode, useState } from "react";

import {
  createPanelEngine,
  definePanel,
  defineRootPanel,
} from "../packages/canvas-panels/dist/core/index.js";
import { usePanelEditor } from "../packages/canvas-panels/dist/extensions/editor.js";
import {
  createResourceExchange,
  ResourceExchangeProvider,
  usePanelResource,
  useResourceSubscription,
} from "../packages/canvas-panels/dist/extensions/resources.js";
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

const portfolio = defineRootPanel({ kind: "portfolio", title: "Portfolio" });
const project = definePanel({
  kind: "project",
  deduplication: "reuse",
  key: ({ projectId }) => projectId,
  title: ({ name }) => name,
});
const brief = definePanel({
  kind: "brief",
  deduplication: "allow-many",
  title: ({ title }) => title,
});
const person = definePanel({
  kind: "person",
  deduplication: "allow-many",
  title: ({ name }) => name,
});

/**
 * A Canvas whose Panels show three related things and one unrelated one:
 * the portfolio list, the Atlas project, the Atlas creative brief, and a
 * person who has nothing to do with any of them.
 */
function renderResourceCanvas() {
  cleanup();
  const exchange = createResourceExchange();
  const records = new Map([
    ["projects/atlas", "Atlas Field Guide"],
    ["projects/atlas/briefs/direction", "Confident and useful"],
    ["people/ada", "Ada Lovelace"],
  ]);
  const reads = { brief: 0, person: 0, portfolio: 0, project: 0 };
  let Canvas;

  function PortfolioRenderer() {
    const navigation = Canvas.useNavigation();
    const [heard, setHeard] = useState(0);
    useResourceSubscription({
      keys: ["projects/*"],
      notify: () => {
        reads.portfolio += 1;
        setHeard((count) => count + 1);
      },
    });
    return createElement(
      "div",
      null,
      createElement("p", { "data-testid": "portfolio-heard" }, String(heard)),
      createElement(
        "button",
        {
          onClick: () =>
            navigation.open(project, {
              name: "Atlas Field Guide",
              projectId: "atlas",
            }),
          type: "button",
        },
        "Open Atlas",
      ),
    );
  }

  function ProjectRenderer({ descriptor, panel }) {
    const navigation = Canvas.useNavigation();
    const key = `projects/${descriptor.projectId}`;
    const [shown, setShown] = useState(() => records.get(key));
    const resource = usePanelResource({
      keys: [key],
      reload: async () => {
        reads.project += 1;
        setShown(records.get(key) ?? "(gone)");
      },
      source: panel.instanceId,
    });
    return createElement(
      "div",
      null,
      createElement("p", { "data-testid": "project-shown" }, shown),
      createElement(
        "p",
        { "data-testid": "project-deleted" },
        resource.deleted ? "deleted" : "present",
      ),
      createElement(
        "button",
        {
          onClick: () => {
            records.set(key, "Atlas Field Guide (renamed here)");
            setShown(records.get(key));
            resource.publish({ key, kind: "changed", nested: true });
          },
          type: "button",
        },
        "Rename Atlas here",
      ),
      createElement(
        "button",
        {
          onClick: () =>
            navigation.open(brief, {
              briefId: "direction",
              projectId: descriptor.projectId,
              title: "Creative direction",
            }),
          type: "button",
        },
        "Open brief",
      ),
    );
  }

  function BriefRenderer({ descriptor, panel }) {
    const key = `projects/${descriptor.projectId}/briefs/${descriptor.briefId}`;
    const [stored, setStored] = useState(() => records.get(key));
    const [draft, setDraft] = useState(() => records.get(key));
    const navigation = Canvas.useNavigation();
    const editor = usePanelEditor({
      discard: async () => setDraft(stored),
      dirty: draft !== stored,
      reload: async () => {
        reads.brief += 1;
        const current = records.get(key) ?? "(gone)";
        setStored(current);
        setDraft(current);
      },
      save: async () => {
        records.set(key, draft);
        setStored(draft);
      },
    });
    // The Panel keeps one lifecycle: the editor's. The resource coordinator
    // never registers its own, it only defers to what the editor reports.
    Canvas.useLifecycle({ ...editor.lifecycle, dirtyLabel: "Unsaved" });
    const resource = usePanelResource({
      // Both halves of "there is something here a re-read would disturb": an
      // unsaved draft, and an operation the editor is part-way through.
      dirty: editor.dirty || editor.busy,
      keys: [key],
      reload: async () => {
        const outcome = await editor.reload({ discardChanges: true });
        if (outcome.status !== "completed") {
          throw new Error(`the brief refused to re-read: ${outcome.status}`);
        }
      },
      source: panel.instanceId,
    });
    return createElement(
      "div",
      null,
      createElement("p", { "data-testid": "brief-draft" }, draft),
      createElement(
        "p",
        { "data-testid": "brief-pending" },
        resource.pending ? resource.pending.kind : "none",
      ),
      createElement(
        "button",
        { onClick: () => setDraft("Half-written"), type: "button" },
        "Edit brief",
      ),
      createElement(
        "button",
        { onClick: () => void editor.discard(), type: "button" },
        "Discard brief",
      ),
      createElement(
        "button",
        { onClick: () => void resource.apply(), type: "button" },
        "Reload brief now",
      ),
      createElement(
        "button",
        { onClick: () => resource.dismiss(), type: "button" },
        "Keep editing",
      ),
      createElement(
        "button",
        {
          onClick: () =>
            navigation.open(person, { name: "Ada Lovelace", personId: "ada" }),
          type: "button",
        },
        "Open Ada",
      ),
    );
  }

  function PersonRenderer({ descriptor, panel }) {
    const key = `people/${descriptor.personId}`;
    const [shown, setShown] = useState(() => records.get(key));
    const resource = usePanelResource({
      keys: [key],
      reload: async () => {
        reads.person += 1;
        setShown(records.get(key) ?? "(gone)");
      },
      source: panel.instanceId,
    });
    return createElement(
      "div",
      null,
      createElement("p", { "data-testid": "person-shown" }, shown),
      createElement(
        "p",
        { "data-testid": "person-pending" },
        resource.pending ? resource.pending.kind : "none",
      ),
    );
  }

  Canvas = createCanvasModule({
    root: portfolio,
    panels: [project, brief, person],
    renderers: {
      brief: BriefRenderer,
      person: PersonRenderer,
      portfolio: PortfolioRenderer,
      project: ProjectRenderer,
    },
  });

  const engine = createPanelEngine({
    root: portfolio,
    panels: [project, brief, person],
  });
  const rendered = render(
    createElement(
      StrictMode,
      null,
      createElement(
        ResourceExchangeProvider,
        { exchange },
        createElement(
          Canvas.Provider,
          { engine },
          createElement(Canvas.Workspace, { label: "Studio" }),
        ),
      ),
    ),
  );

  fireEvent.click(rendered.getByRole("button", { name: "Open Atlas" }));
  fireEvent.click(rendered.getByRole("button", { name: "Open brief" }));
  fireEvent.click(rendered.getByRole("button", { name: "Open Ada" }));

  return { engine, exchange, records, reads, rendered };
}

async function publish(exchange, announcement) {
  await act(async () => {
    exchange.publish(announcement);
  });
}

test("related Panels re-read a changed Resource while an unrelated Panel is untouched", async () => {
  const { exchange, records, reads, rendered } = renderResourceCanvas();
  records.set("projects/atlas", "Atlas Field Guide, second edition");
  records.set("projects/atlas/briefs/direction", "Confident, useful, human");

  await publish(exchange, {
    key: "projects/atlas",
    kind: "changed",
    nested: true,
  });

  assert.equal(
    rendered.getByTestId("project-shown").textContent,
    "Atlas Field Guide, second edition",
  );
  assert.equal(
    rendered.getByTestId("brief-draft").textContent,
    "Confident, useful, human",
  );
  assert.equal(rendered.getByTestId("portfolio-heard").textContent, "1");
  assert.equal(
    rendered.getByTestId("person-shown").textContent,
    "Ada Lovelace",
    "an unrelated Panel must not be disturbed",
  );
  assert.equal(reads.person, 0);
  assert.equal(rendered.getByTestId("person-pending").textContent, "none");
});

test("a deletion is reported to related Panels and applied to none of them", async () => {
  const { exchange, reads, rendered } = renderResourceCanvas();

  await publish(exchange, {
    key: "projects/atlas",
    kind: "deleted",
    nested: true,
  });

  assert.equal(rendered.getByTestId("project-deleted").textContent, "deleted");
  assert.equal(rendered.getByTestId("brief-pending").textContent, "deleted");
  assert.equal(
    rendered.getByTestId("project-shown").textContent,
    "Atlas Field Guide",
    "a Panel is never emptied out from under its reader",
  );
  assert.equal(reads.project, 0);
  assert.equal(reads.brief, 0);
  assert.equal(rendered.getByTestId("person-pending").textContent, "none");
});

// The criterion this extension exists for: an invalidation must never be the
// reason a human loses what they typed.
test("a Panel with unsaved work defers the re-read through its own lifecycle", async () => {
  const { exchange, records, reads, rendered } = renderResourceCanvas();

  fireEvent.click(rendered.getByRole("button", { name: "Edit brief" }));
  assert.equal(rendered.getByTestId("brief-draft").textContent, "Half-written");
  assert.ok(rendered.getByText("Unsaved"));

  records.set("projects/atlas/briefs/direction", "Rewritten elsewhere");
  await publish(exchange, {
    key: "projects/atlas/briefs/direction",
    kind: "changed",
  });

  assert.equal(
    rendered.getByTestId("brief-draft").textContent,
    "Half-written",
    "the draft survives the invalidation",
  );
  assert.equal(rendered.getByTestId("brief-pending").textContent, "changed");
  assert.equal(reads.brief, 0);

  // Settling the edit the ordinary way is all it takes: the held read follows.
  await act(async () => {
    fireEvent.click(rendered.getByRole("button", { name: "Discard brief" }));
  });

  assert.equal(
    rendered.getByTestId("brief-draft").textContent,
    "Rewritten elsewhere",
  );
  assert.equal(rendered.getByTestId("brief-pending").textContent, "none");
  assert.equal(reads.brief, 1);
});

test("a held re-read can be taken now, or kept waiting, on the human's say-so", async () => {
  const { exchange, records, rendered } = renderResourceCanvas();

  fireEvent.click(rendered.getByRole("button", { name: "Edit brief" }));
  records.set("projects/atlas/briefs/direction", "Rewritten elsewhere");
  await publish(exchange, {
    key: "projects/atlas/briefs/direction",
    kind: "changed",
  });

  await act(async () => {
    fireEvent.click(rendered.getByRole("button", { name: "Keep editing" }));
  });
  assert.equal(rendered.getByTestId("brief-draft").textContent, "Half-written");
  assert.equal(rendered.getByTestId("brief-pending").textContent, "none");

  fireEvent.click(rendered.getByRole("button", { name: "Edit brief" }));
  await publish(exchange, {
    key: "projects/atlas/briefs/direction",
    kind: "changed",
  });
  await act(async () => {
    fireEvent.click(rendered.getByRole("button", { name: "Reload brief now" }));
  });

  assert.equal(
    rendered.getByTestId("brief-draft").textContent,
    "Rewritten elsewhere",
  );
});

test("the Panel that made the change is not told to re-read its own work", async () => {
  const { reads, rendered } = renderResourceCanvas();

  await act(async () => {
    fireEvent.click(
      rendered.getByRole("button", { name: "Rename Atlas here" }),
    );
  });

  assert.equal(
    rendered.getByTestId("project-shown").textContent,
    "Atlas Field Guide (renamed here)",
  );
  assert.equal(reads.project, 0, "the publisher must not hear itself");
  assert.equal(rendered.getByTestId("portfolio-heard").textContent, "1");
  assert.equal(reads.brief, 1, "the nested brief still hears it");
});

test("an unmounted Panel stops listening", async () => {
  const { exchange, reads, rendered } = renderResourceCanvas();

  fireEvent.click(rendered.getByRole("button", { name: "Close Ada Lovelace" }));
  await publish(exchange, { key: "people/ada", kind: "changed" });

  assert.equal(reads.person, 0);
  assert.equal(
    exchange.publish({ key: "people/ada", kind: "changed" }).notified,
    0,
  );
});

test("a Canvas without an exchange above it says so instead of failing later", () => {
  cleanup();
  function Orphan() {
    usePanelResource({ keys: ["projects/atlas"] });
    return null;
  }

  assert.throws(
    () => render(createElement(Orphan)),
    /Canvas Panels resource hooks must be used within a ResourceExchangeProvider/,
  );
});
