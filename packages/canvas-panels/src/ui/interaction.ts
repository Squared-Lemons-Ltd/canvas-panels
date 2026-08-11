import type { CanvasBreakpoint } from "../core/index.js";

/**
 * The keyboard and announcement grammar the Canvas owns, kept pure so the
 * decisions can be tested without a DOM and reused by any presentation.
 */

export type PanelRegionDirection = "forward" | "backward";

/**
 * The visible Panel region F6 (`forward`) or Shift+F6 (`backward`) should move
 * to from `currentId`.
 *
 * Cycling wraps, and entering from outside the Canvas — or from a region the
 * presentation has since hidden — lands on the end nearest the direction of
 * travel. Only visible regions participate: a retained but hidden Panel is not
 * somewhere a keyboard user should be able to land.
 */
export function cyclePanelRegion(
  visiblePanelIds: readonly string[],
  currentId: string | null,
  direction: PanelRegionDirection,
): string | null {
  if (visiblePanelIds.length === 0) return null;
  const current = currentId === null ? -1 : visiblePanelIds.indexOf(currentId);
  if (current < 0) {
    return (
      (direction === "forward" ? visiblePanelIds[0] : visiblePanelIds.at(-1)) ??
      null
    );
  }
  const step = direction === "forward" ? 1 : -1;
  const next =
    (current + step + visiblePanelIds.length) % visiblePanelIds.length;
  return visiblePanelIds[next] ?? null;
}

export type SizingCommand =
  | "increase"
  | "decrease"
  | "increase-coarse"
  | "decrease-coarse"
  | "minimum"
  | "maximum"
  | "reset"
  /** A pointer drag, expressed as the size it is asking for. */
  | Readonly<{ to: number }>;

/**
 * The sizing command a key press on a Panel separator means, or `null` when the
 * separator does not own that key.
 *
 * Separators sit between horizontally arranged Panels, so only the horizontal
 * arrows resize. Everything else — including Tab and F6 — is deliberately left
 * to the application and to the Canvas's own region cycling.
 */
export function sizingCommandForKey(
  event: Readonly<{ key: string; shiftKey?: boolean }>,
): SizingCommand | null {
  switch (event.key) {
    case "ArrowRight":
      return event.shiftKey ? "increase-coarse" : "increase";
    case "ArrowLeft":
      return event.shiftKey ? "decrease-coarse" : "decrease";
    case "Home":
      return "minimum";
    case "End":
      return "maximum";
    case "Enter":
      return "reset";
    default:
      return null;
  }
}

export type PanelSizing = Readonly<{
  size: number;
  min: number;
  max: number;
  step: number;
  coarseStep: number;
  /** The size a reset returns to. */
  initial: number;
  command: SizingCommand;
}>;

export type PanelSizingOutcome = Readonly<{
  size: number;
  /**
   * Whether the size actually moved. A separator already at its bound must not
   * announce a result, or holding an arrow key would flood the live region.
   */
  changed: boolean;
}>;

/**
 * The one sizing engine behind both pointer and keyboard resizing, so the two
 * cannot drift apart on clamping or on what counts as a change.
 */
export function resizePanel(sizing: PanelSizing): PanelSizingOutcome {
  const { size, min, max, step, coarseStep, initial, command } = sizing;
  const requested = (() => {
    if (typeof command === "object") return command.to;
    switch (command) {
      case "increase":
        return size + step;
      case "decrease":
        return size - step;
      case "increase-coarse":
        return size + coarseStep;
      case "decrease-coarse":
        return size - coarseStep;
      case "minimum":
        return min;
      case "maximum":
        return max;
      case "reset":
        return initial;
    }
  })();
  const next = Math.min(max, Math.max(min, requested));
  return Object.freeze({ size: next, changed: next !== size });
}

export type CanvasAnnouncementPanel = Readonly<{
  instanceId: string;
  title: string;
}>;

export type CanvasAnnouncementState = Readonly<{
  panels: readonly CanvasAnnouncementPanel[];
  activePanelId: string;
  breakpoint: CanvasBreakpoint;
  visiblePanelIds: readonly string[];
}>;

export type CanvasAnnouncementTemplates = Readonly<{
  opened: (values: {
    title: string;
    position: number;
    total: number;
  }) => string;
  closed: (values: {
    title: string;
    activeTitle: string;
    total: number;
  }) => string;
  replaced: (values: {
    title: string;
    replacedTitle: string;
    position: number;
    total: number;
  }) => string;
  presentation: (values: {
    breakpoint: CanvasBreakpoint;
    visible: number;
    total: number;
  }) => string;
  /** Announced once a resize settles, never while it is still moving. */
  resized: (values: { title: string; size: number }) => string;
  /** The accessible name of the handle that resizes a Panel. */
  resizeLabel: (values: { title: string }) => string;
}>;

const breakpointNames: Readonly<Record<CanvasBreakpoint, string>> =
  Object.freeze({
    desktop: "Desktop",
    tablet: "Tablet",
    mobile: "Mobile",
  });

/**
 * The package's English announcements. Spread and override any member to
 * localize; every value the sentence needs is passed in rather than
 * interpolated here, so a translation can reorder freely.
 */
export const canvasAnnouncementTemplates: CanvasAnnouncementTemplates =
  Object.freeze({
    opened: ({ title, position, total }) =>
      `${title} opened. Panel ${position} of ${total}.`,
    closed: ({ title, activeTitle, total }) =>
      `${title} closed. Showing ${activeTitle}. Panel ${total} of ${total}.`,
    replaced: ({ title, replacedTitle, position, total }) =>
      `${title} opened, replacing ${replacedTitle}. Panel ${position} of ${total}.`,
    presentation: ({ breakpoint, visible, total }) =>
      `${breakpointNames[breakpoint]} layout. Showing ${visible} of ${total} panels.`,
    resized: ({ title, size }) => `${title} resized to ${size} pixels.`,
    resizeLabel: ({ title }) => `Resize ${title}`,
  });

export type PanelSizingBounds = Readonly<{
  min: number;
  max: number;
  step: number;
  coarseStep: number;
}>;

/**
 * The sizes a Panel may be dragged or stepped between. Overridable per
 * Workspace, because how narrow a Panel may usefully get is a property of what
 * an application puts inside it.
 */
export const canvasPanelSizingBounds: PanelSizingBounds = Object.freeze({
  min: 240,
  max: 960,
  step: 16,
  coarseStep: 64,
});

/**
 * What to announce about the move from `previous` to `next`, or `null` when
 * nothing structural happened.
 *
 * Activation, focus, and sizing are deliberately silent here: they are either
 * already conveyed by focus moving or announced by the separator itself, and
 * repeating them is what makes a live region unbearable.
 */
export function describeStructuralChange(
  previous: CanvasAnnouncementState | null,
  next: CanvasAnnouncementState,
  templates: CanvasAnnouncementTemplates = canvasAnnouncementTemplates,
): string | null {
  // The first render describes a Canvas the user has not yet moved through.
  if (!previous) return null;

  const total = next.panels.length;
  const before = previous.panels;
  const after = next.panels;

  let shared = 0;
  while (
    shared < before.length &&
    shared < after.length &&
    before[shared]?.instanceId === after[shared]?.instanceId
  ) {
    shared += 1;
  }
  const removed = before.slice(shared);
  const opened = after.slice(shared);

  if (opened.length > 0) {
    const deepest = opened.at(-1) as CanvasAnnouncementPanel;
    const position = after.indexOf(deepest) + 1;
    // Panels leaving and arriving in the same move is Branch Replacement, and
    // saying only what arrived would hide that something was discarded.
    return removed.length > 0
      ? templates.replaced({
          title: deepest.title,
          replacedTitle: (removed[0] as CanvasAnnouncementPanel).title,
          position,
          total,
        })
      : templates.opened({ title: deepest.title, position, total });
  }

  if (removed.length > 0) {
    const active =
      after.find(({ instanceId }) => instanceId === next.activePanelId) ??
      after.at(-1);
    return templates.closed({
      title: (removed[0] as CanvasAnnouncementPanel).title,
      activeTitle: active?.title ?? "",
      total,
    });
  }

  // The stack is the same, so the only structural change left is how much of
  // it the presentation is showing.
  if (
    previous.breakpoint !== next.breakpoint ||
    previous.visiblePanelIds.length !== next.visiblePanelIds.length
  ) {
    return templates.presentation({
      breakpoint: next.breakpoint,
      visible: next.visiblePanelIds.length,
      total,
    });
  }

  return null;
}
