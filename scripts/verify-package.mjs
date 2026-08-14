import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  collectFiles,
  optionalSubpathsReachedFromBaseEntryPoints,
} from "./module-graph.mjs";

const execFileAsync = promisify(execFile);
const root = fileURLToPath(new URL("..", import.meta.url));
const packageDirectory = join(root, "packages/canvas-panels");
const temporaryRoot = await mkdtemp(join(tmpdir(), "canvas-panels-package-"));

async function run(command, args, cwd) {
  try {
    return await execFileAsync(command, args, {
      cwd,
      env: {
        ...process.env,
        NEXT_TELEMETRY_DISABLED: "1",
      },
      maxBuffer: 20 * 1024 * 1024,
      timeout: 4 * 60 * 1000,
    });
  } catch (error) {
    const stdout = typeof error.stdout === "string" ? error.stdout : "";
    const stderr = typeof error.stderr === "string" ? error.stderr : "";
    throw new Error(
      `${command} ${args.join(" ")} failed in ${cwd}\n${stdout}\n${stderr}`,
      { cause: error },
    );
  }
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

/**
 * A consumer that never imports an optional subpath — an extension, or the
 * overlay composition path — must never pay for one, so the check runs against
 * the installed tarball rather than the built source.
 */
async function assertInstalledSubpathsStayOptional(consumerDirectory) {
  const reached = await optionalSubpathsReachedFromBaseEntryPoints(
    join(consumerDirectory, "node_modules/@squaredlemons/canvas-panels/dist"),
  );

  for (const [entry, optional] of reached) {
    if (optional.length > 0) {
      throw new Error(
        `packed ${entry} initializes an optional subpath: ${optional.join(", ")}`,
      );
    }
  }
}

/**
 * Nothing that looks like credential material may reach a registry. The scan is
 * over the installed tarball rather than the repository, because what ships is
 * the only thing that matters here.
 */
const secretPatterns = Object.freeze([
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "a private key"],
  [/\bnpm_[A-Za-z0-9]{36}\b/, "an npm token"],
  [/\bgh[pousr]_[A-Za-z0-9]{36}\b/, "a GitHub token"],
  [/\bAKIA[0-9A-Z]{16}\b/, "an AWS access key id"],
  [/\bsk-[A-Za-z0-9]{32,}\b/, "an API secret key"],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}\b/, "a Slack token"],
  [
    /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
    "a JWT",
  ],
  [
    /["'](?:authorization|password|passwd|secret)["']\s*:\s*["'][^"']{8,}/i,
    "an inline credential",
  ],
]);

async function assertNoSecretMaterial(installedDirectory) {
  const files = await collectFiles(installedDirectory);

  if (files.length === 0) {
    throw new Error("the installed package is empty");
  }
  for (const file of files) {
    const contents = await readFile(file, "utf8").catch(() => "");
    for (const [pattern, description] of secretPatterns) {
      if (pattern.test(contents)) {
        throw new Error(
          `packed ${relative(installedDirectory, file)} contains ${description}`,
        );
      }
    }
  }
  return files.length;
}

/**
 * The directive, barrel and module-format rules, checked against what a
 * consumer actually installed. The same rules are asserted over the built
 * source in the contract suite; repeating them here is the difference between
 * trusting the build and inspecting the artifact.
 */
async function assertInstalledArtifactShape(installedDirectory) {
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
  const directive = /^(?:"use client"|'use client');/;

  for (const entry of clientEntries) {
    const source = await readFile(join(installedDirectory, entry), "utf8");
    if (!directive.test(source)) {
      throw new Error(`packed ${entry} lost its "use client" directive`);
    }
  }
  for (const entry of serverEntries) {
    const source = await readFile(join(installedDirectory, entry), "utf8");
    if (directive.test(source)) {
      throw new Error(`packed ${entry} is no longer server-safe`);
    }
  }

  // No entry point may re-export another wholesale: that is a broad barrel by
  // another name, and it would make every internal module public.
  for (const entry of [...clientEntries, ...serverEntries]) {
    const source = await readFile(join(installedDirectory, entry), "utf8");
    if (/export\s+\*\s+from/.test(source)) {
      throw new Error(`packed ${entry} re-exports a whole module`);
    }
  }

  process.stdout.write(
    `verified packed client directives and ${clientEntries.length + serverEntries.length} barrel-free entry points\n`,
  );
}

/**
 * The exports map is the whole public surface. A consumer that reaches past it
 * is depending on something the versioning policy does not protect, so Node
 * must refuse the path rather than resolve it.
 */
async function assertPrivateDeepImportsAreRefused(consumerDirectory) {
  const privatePaths = [
    "@squaredlemons/canvas-panels/dist/core/index.js",
    "@squaredlemons/canvas-panels/dist/ui/index.js",
    "@squaredlemons/canvas-panels/package.json",
    "@squaredlemons/canvas-panels/src/core/index.ts",
    "@squaredlemons/canvas-panels",
  ];
  await writeFile(
    join(consumerDirectory, "deep-import-probe.mjs"),
    `const refused = [];
for (const specifier of ${JSON.stringify(privatePaths)}) {
  try {
    await import(specifier);
  } catch (error) {
    if (error.code !== "ERR_PACKAGE_PATH_NOT_EXPORTED" && error.code !== "ERR_MODULE_NOT_FOUND") {
      throw new Error("unexpected resolution failure for " + specifier + ": " + error.code);
    }
    refused.push(specifier);
    continue;
  }
  throw new Error("private deep import resolved: " + specifier);
}
if (refused.length !== ${privatePaths.length}) throw new Error("deep import probe did not run");
console.log("verified packed private deep imports stay unreachable");
`,
  );
  const { stdout } = await run(
    process.execPath,
    ["deep-import-probe.mjs"],
    consumerDirectory,
  );
  process.stdout.write(stdout);
}

/**
 * A second React in the tree is what silently breaks hooks in a consumer, and
 * the package is the one thing that must never be the cause.
 */
async function assertSingleReactInstallation(consumerDirectory) {
  const found = new Map();

  // Walks one `node_modules`. Its children are either `@scope` directories,
  // whose children are packages, or packages themselves — and a package may
  // nest its own `node_modules`, which is exactly where a second copy hides.
  const walkModules = async (modulesDirectory) => {
    for (const entry of await readdir(modulesDirectory, {
      withFileTypes: true,
    })) {
      // A hoisted or linked dependency arrives as a symlink, so a check that
      // only accepted real directories would miss the duplicate it is for.
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      const path = join(modulesDirectory, entry.name);
      if (entry.name.startsWith("@")) {
        await walkModules(path);
        continue;
      }
      if (entry.name === "react" || entry.name === "react-dom") {
        found.set(entry.name, [...(found.get(entry.name) ?? []), path]);
      }
      const nested = join(path, "node_modules");
      if (existsSync(nested)) await walkModules(nested);
    }
  };
  await walkModules(join(consumerDirectory, "node_modules"));

  // Positive control: the consumer genuinely depends on both, so finding
  // neither would mean the walk never enumerated anything and the duplicate
  // check below had nothing to disagree with.
  for (const name of ["react", "react-dom"]) {
    const copies = found.get(name) ?? [];
    if (copies.length === 0) {
      throw new Error(`clean consumer resolved no ${name} at all`);
    }
    if (copies.length !== 1) {
      throw new Error(
        `clean consumer resolved ${copies.length} copies of ${name}: ${copies.join(", ")}`,
      );
    }
  }
}

/**
 * Every area an integrator has to be able to answer for themselves, read from
 * the installed package rather than the repository: the tarball ships `dist`
 * and one README, so if it is not in there it is not available to a consumer at
 * all.
 */
const documentedAreas = Object.freeze([
  "Installation",
  "Architecture",
  "API",
  "Accessibility",
  "Navigation",
  "Theming",
  "Next.js",
  "Extensions",
  "Testing",
  "Compatibility",
  "Support",
  "Migration",
  "Rollback",
]);

async function assertDocumentationIsComplete(installedDirectory, exports) {
  const readme = await readFile(join(installedDirectory, "README.md"), "utf8");
  const headings = new Set(
    [...readme.matchAll(/^#{2,3}\s+(.+?)\s*$/gm)].map(([, heading]) => heading),
  );

  for (const area of documentedAreas) {
    if (!headings.has(area)) {
      throw new Error(`packed documentation has no "${area}" section`);
    }
  }

  // Documentation is only executable if what it tells a reader to import is
  // actually importable. Every package specifier the examples name must be a
  // declared export, and every declared export must be documented somewhere.
  const declared = new Set(
    Object.keys(exports).map((subpath) =>
      subpath.replace(/^\.\//, "@squaredlemons/canvas-panels/"),
    ),
  );
  // Only subpath imports are claims about the exports map. Naming the package
  // itself — in a dependency entry, or in prose — is not.
  const documented = new Set(
    [
      ...readme.matchAll(/["'](@squaredlemons\/canvas-panels\/[^"']+)["']/g),
    ].map(([, specifier]) => specifier),
  );

  for (const specifier of documented) {
    if (!declared.has(specifier)) {
      throw new Error(
        `packed documentation imports an undeclared subpath: ${specifier}`,
      );
    }
  }
  for (const specifier of declared) {
    if (!documented.has(specifier)) {
      throw new Error(`packed documentation never shows ${specifier}`);
    }
  }

  process.stdout.write(
    `verified packed documentation covers ${documentedAreas.length} areas and all ${declared.size} public subpaths\n`,
  );
}

async function assertTarballLockfile(consumerDirectory) {
  const lockfile = JSON.parse(
    await readFile(join(consumerDirectory, "package-lock.json"), "utf8"),
  );
  const installed =
    lockfile.packages?.["node_modules/@squaredlemons/canvas-panels"];

  if (!installed?.resolved?.endsWith(".tgz") || !installed.integrity) {
    throw new Error(
      "clean consumer lockfile lacks tarball resolution and integrity",
    );
  }
}

try {
  await run(
    "pnpm",
    ["--filter", "@squaredlemons/canvas-panels", "build"],
    root,
  );

  const { stdout: packOutput } = await run(
    "npm",
    ["pack", "--json", "--pack-destination", temporaryRoot],
    packageDirectory,
  );
  const [packResult] = JSON.parse(packOutput);
  if (!packResult?.filename || !Array.isArray(packResult.files)) {
    throw new Error("npm pack did not return inspectable package metadata");
  }

  const packedPaths = new Set(packResult.files.map((file) => file.path));
  const packageJson = JSON.parse(
    await readFile(join(packageDirectory, "package.json"), "utf8"),
  );
  for (const target of Object.values(packageJson.exports)) {
    const paths = typeof target === "string" ? [target] : Object.values(target);
    for (const path of paths) {
      const packedPath = path.replace(/^\.\//, "");
      if (!packedPaths.has(packedPath)) {
        throw new Error(`export target is absent from tarball: ${packedPath}`);
      }
    }

    if (typeof target !== "string") {
      for (const mapPath of [`${target.import}.map`, `${target.types}.map`]) {
        const packedMapPath = mapPath.replace(/^\.\//, "");
        if (!packedPaths.has(packedMapPath)) {
          throw new Error(
            `source map is absent from tarball: ${packedMapPath}`,
          );
        }
      }
    }
  }
  for (const file of packedPaths) {
    if (file.startsWith("src/") || file.startsWith("scripts/")) {
      throw new Error(`private source/build file leaked into tarball: ${file}`);
    }
  }

  const tarball = join(temporaryRoot, packResult.filename);
  const tarballDependency = `file:${tarball}`;

  const reactConsumer = join(temporaryRoot, "react-consumer");
  await writeJson(join(reactConsumer, "package.json"), {
    name: "canvas-panels-clean-react-consumer",
    private: true,
    type: "module",
    dependencies: {
      "@squaredlemons/canvas-panels": tarballDependency,
      react: "19.2.8",
      "react-dom": "19.2.8",
    },
    devDependencies: {
      jsdom: "26.1.0",
    },
  });
  await writeFile(
    join(reactConsumer, "probe.mjs"),
    `import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createPanelEngine, definePanel, defineRootPanel } from "@squaredlemons/canvas-panels/core";
import { createPanelEditor, editorGuardMessages, resolveEditorGuard } from "@squaredlemons/canvas-panels/extensions/editor";
import { createPanelResource, createResourceExchange, resolveResourceDeferral } from "@squaredlemons/canvas-panels/extensions/resources";
import { createOverlayWorkspace, defineOverlayWorkspace, overlayNavigationParameterPrefix, overlayPresentation } from "@squaredlemons/canvas-panels/overlay";
import { buildNavigationDocument, buildPanelStack, createTestClock, createTestFocusTarget, createTestHistory, createTestIdentities, createTestLifecycle, createTestRestore, createTestViewport } from "@squaredlemons/canvas-panels/testing";
import { canvasBreakpointQueries, createCanvasModule, defineCanvasContext } from "@squaredlemons/canvas-panels/ui";

await import("@squaredlemons/canvas-panels/react");

const root = defineRootPanel({ kind: "classes", title: "Classes" });
const classPanel = definePanel({
  kind: "class",
  deduplication: "reuse",
  key: ({ classId }) => classId,
  title: ({ name }) => name,
  persistence: {
    mode: "navigation-with-loader",
    version: 1,
    codec: {
      encode: ({ classId, name }) => ({ classId, name }),
      validate: (value) => typeof value === "object" && value !== null && typeof value.classId === "string" && typeof value.name === "string",
      decode: ({ classId, name }) => ({ classId, name }),
      migrations: [],
    },
    restore: async (_input, { signal }) => signal.aborted
      ? { status: "unavailable" }
      : { status: "available" },
  },
  update: {
    validate: (update) => typeof update === "object" && update !== null && (update.type === "rename" || update.type === "noop"),
    validateResult: (value) => typeof value === "object" && value !== null && typeof value.classId === "string" && typeof value.name === "string",
    apply: (current, update) => update.type === "noop" ? current : { ...current, name: update.name },
    navigation: "replace",
  },
});
const learner = definePanel({
  kind: "learner",
  deduplication: "allow-many",
  title: ({ name }) => name,
});
let Canvas;
function ClassRenderer({ descriptor, panel }) {
  const current = Canvas.usePanel();
  const stack = Canvas.useStack();
  const transition = Canvas.useTransitionStatus();
  const presentation = Canvas.usePresentation();
  Canvas.useNavigation();
  Canvas.useContextSignal({ selectedClassId: descriptor.classId });
  if (current.panel.instanceId !== panel.instanceId || stack.length < 2 || transition.pending || !presentation.visible) {
    throw new Error("packed bound read hooks returned an invalid Class model");
  }
  return createElement("p", null, "Class record: " + descriptor.name);
}
Canvas = createCanvasModule({
  context: defineCanvasContext(),
  root,
  panels: [classPanel, learner],
  renderers: {
    classes: () => createElement("p", null, "Class list"),
    class: ClassRenderer,
    learner: ({ descriptor }) => createElement("p", null, "Learner record: " + descriptor.name),
  },
});
const engine = createPanelEngine({ root, panels: [classPanel, learner] });
const rootId = engine.getSnapshot().panels[0].instanceId;
const openedClass = engine.open({
  originId: rootId,
  panel: classPanel.reference({ classId: "class-a", name: "Class A" }),
});
if (openedClass.status !== "opened") throw new Error("packed Class Panel did not open");
const openedLearner = engine.open({
  originId: openedClass.instanceId,
  panel: learner.reference({ name: "Ada Lovelace" }),
});
if (openedLearner.status !== "opened") throw new Error("packed Learner Panel did not open");
const navigationDocument = engine.encodeNavigationDocument();
const decodedNavigation = engine.decodeNavigationDocument(navigationDocument);
if (
  decodedNavigation.status !== "decoded" ||
  decodedNavigation.normalized ||
  decodedNavigation.references.length !== 1 ||
  decodedNavigation.references[0].kind !== "class" ||
  decodedNavigation.references[0].input.classId !== "class-a"
) {
  throw new Error("packed persistent Class did not round-trip through a Navigation Document");
}
const restoredNavigation = await engine.restoreNavigationDocument(
  navigationDocument,
  { signal: new AbortController().signal },
);
if (
  restoredNavigation.status !== "restored" ||
  restoredNavigation.navigationIntent !== "none" ||
  restoredNavigation.references.length !== 1 ||
  restoredNavigation.references[0].input.classId !== "class-a"
) {
  throw new Error("packed persistent Class did not restore through its availability loader");
}
const classTarget = engine.getSnapshot().panels[1].instanceRef;
const updatedClass = engine.update({
  definition: classPanel,
  target: classTarget,
  update: { type: "rename", name: "Class Alpha" },
});
if (updatedClass.status !== "updated" || engine.getSnapshot().panels[1].title !== "Class Alpha") {
  throw new Error("packed typed Class update did not commit");
}
const beforeNoop = engine.getSnapshot();
const noopUpdate = engine.update({
  definition: classPanel,
  target: classTarget,
  update: { type: "noop" },
});
if (noopUpdate.status !== "unchanged" || engine.getSnapshot() !== beforeNoop) {
  throw new Error("packed no-op update published a snapshot");
}
const renderCanvas = () => renderToStaticMarkup(
  createElement(
    Canvas.Provider,
    { engine },
    createElement(Canvas.Workspace, { label: "Class and learner records" }),
  ),
);

const openedMarkup = renderCanvas();
if (!openedMarkup.includes('aria-label="Class and learner records"')) throw new Error("missing labelled packed Workspace");
const rootHeadingId = openedMarkup.match(/aria-labelledby="([^"]+)"[^>]*data-panel-kind="classes"/)?.[1];
if (!rootHeadingId || !openedMarkup.includes('id="' + rootHeadingId + '"')) throw new Error("missing labelled packed Root Panel");
if (!openedMarkup.includes('aria-label="Close Class Alpha"')) throw new Error("missing accessible packed Class close control");
if (!openedMarkup.includes('aria-label="Close Ada Lovelace"')) throw new Error("missing accessible packed Learner close control");
const reusedClass = engine.open({
  originId: rootId,
  panel: classPanel.reference({ classId: "class-a", name: "Class A" }),
});
if (reusedClass.status !== "reused" || reusedClass.instanceId !== openedClass.instanceId) {
  throw new Error("packed Class Panel did not reuse its semantic identity");
}
if (engine.getSnapshot().panels.length !== 2) throw new Error("packed Class reuse retained its Learner suffix");
const openedOtherClass = engine.open({
  originId: rootId,
  panel: classPanel.reference({ classId: "class-b", name: "Class B" }),
});
if (openedOtherClass.status !== "opened") throw new Error("packed replacement Class did not open");
if (engine.getSnapshot().panels.some(({ title }) => title === "Class A")) {
  throw new Error("packed Branch Replacement retained the prior Class");
}
const otherClassTarget = engine.getSnapshot().panels[1].instanceRef;
let discarded = 0;
let receivedAbortSignal;
engine.registerLifecycle({
  target: otherClassTarget,
  lifecycle: {
    dirty: true,
    guard: () => ({ status: "confirm", message: "Unsaved packed changes" }),
    save: async () => {},
    discard: async ({ signal }) => {
      receivedAbortSignal = signal;
      discarded += 1;
    },
  },
});
const nestedEngine = createPanelEngine({ root, panels: [classPanel, learner] });
const foreignClose = nestedEngine.close({
  target: otherClassTarget,
});
if (foreignClose.status !== "rejected" || foreignClose.reason !== "foreign-workspace") {
  throw new Error("packed nested Workspace accepted a foreign command");
}
const closedClass = engine.close({
  target: otherClassTarget,
});
if (closedClass.status !== "confirmation-required") throw new Error("packed dirty Class close did not request confirmation");
const resolvedClass = await engine.resolveTransition({ decision: "discard" });
if (
  resolvedClass.status !== "committed" ||
  resolvedClass.outcome.status !== "closed" ||
  resolvedClass.panelIds.length !== 1 ||
  discarded !== 1 ||
  !(receivedAbortSignal instanceof AbortSignal)
) {
  throw new Error("packed guarded Class close did not discard and commit once");
}
const closedMarkup = renderCanvas();
if (!closedMarkup.includes("Classes")) throw new Error("packed Root Panel was not retained");
if (closedMarkup.includes("Class B")) throw new Error("packed Class Panel remained after close");

const stylesheet = await readFile(new URL(import.meta.resolve("@squaredlemons/canvas-panels/styles.css")), "utf8");
if (!stylesheet.includes("@layer canvas-panels")) throw new Error("missing Canvas stylesheet layer");
console.log("verified packed React Root-to-Class-to-Learner consumer");

const editorClass = engine.open({
  originId: rootId,
  panel: classPanel.reference({ classId: "class-c", name: "Class C" }),
});
if (editorClass.status !== "opened") throw new Error("packed editor Class did not open");
const editorTarget = engine.getSnapshot().panels[1].instanceRef;
let record = "draft";
const panelEditor = createPanelEditor({
  dirty: true,
  save: async ({ kind, transition }) => {
    if (kind !== "save" || transition === null) throw new Error("packed editor lost its operation context");
    record = "saved";
  },
  discard: async () => { record = "discarded"; },
  reload: async () => { record = "reloaded"; },
});
if (panelEditor.getState().status !== "idle" || panelEditor.getLifecycle().dirty !== true) {
  throw new Error("packed editor did not report its unsaved work");
}
engine.registerLifecycle({ target: editorTarget, lifecycle: panelEditor.getLifecycle() });
const editorClose = engine.close({ target: editorTarget });
if (editorClose.status !== "confirmation-required") throw new Error("packed editor did not ask for a decision");
const editorResolution = await engine.resolveTransition({ decision: "save" });
if (editorResolution.status !== "committed" || record !== "saved") {
  throw new Error("packed editor did not save through the Guarded Transition coordinator");
}
if (engine.getSnapshot().panels.length !== 1) throw new Error("packed editor Panel remained after saving");
const blocked = resolveEditorGuard({ dirty: true, status: "saving" });
if (blocked.status !== "block" || blocked.reason !== editorGuardMessages.saving) {
  throw new Error("packed editor guard lost its ordering");
}
const refusedReload = await panelEditor.reload();
if (refusedReload.status !== "rejected" || refusedReload.reason !== "unsaved-changes") {
  throw new Error("packed editor reload overwrote unsaved work");
}
const forcedReload = await panelEditor.reload({ discardChanges: true });
if (forcedReload.status !== "completed" || record !== "reloaded") {
  throw new Error("packed editor reload did not re-read its record");
}
console.log("verified packed editor extension consumer");

const exchange = createResourceExchange();
const listHeard = [];
const unrelatedHeard = [];
exchange.subscribe({ keys: ["projects/*"], notify: ({ key }) => listHeard.push(key) });
exchange.subscribe({ keys: ["people/ada"], notify: () => unrelatedHeard.push("person") });
let projectRecord = "Atlas";
const projectResource = createPanelResource({
  exchange,
  keys: ["projects/atlas"],
  source: "packed-project-panel",
  reload: async () => { projectRecord = "Atlas, second edition"; },
});
projectResource.start();
let briefRecord = "Confident";
const briefOptions = {
  exchange,
  keys: ["projects/atlas/briefs/direction"],
  source: "packed-brief-panel",
  dirty: true,
  reload: async () => { briefRecord = "Rewritten elsewhere"; },
};
const briefResource = createPanelResource(briefOptions);
briefResource.start();

const announced = exchange.publish({
  key: "projects/atlas",
  kind: "changed",
  nested: true,
  source: "packed-project-panel",
});
if (announced.notified !== 2) {
  throw new Error("packed exchange did not address the related consumers exactly");
}
if (listHeard.length !== 1 || listHeard[0] !== "projects/atlas") {
  throw new Error("packed wildcard subscription did not hear the change");
}
if (unrelatedHeard.length !== 0) throw new Error("packed unrelated consumer was disturbed");
if (projectRecord !== "Atlas") throw new Error("packed publisher was told to re-read its own work");
if (briefRecord !== "Confident" || briefResource.getState().pending?.key !== "projects/atlas") {
  throw new Error("packed dirty consumer did not defer the nested change");
}
briefResource.update({ ...briefOptions, dirty: false });
await Promise.resolve();
if (briefRecord !== "Rewritten elsewhere" || briefResource.getState().pending !== null) {
  throw new Error("packed deferred read did not follow the settled edit");
}

exchange.publish({ key: "projects/atlas", kind: "deleted" });
if (!projectResource.getState().deleted || projectRecord !== "Atlas") {
  throw new Error("packed deletion was applied without being asked");
}
const applied = await projectResource.apply();
if (applied.status !== "applied" || projectRecord !== "Atlas, second edition") {
  throw new Error("packed consumer could not apply what it was holding");
}
if (resolveResourceDeferral({
  dirty: true,
  failed: false,
  pending: applied.invalidation,
  reloadable: true,
  reloading: false,
}) !== "hold") {
  throw new Error("packed resource deferral lost its ordering");
}
console.log("verified packed resource extension consumer");

const overlayDefinition = defineOverlayWorkspace({ label: "Help", name: "help" });
if (overlayDefinition.namespace !== overlayNavigationParameterPrefix + "help") {
  throw new Error("packed overlay did not mint its own persistence namespace");
}
if (overlayDefinition.namespace === "canvas" || overlayDefinition.modality !== "modal") {
  throw new Error("packed overlay namespace collided with the primary Canvas");
}
let refusedCollision = false;
try {
  defineOverlayWorkspace({ label: "Help", name: "help", primaryNamespace: overlayDefinition.namespace });
} catch {
  refusedCollision = true;
}
if (!refusedCollision) throw new Error("packed overlay accepted the primary Canvas namespace");
const overlayRoot = defineRootPanel({ kind: "overlay-root", title: "Overlay" });
const helpPanel = definePanel({ kind: "help", title: ({ topic }) => topic });
const OverlayCanvas = createCanvasModule({
  root: overlayRoot,
  panels: [helpPanel],
  renderers: {
    "overlay-root": () => null,
    help: ({ descriptor }) => createElement("p", null, "Help: " + descriptor.topic),
  },
});
const overlayEngine = createPanelEngine({ root: overlayRoot, panels: [helpPanel] });
const overlay = createOverlayWorkspace({
  canvas: OverlayCanvas,
  definition: overlayDefinition,
  engine: overlayEngine,
});
if (overlayPresentation(overlayEngine.getSnapshot()).presented) {
  throw new Error("packed overlay presented before anything was routed into it");
}
const emptyMarkup = renderToStaticMarkup(createElement(overlay.Host, null, createElement("main", null, "Application")));
if (emptyMarkup.includes("data-canvas-overlay=") || emptyMarkup.includes("inert=")) {
  throw new Error("packed overlay rendered a layer over an empty Workspace");
}
if (overlay.open(helpPanel.reference({ topic: "Shortcuts" })).status !== "opened") {
  throw new Error("packed overlay did not route its Panel");
}
if (overlayEngine.getSnapshot().panels.length !== 2 || engine.getSnapshot().panels.some(({ kind }) => kind === "help")) {
  throw new Error("packed overlay routing reached the primary Canvas");
}
const overlayMarkup = renderToStaticMarkup(createElement(overlay.Host, null, createElement("main", null, "Application")));
for (const expected of ['role="dialog"', 'aria-modal="true"', 'aria-label="Help"', 'inert=""', "Help: Shortcuts"]) {
  if (!overlayMarkup.includes(expected)) {
    throw new Error("packed overlay layer is missing " + expected);
  }
}
const overlayTarget = overlayEngine.getSnapshot().panels[1].instanceRef;
overlayEngine.registerLifecycle({
  target: overlayTarget,
  lifecycle: {
    dirty: true,
    guard: () => ({ status: "confirm", message: "Unsaved packed help" }),
    save: async () => {},
    discard: async () => {},
  },
});
if (overlay.dismiss().status !== "confirmation-required") {
  throw new Error("packed overlay dismissal skipped its Transition Guard");
}
const settledOverlay = await overlayEngine.resolveTransition({ decision: "discard" });
if (settledOverlay.status !== "committed" || overlayEngine.getSnapshot().panels.length !== 1) {
  throw new Error("packed overlay dismissal did not commit through the guard");
}
const emptyDismissal = overlay.dismiss();
if (emptyDismissal.status !== "rejected" || emptyDismissal.reason !== "root-panel") {
  throw new Error("packed overlay dismissed a layer that was not presented");
}
console.log("verified packed overlay Workspace consumer");

const identities = createTestIdentities();
if (identities.workspace() !== "test-workspace-1" || identities.panel() !== "test-panel-1") {
  throw new Error("packed testing identities were not deterministic");
}
const builtStack = buildPanelStack([
  { kind: "classes", title: "Classes" },
  { kind: "class", title: "Class A", descriptor: { classId: "class-a" } },
]);
if (builtStack.length !== 2 || builtStack[0].closable !== false || builtStack[1].deepest !== true || builtStack[1].descriptor.classId !== "class-a") {
  throw new Error("packed testing read-model builder produced an incomplete stack");
}
const testClock = createTestClock({ start: 5 });
let ticked = 0;
testClock.setTimeout(() => { ticked = testClock.now(); }, 10);
if (testClock.advance(20) !== 1 || ticked !== 15) {
  throw new Error("packed testing clock did not run its timer at its due point");
}
const testViewport = createTestViewport({ breakpoint: "mobile" });
if (testViewport.queries !== canvasBreakpointQueries) {
  throw new Error("packed testing viewport answers for a different breakpoint set");
}
if (!testViewport.matchMedia(canvasBreakpointQueries[0][1]).matches) {
  throw new Error("packed testing viewport did not report its own breakpoint");
}
const testFocus = createTestFocusTarget();
testFocus.ref.current.focus({ preventScroll: true });
if (testFocus.focusCount !== 1 || testFocus.ref.current.isConnected !== true) {
  throw new Error("packed testing focus target did not record its focus");
}
const testHistory = createTestHistory({ url: "/classes" });
testHistory.port.push({ page: 1 }, "/classes?canvas=one");
testHistory.back();
if (testHistory.index !== 0 || testHistory.writes.length !== 1) {
  throw new Error("packed testing history conflated a traversal with a write");
}

// The Panel Engine only ever encodes the current descriptor version, so a
// hand-built historical document is the only way a packed consumer can prove a
// migration still runs.
const restoreProbe = createTestRestore();
const historicalPanel = definePanel({
  kind: "historical",
  title: ({ name }) => name,
  persistence: {
    mode: "navigation-with-loader",
    version: 2,
    codec: {
      encode: ({ id, name }) => ({ id, name }),
      validate: (value) => typeof value === "object" && value !== null && typeof value.id === "string" && typeof value.name === "string",
      decode: ({ id, name }) => ({ id, name }),
      migrations: [{ from: 1, to: 2, migrate: ({ id }) => ({ id, name: id }) }],
    },
    restore: restoreProbe.restore,
  },
});
const historicalEngine = createPanelEngine({ root, panels: [historicalPanel] });
const historicalDocument = buildNavigationDocument([
  { kind: "historical", version: 1, descriptor: { id: "report-a" } },
]);
const historicalRestore = await historicalEngine.restoreNavigationDocument(historicalDocument, { signal: new AbortController().signal });
if (
  historicalRestore.status !== "restored" ||
  historicalRestore.navigationIntent !== "replace" ||
  historicalRestore.references[0].input.name !== "report-a" ||
  restoreProbe.calls.length !== 1
) {
  throw new Error("packed historical Navigation Document did not migrate and restore");
}

const testEditor = createTestLifecycle({ guard: { status: "confirm", message: "Unsaved" }, mode: "manual" });
const guardedClass = historicalEngine.open({ panel: historicalPanel.reference({ id: "report-b", name: "Report B" }) });
if (guardedClass.status !== "opened") throw new Error("packed testing lifecycle had no Panel to guard");
const guardedTarget = historicalEngine.getSnapshot().panels[1].instanceRef;
historicalEngine.registerLifecycle({ target: guardedTarget, lifecycle: testEditor.lifecycle });
if (historicalEngine.close({ target: guardedTarget }).status !== "confirmation-required") {
  throw new Error("packed testing lifecycle did not raise its Guarded Transition");
}
const heldResolution = historicalEngine.resolveTransition({ decision: "save" });
await Promise.resolve();
if (testEditor.saves.length !== 1 || testEditor.saves[0].settled || historicalEngine.getSnapshot().panels.length !== 2) {
  throw new Error("packed testing lifecycle committed over a write in flight");
}
testEditor.saves[0].settle();
if ((await heldResolution).status !== "committed" || historicalEngine.getSnapshot().panels.length !== 1) {
  throw new Error("packed testing lifecycle did not commit once its write settled");
}
console.log("verified packed testing tools consumer");
`,
  );
  // A server render the packed package then has to hydrate. Nothing else in
  // this suite crosses that boundary, and an identity that disagreed across it
  // reached a consumer once already: every lookup by `data-canvas-panel-id`
  // missed, so F6 stopped cycling and separators reported the wrong width.
  await writeFile(
    join(reactConsumer, "hydrate-probe.mjs"),
    `import { act, createElement } from "react";
import { renderToString } from "react-dom/server";
import { JSDOM } from "jsdom";
import { createPanelEngine, definePanel, defineRootPanel } from "@squaredlemons/canvas-panels/core";
import { createCanvasModule } from "@squaredlemons/canvas-panels/ui";

const root = defineRootPanel({ kind: "classes", title: "Classes" });
const classPanel = definePanel({ kind: "class", title: ({ name }) => name });
const learner = definePanel({ kind: "learner", title: ({ name }) => name });
const Canvas = createCanvasModule({
  root,
  panels: [classPanel, learner],
  renderers: {
    classes: () => createElement("p", null, "Class list"),
    class: ({ descriptor }) => createElement("p", null, "Class record: " + descriptor.name),
    learner: ({ descriptor }) => createElement("p", null, "Learner record: " + descriptor.name),
  },
});

// Seeded the way a cold load seeds: the stack a deep link asks for, restored
// in one go, which is the path a server-rendered Canvas actually takes.
function seededEngine() {
  const engine = createPanelEngine({ root, panels: [classPanel, learner] });
  const restored = engine.restoreStack({
    references: [
      classPanel.reference({ name: "Class A" }),
      learner.reference({ name: "Ada Lovelace" }),
    ],
  });
  if (restored.status === "rejected") throw new Error("packed hydration fixture did not restore its stack");
  if (engine.getSnapshot().panels.length !== 3) throw new Error("packed hydration fixture restored the wrong stack");
  return engine;
}

const tree = (engine) => createElement(
  Canvas.Provider,
  { engine },
  createElement(Canvas.Workspace, { label: "Class and learner records" }),
);

// This process has served requests before, exactly as a running server has.
seededEngine();
seededEngine();
const serverHtml = renderToString(tree(seededEngine()));
if (!serverHtml.includes('data-canvas-panel-id')) throw new Error("packed server render carried no Panel identities");

const dom = new JSDOM('<!doctype html><html><body><div id="canvas-root">' + serverHtml + '</div></body></html>', {
  url: "https://packed-consumer.test/",
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Node = dom.window.Node;
globalThis.getComputedStyle = dom.window.getComputedStyle;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { hydrateRoot } = await import("react-dom/client");

const clientEngine = seededEngine();
const logged = [];
const consoleError = console.error;
console.error = (...args) => logged.push(args.map(String).join(" "));
try {
  await act(async () => {
    hydrateRoot(dom.window.document.getElementById("canvas-root"), tree(clientEngine));
  });
} finally {
  console.error = consoleError;
}

const domIds = [...dom.window.document.querySelectorAll("[data-canvas-panel]")]
  .map((panel) => panel.getAttribute("data-canvas-panel-id"));
const engineIds = clientEngine.getSnapshot().panels.map(({ instanceId }) => instanceId);
if (domIds.length !== 3 || domIds.join(",") !== engineIds.join(",")) {
  throw new Error("packed hydrated DOM identities " + domIds.join(",") + " do not match the client Engine's " + engineIds.join(","));
}
const mismatches = logged.filter((message) => /hydrat/i.test(message));
if (mismatches.length > 0) {
  throw new Error("packed hydration reported a mismatch: " + mismatches[0]);
}
console.log("verified packed server render hydrates with matching Panel identities");
`,
  );
  await run(
    "npm",
    ["install", "--ignore-scripts", "--no-audit", "--no-fund"],
    reactConsumer,
  );
  await assertTarballLockfile(reactConsumer);
  await assertInstalledSubpathsStayOptional(reactConsumer);
  process.stdout.write(
    "verified packed base entry points leave the optional subpaths optional\n",
  );
  const scanned = await assertNoSecretMaterial(
    join(reactConsumer, "node_modules/@squaredlemons/canvas-panels"),
  );
  process.stdout.write(
    `verified packed artifact carries no secret material across ${scanned} files\n`,
  );
  await assertSingleReactInstallation(reactConsumer);
  process.stdout.write("verified packed consumer resolves a single React\n");
  await assertInstalledArtifactShape(
    join(reactConsumer, "node_modules/@squaredlemons/canvas-panels"),
  );
  await assertPrivateDeepImportsAreRefused(reactConsumer);
  await assertDocumentationIsComplete(
    join(reactConsumer, "node_modules/@squaredlemons/canvas-panels"),
    packageJson.exports,
  );
  const reactResult = await run(process.execPath, ["probe.mjs"], reactConsumer);
  process.stdout.write(reactResult.stdout);
  const hydrationResult = await run(
    process.execPath,
    ["hydrate-probe.mjs"],
    reactConsumer,
  );
  process.stdout.write(hydrationResult.stdout);

  const nextConsumer = join(temporaryRoot, "next-consumer");
  await writeJson(join(nextConsumer, "package.json"), {
    name: "canvas-panels-clean-next-consumer",
    private: true,
    type: "module",
    scripts: { build: "next build" },
    dependencies: {
      "@squaredlemons/canvas-panels": tarballDependency,
      next: "16.3.0",
      react: "19.2.8",
      "react-dom": "19.2.8",
    },
    devDependencies: {
      "@types/node": "26.1.2",
      "@types/react": "19.2.18",
      "@types/react-dom": "19.2.4",
      typescript: "5.9.3",
    },
  });
  await writeJson(join(nextConsumer, "tsconfig.json"), {
    compilerOptions: {
      target: "ES2022",
      lib: ["dom", "dom.iterable", "esnext"],
      allowJs: false,
      skipLibCheck: true,
      strict: true,
      noEmit: true,
      esModuleInterop: true,
      module: "esnext",
      moduleResolution: "bundler",
      resolveJsonModule: true,
      isolatedModules: true,
      jsx: "react-jsx",
      incremental: true,
      plugins: [{ name: "next" }],
    },
    include: ["next-env.d.ts", ".next/types/**/*.ts", "**/*.ts", "**/*.tsx"],
    exclude: ["node_modules"],
  });
  await writeFile(
    join(nextConsumer, "next-env.d.ts"),
    '/// <reference types="next" />\n/// <reference types="next/image-types/global" />\n',
  );
  await mkdir(join(nextConsumer, "app"), { recursive: true });
  await writeFile(
    join(nextConsumer, "app/layout.tsx"),
    `import "@squaredlemons/canvas-panels/styles.css";
import type { ReactNode } from "react";

export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
`,
  );
  await writeFile(
    join(nextConsumer, "app/client-probe.tsx"),
    `"use client";

import * as editor from "@squaredlemons/canvas-panels/extensions/editor";
import * as nextAdapter from "@squaredlemons/canvas-panels/next";
import * as overlay from "@squaredlemons/canvas-panels/overlay";
import * as canvasReact from "@squaredlemons/canvas-panels/react";
import * as resources from "@squaredlemons/canvas-panels/extensions/resources";
import * as testing from "@squaredlemons/canvas-panels/testing";
import * as ui from "@squaredlemons/canvas-panels/ui";

export function ClientProbe() {
  const entries = [editor, nextAdapter, overlay, canvasReact, resources, testing, ui];
  return <p data-client-entries={entries.length}>packed client entries resolved</p>;
}
`,
  );
  await writeFile(
    join(nextConsumer, "app/page.tsx"),
    `import * as core from "@squaredlemons/canvas-panels/core";
import * as nextServer from "@squaredlemons/canvas-panels/next/server";
import { ClientProbe } from "./client-probe";

export default function Page() {
  const serverEntries = [core, nextServer];
  return <main data-server-entries={serverEntries.length}><ClientProbe /></main>;
}
`,
  );
  await run(
    "npm",
    ["install", "--ignore-scripts", "--no-audit", "--no-fund"],
    nextConsumer,
  );
  await assertTarballLockfile(nextConsumer);
  await run("npm", ["run", "build"], nextConsumer);
  process.stdout.write("verified packed Next consumer\n");
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}
