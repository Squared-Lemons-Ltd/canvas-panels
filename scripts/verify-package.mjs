import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

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
import { definePanel, defineRootPanel } from "@squaredlemons/canvas-panels/core";
import { createCanvasModule } from "@squaredlemons/canvas-panels/ui";

await Promise.all([
  import("@squaredlemons/canvas-panels/react"),
  import("@squaredlemons/canvas-panels/extensions/editor"),
  import("@squaredlemons/canvas-panels/extensions/resources"),
  import("@squaredlemons/canvas-panels/overlay"),
  import("@squaredlemons/canvas-panels/testing"),
]);

const root = defineRootPanel({ kind: "classes", title: "Classes" });
const student = definePanel({
  kind: "student",
  title: ({ name }) => name,
});
const Canvas = createCanvasModule({
  root,
  panels: [student],
  renderers: {
    classes: () => createElement("p", null, "Class list"),
    student: ({ panel }) => createElement("p", null, "Student record: " + panel.title),
  },
});
const engine = Canvas.createEngine();
const rootId = engine.getSnapshot().panels[0].instanceId;
const childId = engine.open({
  originId: rootId,
  panel: student.reference({ name: "Ada Lovelace" }),
});
const renderCanvas = () => renderToStaticMarkup(
  createElement(
    Canvas.Provider,
    { engine },
    createElement(Canvas.Workspace, { label: "Student records" }),
  ),
);

const openedMarkup = renderCanvas();
if (!openedMarkup.includes('aria-label="Student records"')) throw new Error("missing labelled packed Workspace");
const rootHeadingId = openedMarkup.match(/aria-labelledby="([^"]+)"[^>]*data-panel-kind="classes"/)?.[1];
if (!rootHeadingId || !openedMarkup.includes('id="' + rootHeadingId + '"')) throw new Error("missing labelled packed Root Panel");
if (!openedMarkup.includes('aria-label="Close Ada Lovelace"')) throw new Error("missing accessible packed Child close control");
if (!engine.close(childId)) throw new Error("packed Child Panel did not close");
const closedMarkup = renderCanvas();
if (!closedMarkup.includes("Classes")) throw new Error("packed Root Panel was not retained");
if (closedMarkup.includes("Ada Lovelace")) throw new Error("packed Child Panel remained after close");

const stylesheet = await readFile(new URL(import.meta.resolve("@squaredlemons/canvas-panels/styles.css")), "utf8");
if (!stylesheet.includes("@layer canvas-panels")) throw new Error("missing Canvas stylesheet layer");
console.log("verified packed React Root-to-Child consumer");
`,
  );
  await run(
    "npm",
    ["install", "--ignore-scripts", "--no-audit", "--no-fund"],
    reactConsumer,
  );
  await assertTarballLockfile(reactConsumer);
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
