import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import test from "node:test";
import { promisify } from "node:util";

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
  assert.match(
    stdout,
    /verified packed base entry points leave the optional subpaths optional/,
  );
  assert.match(stdout, /verified packed editor extension consumer/);
  assert.match(stdout, /verified packed overlay Workspace consumer/);
  assert.match(stdout, /verified packed Next consumer/);
});
