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
import { createElement, StrictMode, useState } from "react";

import {
  createPanelEngine,
  definePanel,
  defineRootPanel,
} from "../packages/canvas-panels/dist/core/index.js";
import {
  editorGuardMessages,
  usePanelEditor,
} from "../packages/canvas-panels/dist/extensions/editor.js";
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

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolveDeferred, rejectDeferred) => {
    resolve = resolveDeferred;
    reject = rejectDeferred;
  });
  return { promise, reject, resolve };
}

const root = defineRootPanel({ kind: "records", title: "Records" });
const draft = definePanel({
  kind: "draft",
  deduplication: "allow-many",
  title: ({ name }) => name,
});

/**
 * Renders a Canvas whose one editable Panel coordinates an application-owned
 * draft through the extension. `hooks` supplies whatever the test needs to
 * drive: a deferred save, a failing save, a loading flag.
 */
function renderEditorCanvas(hooks = {}) {
  cleanup();
  const record = { saves: 0, discards: 0, reloads: 0 };
  let Canvas;

  function DraftPanel() {
    const [stored, setStored] = useState("first");
    const [text, setText] = useState("first");
    const editor = usePanelEditor({
      dirty: text !== stored,
      loading: hooks.loading === true,
      save: async (operation) => {
        record.saves += 1;
        await hooks.save?.(operation);
        setStored(text);
      },
      discard: async () => {
        record.discards += 1;
        setText(stored);
      },
      ...(hooks.reload === false
        ? {}
        : {
            reload: async (operation) => {
              record.reloads += 1;
              if (typeof hooks.reload === "function") {
                await hooks.reload(operation);
              }
              setStored("reloaded");
              setText("reloaded");
            },
          }),
    });
    Canvas.useLifecycle({ ...editor.lifecycle, dirtyLabel: "Unsaved" });

    return createElement(
      "div",
      null,
      createElement("p", { "data-testid": "status" }, editor.status),
      createElement(
        "p",
        { "data-testid": "dirty" },
        editor.dirty ? "dirty" : "clean",
      ),
      createElement(
        "p",
        { "data-testid": "failure" },
        editor.failure ? String(editor.failure.error.message) : "none",
      ),
      createElement("p", { "data-testid": "text" }, text),
      createElement(
        "button",
        { onClick: () => setText("edited"), type: "button" },
        "Edit draft",
      ),
      createElement(
        "button",
        { onClick: () => void editor.save(), type: "button" },
        "Save draft",
      ),
      createElement(
        "button",
        {
          onClick: () => {
            record.lastReload = editor.reload();
          },
          type: "button",
        },
        "Reload draft",
      ),
      createElement(
        "button",
        {
          onClick: () => {
            record.lastReload = editor.reload({ discardChanges: true });
          },
          type: "button",
        },
        "Reload and lose changes",
      ),
    );
  }

  Canvas = createCanvasModule({
    root,
    panels: [draft],
    renderers: {
      draft: DraftPanel,
      records: () => {
        const navigation = Canvas.useNavigation();
        return createElement(
          "button",
          {
            onClick: () => navigation.open(draft, { name: "Draft" }),
            type: "button",
          },
          "Open draft",
        );
      },
    },
  });

  const engine = createPanelEngine({ root, panels: [draft] });
  const workspace = createElement(
    Canvas.Provider,
    { engine },
    createElement(Canvas.Workspace, { label: "Records" }),
  );
  const rendered = render(
    hooks.strict === true
      ? createElement(StrictMode, null, workspace)
      : workspace,
  );
  fireEvent.click(rendered.getByRole("button", { name: "Open draft" }));

  return { engine, record, rendered };
}

test("an unedited editor Panel closes without a decision", () => {
  const { engine, rendered } = renderEditorCanvas();

  fireEvent.click(rendered.getByRole("button", { name: "Close Draft" }));

  assert.equal(engine.getSnapshot().panels.length, 1);
  assert.equal(rendered.queryByRole("alertdialog"), null);
});

test("an edited editor Panel asks for a decision and saves through the coordinator", async () => {
  const { engine, record, rendered } = renderEditorCanvas();

  fireEvent.click(rendered.getByRole("button", { name: "Edit draft" }));
  assert.equal(rendered.getByTestId("text").textContent, "edited");
  assert.ok(rendered.getByText("Unsaved"), "the Panel reports unsaved work");

  fireEvent.click(rendered.getByRole("button", { name: "Close Draft" }));

  const dialog = await rendered.findByRole("alertdialog", {
    name: "Unsaved changes in Draft",
  });
  assert.match(
    dialog.textContent,
    new RegExp(editorGuardMessages.unsavedChanges),
  );

  await act(async () => {
    fireEvent.click(rendered.getByRole("button", { name: "Save" }));
  });

  assert.equal(record.saves, 1);
  assert.equal(engine.getSnapshot().panels.length, 1);
});

test("discarding through the coordinator restores the stored record", async () => {
  const { engine, record, rendered } = renderEditorCanvas();

  fireEvent.click(rendered.getByRole("button", { name: "Edit draft" }));
  fireEvent.click(rendered.getByRole("button", { name: "Close Draft" }));
  await rendered.findByRole("alertdialog");

  await act(async () => {
    fireEvent.click(rendered.getByRole("button", { name: "Discard" }));
  });

  assert.equal(record.discards, 1);
  assert.equal(record.saves, 0);
  assert.equal(engine.getSnapshot().panels.length, 1);
});

test("a failed save keeps the Panel open and reports the failure in both places", async () => {
  const failure = new Error("the draft could not be stored");
  const { engine, rendered } = renderEditorCanvas({
    save: async () => {
      throw failure;
    },
  });

  fireEvent.click(rendered.getByRole("button", { name: "Edit draft" }));
  fireEvent.click(rendered.getByRole("button", { name: "Close Draft" }));
  await rendered.findByRole("alertdialog");

  await act(async () => {
    fireEvent.click(rendered.getByRole("button", { name: "Save" }));
  });

  assert.equal(engine.getSnapshot().panels.length, 2, "the Panel must remain");
  assert.ok(
    rendered.getByText(
      "The transition could not be completed. Your work is still open.",
    ),
  );
  assert.equal(
    rendered.getByTestId("failure").textContent,
    "the draft could not be stored",
  );
  assert.equal(rendered.getByTestId("status").textContent, "idle");
  assert.equal(rendered.getByTestId("text").textContent, "edited");
});

test("a save in flight blocks a destructive transition instead of racing it", async () => {
  const pending = deferred();
  const { engine, rendered } = renderEditorCanvas({
    save: () => pending.promise,
  });

  fireEvent.click(rendered.getByRole("button", { name: "Edit draft" }));
  fireEvent.click(rendered.getByRole("button", { name: "Save draft" }));
  assert.equal(rendered.getByTestId("status").textContent, "saving");

  fireEvent.click(rendered.getByRole("button", { name: "Close Draft" }));

  assert.equal(engine.getSnapshot().panels.length, 2);
  assert.equal(rendered.queryByRole("alertdialog"), null);

  await act(async () => {
    pending.resolve();
    await pending.promise;
  });

  await waitFor(() =>
    assert.equal(rendered.getByTestId("status").textContent, "idle"),
  );
  fireEvent.click(rendered.getByRole("button", { name: "Close Draft" }));
  assert.equal(engine.getSnapshot().panels.length, 1);
});

test("a close against a saving Panel is rejected as blocked", async () => {
  const pending = deferred();
  const { engine, rendered } = renderEditorCanvas({
    save: () => pending.promise,
  });

  fireEvent.click(rendered.getByRole("button", { name: "Edit draft" }));
  fireEvent.click(rendered.getByRole("button", { name: "Save draft" }));

  const target = engine.getSnapshot().panels[1].instanceRef;
  const outcome = engine.close({ target });
  assert.deepEqual(
    { reason: outcome.reason, status: outcome.status },
    { reason: "transition-blocked", status: "rejected" },
  );

  await act(async () => {
    pending.resolve();
    await pending.promise;
  });
});

// The coordinator only consults a guard on a Panel registered as dirty, so a
// clean editor writing its record would be torn down mid-write unless the
// extension keeps it registered for the length of the write. Editing first
// would make the draft dirty and prove nothing.
test("an unedited Panel writing its record is still guarded", async () => {
  const pending = deferred();
  const { engine, rendered } = renderEditorCanvas({
    save: () => pending.promise,
  });

  fireEvent.click(rendered.getByRole("button", { name: "Save draft" }));
  assert.equal(rendered.getByTestId("text").textContent, "first");
  assert.equal(rendered.getByTestId("status").textContent, "saving");
  assert.equal(
    rendered.getByTestId("dirty").textContent,
    "clean",
    "the draft itself has nothing unsaved in it",
  );
  // One flag does two jobs in the Panel Engine: it decides whether the guard is
  // consulted, and it is what puts a `dirtyLabel` in the header. Keeping the
  // write guarded therefore shows the label for its duration — vary the label
  // on `editor.dirty` if that should read differently while saving.
  assert.ok(rendered.getByText("Unsaved"));

  const target = engine.getSnapshot().panels[1].instanceRef;
  const outcome = engine.close({ target });
  assert.deepEqual(
    { reason: outcome.reason, status: outcome.status },
    { reason: "transition-blocked", status: "rejected" },
  );
  assert.equal(engine.getSnapshot().panels.length, 2);

  await act(async () => {
    pending.resolve();
    await pending.promise;
  });

  assert.equal(engine.close({ target }).status, "closed");
});

test("a reloading Panel with unsaved work can still be left", async () => {
  const pending = deferred();
  const { engine, rendered } = renderEditorCanvas({
    reload: () => pending.promise,
  });

  fireEvent.click(rendered.getByRole("button", { name: "Edit draft" }));
  fireEvent.click(
    rendered.getByRole("button", { name: "Reload and lose changes" }),
  );
  assert.equal(rendered.getByTestId("status").textContent, "reloading");

  fireEvent.click(rendered.getByRole("button", { name: "Close Draft" }));
  const dialog = await rendered.findByRole("alertdialog");
  assert.match(
    dialog.textContent,
    new RegExp(editorGuardMessages.unsavedChanges),
  );

  await act(async () => {
    fireEvent.click(rendered.getByRole("button", { name: "Stay" }));
    pending.resolve();
    await pending.promise;
  });

  assert.equal(engine.getSnapshot().panels.length, 2);
});

test("a reload refuses to overwrite unsaved work until it is told to", async () => {
  const { record, rendered } = renderEditorCanvas();

  fireEvent.click(rendered.getByRole("button", { name: "Edit draft" }));
  await act(async () => {
    fireEvent.click(rendered.getByRole("button", { name: "Reload draft" }));
    await record.lastReload;
  });

  assert.deepEqual(await record.lastReload, {
    operation: "reload",
    reason: "unsaved-changes",
    status: "rejected",
  });
  assert.equal(record.reloads, 0);
  assert.equal(rendered.getByTestId("text").textContent, "edited");

  await act(async () => {
    fireEvent.click(
      rendered.getByRole("button", { name: "Reload and lose changes" }),
    );
    await record.lastReload;
  });

  assert.deepEqual(await record.lastReload, {
    operation: "reload",
    status: "completed",
  });
  assert.equal(record.reloads, 1);
  assert.equal(rendered.getByTestId("text").textContent, "reloaded");
});

test("an editor without a reload reports the operation as unsupported", async () => {
  const { record, rendered } = renderEditorCanvas({ reload: false });

  await act(async () => {
    fireEvent.click(rendered.getByRole("button", { name: "Reload draft" }));
    await record.lastReload;
  });

  assert.deepEqual(await record.lastReload, {
    operation: "reload",
    reason: "unsupported",
    status: "rejected",
  });
});

test("a Panel reading its record reports a loading status", () => {
  const { rendered } = renderEditorCanvas({ loading: true });

  assert.equal(rendered.getByTestId("status").textContent, "loading");
  assert.equal(rendered.queryByText("Unsaved"), null);
});

// The republished source runs on every commit, so a double-invoked render must
// settle rather than notify its way around the loop again.
test("a StrictMode Panel settles instead of re-rendering itself", async () => {
  const { engine, record, rendered } = renderEditorCanvas({ strict: true });

  fireEvent.click(rendered.getByRole("button", { name: "Edit draft" }));
  assert.equal(rendered.getByTestId("status").textContent, "idle");

  fireEvent.click(rendered.getByRole("button", { name: "Close Draft" }));
  await rendered.findByRole("alertdialog");
  await act(async () => {
    fireEvent.click(rendered.getByRole("button", { name: "Save" }));
  });

  assert.equal(record.saves, 1);
  assert.equal(engine.getSnapshot().panels.length, 1);
});

test("a loading Panel with nothing to lose still closes freely", () => {
  const { engine, rendered } = renderEditorCanvas({ loading: true });

  fireEvent.click(rendered.getByRole("button", { name: "Close Draft" }));

  assert.equal(engine.getSnapshot().panels.length, 1);
});
