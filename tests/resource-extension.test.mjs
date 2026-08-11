import assert from "node:assert/strict";
import test from "node:test";

import {
  createPanelResource,
  createResourceExchange,
  resolveResourceDeferral,
  resourceInvalidationMatches,
  resourceKeyMatches,
} from "../packages/canvas-panels/dist/extensions/resources.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolveDeferred, rejectDeferred) => {
    resolve = resolveDeferred;
    reject = rejectDeferred;
  });
  return { promise, reject, resolve };
}

function recorder() {
  const heard = [];
  return { heard, notify: (received) => heard.push(received) };
}

function invalidation(overrides = {}) {
  return {
    key: "projects/atlas",
    kind: "changed",
    nested: false,
    sequence: 1,
    source: null,
    ...overrides,
  };
}

test("an exact subscription matches only its own Resource Key", () => {
  assert.equal(resourceKeyMatches("projects/atlas", "projects/atlas"), true);
  assert.equal(resourceKeyMatches("projects/atlas", "projects/harbour"), false);
  assert.equal(resourceKeyMatches("projects/atlas", "projects"), false);
  assert.equal(
    resourceKeyMatches("projects/atlas", "projects/atlas/briefs/direction"),
    false,
  );
});

test("a wildcard segment stands for exactly one segment, in any position", () => {
  assert.equal(resourceKeyMatches("projects/*", "projects/atlas"), true);
  assert.equal(resourceKeyMatches("projects/*", "projects/harbour"), true);
  assert.equal(resourceKeyMatches("projects/*", "projects"), false);
  assert.equal(
    resourceKeyMatches("projects/*", "projects/atlas/briefs/direction"),
    false,
  );
  assert.equal(
    resourceKeyMatches(
      "projects/*/briefs/direction",
      "projects/atlas/briefs/direction",
    ),
    true,
  );
  assert.equal(resourceKeyMatches("*", "projects"), true);
});

test("an invalidation reaches the subscriptions its own key matches", () => {
  assert.equal(
    resourceInvalidationMatches("projects/atlas", invalidation()),
    true,
  );
  assert.equal(resourceInvalidationMatches("projects/*", invalidation()), true);
  assert.equal(
    resourceInvalidationMatches("projects/harbour", invalidation()),
    false,
  );
});

// Propagation runs downward only. A parent that changed may or may not mean its
// children changed, and only the application knows — so it says. A child that
// changed never implies anything about its parent, so no flag can make it.
test("a nested invalidation also reaches subscriptions beneath its key", () => {
  const shallow = invalidation();
  const deep = invalidation({ nested: true });

  for (const pattern of [
    "projects/atlas/briefs/direction",
    "projects/atlas/briefs/*",
    "projects/*/briefs/direction",
  ]) {
    assert.equal(
      resourceInvalidationMatches(pattern, shallow),
      false,
      `${pattern} must not hear an unnested change`,
    );
    assert.equal(
      resourceInvalidationMatches(pattern, deep),
      true,
      `${pattern} must hear a nested change`,
    );
  }

  assert.equal(
    resourceInvalidationMatches("projects", deep),
    false,
    "propagation never runs upward",
  );
  assert.equal(
    resourceInvalidationMatches("projects/harbour/briefs/direction", deep),
    false,
  );
});

test("an exchange delivers a published invalidation to the subscriptions that match", () => {
  const exchange = createResourceExchange();
  const project = recorder();
  const otherProject = recorder();
  const anyProject = recorder();
  exchange.subscribe({ keys: ["projects/atlas"], notify: project.notify });
  exchange.subscribe({
    keys: ["projects/harbour"],
    notify: otherProject.notify,
  });
  exchange.subscribe({ keys: ["projects/*"], notify: anyProject.notify });

  const outcome = exchange.publish({
    key: "projects/atlas",
    kind: "changed",
  });

  assert.deepEqual(outcome, {
    invalidation: {
      key: "projects/atlas",
      kind: "changed",
      nested: false,
      sequence: 1,
      source: null,
    },
    notified: 2,
    status: "published",
  });
  assert.deepEqual(project.heard, [outcome.invalidation]);
  assert.deepEqual(anyProject.heard, [outcome.invalidation]);
  assert.deepEqual(otherProject.heard, []);
});

test("a subscription hears one invalidation once however many of its keys match", () => {
  const exchange = createResourceExchange();
  const listener = recorder();
  exchange.subscribe({
    keys: ["projects/atlas", "projects/*", "*/atlas"],
    notify: listener.notify,
  });

  const { notified } = exchange.publish({
    key: "projects/atlas",
    kind: "changed",
  });

  assert.equal(notified, 1);
  assert.equal(listener.heard.length, 1);
});

// Whoever made the change has already applied it. Telling them to re-read it
// would at best waste a round trip and at worst replace what they just typed.
test("a publisher does not hear its own invalidation", () => {
  const exchange = createResourceExchange();
  const author = recorder();
  const reader = recorder();
  const anonymous = recorder();
  exchange.subscribe({
    keys: ["projects/atlas"],
    notify: author.notify,
    source: "panel-1",
  });
  exchange.subscribe({
    keys: ["projects/atlas"],
    notify: reader.notify,
    source: "panel-2",
  });
  exchange.subscribe({ keys: ["projects/atlas"], notify: anonymous.notify });

  exchange.publish({
    key: "projects/atlas",
    kind: "changed",
    source: "panel-1",
  });

  assert.equal(author.heard.length, 0);
  assert.equal(reader.heard.length, 1);
  assert.equal(anonymous.heard.length, 1);
  assert.equal(reader.heard[0].source, "panel-1");
});

test("an unsourced invalidation reaches every matching subscription", () => {
  const exchange = createResourceExchange();
  const author = recorder();
  exchange.subscribe({
    keys: ["projects/atlas"],
    notify: author.notify,
    source: "panel-1",
  });

  exchange.publish({ key: "projects/atlas", kind: "changed" });

  assert.equal(author.heard.length, 1);
});

test("a deleted Resource reaches the same subscriptions as a change", () => {
  const exchange = createResourceExchange();
  const brief = recorder();
  exchange.subscribe({
    keys: ["projects/atlas/briefs/direction"],
    notify: brief.notify,
  });

  exchange.publish({ key: "projects/atlas", kind: "deleted", nested: true });

  assert.deepEqual(brief.heard, [
    {
      key: "projects/atlas",
      kind: "deleted",
      nested: true,
      sequence: 1,
      source: null,
    },
  ]);
});

test("a cancelled subscription stops hearing invalidations", () => {
  const exchange = createResourceExchange();
  const listener = recorder();
  const stop = exchange.subscribe({
    keys: ["projects/atlas"],
    notify: listener.notify,
  });

  exchange.publish({ key: "projects/atlas", kind: "changed" });
  stop();
  const second = exchange.publish({ key: "projects/atlas", kind: "changed" });

  assert.equal(listener.heard.length, 1);
  assert.equal(second.notified, 0);
  assert.equal(second.invalidation.sequence, 2);
});

// Delivery order has to be answerable, because a Panel that reloads on being
// told is publishing again the moment it lands.
test("invalidations published during delivery run in publication order", () => {
  const exchange = createResourceExchange();
  const order = [];
  exchange.subscribe({
    keys: ["projects/atlas"],
    notify: ({ sequence }) => {
      order.push(`project:${sequence}`);
      if (sequence === 1) {
        exchange.publish({
          key: "projects/atlas/briefs/direction",
          kind: "changed",
        });
      }
    },
  });
  exchange.subscribe({
    keys: ["projects/atlas/briefs/direction"],
    notify: ({ sequence }) => order.push(`brief:${sequence}`),
  });
  exchange.subscribe({
    keys: ["projects/*"],
    notify: ({ sequence }) => order.push(`list:${sequence}`),
  });

  exchange.publish({ key: "projects/atlas", kind: "changed" });

  assert.deepEqual(order, ["project:1", "list:1", "brief:2"]);
});

test("a subscription added during delivery hears only what follows", () => {
  const exchange = createResourceExchange();
  const late = recorder();
  exchange.subscribe({
    keys: ["projects/atlas"],
    notify: () => {
      exchange.subscribe({ keys: ["projects/atlas"], notify: late.notify });
    },
  });

  exchange.publish({ key: "projects/atlas", kind: "changed" });
  assert.equal(late.heard.length, 0);

  exchange.publish({ key: "projects/atlas", kind: "changed" });
  assert.equal(late.heard.length, 1);
});

test("a failing subscriber is reported without silencing the rest", () => {
  const reported = [];
  const exchange = createResourceExchange({
    onSubscriberError: (error, invalidation) =>
      reported.push({ error, key: invalidation.key }),
  });
  const failure = new Error("the brief could not be re-read");
  const survivor = recorder();
  exchange.subscribe({
    keys: ["projects/atlas"],
    notify: () => {
      throw failure;
    },
  });
  exchange.subscribe({ keys: ["projects/atlas"], notify: survivor.notify });

  const outcome = exchange.publish({ key: "projects/atlas", kind: "changed" });

  assert.equal(survivor.heard.length, 1);
  assert.equal(outcome.notified, 2);
  assert.deepEqual(reported, [{ error: failure, key: "projects/atlas" }]);
});

const settledDeferral = {
  dirty: false,
  failed: false,
  pending: null,
  reloadable: true,
  reloading: false,
};

test("nothing pending settles a consumer without reading anything", () => {
  assert.equal(resolveResourceDeferral(settledDeferral), "settled");
});

test("a change reaching a consumer with nothing to lose is read straight away", () => {
  assert.equal(
    resolveResourceDeferral({
      ...settledDeferral,
      pending: invalidation(),
    }),
    "reload",
  );
});

// The whole point of the extension: an invalidation must never be the reason a
// human loses what they typed.
test("a change reaching unsaved work is held rather than applied", () => {
  assert.equal(
    resolveResourceDeferral({
      ...settledDeferral,
      dirty: true,
      pending: invalidation(),
    }),
    "hold",
  );
});

test("a deletion is never applied on the consumer's behalf", () => {
  assert.equal(
    resolveResourceDeferral({
      ...settledDeferral,
      pending: invalidation({ kind: "deleted" }),
    }),
    "hold",
  );
});

// Retrying a read that just failed, unasked, as fast as the failures arrive is
// how a refresh becomes a hot loop against a service that is already unhappy.
test("a re-read that failed is not retried on the consumer's behalf", () => {
  assert.equal(
    resolveResourceDeferral({
      ...settledDeferral,
      failed: true,
      pending: invalidation(),
    }),
    "hold",
  );
});

test("a consumer that cannot re-read, or is already re-reading, holds", () => {
  assert.equal(
    resolveResourceDeferral({
      ...settledDeferral,
      pending: invalidation(),
      reloadable: false,
    }),
    "hold",
  );
  assert.equal(
    resolveResourceDeferral({
      ...settledDeferral,
      pending: invalidation(),
      reloading: true,
    }),
    "hold",
  );
});

function panelResource(overrides = {}) {
  const exchange = overrides.exchange ?? createResourceExchange();
  const reads = [];
  const resource = createPanelResource({
    exchange,
    keys: ["projects/atlas"],
    reload: async (received) => {
      reads.push(received);
    },
    ...overrides,
  });
  return { exchange, reads, resource, stop: resource.start() };
}

// React double-invokes an initializer and throws one of the two coordinators
// away. One that had already subscribed would keep re-reading forever.
test("a coordinator hears nothing until it is asked to listen", () => {
  const exchange = createResourceExchange();
  const reads = [];
  const resource = createPanelResource({
    exchange,
    keys: ["projects/atlas"],
    reload: async (received) => reads.push(received),
  });

  exchange.publish({ key: "projects/atlas", kind: "changed" });
  assert.equal(reads.length, 0);
  assert.equal(resource.getState().pending, null);

  resource.start();
  exchange.publish({ key: "projects/atlas", kind: "changed" });
  assert.equal(reads.length, 1);
});

test("a clean consumer re-reads as soon as it is told", () => {
  const { exchange, reads, resource } = panelResource();

  exchange.publish({ key: "projects/atlas", kind: "changed" });

  assert.equal(reads.length, 1);
  assert.equal(reads[0].key, "projects/atlas");
  assert.deepEqual(resource.getState(), {
    deleted: false,
    failure: null,
    pending: null,
    reloading: true,
  });
});

test("a consumer with unsaved work keeps the change pending instead of reading", () => {
  const { exchange, reads, resource } = panelResource({ dirty: true });

  const { invalidation: published } = exchange.publish({
    key: "projects/atlas",
    kind: "changed",
  });

  assert.equal(reads.length, 0);
  assert.equal(resource.getState().pending, published);
});

// This is the deferral criterion: the edit is settled by the Panel's ordinary
// lifecycle — a Guarded Transition Save or Discard, or the human simply
// finishing — and the reload the Panel was holding then happens by itself.
test("a held change is read the moment the consumer reports itself clean again", () => {
  const { exchange, reads, resource } = panelResource({ dirty: true });
  exchange.publish({ key: "projects/atlas", kind: "changed" });
  assert.equal(reads.length, 0);

  resource.update({
    dirty: false,
    exchange,
    keys: ["projects/atlas"],
    reload: async (received) => reads.push(received),
  });

  assert.equal(reads.length, 1);
  assert.equal(resource.getState().pending, null);
});

test("only the newest invalidation is held, and a deletion is reported as one", () => {
  const { exchange, resource } = panelResource({ dirty: true });

  exchange.publish({ key: "projects/atlas", kind: "changed" });
  const { invalidation: removal } = exchange.publish({
    key: "projects/atlas",
    kind: "deleted",
  });

  assert.equal(resource.getState().pending, removal);
  assert.equal(resource.getState().deleted, true);
});

test("a deletion is held even for a consumer with nothing to lose", () => {
  const { exchange, reads, resource } = panelResource();

  exchange.publish({ key: "projects/atlas", kind: "deleted" });

  assert.equal(reads.length, 0);
  assert.equal(resource.getState().deleted, true);
  assert.equal(resource.getState().pending?.kind, "deleted");
});

test("applying a held invalidation reads it over whatever was in the way", async () => {
  const { exchange, reads, resource } = panelResource({ dirty: true });
  const { invalidation: published } = exchange.publish({
    key: "projects/atlas",
    kind: "changed",
  });

  const outcome = await resource.apply();

  assert.deepEqual(outcome, { invalidation: published, status: "applied" });
  assert.equal(reads.length, 1);
  assert.equal(resource.getState().pending, null);
  assert.equal(resource.getState().reloading, false);
});

test("applying nothing is rejected rather than read as an empty success", async () => {
  const { resource } = panelResource();

  assert.deepEqual(await resource.apply(), {
    reason: "nothing-pending",
    status: "rejected",
  });
});

test("a consumer that supplied no re-read holds and reports the request unsupported", async () => {
  const exchange = createResourceExchange();
  const resource = createPanelResource({
    exchange,
    keys: ["projects/atlas"],
  });
  resource.start();

  exchange.publish({ key: "projects/atlas", kind: "changed" });
  assert.equal(resource.getState().pending?.key, "projects/atlas");
  assert.deepEqual(await resource.apply(), {
    reason: "unsupported",
    status: "rejected",
  });
});

test("a failed re-read keeps the invalidation pending for another attempt", async () => {
  const error = new Error("the project could not be re-read");
  let attempts = 0;
  const { exchange, resource } = panelResource({
    dirty: true,
    reload: async () => {
      attempts += 1;
      if (attempts === 1) throw error;
    },
  });
  const { invalidation: published } = exchange.publish({
    key: "projects/atlas",
    kind: "changed",
  });

  assert.deepEqual(await resource.apply(), {
    error,
    invalidation: published,
    status: "failed",
  });
  assert.deepEqual(resource.getState().failure, {
    error,
    invalidation: published,
  });
  assert.equal(resource.getState().pending, published);

  assert.deepEqual(await resource.apply(), {
    invalidation: published,
    status: "applied",
  });
  assert.equal(resource.getState().failure, null);
});

test("dismissing a held invalidation leaves the consumer as it was", () => {
  const { exchange, reads, resource } = panelResource({ dirty: true });
  exchange.publish({ key: "projects/atlas", kind: "deleted" });

  resource.dismiss();

  assert.deepEqual(resource.getState(), {
    deleted: false,
    failure: null,
    pending: null,
    reloading: false,
  });
  assert.equal(reads.length, 0);
});

test("a re-read already running holds the next invalidation until it settles", async () => {
  const pending = deferred();
  const { exchange, reads, resource } = panelResource({
    reload: async (received) => {
      reads.push(received);
      await pending.promise;
    },
  });

  exchange.publish({ key: "projects/atlas", kind: "changed" });
  assert.equal(resource.getState().reloading, true);
  const { invalidation: second } = exchange.publish({
    key: "projects/atlas",
    kind: "changed",
  });
  assert.equal(reads.length, 1);
  assert.equal(resource.getState().pending, second);

  pending.resolve();
  await pending.promise;
  await Promise.resolve();

  assert.equal(reads.length, 2);
  assert.equal(resource.getState().pending, null);
});

test("a consumer publishes under its own source and never hears itself", () => {
  const exchange = createResourceExchange();
  const heard = [];
  const { resource } = panelResource({
    exchange,
    reload: async (received) => heard.push(received),
    source: "panel-1",
  });
  const neighbour = recorder();
  exchange.subscribe({ keys: ["projects/atlas"], notify: neighbour.notify });

  const outcome = resource.publish({ key: "projects/atlas", kind: "changed" });

  assert.equal(outcome.status, "published");
  assert.equal(outcome.invalidation.source, "panel-1");
  assert.equal(heard.length, 0);
  assert.equal(neighbour.heard.length, 1);
});

test("a stopped consumer hears nothing further", () => {
  const { exchange, reads, stop } = panelResource();

  stop();
  exchange.publish({ key: "projects/atlas", kind: "changed" });

  assert.equal(reads.length, 0);
});

// Changing the keys replaces the subscription but leaves the coordinator
// listening, so the stopper handed out at the start must still stop it. A
// React Panel takes its stopper once, on mount, and re-keys on every render.
test("a consumer stopped after re-keying really does stop", () => {
  const { exchange, reads, resource, stop } = panelResource();

  resource.update({
    exchange,
    keys: ["projects/harbour"],
    reload: async (received) => reads.push(received),
  });
  stop();
  exchange.publish({ key: "projects/harbour", kind: "changed" });

  assert.equal(reads.length, 0);
  assert.equal(
    exchange.publish({ key: "projects/harbour", kind: "changed" }).notified,
    0,
  );
});

// A Panel showing several Resources must not have a deletion it is holding
// erased by unrelated news about one of the others.
test("a held deletion is superseded only by news about the same Resource", () => {
  const { exchange, resource } = panelResource({
    dirty: true,
    keys: ["projects/atlas", "people/ada"],
  });

  const { invalidation: removal } = exchange.publish({
    key: "projects/atlas",
    kind: "deleted",
  });
  exchange.publish({ key: "people/ada", kind: "changed" });

  assert.equal(resource.getState().pending, removal);
  assert.equal(resource.getState().deleted, true);

  const { invalidation: recreated } = exchange.publish({
    key: "projects/atlas",
    kind: "changed",
  });

  assert.equal(resource.getState().pending, recreated);
  assert.equal(resource.getState().deleted, false);
});

// `null` is a legitimate rejection value, and a coordinator that reads it as
// success would drop the invalidation it had just failed to apply.
test("a re-read rejecting with null is still a failure", async () => {
  const { exchange, resource } = panelResource({
    dirty: true,
    reload: () => Promise.reject(null),
  });
  const { invalidation: published } = exchange.publish({
    key: "projects/atlas",
    kind: "changed",
  });

  assert.deepEqual(await resource.apply(), {
    error: null,
    invalidation: published,
    status: "failed",
  });
  assert.deepEqual(resource.getState().failure, {
    error: null,
    invalidation: published,
  });
  assert.equal(resource.getState().pending, published);
});

test("changing the subscribed keys moves the consumer's interest", () => {
  const { exchange, reads, resource } = panelResource();

  resource.update({
    exchange,
    keys: ["projects/harbour"],
    reload: async (received) => reads.push(received),
  });
  exchange.publish({ key: "projects/atlas", kind: "changed" });
  assert.equal(reads.length, 0);

  exchange.publish({ key: "projects/harbour", kind: "changed" });
  assert.equal(reads.length, 1);
});

test("subscribers are notified once per settled change and read a stable state", () => {
  const { exchange, resource } = panelResource({ dirty: true });
  let notifications = 0;
  const stop = resource.subscribe(() => {
    notifications += 1;
  });

  const before = resource.getState();
  resource.update({ dirty: true, exchange, keys: ["projects/atlas"] });
  assert.equal(
    resource.getState(),
    before,
    "an unchanged consumer must settle",
  );
  assert.equal(notifications, 0);

  exchange.publish({ key: "projects/atlas", kind: "changed" });
  assert.equal(notifications, 1);

  stop();
  resource.dismiss();
  assert.equal(notifications, 1);
});
