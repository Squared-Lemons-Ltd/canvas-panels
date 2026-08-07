import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import assert from "node:assert/strict";

const execFileAsync = promisify(execFile);
const root = new URL("..", import.meta.url);

test("the packed package installs into clean React and Next consumers", async () => {
  const { stderr, stdout } = await execFileAsync(
    process.execPath,
    ["scripts/verify-package.mjs"],
    {
      cwd: root,
      maxBuffer: 10 * 1024 * 1024,
      timeout: 5 * 60 * 1000,
    },
  );

  assert.equal(stderr, "");
  assert.match(
    stdout,
    /verified packed React Root-to-Class-to-Learner consumer/,
  );
  assert.match(stdout, /verified packed Next consumer/);
});
