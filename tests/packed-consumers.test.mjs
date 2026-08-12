import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = new URL("..", import.meta.url);

// Packing, installing and building the clean consumers is the slowest gate in
// the repository, so every assertion below reads one run of it.
let verification;
function verifyPackage() {
  verification ??= execFileAsync(
    process.execPath,
    ["scripts/verify-package.mjs"],
    {
      cwd: root,
      maxBuffer: 10 * 1024 * 1024,
      timeout: 8 * 60 * 1000,
    },
  );
  return verification;
}

test("the packed package installs into clean React and Next consumers", async () => {
  const { stderr, stdout } = await verifyPackage();

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
  assert.match(stdout, /verified packed resource extension consumer/);
  assert.match(stdout, /verified packed overlay Workspace consumer/);
  assert.match(stdout, /verified packed testing tools consumer/);
  assert.match(stdout, /verified packed Next consumer/);
  assert.match(
    stdout,
    /verified packed server render hydrates with matching Panel identities/,
  );
});

test("artifact inspection rejects what must never reach a consumer", async () => {
  const { stdout } = await verifyPackage();

  assert.match(stdout, /verified packed artifact carries no secret material/);
  assert.match(stdout, /verified packed consumer resolves a single React/);
  assert.match(
    stdout,
    /verified packed client directives and \d+ barrel-free entry points/,
  );
  assert.match(stdout, /verified packed private deep imports stay unreachable/);
});

test("the packed documentation is complete from the package output alone", async () => {
  const { stdout } = await verifyPackage();

  assert.match(stdout, /verified packed documentation covers/);
});
