import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import assert from "node:assert/strict";

const execFileAsync = promisify(execFile);
const root = new URL("..", import.meta.url);

test("the package source respects the declared layer direction", async () => {
  const { stdout } = await execFileAsync(
    process.execPath,
    ["scripts/check-boundaries.mjs"],
    {
      cwd: root,
    },
  );

  assert.match(stdout, /verified package dependency boundaries/);
});

test("the boundary checker rejects a core import from React", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "canvas-boundary-"));

  try {
    await mkdir(join(fixture, "core"), { recursive: true });
    await mkdir(join(fixture, "react"), { recursive: true });
    await writeFile(
      join(fixture, "core/index.ts"),
      'import "../react/index.js";\n',
    );
    await writeFile(join(fixture, "react/index.ts"), "export {};\n");

    await assert.rejects(
      execFileAsync(
        process.execPath,
        ["scripts/check-boundaries.mjs", fixture],
        {
          cwd: root,
        },
      ),
      /core cannot import react/,
    );
  } finally {
    await rm(fixture, { force: true, recursive: true });
  }
});
