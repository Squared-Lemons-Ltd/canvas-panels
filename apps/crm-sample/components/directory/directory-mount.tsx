"use client";

/* ------------------------------------------------------------------------ *
 *  The contact directory Canvas Workspace.
 *
 *  The third URL-owning Workspace in this application — `people`, alongside the
 *  Pipeline's `canvas` and the account book's `book`. Its chrome is a single
 *  line naming how many Workspaces are currently on the page, because that is
 *  the fact this section exists to make visible: two of them are, and one is
 *  inside a Panel of the other.
 * ------------------------------------------------------------------------ */

import { createPanelEngine } from "@squaredlemons/canvas-panels/core";
import {
  type CanvasNavigationState,
  seedCanvasNavigation,
  useCanvasNavigationSync,
} from "@squaredlemons/canvas-panels/next";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { DirectoryCanvas } from "./directory-canvas";
import {
  directoryPanels,
  directoryParameterName,
  directoryRoot,
} from "./directory-panels";

const recoverySentences: Readonly<Record<string, string>> = Object.freeze({
  aborted: "Meridian stopped opening that link before it finished.",
  denied: "Part of that link points at somebody you cannot see.",
  "invalid-document": "That link is not a Meridian directory address.",
  "loader-failed": "Part of that link could not be read.",
  unavailable: "Part of that link points at somebody who has left.",
});

function Legend() {
  const stack = DirectoryCanvas.useStack();
  const dossiers = stack.length - 1;

  return (
    <div
      className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-1 border-t border-border bg-muted/30 px-4 py-2.5 text-xs"
      data-meridian-inspector=""
    >
      <span className="font-medium">
        {1 + dossiers} Workspace{dossiers === 0 ? "" : "s"} on this page
      </span>
      <span className="text-muted-foreground">
        One outer Canvas owning <code>?people=</code>, and one more inside every
        open dossier owning nothing. Walk a network and the address bar stays
        where it is; close the dossier and that Workspace goes with it.
      </span>
    </div>
  );
}

export function DirectoryMount({
  initialState,
}: Readonly<{ initialState: CanvasNavigationState }>) {
  const [engine] = useState(() => {
    const created = createPanelEngine({
      root: directoryRoot,
      panels: directoryPanels,
    });
    seedCanvasNavigation(created, initialState);
    return created;
  });
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useCanvasNavigationSync({
    engine,
    initialState,
    parameterName: directoryParameterName,
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
      toast.warning("The directory is navigating in memory", {
        description:
          "Another Workspace already owns this History Namespace, so the address bar will not follow it.",
      });
    },
  });

  return (
    <DirectoryCanvas.Provider engine={engine}>
      <section
        aria-label="Contact directory canvas"
        className="flex h-[calc(100svh-14.5rem)] min-h-[32rem] flex-col overflow-hidden rounded-xl border border-border bg-card"
        data-meridian-directory="mounted"
        id="directory-mount"
      >
        <DirectoryCanvas.Workspace label="Meridian contact directory" />
        <Legend />
      </section>
    </DirectoryCanvas.Provider>
  );
}
