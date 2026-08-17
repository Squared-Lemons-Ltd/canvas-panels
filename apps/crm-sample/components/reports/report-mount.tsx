"use client";

/* ------------------------------------------------------------------------ *
 *  The reading room Canvas Workspace.
 *
 *  The fourth URL-owning Workspace in this application, claiming `report`. It
 *  is also the only mount that hands the Engine's own commands down: a saved
 *  view calls `restoreStack`, which the Bound Canvas Module deliberately does
 *  not expose, because moving the whole stack is an Engine concern rather than
 *  a Panel's.
 * ------------------------------------------------------------------------ */

import { createPanelEngine } from "@squared-lemons-ltd/canvas-panels/core";
import {
  type CanvasNavigationState,
  seedCanvasNavigation,
  useCanvasNavigationSync,
} from "@squared-lemons-ltd/canvas-panels/next";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { ReportCanvas, ReportLegend, RestoreProvider } from "./report-canvas";
import {
  reportPanels,
  reportParameterName,
  reportsRoot,
  type viewReferences,
} from "./report-panels";

const recoverySentences: Readonly<Record<string, string>> = Object.freeze({
  aborted: "Meridian stopped opening that link before it finished.",
  denied: "Part of that link points at an analysis you cannot see.",
  "invalid-document": "That link is not a Meridian reading-room address.",
  "loader-failed": "Part of that link could not be read.",
  unavailable: "Part of that link names an analysis that no longer exists.",
});

export function ReportMount({
  initialState,
}: Readonly<{ initialState: CanvasNavigationState }>) {
  const [engine] = useState(() => {
    const created = createPanelEngine({
      root: reportsRoot,
      panels: reportPanels,
    });
    seedCanvasNavigation(created, initialState);
    return created;
  });
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const restore = useCallback(
    (references: ReturnType<typeof viewReferences>) =>
      engine.restoreStack({ references }),
    [engine],
  );

  useCanvasNavigationSync({
    engine,
    initialState,
    parameterName: reportParameterName,
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
    onOwnership: (ownership) => {
      if (ownership === "url") return;
      toast.warning("The reading room is navigating in memory", {
        description:
          "Another Workspace already owns this History Namespace, so the address bar will not follow it.",
      });
    },
  });

  return (
    <ReportCanvas.Provider engine={engine}>
      <RestoreProvider restore={restore}>
        <section
          aria-label="Reading room canvas"
          className="flex h-[calc(100svh-14.5rem)] min-h-[32rem] flex-col overflow-hidden rounded-xl border border-border bg-card"
          data-meridian-reports="mounted"
          id="report-mount"
        >
          <ReportCanvas.Workspace label="Meridian reading room" />
          <ReportLegend />
        </section>
      </RestoreProvider>
    </ReportCanvas.Provider>
  );
}
