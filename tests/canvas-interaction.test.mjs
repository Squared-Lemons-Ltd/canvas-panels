import assert from "node:assert/strict";
import test from "node:test";

import {
  canvasAnnouncementTemplates,
  cyclePanelRegion,
  describeStructuralChange,
  resizePanel,
  sizingCommandForKey,
} from "../packages/canvas-panels/dist/ui/interaction.js";

const regions = ["a", "b", "c"];

test("F6 moves to the next visible region", () => {
  assert.equal(cyclePanelRegion(regions, "a", "forward"), "b");
  assert.equal(cyclePanelRegion(regions, "b", "forward"), "c");
});

test("Shift+F6 moves to the previous visible region", () => {
  assert.equal(cyclePanelRegion(regions, "c", "backward"), "b");
  assert.equal(cyclePanelRegion(regions, "b", "backward"), "a");
});

test("cycling wraps at both ends", () => {
  assert.equal(cyclePanelRegion(regions, "c", "forward"), "a");
  assert.equal(cyclePanelRegion(regions, "a", "backward"), "c");
});

test("cycling from outside the Canvas enters at the nearest end", () => {
  assert.equal(cyclePanelRegion(regions, null, "forward"), "a");
  assert.equal(cyclePanelRegion(regions, null, "backward"), "c");
  // A region that is no longer visible is treated the same as no region.
  assert.equal(cyclePanelRegion(regions, "gone", "forward"), "a");
});

test("a single visible region cycles to itself", () => {
  assert.equal(cyclePanelRegion(["only"], "only", "forward"), "only");
  assert.equal(cyclePanelRegion(["only"], "only", "backward"), "only");
});

test("cycling with no visible regions reports nothing", () => {
  assert.equal(cyclePanelRegion([], null, "forward"), null);
  assert.equal(cyclePanelRegion([], "a", "backward"), null);
});

test("Arrow keys resize by one step and Shift+Arrow by a coarse step", () => {
  assert.deepEqual(sizingCommandForKey({ key: "ArrowRight" }), "increase");
  assert.deepEqual(sizingCommandForKey({ key: "ArrowLeft" }), "decrease");
  assert.deepEqual(
    sizingCommandForKey({ key: "ArrowRight", shiftKey: true }),
    "increase-coarse",
  );
  assert.deepEqual(
    sizingCommandForKey({ key: "ArrowLeft", shiftKey: true }),
    "decrease-coarse",
  );
});

test("Home, End, and Enter map to minimum, maximum, and reset", () => {
  assert.equal(sizingCommandForKey({ key: "Home" }), "minimum");
  assert.equal(sizingCommandForKey({ key: "End" }), "maximum");
  assert.equal(sizingCommandForKey({ key: "Enter" }), "reset");
});

test("keys the separator does not own are left to the application", () => {
  for (const key of ["ArrowUp", "ArrowDown", "Tab", "a", "F6", "Escape"]) {
    assert.equal(sizingCommandForKey({ key }), null);
  }
});

const sizing = {
  size: 300,
  min: 200,
  max: 600,
  step: 16,
  coarseStep: 64,
  initial: 320,
};

test("resizing steps by the declared amounts", () => {
  assert.deepEqual(resizePanel({ ...sizing, command: "increase" }), {
    size: 316,
    changed: true,
  });
  assert.deepEqual(resizePanel({ ...sizing, command: "decrease" }), {
    size: 284,
    changed: true,
  });
  assert.deepEqual(resizePanel({ ...sizing, command: "increase-coarse" }), {
    size: 364,
    changed: true,
  });
  assert.deepEqual(resizePanel({ ...sizing, command: "decrease-coarse" }), {
    size: 236,
    changed: true,
  });
});

test("resizing clamps to the declared bounds rather than overshooting", () => {
  assert.deepEqual(
    resizePanel({ ...sizing, size: 590, command: "increase-coarse" }),
    { size: 600, changed: true },
  );
  assert.deepEqual(
    resizePanel({ ...sizing, size: 210, command: "decrease-coarse" }),
    { size: 200, changed: true },
  );
});

test("resizing at a bound reports no change so nothing is announced", () => {
  assert.deepEqual(resizePanel({ ...sizing, size: 600, command: "increase" }), {
    size: 600,
    changed: false,
  });
  assert.deepEqual(resizePanel({ ...sizing, size: 200, command: "decrease" }), {
    size: 200,
    changed: false,
  });
});

test("Home, End, and reset go to the bounds and the initial size", () => {
  assert.deepEqual(resizePanel({ ...sizing, command: "minimum" }), {
    size: 200,
    changed: true,
  });
  assert.deepEqual(resizePanel({ ...sizing, command: "maximum" }), {
    size: 600,
    changed: true,
  });
  assert.deepEqual(resizePanel({ ...sizing, command: "reset" }), {
    size: 320,
    changed: true,
  });
});

test("a pointer drag runs through the same engine and clamps identically", () => {
  assert.deepEqual(resizePanel({ ...sizing, command: { to: 450 } }), {
    size: 450,
    changed: true,
  });
  assert.deepEqual(resizePanel({ ...sizing, command: { to: 5000 } }), {
    size: 600,
    changed: true,
  });
  assert.deepEqual(resizePanel({ ...sizing, command: { to: 0 } }), {
    size: 200,
    changed: true,
  });
});

// Identity follows the Panel, not its position: Branch Replacement gives the
// arriving Panel a new instance, which is what distinguishes it from a retitle.
function state(
  titles,
  { active = titles.length - 1, breakpoint = "desktop", visible } = {},
) {
  const panels = titles.map((title) => ({
    instanceId: `panel-${title}`,
    title,
  }));
  return {
    panels,
    activePanelId: `panel-${titles[active]}`,
    breakpoint,
    visiblePanelIds:
      visible?.map((title) => `panel-${title}`) ??
      panels.map(({ instanceId }) => instanceId),
  };
}

test("opening a Panel announces it with its position in the stack", () => {
  const message = describeStructuralChange(
    state(["Classes"]),
    state(["Classes", "Class A"]),
  );

  assert.equal(message, "Class A opened. Panel 2 of 2.");
});

test("closing a Panel announces what is showing afterwards", () => {
  const message = describeStructuralChange(
    state(["Classes", "Class A"]),
    state(["Classes"]),
  );

  assert.equal(message, "Class A closed. Showing Classes. Panel 1 of 1.");
});

test("Branch Replacement announces what replaced what", () => {
  const message = describeStructuralChange(
    state(["Classes", "Class A"]),
    state(["Classes", "Class B"]),
  );

  assert.equal(message, "Class B opened, replacing Class A. Panel 2 of 2.");
});

test("a breakpoint change announces the new presentation", () => {
  const message = describeStructuralChange(
    state(["Classes", "Class A"]),
    state(["Classes", "Class A"], {
      breakpoint: "mobile",
      visible: ["Class A"],
    }),
  );

  assert.equal(message, "Mobile layout. Showing 1 of 2 panels.");
});

test("activation alone is not a structural change and announces nothing", () => {
  const message = describeStructuralChange(
    state(["Classes", "Class A"], { active: 1 }),
    state(["Classes", "Class A"], { active: 0 }),
  );

  assert.equal(message, null);
});

test("an unchanged Canvas announces nothing", () => {
  const unchanged = state(["Classes", "Class A"]);

  assert.equal(describeStructuralChange(unchanged, unchanged), null);
});

test("the first render announces nothing", () => {
  assert.equal(describeStructuralChange(null, state(["Classes"])), null);
});

test("announcement templates are replaceable for localization", () => {
  const message = describeStructuralChange(
    state(["Classes"]),
    state(["Classes", "Class A"]),
    {
      ...canvasAnnouncementTemplates,
      opened: ({ title, position, total }) =>
        `${title} ouvert. Panneau ${position} sur ${total}.`,
    },
  );

  assert.equal(message, "Class A ouvert. Panneau 2 sur 2.");
});
