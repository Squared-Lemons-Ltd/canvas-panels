import { readFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

const specifierPatterns = [
  /(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g,
  /import\s*\(\s*["']([^"']+)["']\s*\)/g,
];

/**
 * Every static and dynamic specifier a module names, whether it is source or
 * built output. Both the boundary checker and the extension-isolation checks
 * read a module graph, so they read it the same way.
 */
export function importSpecifiers(source) {
  const specifiers = [];

  for (const pattern of specifierPatterns) {
    for (const [, specifier] of source.matchAll(pattern)) {
      specifiers.push(specifier);
    }
  }

  return specifiers;
}

/** The built entry points a consumer gets without importing an extension. */
export const baseEntryPoints = Object.freeze([
  "core/index.js",
  "react/index.js",
  "ui/index.js",
  "next/index.js",
  "next/server.js",
  "overlay/index.js",
  "testing/index.js",
]);

/**
 * Walks the built ESM graph from one entry point. What a base entry point can
 * reach is what a consumer that only imports it pays for: ESM evaluates
 * nothing it does not import, so an entry point that cannot reach an optional
 * extension neither initializes nor bundles it.
 *
 * @param {string} entry absolute path to a built `.js` entry point
 * @returns {Promise<{ modules: Set<string>, external: Set<string> }>} the
 *   package-internal modules reached, and the bare specifiers left to the host
 */
export async function reachableModules(entry) {
  const modules = new Set();
  const external = new Set();
  const queue = [resolve(entry)];

  while (queue.length > 0) {
    const file = queue.pop();
    if (modules.has(file)) continue;
    modules.add(file);

    const source = await readFile(file, "utf8");
    for (const specifier of importSpecifiers(source)) {
      if (specifier.startsWith(".")) {
        queue.push(resolve(dirname(file), specifier));
      } else {
        external.add(specifier);
      }
    }
  }

  return { external, modules };
}

/**
 * The reached modules as subpaths of the distribution directory, so an
 * assertion reads the way the package does.
 */
export function distributionSubpaths(modules, distribution) {
  return [...modules]
    .map((module) => relative(distribution, module).split(sep).join("/"))
    .sort();
}

/**
 * The extension subpaths each base entry point drags in. An empty result for
 * every entry is the isolation guarantee.
 *
 * @returns {Promise<Map<string, readonly string[]>>} keyed by base entry point
 */
export async function extensionsReachedFromBaseEntryPoints(distribution) {
  const reached = new Map();

  for (const entry of baseEntryPoints) {
    const { modules } = await reachableModules(join(distribution, entry));
    reached.set(
      entry,
      distributionSubpaths(modules, distribution).filter((subpath) =>
        subpath.startsWith("extensions/"),
      ),
    );
  }

  return reached;
}
