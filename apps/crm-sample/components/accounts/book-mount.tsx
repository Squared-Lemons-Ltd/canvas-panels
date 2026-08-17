"use client";

/* ------------------------------------------------------------------------ *
 *  The account book Canvas Workspace.
 *
 *  The second URL-owning Workspace in this application. It claims the `book`
 *  parameter rather than the pipeline's `canvas`, which is what lets both exist
 *  without either being demoted to memory — a History Namespace is named by its
 *  Navigation Parameter, and the first Workspace to claim one owns it.
 *
 *  The chrome around it is deliberately not the pipeline's. There is no trail
 *  and no event channel; there is one strip below the Canvas that reads
 *  whatever the Active Panel published as its Context Signal. Which is the
 *  point: the package supplies the Workspace and the Panels, and what an
 *  application puts around them is entirely its own.
 * ------------------------------------------------------------------------ */

import {
  createPanelEngine,
  type PanelEngineSnapshot,
} from "@squaredlemons/canvas-panels/core";
import {
  type CanvasNavigationState,
  seedCanvasNavigation,
  useCanvasNavigationSync,
} from "@squaredlemons/canvas-panels/next";
import {
  canvasAnnouncementTemplates,
  type PanelSizingBounds,
} from "@squaredlemons/canvas-panels/ui";
import { usePathname, useSearchParams } from "next/navigation";
import type { RefObject } from "react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { BookCanvas } from "./book-canvas";
import { bookPanels, bookParameterName, bookRoot } from "./book-panels";

const recoverySentences: Readonly<Record<string, string>> = Object.freeze({
  aborted: "Meridian stopped opening that link before it finished.",
  denied: "Part of that link points at something you cannot see.",
  "invalid-document": "That link is not a Meridian account-book address.",
  "loader-failed": "Part of that link could not be read.",
  unavailable: "Part of that link points at a record that no longer exists.",
});

/**
 * The Canvas talks about columns here, because that is what a reader of this
 * page sees. Every sentence the package announces comes from a replaceable
 * template — the mechanism is there for localisation, and it works just as well
 * for calling the same structure by the name the surface uses.
 */
const bookAnnouncements = Object.freeze({
  ...canvasAnnouncementTemplates,
  opened: ({
    title,
    position,
    total,
  }: {
    title: string;
    position: number;
    total: number;
  }) => `${title} opened. Column ${position} of ${total}.`,
  closed: ({
    title,
    activeTitle,
    total,
  }: {
    title: string;
    activeTitle: string;
    total: number;
  }) => `${title} closed. Showing ${activeTitle}. Column ${total} of ${total}.`,
  replaced: ({
    title,
    replacedTitle,
    position,
    total,
  }: {
    title: string;
    replacedTitle: string;
    position: number;
    total: number;
  }) =>
    `${title} took the place of ${replacedTitle}. Column ${position} of ${total}.`,
  resizeLabel: ({ title }: { title: string }) => `Resize the ${title} column`,
});

/**
 * A column browser holds narrower columns than a trail of records does, and
 * lets none of them grow to the width of a page: these are lists and fact
 * tables, not documents. The bounds are a Workspace-level decision precisely
 * because how narrow a Panel may usefully get is a property of what the
 * application puts inside it.
 */
const bookSizing: PanelSizingBounds = Object.freeze({
  min: 260,
  max: 620,
  step: 20,
  coarseStep: 80,
});

/** The part of a Panel Engine this file watches, and nothing more. */
type WatchableEngine = Readonly<{
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => PanelEngineSnapshot;
}>;

/**
 * Keeps the Active Panel inside the Canvas's own horizontal scroll.
 *
 * The same problem the pipeline has, arrived at from the other direction: a
 * column browser scrolls sideways by design, so a column opened past the right
 * edge leaves the reader looking at exactly where they already were.
 *
 * It finds the column by *position in the stack* rather than by
 * `data-canvas-panel-id`. Instance ids survive hydration, but they are unique
 * only within their own Workspace, and this application mounts three: the
 * pipeline, the command palette overlay, and this. Position needs no caveat.
 *
 * It waits for the Canvas's own transition to settle before measuring, read
 * from the computed style rather than guessed, so a reduced-motion reader — for
 * whom the package forces the duration to zero — waits one frame and no more.
 */
function useActiveColumnInView(
  container: RefObject<HTMLElement | null>,
  engine: WatchableEngine,
): void {
  const snapshot = useSyncExternalStore(
    engine.subscribe,
    engine.getSnapshot,
    engine.getSnapshot,
  );
  const shown = useRef(-1);
  const index = snapshot.panels.findIndex(
    ({ instanceId }) => instanceId === snapshot.activePanelId,
  );
  useEffect(() => {
    if (index < 0 || shown.current === index) return;
    shown.current = index;
    const canvas = container.current?.querySelector<HTMLElement>(
      "[data-canvas-application]",
    );
    const element = canvas?.querySelectorAll<HTMLElement>(
      "[data-canvas-panel]",
    )[index];
    if (!canvas || !element) return;
    const settling =
      Number.parseFloat(getComputedStyle(element).transitionDuration) * 1000;
    const timer = window.setTimeout(
      () => {
        const view = canvas.getBoundingClientRect();
        const panel = element.getBoundingClientRect();
        const delta =
          panel.right > view.right
            ? Math.min(panel.right - view.right, panel.left - view.left)
            : panel.left < view.left
              ? panel.left - view.left
              : 0;
        if (delta === 0) return;
        // Deliberately not `smooth`: a smooth programmatic scroll is silently
        // dropped in more environments than it works in, and a scroll that
        // sometimes does nothing is worse than one that always arrives.
        canvas.scrollBy({ behavior: "auto", left: delta });
      },
      (Number.isFinite(settling) ? settling : 0) + 30,
    );
    return () => window.clearTimeout(timer);
  }, [container, index]);
}

/**
 * The inspector.
 *
 * It knows nothing about deals, accounts or people. It reads one Context
 * Signal — the Active Panel's — and renders whatever that Panel decided to say
 * about itself. Every renderer publishes one; none of them knows this strip
 * exists.
 */
function Inspector() {
  const { signal } = BookCanvas.useContextTarget("active");
  const stack = BookCanvas.useStack();
  const position = stack.findIndex(({ active }) => active) + 1;

  return (
    <div
      className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-2 border-t border-border bg-muted/30 px-4 py-2.5"
      data-meridian-inspector=""
    >
      {signal ? (
        <>
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="shrink-0 rounded-[3px] border border-border bg-background px-1.5 py-px text-[0.625rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
              {signal.what}
            </span>
            <span className="truncate text-sm font-medium">
              {signal.headline}
            </span>
          </span>
          <dl className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs">
            {signal.facts.map(([term, value]) => (
              <div className="flex items-baseline gap-1.5" key={term}>
                <dt className="text-muted-foreground">{term}</dt>
                <dd className="font-medium" data-numeric>
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          <p className="min-w-0 flex-1 basis-full text-xs leading-relaxed text-muted-foreground xl:basis-0">
            {signal.note}
          </p>
        </>
      ) : (
        <p className="flex-1 text-xs text-muted-foreground">
          Every column publishes a Context Signal saying what it is. This strip
          reads the Active one's, and nothing else.
        </p>
      )}
      <span className="shrink-0 text-xs text-muted-foreground" data-numeric>
        Column {Math.max(position, 1)} of {stack.length} · F6 to cycle
      </span>
    </div>
  );
}

export function BookMount({
  initialState,
}: Readonly<{ initialState: CanvasNavigationState }>) {
  const container = useRef<HTMLElement>(null);
  const [engine] = useState(() => {
    const created = createPanelEngine({ root: bookRoot, panels: bookPanels });
    seedCanvasNavigation(created, initialState);
    return created;
  });
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useActiveColumnInView(container, engine);

  useCanvasNavigationSync({
    engine,
    initialState,
    parameterName: bookParameterName,
    location: {
      pathname,
      search: searchParams.toString(),
      hash: typeof window === "undefined" ? "" : window.location.hash,
    },
    onRecovery: (recovery) => {
      toast.warning("Meridian could only open part of that link", {
        description:
          recoverySentences[recovery.reason] ??
          "Part of that link could not be opened.",
      });
    },
    onHistoryFailure: () => {
      toast.warning("The browser and the book are out of step", {
        description: "Use the columns themselves to carry on from here.",
      });
    },
    // Reported rather than assumed. Two URL-owning Workspaces in one
    // application is exactly the arrangement the package refuses when both
    // claim the same namespace, and a demo that quietly navigated in memory
    // would be hiding the one thing worth checking.
    onOwnership: (ownership) => {
      if (ownership === "url") return;
      toast.warning("The book is navigating in memory", {
        description:
          "Another Workspace already owns this History Namespace, so the address bar will not follow these columns.",
      });
    },
  });

  return (
    <BookCanvas.Provider engine={engine}>
      <section
        aria-label="Account book canvas"
        className="flex h-[calc(100svh-14.5rem)] min-h-[32rem] flex-col overflow-hidden rounded-md border border-border bg-card"
        data-meridian-book="mounted"
        id="book-mount"
        ref={container}
      >
        <BookCanvas.Workspace
          announcements={bookAnnouncements}
          label="Meridian account book"
          sizing={bookSizing}
        />
        <Inspector />
      </section>
    </BookCanvas.Provider>
  );
}
