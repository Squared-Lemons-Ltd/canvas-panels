import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  distributionSubpaths,
  extensionsReachedFromBaseEntryPoints,
  reachableModules,
} from "../scripts/module-graph.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const distribution = join(root, "packages/canvas-panels/dist");

async function readJson(path) {
  return JSON.parse(await readFile(join(root, path), "utf8"));
}

test("the private workspace declares the package and both clean-consumer fixtures", async () => {
  const workspaceRoot = await readJson("package.json");
  const workspace = await readFile(join(root, "pnpm-workspace.yaml"), "utf8");
  const canvasPackage = await readJson("packages/canvas-panels/package.json");
  const reactFixture = await readJson("apps/react-fixture/package.json");
  const nextFixture = await readJson("apps/next-fixture/package.json");

  assert.equal(workspaceRoot.private, true);
  assert.match(workspaceRoot.packageManager, /^pnpm@/);
  assert.match(workspace, /packages\/\*/);
  assert.match(workspace, /apps\/\*/);
  assert.equal(canvasPackage.name, "@squaredlemons/canvas-panels");
  assert.equal(canvasPackage.private, true);
  assert.equal(
    reactFixture.dependencies["@squaredlemons/canvas-panels"],
    "workspace:*",
  );
  assert.equal(
    nextFixture.dependencies["@squaredlemons/canvas-panels"],
    "workspace:*",
  );
});

test("the package exposes only the approved ESM entry points and compiled stylesheet", async () => {
  const canvasPackage = await readJson("packages/canvas-panels/package.json");
  const expectedJavaScriptExports = [
    "./core",
    "./react",
    "./ui",
    "./next",
    "./next/server",
    "./extensions/editor",
    "./extensions/resources",
    "./overlay",
    "./testing",
  ];

  assert.equal(canvasPackage.type, "module");
  assert.equal(canvasPackage.private, true);
  assert.equal(canvasPackage.publishConfig.access, "restricted");
  assert.equal(canvasPackage.publishConfig.provenance, false);
  assert.ok(canvasPackage.exports, "package exports must be declared");
  assert.equal(canvasPackage.exports["."], undefined);
  assert.deepEqual(
    Object.keys(canvasPackage.exports).sort(),
    [...expectedJavaScriptExports, "./styles.css"].sort(),
  );

  for (const subpath of expectedJavaScriptExports) {
    assert.match(canvasPackage.exports[subpath].types, /^\.\/dist\/.+\.d\.ts$/);
    assert.match(canvasPackage.exports[subpath].import, /^\.\/dist\/.+\.js$/);
  }

  assert.equal(canvasPackage.exports["./styles.css"], "./dist/styles.css");
  assert.deepEqual(canvasPackage.sideEffects, ["./dist/styles.css"]);
  assert.deepEqual(canvasPackage.files, ["dist", "README.md"]);
  assert.equal(canvasPackage.peerDependencies.react, ">=19 <20");
  assert.equal(canvasPackage.peerDependencies["react-dom"], ">=19 <20");
  assert.equal(canvasPackage.peerDependencies.next, ">=15 <17");
  assert.equal(canvasPackage.peerDependenciesMeta.next.optional, true);
});

test("built client entry points retain use-client while server-safe entries stay server-safe", async () => {
  const clientEntries = [
    "dist/react/index.js",
    "dist/ui/index.js",
    "dist/next/index.js",
    "dist/extensions/editor.js",
    "dist/overlay/index.js",
  ];
  const serverEntries = [
    "dist/core/index.js",
    "dist/next/server.js",
    "dist/extensions/resources.js",
    "dist/testing/index.js",
  ];

  for (const entry of clientEntries) {
    const source = await readFile(
      join(root, "packages/canvas-panels", entry),
      "utf8",
    );
    assert.match(source, /^(?:"use client"|'use client');/);
  }

  for (const entry of serverEntries) {
    const source = await readFile(
      join(root, "packages/canvas-panels", entry),
      "utf8",
    );
    assert.doesNotMatch(source, /^(?:"use client"|'use client');/);
  }
});

test("the module graph walker follows the package's own imports", async () => {
  // The isolation checks below assert an absence, so they would pass just as
  // happily against a walker that had stopped seeing imports at all. This is
  // the positive control that keeps them honest.
  const { external, modules } = await reachableModules(
    join(distribution, "ui/index.js"),
  );

  assert.deepEqual(distributionSubpaths(modules, distribution), [
    "core/index.js",
    "react/index.js",
    "ui/index.js",
    "ui/interaction.js",
  ]);
  assert.deepEqual([...external].sort(), ["react"]);
});

test("no base entry point reaches an optional extension", async () => {
  const reached = await extensionsReachedFromBaseEntryPoints(distribution);

  assert.ok(reached.size > 0, "base entry points must be checked");
  for (const [entry, extensions] of reached) {
    assert.deepEqual(
      extensions,
      [],
      `${entry} must not initialize or bundle an extension`,
    );
  }
});

test("the editor extension costs an importer nothing but React", async () => {
  const { external, modules } = await reachableModules(
    join(distribution, "extensions/editor.js"),
  );

  // The extension speaks the Panel Engine's contracts through types alone, so
  // importing it pulls in no Canvas module at all — and importing the Canvas
  // can never pull in the extension.
  assert.deepEqual(distributionSubpaths(modules, distribution), [
    "extensions/editor.js",
  ]);
  assert.deepEqual([...external].sort(), ["react"]);
});

test("workspace fixtures build as applications through package subpaths only", async () => {
  const reactFixture = await readJson("apps/react-fixture/package.json");
  const nextFixture = await readJson("apps/next-fixture/package.json");
  const fixtureSources = await Promise.all([
    readFile(join(root, "apps/react-fixture/src/main.tsx"), "utf8"),
    readFile(join(root, "apps/next-fixture/app/page.tsx"), "utf8"),
    readFile(join(root, "apps/next-fixture/app/client-probe.tsx"), "utf8"),
  ]);

  assert.ok(reactFixture.scripts.build);
  assert.ok(reactFixture.scripts.typecheck);
  assert.ok(nextFixture.scripts.build);
  assert.ok(nextFixture.scripts.typecheck);
  assert.ok(
    fixtureSources.some((source) =>
      source.includes("@squaredlemons/canvas-panels/core"),
    ),
  );
  assert.ok(
    fixtureSources.some((source) =>
      source.includes("@squaredlemons/canvas-panels/react"),
    ),
  );

  for (const source of fixtureSources) {
    assert.doesNotMatch(
      source,
      /packages\/canvas-panels\/src|\.\.\/\.\.\/packages/,
    );
  }
});

test("the Next fixture proves deep links across the server and client boundary", async () => {
  const [page, canvas, panels] = await Promise.all([
    readFile(join(root, "apps/next-fixture/app/canvas/page.tsx"), "utf8"),
    readFile(
      join(root, "apps/next-fixture/app/canvas/classes-canvas.tsx"),
      "utf8",
    ),
    readFile(join(root, "apps/next-fixture/app/canvas/panels.ts"), "utf8"),
  ]);

  // The route entry stays a Server Component that decodes navigation state.
  assert.doesNotMatch(page, /^(?:"use client"|'use client');/);
  assert.match(page, /@squaredlemons\/canvas-panels\/next\/server/);
  assert.match(page, /readCanvasNavigationState/);
  assert.doesNotMatch(page, /@squaredlemons\/canvas-panels\/(?:ui|react)\b/);

  // The client half seeds before first render and then owns URL synchronization.
  assert.match(canvas, /^(?:"use client"|'use client');/);
  assert.match(canvas, /@squaredlemons\/canvas-panels\/next"/);
  assert.match(canvas, /seedCanvasNavigation/);
  assert.match(canvas, /useCanvasNavigationSync/);
  assert.match(canvas, /from "next\/navigation"/);

  // Persistent Panel Kinds are required for a deep link to reconstruct at all.
  assert.match(panels, /mode: "navigation"/);

  for (const source of [page, canvas, panels]) {
    assert.doesNotMatch(
      source,
      /packages\/canvas-panels\/src|\.\.\/\.\.\/packages/,
    );
  }
});

test("continuous integration runs every delivery-path gate on Node 22 and 24", async () => {
  const workflow = await readFile(
    join(root, ".github/workflows/ci.yml"),
    "utf8",
  );

  assert.match(workflow, /node-version:\s*\[22, 24\]/);
  assert.match(workflow, /pnpm install --frozen-lockfile/);
  for (const command of [
    "pnpm format:check",
    "pnpm lint",
    "pnpm typecheck",
    "pnpm test",
    "pnpm build",
    "pnpm pack:check",
  ]) {
    assert.ok(workflow.includes(command), `CI must run ${command}`);
  }
  assert.doesNotMatch(workflow, /npm publish|pnpm publish/);
});
