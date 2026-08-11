import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  collectFiles,
  distributionSubpaths,
  optionalSubpathsReachedFromBaseEntryPoints,
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
    "dist/extensions/resources.js",
    "dist/overlay/index.js",
  ];
  const serverEntries = [
    "dist/core/index.js",
    "dist/next/server.js",
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

test("no base entry point reaches an optional subpath", async () => {
  const reached =
    await optionalSubpathsReachedFromBaseEntryPoints(distribution);

  assert.ok(reached.size > 0, "base entry points must be checked");
  for (const [entry, optional] of reached) {
    assert.deepEqual(
      optional,
      [],
      `${entry} must not initialize or bundle an optional subpath`,
    );
  }
});

test("the overlay costs an importer the Panel Engine and nothing else", async () => {
  const { external, modules } = await reachableModules(
    join(distribution, "overlay/index.js"),
  );

  // The overlay speaks the Bound Canvas Module's shape structurally, so an
  // application that opts into a global layer does not thereby drag the whole
  // `ui` entry point into a bundle that had not already asked for it.
  assert.deepEqual(distributionSubpaths(modules, distribution), [
    "core/index.js",
    "overlay/index.js",
    "overlay/routing.js",
  ]);
  assert.deepEqual([...external].sort(), ["react"]);
});

test("overlay definitions and factories exist only on the overlay subpath", async () => {
  const overlayExports = [
    "createOverlayWorkspace",
    "defineOverlayWorkspace",
    "overlayNavigationParameterPrefix",
    "overlayPresentation",
    "resolveOverlayEscape",
  ];
  const [overlay, ...base] = await Promise.all(
    ["overlay/index.js", "core/index.js", "react/index.js", "ui/index.js"].map(
      (entry) => import(pathToFileURL(join(distribution, entry)).href),
    ),
  );

  for (const name of overlayExports) {
    assert.ok(name in overlay, `the overlay subpath must export ${name}`);
  }
  for (const module of base) {
    for (const name of overlayExports) {
      assert.equal(
        name in module,
        false,
        `${name} must not be reachable without naming the overlay subpath`,
      );
    }
  }
});

test("the testing tools cost an importer the Panel Engine and nothing else", async () => {
  const { external, modules } = await reachableModules(
    join(distribution, "testing/index.js"),
  );

  // The tools speak every other layer's contracts through types alone, so the
  // testing subpath stays server-safe and never drags React — or the Canvas —
  // into a bundle. Only the Declared Breakpoints are needed at runtime.
  assert.deepEqual(distributionSubpaths(modules, distribution), [
    "core/index.js",
    "testing/index.js",
  ]);
  assert.deepEqual([...external].sort(), []);
});

test("the testing tools export a fake or builder for every published seam", async () => {
  const testing = await import(
    pathToFileURL(join(distribution, "testing/index.js")).href
  );

  // Criterion 1's list, as an assertion: deterministic identity and time, and a
  // fake or builder for guards, restoration, history, focus, responsiveness,
  // and the public read models.
  assert.deepEqual(Object.keys(testing).sort(), [
    "allowTransition",
    "blockTransition",
    "buildNavigationDocument",
    "buildPanelReadModel",
    "buildPanelStack",
    "buildPresentation",
    "buildTransitionStatus",
    "confirmTransition",
    "createTestClock",
    "createTestFocusTarget",
    "createTestHistory",
    "createTestIdentities",
    "createTestLifecycle",
    "createTestRestore",
    "createTestViewport",
  ]);
});

test("the testing tools bind to no test runner", async () => {
  const source = await readFile(join(distribution, "testing/index.js"), "utf8");

  // Runner-neutral means exactly this: nothing here can only run under one
  // runner, and nothing registers a global hook on import.
  for (const runner of [
    "node:test",
    "vitest",
    "jest",
    "@jest/globals",
    "mocha",
    "@testing-library",
  ]) {
    assert.doesNotMatch(
      source,
      new RegExp(`["']${runner.replace(/[/@]/g, "\\$&")}`),
      `the testing subpath must not import ${runner}`,
    );
  }
  for (const global of ["afterEach(", "beforeEach(", "describe(", "expect("]) {
    assert.ok(
      !source.includes(global),
      `the testing subpath must not call ${global}`,
    );
  }
});

test("the declared breakpoint queries are one value, not a copy per entry point", async () => {
  const [core, ui] = await Promise.all(
    ["core/index.js", "ui/index.js"].map(
      (entry) => import(pathToFileURL(join(distribution, entry)).href),
    ),
  );

  // The Canvas re-exports what core declares. Two copies could disagree, and
  // the testing viewport answers against whichever it was given.
  assert.equal(ui.canvasBreakpointQueries, core.canvasBreakpointQueries);
  assert.deepEqual(
    core.canvasBreakpointQueries.map(([breakpoint]) => breakpoint),
    ["mobile", "tablet", "desktop"],
  );
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

test("the resource extension costs an importer nothing but React", async () => {
  const { external, modules } = await reachableModules(
    join(distribution, "extensions/resources.js"),
  );

  // Resource Keys are opaque, so the extension needs no Panel Engine contract
  // at all: it reaches no Canvas module, and no Canvas module reaches it.
  assert.deepEqual(distributionSubpaths(modules, distribution), [
    "extensions/resources.js",
  ]);
  assert.deepEqual([...external].sort(), ["react"]);
});

test("neither optional extension can reach the other", async () => {
  for (const entry of ["extensions/editor.js", "extensions/resources.js"]) {
    const { modules } = await reachableModules(join(distribution, entry));

    assert.deepEqual(
      distributionSubpaths(modules, distribution).filter(
        (subpath) => subpath.startsWith("extensions/") && subpath !== entry,
      ),
      [],
      `${entry} must not drag in another extension`,
    );
  }
});

test("the distribution is ESM ES2022 throughout, with no global polyfills", async () => {
  const files = await collectFiles(distribution, (name) =>
    name.endsWith(".js"),
  );
  assert.ok(files.length > 0, "the distribution must be built");

  for (const file of files) {
    const source = await readFile(file, "utf8");
    const name = relative(distribution, file);

    // CommonJS in an ESM package is a resolution failure waiting to happen.
    assert.doesNotMatch(source, /\brequire\s*\(/, `${name} uses require()`);
    assert.doesNotMatch(source, /\bmodule\.exports\b/, `${name} uses CommonJS`);
    assert.doesNotMatch(source, /\bexports\.\w/, `${name} uses CommonJS`);

    // Down-levelling below ES2022 is what introduces these helpers, and a
    // polyfill would mutate a global the host owns.
    for (const helper of [
      "__awaiter",
      "__generator",
      "__extends",
      "__assign",
      "regeneratorRuntime",
      "core-js",
    ]) {
      assert.ok(!source.includes(helper), `${name} ships the ${helper} shim`);
    }
    assert.doesNotMatch(
      source,
      /globalThis\.\w+\s*=|window\.\w+\s*=\s*window\.\w+\s*\|\|/,
      `${name} assigns to a global`,
    );
  }
});

test("the package exposes no broad barrel and no wildcard subpath", async () => {
  const canvasPackage = await readJson("packages/canvas-panels/package.json");

  // A root barrel or a wildcard would make every internal module public and
  // undo the isolation the optional subpaths exist for.
  assert.equal(canvasPackage.exports["."], undefined);
  for (const subpath of Object.keys(canvasPackage.exports)) {
    assert.ok(
      !subpath.includes("*"),
      `${subpath} exposes the distribution by wildcard`,
    );
  }

  // Nor may an entry point re-export another entry point wholesale: that is the
  // same barrel by another name.
  const entryPoints = Object.values(canvasPackage.exports)
    .filter((target) => typeof target !== "string")
    .map((target) => target.import.replace(/^\.\/dist\//, ""));
  assert.equal(entryPoints.length, 9, "every entry point must be scanned");
  for (const entry of entryPoints) {
    const source = await readFile(join(distribution, entry), "utf8");
    assert.doesNotMatch(
      source,
      /export\s+\*\s+from/,
      `${entry} re-exports a whole module`,
    );
  }
});

test("the package declares no runtime dependency, so a consumer installs one React", async () => {
  const canvasPackage = await readJson("packages/canvas-panels/package.json");

  // React arrives only as a peer. A dependency or a bundled copy is how a
  // second React reaches a consumer's tree and breaks hooks.
  assert.equal(canvasPackage.dependencies, undefined);
  assert.equal(canvasPackage.bundledDependencies, undefined);
  assert.equal(canvasPackage.bundleDependencies, undefined);
  assert.equal(canvasPackage.optionalDependencies, undefined);
  assert.deepEqual(Object.keys(canvasPackage.peerDependencies).sort(), [
    "next",
    "react",
    "react-dom",
  ]);

  // Install scripts are the other thing a consumer cannot audit before running.
  for (const hook of ["preinstall", "install", "postinstall", "prepare"]) {
    assert.equal(canvasPackage.scripts[hook], undefined);
  }
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
