"use client";

/* ------------------------------------------------------------------------ *
 *  The pipeline Canvas Workspace.
 *
 *  Everything the Canvas needs to exist before it paints happens here: the
 *  Panel Engine is created and seeded from server-decoded navigation state in
 *  the same initializer, so a deep link renders its whole stack in one pass
 *  instead of flashing the Root Panel and then filling in.
 * ------------------------------------------------------------------------ */

import {
  createPanelEngine,
  type PanelEngineSnapshot,
} from "@squaredlemons/canvas-panels/core";
import {
  createResourceExchange,
  ResourceExchangeProvider,
} from "@squaredlemons/canvas-panels/extensions/resources";
import {
  type CanvasNavigationState,
  seedCanvasNavigation,
  useCanvasNavigationSync,
} from "@squaredlemons/canvas-panels/next";
import { usePathname, useSearchParams } from "next/navigation";
import type { RefObject } from "react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { pipelinePanels, pipelineRoot, referenceFor } from "./panels";
import { PipelineCanvas } from "./pipeline-canvas";
import { registerPipelineNavigator } from "./pipeline-navigator";

/**
 * One Resource Exchange for the pipeline. Every Panel showing a deal, an
 * account or a person subscribes to it, and it is the only route by which one
 * of them learns that another has changed something.
 */
const pipelineExchange = createResourceExchange({
  onSubscriberError: (error) => {
    console.error("A pipeline Panel failed to handle an invalidation", error);
  },
});

const recoverySentences: Readonly<Record<string, string>> = Object.freeze({
  aborted: "Meridian stopped opening that link before it finished.",
  denied: "Part of that link points at something you cannot see.",
  "invalid-document": "That link is not a Meridian pipeline address.",
  "loader-failed": "Part of that link could not be read.",
  unavailable: "Part of that link points at a record that no longer exists.",
});

/** The part of a Panel Engine this file watches, and nothing more. */
type WatchableEngine = Readonly<{
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => PanelEngineSnapshot;
}>;

/**
 * Keeps the Active Panel inside the Canvas's own horizontal scroll.
 *
 * The Canvas scrolls sideways by design, and opening a Panel beyond the right
 * edge otherwise leaves the reader looking at exactly where they already were.
 * The package moves focus with `preventScroll` and offers no way to ask for the
 * Active Panel's element, so this has to find it in the DOM itself.
 *
 * It finds it by *position in the stack*, not by `data-canvas-panel-id`.
 * Instance ids are minted from a counter that starts afresh in every process,
 * so on a server-rendered Canvas the attribute in the DOM is whatever the
 * server's engine happened to be called and never matches the client's. Panel
 * order is the one thing both renders agree on.
 *
 * It scrolls the Canvas and nothing else. `scrollIntoView` would have been
 * shorter, but it walks every scrollable ancestor, so a Canvas taller than the
 * window would drag the whole page on the first paint.
 *
 * It also waits. The Canvas animates `flex-basis` when a Panel opens, so a
 * measurement taken in the effect that observed the change measures a Panel
 * part-way through growing — and a smooth scroll started against a layout that
 * is still moving simply does not arrive. The wait is read from the Canvas's
 * own transition duration rather than guessed, so a reduced-motion reader, for
 * whom the package forces the duration to zero, waits a frame and no longer.
 */
function useActivePanelInView(
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
        // Deliberately not `smooth`. A smooth programmatic scroll is silently
        // dropped in more environments than it works in — including an
        // automated Chrome, which is where this was caught — and a scroll that
        // sometimes does nothing is worse than one that always arrives. The
        // Panel has just spent the transition above growing into place, so
        // landing at the end of it reads as one movement either way.
        canvas.scrollBy({ behavior: "auto", left: delta });
      },
      (Number.isFinite(settling) ? settling : 0) + 30,
    );
    return () => window.clearTimeout(timer);
  }, [container, index]);
}

export function CanvasMount({
  initialState,
}: Readonly<{ initialState: CanvasNavigationState }>) {
  const container = useRef<HTMLElement>(null);
  const [engine] = useState(() => {
    const created = createPanelEngine({
      root: pipelineRoot,
      panels: pipelinePanels,
    });
    seedCanvasNavigation(created, initialState);
    return created;
  });
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useActivePanelInView(container, engine);

  // The command palette lives outside this Provider, so it is handed the one
  // way into this Workspace rather than reaching for it. Every record opens
  // from the Root Panel: a jump is a fresh line of enquiry, not a step deeper
  // into wherever the reader happened to be.
  useEffect(
    () =>
      registerPipelineNavigator({
        open: (record) => {
          const root = engine.getSnapshot().panels[0];
          if (!root) return;
          engine.open({
            originId: root.instanceId,
            panel: referenceFor(record),
          });
        },
      }),
    [engine],
  );

  // No router: the Canvas writes through the History API so its own entry
  // metadata survives Next's rewriting of `history.state`.
  useCanvasNavigationSync({
    engine,
    initialState,
    location: {
      pathname,
      search: searchParams.toString(),
      // The App Router never sees the fragment. It is only read inside effects,
      // so it cannot desync the server and client renders.
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
      toast.warning("The browser and the Canvas are out of step", {
        description: "Use the Panels themselves to carry on from here.",
      });
    },
  });

  return (
    <ResourceExchangeProvider exchange={pipelineExchange}>
      <PipelineCanvas.Provider engine={engine}>
        <section
          aria-label="Pipeline canvas"
          className="flex h-[calc(100svh-13.5rem)] min-h-[32rem] flex-col overflow-hidden rounded-xl border border-border bg-card"
          data-meridian-canvas="mounted"
          id="canvas-mount"
          ref={container}
        >
          <PipelineCanvas.Workspace label="Meridian pipeline" />
        </section>
      </PipelineCanvas.Provider>
    </ResourceExchangeProvider>
  );
}
