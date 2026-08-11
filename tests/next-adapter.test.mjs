import assert from "node:assert/strict";
import test from "node:test";

import {
  createPanelEngine,
  definePanel,
  defineRootPanel,
  encodeNavigationParameter,
} from "../packages/canvas-panels/dist/core/index.js";
import {
  applyCanvasNavigationParameter,
  canvasNavigationParameterName,
  readCanvasNavigationState,
} from "../packages/canvas-panels/dist/next/server.js";

const sectionCodec = {
  encode: ({ id }) => ({ id }),
  validate: (value) =>
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string",
  decode: (value) => ({ id: value.id }),
  migrations: [],
};

function createSectionEngine() {
  const root = defineRootPanel({ kind: "classes", title: "Classes" });
  const section = definePanel({
    kind: "section",
    title: ({ id }) => id,
    persistence: { mode: "navigation", version: 1, codec: sectionCodec },
  });
  return {
    section,
    engine: createPanelEngine({ root, panels: [section] }),
  };
}

test("the adapter claims the versioned canvas query parameter", () => {
  assert.equal(canvasNavigationParameterName, "canvas");
});

test("an absent navigation parameter reports absent rather than rejected", () => {
  for (const search of [
    new URLSearchParams(),
    new URLSearchParams("tab=overview"),
    {},
    { tab: "overview" },
    { canvas: undefined },
  ]) {
    assert.deepEqual(readCanvasNavigationState(search), { status: "absent" });
  }
});

test("a server-rendered request decodes the full contextual stack", () => {
  const { engine, section } = createSectionEngine();
  engine.open({
    originId: engine.getSnapshot().activePanelId,
    panel: section.reference({ id: "section-a" }),
  });
  const parameter = encodeNavigationParameter(
    engine.encodeNavigationDocument(),
  );

  const fromUrlSearchParams = readCanvasNavigationState(
    new URLSearchParams({ canvas: parameter, tab: "overview" }),
  );
  const fromPageProps = readCanvasNavigationState({
    canvas: parameter,
    tab: "overview",
  });

  assert.equal(fromUrlSearchParams.status, "decoded");
  assert.deepEqual(fromUrlSearchParams, fromPageProps);
  assert.equal(
    engine.decodeNavigationDocument(fromUrlSearchParams.document).status,
    "decoded",
  );
});

test("a malformed navigation parameter is rejected with a typed diagnostic", () => {
  const outcome = readCanvasNavigationState({ canvas: "v9.abcd" });

  assert.equal(outcome.status, "rejected");
  assert.deepEqual(outcome.diagnostic, {
    code: "unsupported-parameter-version",
    path: "$",
  });
});

test("a repeated navigation parameter is rejected rather than silently resolved", () => {
  const search = new URLSearchParams();
  search.append("canvas", "v1.eyJwYW5lbHMiOltdfQ");
  search.append("canvas", "v1.eyJwYW5lbHMiOltdfQ");

  for (const candidate of [search, { canvas: ["v1.a", "v1.b"] }]) {
    const outcome = readCanvasNavigationState(candidate);
    assert.equal(outcome.status, "rejected");
    assert.deepEqual(outcome.diagnostic, {
      code: "repeated-parameter",
      path: "$.canvas",
    });
  }
});

test("writing the navigation parameter preserves unrelated query parameters", () => {
  const applied = applyCanvasNavigationParameter(
    new URLSearchParams("tab=overview&sort=name"),
    '{"panels":[],"version":1}',
  );

  assert.equal(applied.get("tab"), "overview");
  assert.equal(applied.get("sort"), "name");
  assert.match(applied.get("canvas"), /^v1\./);
});

test("writing a null Navigation Document removes only the canvas parameter", () => {
  const applied = applyCanvasNavigationParameter(
    new URLSearchParams("tab=overview&canvas=v1.eyJwYW5lbHMiOltdfQ"),
    null,
  );

  assert.equal(applied.has("canvas"), false);
  assert.equal(applied.get("tab"), "overview");
  assert.equal(applied.toString(), "tab=overview");
});

test("writing the navigation parameter does not mutate the caller's search params", () => {
  const original = new URLSearchParams("tab=overview");
  const applied = applyCanvasNavigationParameter(
    original,
    '{"panels":[],"version":1}',
  );

  assert.equal(original.has("canvas"), false);
  assert.notEqual(applied, original);
});

test("a host application may claim a different navigation parameter name", () => {
  const applied = applyCanvasNavigationParameter(
    new URLSearchParams("tab=overview"),
    '{"panels":[],"version":1}',
    { parameterName: "workspace" },
  );

  assert.equal(applied.has("canvas"), false);
  assert.match(applied.get("workspace"), /^v1\./);
  assert.equal(
    readCanvasNavigationState(applied, { parameterName: "workspace" }).status,
    "decoded",
  );
});

test("the server entry point carries no client-only module directive", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) =>
    readFile(
      new URL("../packages/canvas-panels/dist/next/server.js", import.meta.url),
      "utf8",
    ),
  );

  assert.doesNotMatch(source, /^(?:"use client"|'use client');/);
  assert.doesNotMatch(source, /\bfrom "react"|\bfrom "next\/navigation"/);
});
