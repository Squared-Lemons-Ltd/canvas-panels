import { readdir, readFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const defaultSourceRoot = fileURLToPath(
  new URL("../packages/canvas-panels/src", import.meta.url),
);
const sourceRoot = resolve(process.argv[2] ?? defaultSourceRoot);

const allowedLayers = new Map([
  ["core", new Set()],
  ["react", new Set(["core"])],
  ["ui", new Set(["core", "react"])],
  ["next", new Set(["core", "react"])],
  ["next-server", new Set(["core"])],
  ["editor", new Set(["core", "react"])],
  ["resources", new Set(["core", "react"])],
  ["overlay", new Set(["core", "react"])],
  ["testing", new Set(["core", "react", "ui", "next", "next-server"])],
]);

async function collectTypeScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTypeScriptFiles(path)));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(path);
    }
  }

  return files;
}

function layerFor(relativePath) {
  const normalized = relativePath.split(sep).join("/");
  if (normalized === "next/server.ts") return "next-server";
  if (normalized.startsWith("next/")) return "next";
  if (
    normalized === "extensions/editor.ts" ||
    normalized.startsWith("extensions/editor/")
  ) {
    return "editor";
  }
  if (
    normalized === "extensions/resources.ts" ||
    normalized.startsWith("extensions/resources/")
  ) {
    return "resources";
  }
  return normalized.split("/")[0];
}

function layerForPackageSubpath(subpath) {
  if (subpath === "next/server") return "next-server";
  if (subpath === "extensions/editor") return "editor";
  if (subpath === "extensions/resources") return "resources";
  return subpath.split("/")[0];
}

function importSpecifiers(source) {
  const specifiers = [];
  const patterns = [
    /(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g,
    /import\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (match[1]) specifiers.push(match[1]);
    }
  }

  return specifiers;
}

const violations = [];
for (const file of await collectTypeScriptFiles(sourceRoot)) {
  const importerPath = relative(sourceRoot, file);
  const importerLayer = layerFor(importerPath);
  const allowed = allowedLayers.get(importerLayer);
  if (!allowed) {
    violations.push(`unknown source layer: ${importerLayer} (${importerPath})`);
    continue;
  }

  const source = await readFile(file, "utf8");
  for (const specifier of importSpecifiers(source)) {
    let importedLayer;
    if (specifier.startsWith("@squaredlemons/canvas-panels/")) {
      importedLayer = layerForPackageSubpath(
        specifier.slice("@squaredlemons/canvas-panels/".length),
      );
    } else {
      if (!specifier.startsWith(".")) continue;

      const importedPath = relative(
        sourceRoot,
        resolve(dirname(file), specifier),
      );
      if (importedPath.startsWith("..")) {
        violations.push(
          `${importerPath} imports outside package source via ${specifier}`,
        );
        continue;
      }

      importedLayer = layerFor(importedPath.replace(/\.js$/, ".ts"));
    }

    if (importedLayer !== importerLayer && !allowed.has(importedLayer)) {
      violations.push(
        `${importerLayer} cannot import ${importedLayer} (${importerPath})`,
      );
    }
  }
}

if (violations.length > 0) {
  throw new Error(
    `Package dependency boundary violations:\n${violations.join("\n")}`,
  );
}

process.stdout.write("verified package dependency boundaries\n");
