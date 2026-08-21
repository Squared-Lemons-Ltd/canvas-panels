import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
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

/**
 * Every workspace member's package name, read off disk. Listing them by hand
 * is what lets an app be added, or removed, without the thing that is supposed
 * to account for all of them noticing.
 */
async function workspacePackageNames() {
  const names = [];
  for (const directory of ["apps", "packages"]) {
    const entries = await readdir(join(root, directory), {
      withFileTypes: true,
    });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      names.push(
        (await readJson(join(directory, entry.name, "package.json"))).name,
      );
    }
  }
  return names;
}

// Read before a single `test()` is registered. A top-level `await` suspends
// module evaluation and the runner may start already-registered tests while it
// waits, so a binding declared further down — beside the tests that use it,
// which is where it wants to live — is still in its temporal dead zone when an
// earlier test reaches for it. Nothing above currently reads these, so this is
// the latent form of the failure that `canvas-accessibility.test.mjs` hit for
// real: one Node version, one run in several, from a file that had not changed.
// `styleRules` is a function declaration and hoists, so calling it here is safe.
const stylesheet = await readFile(join(distribution, "styles.css"), "utf8");
const stylesheetRules = styleRules(stylesheet);

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
  // The workspace stays private; the package does not. `private: true` is what
  // npm refuses to publish, so the one package that is meant to be published
  // must not carry it — and every other workspace member must.
  assert.equal(canvasPackage.private, undefined);
  assert.equal(reactFixture.private, true);
  assert.equal(nextFixture.private, true);
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
  assert.equal(canvasPackage.publishConfig.access, "public");
  // Nothing pins provenance off any more: trusted publishing generates an
  // attestation on its own, and a `provenance: false` left behind here would
  // silently suppress it.
  assert.equal(canvasPackage.publishConfig.provenance, undefined);
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
  assert.deepEqual(canvasPackage.files, ["dist", "README.md", "LICENSE"]);
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

const token = /--canvas-[a-z0-9-]+/.source;

/**
 * The built stylesheet as flat rules: the selector each declaration block was
 * written under, its declarations, and the at-rules it was nested inside.
 *
 * A regex over the whole file cannot answer *where* a declaration sits, and
 * where is the entire question here — the same `--canvas-radius: 0.75rem` is a
 * working default on `:root` and a broken one on the Workspace. Comments and
 * strings are consumed by the same pass rather than stripped beforehand, so a
 * brace inside either cannot open or close a block that is not there.
 */
function styleRules(css) {
  const rules = [];
  const nesting = [];
  let buffer = "";
  let quote = null;
  let commented = false;
  let previous = "";

  for (const character of css) {
    const last = previous;
    previous = character;

    if (commented) {
      commented = !(last === "*" && character === "/");
      continue;
    }
    if (quote !== null) {
      if (character === quote && last !== "\\") quote = null;
      buffer += character;
      continue;
    }
    if (last === "/" && character === "*") {
      commented = true;
      buffer = buffer.slice(0, -1);
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      buffer += character;
      continue;
    }
    if (character === "{") {
      // Anything before the last `;` belongs to the block being descended from,
      // not to the prelude — a rule may declare and then nest.
      const boundary = buffer.lastIndexOf(";");
      const enclosing = nesting.at(-1);
      if (enclosing) enclosing.declarations += buffer.slice(0, boundary + 1);
      nesting.push({
        declarations: "",
        prelude: buffer
          .slice(boundary + 1)
          .trim()
          .replace(/\s+/g, " "),
      });
      buffer = "";
      continue;
    }
    if (character === "}") {
      const closed = nesting.pop();
      if (closed !== undefined) {
        closed.declarations += buffer;
        if (!closed.prelude.startsWith("@")) {
          rules.push({
            at: nesting.map(({ prelude }) => prelude),
            declarations: closed.declarations,
            selector: closed.prelude,
          });
        }
      }
      buffer = "";
      continue;
    }
    buffer += character;
  }

  return rules;
}

test("the stylesheet scanner reads the rules it is about to assert an absence in", () => {
  // The two tests below both assert that something is *not* in the stylesheet,
  // and a scanner that had quietly stopped seeing rules would satisfy them
  // perfectly. This is the positive control that keeps them honest.
  const body = stylesheetRules.find(
    ({ selector }) => selector === "[data-canvas-panel-body]",
  );
  const narrow = stylesheetRules.filter(({ at }) => at.length > 1);

  assert.ok(body, "the scanner must find an ordinary Panel rule");
  assert.match(body.declarations, /padding:\s*var\(--canvas-body-padding\);/);
  assert.deepEqual(body.at, ["@layer canvas-panels"]);
  assert.ok(narrow.length > 0, "the scanner must descend into media queries");
  assert.ok(
    stylesheetRules.some(({ declarations }) => declarations.includes('"/"')),
    "the scanner must keep a quoted brace-free string intact",
  );
});

test("the --canvas-* defaults are inherited, so an ancestor can theme the Canvas", () => {
  const declaring = stylesheetRules.filter(({ declarations }) =>
    new RegExp(`${token}\\s*:`).test(declarations),
  );
  // Read from the parsed rules rather than the file: the prose in this
  // stylesheet's comments names these tokens, and a scan of the raw text counts
  // a sentence about `--canvas-radius` as a second declaration of it.
  const css = stylesheetRules.map(({ declarations }) => declarations).join("");
  const declarations = [
    ...css.matchAll(new RegExp(`(${token})\\s*:`, "g")),
  ].map(([, name]) => name);
  const declared = new Set(declarations);
  const referenced = new Set(
    [...css.matchAll(new RegExp(`var\\(\\s*(${token})`, "g"))].map(
      ([, name]) => name,
    ),
  );

  assert.ok(declaring.length > 0, "the stylesheet must declare the tokens");
  assert.ok(referenced.size > 0, "the stylesheet must read the tokens");

  // Case 1 — no override. Every token the stylesheet reads resolves without
  // one: either it has an inherited default, or it derives from a token that
  // has, so a Canvas nobody has themed still paints.
  const derived = new Set(
    [
      ...css.matchAll(
        new RegExp(`var\\(\\s*(${token})\\s*,\\s*var\\(\\s*(${token})`, "g"),
      ),
    ]
      .filter(([, , source]) => declared.has(source))
      .map(([, name]) => name),
  );
  for (const name of referenced) {
    assert.ok(
      declared.has(name) || derived.has(name),
      `${name} is read but never given a default`,
    );
  }
  // Exactly one default each, and no literal copy of one: a second declaration
  // or a value repeated into a `var()` fallback is a default that can drift from
  // the documented one unnoticed.
  assert.deepEqual(
    declarations,
    [...declared],
    "a token must be declared exactly once",
  );
  assert.doesNotMatch(
    css,
    // The `\s*` lives inside the lookahead: outside it the engine backtracks to
    // zero whitespace and the assertion passes on the very thing it forbids.
    new RegExp(`var\\(\\s*${token}\\s*,(?!\\s*var\\()`),
    "a token default belongs on :root, not in a var() fallback",
  );
  // A default may not derive from another token either. A `var()` inside a
  // custom property is substituted where that property is declared, so a
  // derivation written on `:root` resolves against the package's own value and
  // hands every descendant the answer: an application that overrides the token
  // it derives from — at any level, including on the Workspace element, where
  // this used to work — would see nothing change. Derivations belong at the
  // point of use, as `var(--canvas-action-text, var(--canvas-text-muted))`,
  // where they resolve against what that element inherited.
  for (const [, name, value] of css.matchAll(
    new RegExp(`(${token})\\s*:\\s*([^;]+);`, "g"),
  )) {
    assert.doesNotMatch(
      value,
      new RegExp(`var\\(\\s*${token}`),
      `${name} derives from another token where it is declared, so it stops tracking it`,
    );
  }

  // Cases 2 and 3 — an override on an ancestor, and one on the Workspace
  // element itself. Both are declarations on an element, and a declared value
  // always beats a value inherited into it, whatever layer or specificity the
  // declaration it was inherited from had. So both win if and only if the
  // package declares its defaults somewhere the Workspace *inherits* them
  // from — which is `:root` and nothing else. Declaring them on
  // `[data-canvas-workspace]`, where they used to live, made case 2 impossible:
  // the Workspace's own declaration outranked every ancestor override the
  // README documents.
  assert.deepEqual(
    [...new Set(declaring.map(({ selector }) => selector))],
    [":root"],
    "a --canvas-* default outside :root cannot be overridden from an ancestor",
  );
  for (const rule of declaring) {
    // Inside the layer, so an application's own `:root` override — unlayered,
    // or in a layer sorted after `canvas-panels` — still wins.
    assert.deepEqual(rule.at, ["@layer canvas-panels"]);
  }
});

test("a Panel contains what it holds, and the Canvas scrolls on one axis", () => {
  const own = (selector) =>
    stylesheetRules.find(
      (rule) => rule.selector === selector && rule.at.length === 1,
    );
  const application = own("[data-canvas-application]");
  const body = own("[data-canvas-panel-body]");
  const header = own("[data-canvas-panel-header]");

  assert.ok(application && body && header, "the Canvas chrome must be styled");

  // An absolutely positioned descendant is laid out against the nearest
  // positioned ancestor. Without these that is the Panel, so a body's own
  // scroll never clips what it holds while its height still counts toward that
  // scroll box — and Tailwind's `sr-only` is `position: absolute`, which put
  // 323px of overflow into one measured Canvas.
  assert.match(body.declarations, /position:\s*relative;/);
  assert.match(header.declarations, /position:\s*relative;/);

  // Both axes, stated. CSS computes a `visible` axis to `auto` whenever the
  // other one is not `visible`, so `overflow-x: auto` alone made the whole
  // Canvas vertically scrollable and scrolling it carried the Panel headers off
  // the top of the frame. Vertical scrolling belongs to each Panel body.
  assert.match(application.declarations, /overflow-x:\s*auto;/);
  assert.match(application.declarations, /overflow-y:\s*hidden;/);
  assert.match(body.declarations, /overflow-y:\s*auto;/);
});

test("every surface the package paints answers to a --canvas-* token", () => {
  const paint = /(?:^|[\s;])background(?:-color)?:\s*([^;]+);/;
  // `at.length === 1` is the layer and nothing else, which deliberately leaves
  // out the one block that must paint system colours directly: forced-colours
  // modes replace every author colour, and a token resolving to a `color-mix()`
  // there is exactly what has to be overridden. Those rules are asserted by
  // name in canvas-accessibility.test.mjs instead.
  const painted = stylesheetRules.filter(
    ({ at, declarations }) => at.length === 1 && paint.test(declarations),
  );
  const forced = stylesheetRules.filter(({ at }) =>
    at.some((rule) => rule.includes("forced-colors")),
  );

  assert.ok(painted.length > 0, "the scanner must find painted surfaces");
  assert.ok(forced.length > 0, "the excluded block must still be there");
  for (const rule of painted) {
    const [, value] = rule.declarations.match(paint);
    assert.match(
      value,
      // Or paints nothing at all: a non-modal overlay covers no page and is
      // deliberately transparent.
      /var\(--canvas-|^\s*none\s*$/,
      `${rule.selector} paints outside the token seam`,
    );
  }

  // The two surfaces the package paints *above* the Canvas rather than in it.
  // Both used to be the literal system `Canvas` with no token to redirect, so
  // an application that had themed everything else had to reach past the
  // documented seam and on to the attributes to brand the one dialog its users
  // are asked to make a decision in.
  for (const selector of [
    "[data-canvas-transition-dialog]",
    "[data-canvas-overlay] > [data-canvas-workspace]",
  ]) {
    const rule = painted.find((candidate) => candidate.selector === selector);
    assert.ok(rule, `${selector} must be painted`);
    assert.match(
      rule.declarations,
      /background:\s*var\(--canvas-surface-raised\)/,
    );
  }
});

test("every --canvas-* token the stylesheet knows is named in the contract", async () => {
  const readme = await readFile(
    join(root, "packages/canvas-panels/README.md"),
    "utf8",
  );
  const css = stylesheetRules.map(({ declarations }) => declarations).join("");
  // Declared *or* read: the three derived properties have no default of their
  // own and appear only inside a `var()`, and they are the ones an application
  // is most likely to reach for.
  const tokens = new Set([
    ...[...css.matchAll(/(--canvas-[a-z-]+)\s*:/g)].map(([, name]) => name),
    ...[...css.matchAll(/var\(\s*(--canvas-[a-z-]+)/g)].map(([, name]) => name),
  ]);

  assert.ok(tokens.size > 20, "the scanner must find the tokens");
  for (const token of [...tokens].sort()) {
    // A token a consumer can set but cannot find is one they will set anyway,
    // from reading the stylesheet, and one the package can then rename without
    // noticing it broke someone. Presentation is the documented seam; this is
    // what keeps the documentation of it complete.
    assert.ok(
      readme.includes(`\`${token}\``),
      `${token} is part of the theming seam but missing from the README`,
    );
  }

  // And the defaults it publishes are the defaults it has. A documented default
  // that has drifted from the stylesheet is worse than none: it is the value a
  // consumer reasons about when deciding whether they need an override at all.
  // Biome wraps a long value across lines, which is a change to the stylesheet
  // and not to the value, so the comparison is made on the value itself: one
  // space between tokens, and none just inside a bracket.
  const flatten = (value) =>
    value
      .replace(/\s+/g, " ")
      .replace(/\(\s+/g, "(")
      .replace(/\s+\)/g, ")")
      .trim();
  const documented = flatten(readme);
  for (const [, token, value] of css.matchAll(
    /(--canvas-[a-z-]+)\s*:\s*([^;]+);/g,
  )) {
    assert.ok(
      documented.includes(`\`${flatten(value)}\``),
      `${token} defaults to ${flatten(value)}, which the README does not say`,
    );
  }
});

test("every integration attribute the package emits is named in the contract", async () => {
  const readme = await readFile(
    join(root, "packages/canvas-panels/README.md"),
    "utf8",
  );
  const sources = await Promise.all(
    (await collectFiles(distribution))
      .filter((file) => file.endsWith(".js"))
      .map((file) => readFile(file, "utf8")),
  );
  const emitted = new Set(
    [...sources, stylesheet].flatMap((source) =>
      [...source.matchAll(/["[](data-[a-z-]+)["\]]/g)].map(([, name]) => name),
    ),
  );

  assert.ok(emitted.size > 20, "the scanner must find the Canvas attributes");
  for (const attribute of [...emitted].sort()) {
    // A styling or integration hook a consumer can see in the DOM but cannot
    // find in the README is one they will use anyway and one the package can
    // then break without noticing. The table is the freeze; this is what keeps
    // it complete. `data-testid` is the single documented exception, named in
    // the README as outside the contract.
    if (attribute === "data-testid") continue;
    assert.ok(
      readme.includes(`\`${attribute}\``),
      `${attribute} is emitted but missing from the README's attribute table`,
    );
  }
  assert.match(
    readme,
    /`data-testid`[^\n]*not[^\n]*part of the Public Contract/,
  );
});

test("the README states how deep a Context Signal is compared", async () => {
  const readme = await readFile(
    join(root, "packages/canvas-panels/README.md"),
    "utf8",
  );

  // "compared structurally" is itself a promise a consumer plans around: it
  // decides whether they memoise the signal, and how they shape it. So the
  // depth is written down rather than left to be inferred from how a version
  // happens to behave. The behaviour itself is asserted against the built
  // package in tests/react-canvas.test.mjs; this is what keeps the sentence
  // from drifting away from it.
  assert.match(readme, /held and compared one level deep/);
});

test("the README says that focus does not imply Activation, and names the option that changes it", async () => {
  const readme = await readFile(
    join(root, "packages/canvas-panels/README.md"),
    "utf8",
  );

  // The split between the DOM-Focused Panel and the Active Panel is a design
  // decision, and a consumer who has to discover it by debugging a Canvas that
  // will not respond to clicks has been told nothing. Both halves are asserted
  // here: the rule, and the opt-in that reverses it. The behaviour itself is
  // asserted against the built package in tests/react-canvas.test.mjs.
  assert.match(readme, /\*\*Focus does not imply Activation\.\*\*/);
  assert.match(readme, /`activateOnFocus` defaults to `false`/);
  // And the accessibility half, which is the part a host cannot re-derive:
  // activating because focus arrived must not then move that focus.
  assert.match(readme, /never moves focus/);
});

test("the stylesheet is one named cascade layer, and says so where a consumer reads", async () => {
  const readme = await readFile(
    join(root, "packages/canvas-panels/README.md"),
    "utf8",
  );
  const layers = [...stylesheet.matchAll(/@layer\s+([^{;]+)[{;]/g)].map(
    ([, names]) => names.trim(),
  );

  // One layer, named, and nothing outside it. The name is a consumer's only
  // handle on where the package sorts against its own CSS.
  assert.deepEqual(layers, ["canvas-panels"]);
  for (const rule of stylesheetRules) {
    assert.equal(
      rule.at[0],
      "@layer canvas-panels",
      `${rule.selector} escapes the canvas-panels layer`,
    );
  }

  // A layer nobody documents is a layer nobody sorts, and an unsorted layer is
  // ordered by import order — which puts the package either above every
  // application utility or below the reset that then wipes the Canvas. The
  // README has to name it and show where it goes.
  assert.match(readme, /`canvas-panels`/);
  assert.ok(
    readme.includes(
      "@layer theme, base, canvas-panels, components, utilities;",
    ),
    "the README must give the Tailwind v4 layer order",
  );
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

/**
 * The inventory's export lists, read back out of the document: for each
 * `### `@squaredlemons/canvas-panels/<subpath>`` heading, the backticked names
 * in the paragraph under it.
 */
function inventoriedExports(inventory) {
  const sections = inventory.split(/^### /m).slice(1);
  const listed = new Map();
  for (const section of sections) {
    const [heading, ...rest] = section.split("\n");
    const subpath = heading.match(
      /^`@squaredlemons\/canvas-panels\/([^`]+)`$/,
    )?.[1];
    if (subpath === undefined || subpath === "styles.css") continue;
    listed.set(
      subpath,
      [...rest.join("\n").matchAll(/`([A-Za-z][A-Za-z0-9]*)`/g)]
        .map(([, name]) => name)
        .sort(),
    );
  }
  return listed;
}

test("the frozen inventory lists exactly what the package exports", async () => {
  const inventory = await readFile(
    join(root, "docs/delivery/public-contract.md"),
    "utf8",
  );
  const canvasPackage = await readJson("packages/canvas-panels/package.json");
  const listed = inventoriedExports(inventory);
  const subpaths = Object.keys(canvasPackage.exports)
    .map((subpath) => subpath.replace(/^\.\//, ""))
    .filter((subpath) => subpath !== "styles.css");

  // An inventory that has quietly stopped naming a subpath would agree with an
  // empty comparison, so the set of subpaths is checked before their contents.
  assert.deepEqual([...listed.keys()].sort(), [...subpaths].sort());

  for (const subpath of subpaths) {
    const module = await import(
      pathToFileURL(
        join(
          distribution,
          canvasPackage.exports[`./${subpath}`].import.replace(
            /^\.\/dist\//,
            "",
          ),
        ),
      ).href
    );
    // The freeze, as an assertion. An export added, removed, or renamed without
    // an edit to the inventory fails here — which is the point: deciding
    // whether something is a breaking change should not depend on who is asked.
    assert.deepEqual(
      listed.get(subpath),
      Object.keys(module).sort(),
      `the inventory and @squaredlemons/canvas-panels/${subpath} disagree`,
    );
  }
});

test("the frozen inventory lists every result discriminant the types declare", async () => {
  const inventory = await readFile(
    join(root, "docs/delivery/public-contract.md"),
    "utf8",
  );
  const declarations = await Promise.all(
    (await collectFiles(distribution))
      .filter((file) => file.endsWith(".d.ts"))
      .map((file) => readFile(file, "utf8")),
  );
  const declared = (key) =>
    new Set(
      declarations.flatMap((source) =>
        [...source.matchAll(new RegExp(`${key}: "([a-z-]+)"`, "g"))].map(
          ([, member]) => member,
        ),
      ),
    );
  // The paragraph *under* each label, not the label's own line: the sentence
  // introducing a union is free to mention a member without listing it.
  const listedUnder = (label) =>
    new Set(
      [
        ...(
          inventory.match(
            new RegExp(`\\*\\*\`${label}\`\\*\\*[^\\n]*\\n\\n([^\\n]*)`),
          )?.[1] ?? ""
        ).matchAll(/`([a-z-]+)`/g),
      ].map(([, member]) => member),
    );

  for (const key of ["status", "reason"]) {
    const members = declared(key);
    assert.ok(members.size > 5, `the scanner must find the ${key} members`);
    assert.deepEqual(
      [...listedUnder(key)].sort(),
      [...members].sort(),
      `the inventory and the declared \`${key}\` union disagree`,
    );
  }
});

test("the gate runs every test file that exists", async () => {
  const workspaceRoot = await readJson("package.json");

  // `node --test` is given its files by name, because one of them must be left
  // out and the runner has no way to exclude. Naming them is therefore correct
  // and also silent: a test file added to `tests/` and forgotten here runs
  // nowhere — not locally, not in the gate, not in CI — and nothing goes red.
  // That is the one failure a test suite cannot report about itself, so it is
  // reported here.
  const named = new Set(
    (workspaceRoot.scripts.test.match(/tests\/[\w-]+\.test\.mjs/g) ?? []).map(
      (path) => path.slice("tests/".length),
    ),
  );
  const onDisk = (await readdir(join(root, "tests"))).filter((name) =>
    name.endsWith(".test.mjs"),
  );

  // The single deliberate omission. It packs the package and installs it into
  // temporary React and Next consumers, which is minutes rather than seconds,
  // so it is its own script — and the gate runs both.
  const packed = "packed-consumers.test.mjs";
  assert.ok(workspaceRoot.scripts["pack:check"].includes(packed));
  assert.ok(!named.has(packed));

  assert.deepEqual(
    [...named].sort(),
    onDisk.filter((name) => name !== packed).sort(),
    "every file in `tests/` must be run by `pnpm test` or by `pnpm pack:check`",
  );
});

test("the complete Package Gate is one command, and it is what CI runs", async () => {
  const workspaceRoot = await readJson("package.json");
  const gate = workspaceRoot.scripts.gate;

  // A gate spelled out step by step in a workflow is a gate that can be run
  // differently by hand, and differently again by the release path. One script
  // is what makes "the complete Package Gate passed" a checkable statement.
  assert.ok(gate, "the workspace must name the Package Gate");
  for (const step of [
    "pnpm format:check",
    "pnpm lint",
    "pnpm typecheck",
    "pnpm test",
    "pnpm build",
    "pnpm pack:check",
  ]) {
    assert.ok(gate.includes(step), `the gate must run ${step}`);
  }
  const publish = workspaceRoot.scripts["release:publish"];
  assert.ok(publish?.includes("pnpm gate"), "publishing must run the gate");
  assert.ok(publish.includes("changeset publish"), "publishing must publish");
  assert.match(
    publish,
    /pnpm gate\s*&&/,
    "the gate must run before the publish, not after it",
  );
});

test("only the release workflow can publish, and it holds no publish token", async () => {
  const release = await readFile(
    join(root, ".github/workflows/release.yml"),
    "utf8",
  );
  const workflows = await collectFiles(join(root, ".github/workflows"));
  // What the workflow actually does, with the comments taken out: they are free
  // to name the triggers and the tokens they explain, and every assertion below
  // that forbids something has to read past them to mean anything.
  const executed = release.replace(/^\s*#.*$/gm, "");

  // Exactly one workflow publishes, and it is reachable only from `main`.
  const publishing = [];
  for (const file of workflows) {
    const source = await readFile(file, "utf8");
    if (/release:publish|changeset publish|npm publish/.test(source))
      publishing.push(relative(root, file));
  }
  assert.deepEqual(publishing, [".github/workflows/release.yml"]);
  assert.match(release, /on:\s*\n\s*push:\s*\n\s*branches:\s*\[main\]/);

  // One trigger, and it names the branch. A `workflow_dispatch` can be aimed at
  // any ref, which would turn "publishes only from the protected path" into
  // "publishes from whatever a maintainer typed" — so the publishing job checks
  // the ref as well, and a trigger added later still cannot widen it.
  assert.doesNotMatch(executed, /workflow_dispatch|workflow_call|pull_request/);
  assert.match(executed, /if:\s*github\.ref == 'refs\/heads\/main'/);

  // The gate runs before anything is published, on both supported Node
  // versions, and the publishing job waits for it.
  assert.match(release, /node-version:\s*\[22, 24\]/);
  assert.match(release, /run:\s*pnpm gate/);
  assert.match(release, /needs:\s*gate/);

  // `registry-url` and `scope` must stay off setup-node. Given either, it
  // writes an .npmrc with `_authToken=${NODE_AUTH_TOKEN}` and sets that
  // variable to the literal placeholder `XXXXX-XXXXX-XXXXX-XXXXX`. npm then
  // believes it holds a credential, never attempts the OIDC exchange, and
  // publishes with a junk token — which the registry rejects as `404`, not
  // `401`, so it reads as a missing package rather than a refused credential.
  // This cost three debugging rounds; the registry is named in the manifest's
  // `publishConfig` instead, where it cannot fabricate a token.
  assert.doesNotMatch(executed, /registry-url:/);
  assert.doesNotMatch(executed, /NODE_AUTH_TOKEN/);

  // Trusted publishing exchanges a workflow-run OIDC token for a short-lived
  // registry credential, so `id-token: write` is the permission that makes a
  // publish possible at all. `packages: write` granted nothing here any more
  // and would only widen the job.
  assert.match(executed, /id-token:\s*write/);
  assert.doesNotMatch(executed, /packages:\s*write/);

  // setup-node on Node 22 ships npm 10, which predates OIDC entirely: it would
  // not fail, it would fall back to looking for a token and publish without an
  // attestation. The floor is asserted here because nothing else would notice.
  assert.match(executed, /npm install -g npm@\^?11\.\d+\.\d+/);

  // No credential outlives the run, and now none is even named. The registry
  // credential is minted by the OIDC exchange; pushing tags uses the token
  // `actions/checkout` already persisted. So the assertion is the strongest
  // form available: this workflow reads no secret at all, and a stored
  // publishing secret could not be introduced without failing here.
  const secrets = new Set(
    [...executed.matchAll(/secrets\.([A-Z_]+)/g)].map(([, name]) => name),
  );
  assert.deepEqual([...secrets], []);
  assert.doesNotMatch(executed, /NPM_TOKEN|_authToken\s*=/);

  // Provenance is generated by trusted publishing without being asked, so the
  // only way to lose it is to turn it off. Nothing may.
  assert.doesNotMatch(executed, /NPM_CONFIG_PROVENANCE|--provenance[= ]false/);

  // The workflow publishes; it does not version. `changesets/action` branches
  // on whether a Changeset is pending, not on whether a `version:` step was
  // given, so with one present it always tries to open a Version Packages pull
  // request — which this organization forbids, making the path unfailable-safe
  // only by never reaching it. It is therefore not used at all, and the publish
  // is an ordinary step. Versioning is a local `pnpm release:version`, reviewed
  // as the commit that carries it.
  assert.doesNotMatch(executed, /changesets\/action/);
  assert.doesNotMatch(executed, /pull-requests:/);
  assert.doesNotMatch(executed, /version:\s*pnpm release:version/);
  assert.match(executed, /run:\s*pnpm release:publish/);
});

test("the repository distributes exactly one skill, and it is the consumer's", async () => {
  // `npx skills add <repo>` installs every skill it discovers, and it looks in
  // `skills/` *and* in agent directories like `.claude/skills/`. A maintainer
  // procedure left in either would be handed to every consumer who installs the
  // canvas-panels skill — a `/release` command that publishes this package has
  // no business on someone else's machine. Measured before this was written:
  // with the release procedure in `.claude/skills/`, the CLI reported "Found 2
  // skills" and installed both. It lives in `.claude/commands/` instead, which
  // is not scanned.
  const files = await collectFiles(root);
  const skills = files
    .map((file) => relative(root, file))
    .filter(
      (path) => path.endsWith("SKILL.md") && !path.startsWith("node_modules"),
    )
    .sort();

  assert.deepEqual(skills, ["skills/canvas-panels/SKILL.md"]);
});

test("the agent skill names only subpaths the package actually exports", async () => {
  const skill = await readFile(
    join(root, "skills/canvas-panels/SKILL.md"),
    "utf8",
  );
  const canvasPackage = await readJson("packages/canvas-panels/package.json");

  // The skill is distributed by `npx skills add` from this repository, so it is
  // read straight from source and nothing rebuilds it. Its frontmatter name is
  // what the CLI installs it as.
  assert.match(skill, /^---\nname: canvas-panels\n/);

  // It has to install the package it documents. A rename that missed this file
  // would ship agents an install command for a package that no longer exists.
  assert.ok(
    skill.includes(`pnpm add ${canvasPackage.name}`),
    "the skill must install the current package name",
  );

  // And every subpath it mentions must be one the package declares. This is the
  // drift that matters: prose can go stale quietly, but a skill that sends an
  // agent to an entry point which was renamed or removed produces code that
  // cannot resolve. The README pointer is not a subpath and is excluded.
  const named = new Set(
    [...skill.matchAll(/@squaredlemons\/canvas-panels(\/[\w./-]+)/g)]
      .map(([, subpath]) => `.${subpath}`)
      .filter((subpath) => subpath !== "./README.md"),
  );
  assert.ok(named.size > 0, "the skill must name at least one subpath");
  for (const subpath of named) {
    assert.ok(
      subpath in canvasPackage.exports,
      `the skill names ${subpath}, which the package does not export`,
    );
  }

  // The skill points at the shipped README for everything frozen rather than
  // restating it. A second copy of the export inventory or the token table
  // would drift silently, and only the README's copy is enforced.
  assert.match(
    skill,
    /node_modules\/@squaredlemons\/canvas-panels\/README\.md/,
  );
});

test("the package is published to the public npm registry as MIT-licensed open source", async () => {
  const canvasPackage = await readJson("packages/canvas-panels/package.json");

  // The scope is a choice now, not a constraint. GitHub Packages resolved a
  // package by scope alone and required that scope to be the repository owner,
  // which is the only reason the name ever carried the legal suffix. The public
  // registry imposes no such rule, so the scope is free to be the short one and
  // is decoupled from the repository name.
  const [scope] = canvasPackage.name.split("/");
  assert.equal(scope, "@squaredlemons");
  assert.match(
    canvasPackage.repository.url,
    /Squared-Lemons-Ltd\/canvas-panels/,
  );

  // The registry is named here rather than on setup-node, which cannot name it
  // without also fabricating a placeholder auth token that suppresses OIDC.
  // A publish from anywhere — a workflow, a laptop — therefore goes to the same
  // registry without depending on an ambient config.
  assert.equal(
    canvasPackage.publishConfig.registry,
    "https://registry.npmjs.org",
  );
  assert.equal(canvasPackage.publishConfig.access, "public");

  // A public package that says `UNLICENSED` grants nobody the right to use it.
  // The licence and the file that carries its text ship together, inside the
  // tarball, so a consumer reads the terms from the artifact rather than from a
  // repository they may never visit.
  assert.equal(canvasPackage.license, "MIT");
  const licence = await readFile(
    join(root, "packages/canvas-panels/LICENSE"),
    "utf8",
  );
  assert.match(licence, /^MIT License/);
  assert.match(licence, /Copyright \(c\) \d{4} Squared Lemons Ltd/);
  assert.ok(
    canvasPackage.files.includes("LICENSE"),
    "the licence must ship inside the tarball",
  );
});

test("a prerelease publishes to next and a stable release to latest", async () => {
  const config = await readJson(".changeset/config.json");
  const canvasPackage = await readJson("packages/canvas-panels/package.json");
  const runbook = await readFile(
    join(root, "docs/delivery/package-delivery.md"),
    "utf8",
  );

  // No `tag` in publishConfig: with one, every publish would carry it, and a
  // prerelease tag pinned there is how a `next` build reaches `latest`.
  // Changesets takes the dist-tag from pre mode instead — `next` while
  // `.changeset/pre.json` exists, `latest` once it has been exited.
  assert.equal(canvasPackage.publishConfig.tag, undefined);
  // Changesets passes this to `npm publish`, where `restricted` on a scoped
  // package means "private" — and on a free organization npm rejects it. It has
  // to agree with `publishConfig.access`, so the two are asserted together.
  assert.equal(config.access, "public");
  assert.equal(config.access, canvasPackage.publishConfig.access);
  assert.match(runbook, /changeset pre enter next/);
  assert.match(runbook, /changeset pre exit/);

  // And a candidate is promoted by moving a tag, never by building again: the
  // artifact that was verified has to be the artifact that becomes `latest`,
  // and `npm dist-tag add` is the only step that touches no bytes.
  assert.match(runbook, /npm dist-tag add @squaredlemons\/canvas-panels@/);

  // Every workspace member that is not the package is ignored, so a fixture or
  // a sample can never be versioned or published alongside it. Derived from the
  // workspace rather than listed here: a hand-written list agrees with the repo
  // on the day it is written and silently stops the moment an app is added.
  const members = await workspacePackageNames();
  assert.ok(members.includes(canvasPackage.name));
  assert.deepEqual(
    [...config.ignore].sort(),
    members.filter((name) => name !== canvasPackage.name).sort(),
  );
});
