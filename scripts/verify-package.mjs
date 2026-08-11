import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { extensionsReachedFromBaseEntryPoints } from "./module-graph.mjs";

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
 * A consumer that never imports an extension must never pay for one, so the
 * check runs against the installed tarball rather than the built source.
 */
async function assertInstalledExtensionsStayOptional(consumerDirectory) {
  const reached = await extensionsReachedFromBaseEntryPoints(
    join(consumerDirectory, "node_modules/@squaredlemons/canvas-panels/dist"),
  );

  for (const [entry, extensions] of reached) {
    if (extensions.length > 0) {
      throw new Error(
        `packed ${entry} initializes an optional extension: ${extensions.join(", ")}`,
      );
    }
  }
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
  });
  await writeFile(
    join(reactConsumer, "probe.mjs"),
    `import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createPanelEngine, definePanel, defineRootPanel } from "@squaredlemons/canvas-panels/core";
import { createPanelEditor, editorGuardMessages, resolveEditorGuard } from "@squaredlemons/canvas-panels/extensions/editor";
import { createPanelResource, createResourceExchange, resolveResourceDeferral } from "@squaredlemons/canvas-panels/extensions/resources";
import { createCanvasModule, defineCanvasContext } from "@squaredlemons/canvas-panels/ui";

await Promise.all([
  import("@squaredlemons/canvas-panels/react"),
  import("@squaredlemons/canvas-panels/overlay"),
  import("@squaredlemons/canvas-panels/testing"),
]);

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
`,
  );
  await run(
    "npm",
    ["install", "--ignore-scripts", "--no-audit", "--no-fund"],
    reactConsumer,
  );
  await assertTarballLockfile(reactConsumer);
  await assertInstalledExtensionsStayOptional(reactConsumer);
  process.stdout.write(
    "verified packed base entry points leave the extensions optional\n",
  );
  const reactResult = await run(process.execPath, ["probe.mjs"], reactConsumer);
  process.stdout.write(reactResult.stdout);

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
