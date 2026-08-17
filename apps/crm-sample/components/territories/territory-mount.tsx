"use client";

/* ------------------------------------------------------------------------ *
 *  The territory Canvas Workspace, and the wire under it.
 *
 *  The strip at the bottom is a reading of the Resource Exchange and nothing
 *  else: every invalidation as it is published, the key it named, whether it
 *  was nested, and how many subscriptions it was addressed to. It publishes
 *  nothing itself and declares no source, because suppressing a listener from
 *  announcements it never makes would look like it did something.
 * ------------------------------------------------------------------------ */

import { createPanelEngine } from "@squared-lemons-ltd/canvas-panels/core";
import {
  createResourceExchange,
  type ResourceInvalidation,
  ResourceExchangeProvider,
  useResourceSubscription,
} from "@squared-lemons-ltd/canvas-panels/extensions/resources";
import {
  type CanvasNavigationState,
  seedCanvasNavigation,
  useCanvasNavigationSync,
} from "@squared-lemons-ltd/canvas-panels/next";
import { ArrowDownIcon, RadioTowerIcon } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { TerritoryCanvas } from "./territory-canvas";
import { depthsBeneath, describeKey, everyResourceKey } from "./territory-keys";
import {
  territoryPanels,
  territoryParameterName,
  territoriesRoot,
} from "./territory-panels";

/**
 * One exchange for this Workspace. A nested Workspace could be given its own,
 * and then nothing it published would leave it — see the Contacts section for
 * what a nested Workspace is.
 */
const territoryExchange = createResourceExchange({
  onSubscriberError: (error) => {
    console.error("A territory Panel failed to handle an invalidation", error);
  },
});

const recoverySentences: Readonly<Record<string, string>> = Object.freeze({
  aborted: "Meridian stopped opening that link before it finished.",
  denied: "Part of that link points at something you cannot see.",
  "invalid-document": "That link is not a Meridian territory address.",
  "loader-failed": "Part of that link could not be read.",
  unavailable: "Part of that link points at a record that no longer exists.",
});

type WireEntry = Readonly<{
  id: number;
  key: string;
  nested: boolean;
  what: string;
  beneath: number;
}>;

const retained = 5;

function Wire() {
  const [entries, setEntries] = useState<readonly WireEntry[]>([]);

  useResourceSubscription({
    keys: everyResourceKey,
    notify: (invalidation: ResourceInvalidation) => {
      setEntries((current) =>
        Object.freeze(
          [
            Object.freeze({
              id: invalidation.sequence,
              key: invalidation.key,
              nested: invalidation.nested,
              what: describeKey(invalidation.key),
              beneath: depthsBeneath(invalidation.key),
            }),
            ...current.filter(({ id }) => id !== invalidation.sequence),
          ].slice(0, retained),
        ),
      );
    },
  });

  const latest = entries[0];

  return (
    <div
      aria-live="off"
      className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-border bg-muted/30 px-4 py-2.5 text-xs"
      data-meridian-inspector=""
    >
      <span className="flex shrink-0 items-center gap-1.5 font-medium">
        <RadioTowerIcon aria-hidden="true" className="size-3.5" />
        Resource Exchange
      </span>
      {latest ? (
        <>
          <code className="min-w-0 truncate font-mono text-[0.6875rem]">
            {latest.key}
          </code>
          <span className="flex items-center gap-1 text-muted-foreground">
            {latest.nested ? (
              <>
                <ArrowDownIcon aria-hidden="true" className="size-3.5" />
                nested — reaching {latest.beneath}{" "}
                {latest.beneath === 1 ? "depth" : "depths"} beneath{" "}
                {latest.what}
              </>
            ) : (
              <>exact — {latest.what} and nothing under it</>
            )}
          </span>
          <span className="text-muted-foreground" data-numeric>
            {entries.length} of the last {retained}
          </span>
        </>
      ) : (
        <span className="text-muted-foreground">
          Nothing published yet. Rename a territory and watch what is told, and
          what is not.
        </span>
      )}
    </div>
  );
}

export function TerritoryMount({
  initialState,
}: Readonly<{ initialState: CanvasNavigationState }>) {
  const [engine] = useState(() => {
    const created = createPanelEngine({
      root: territoriesRoot,
      panels: territoryPanels,
    });
    seedCanvasNavigation(created, initialState);
    return created;
  });
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useCanvasNavigationSync({
    engine,
    initialState,
    parameterName: territoryParameterName,
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
      toast.warning("The territory book is navigating in memory", {
        description:
          "Another Workspace already owns this History Namespace, so the address bar will not follow it.",
      });
    },
  });

  return (
    <ResourceExchangeProvider exchange={territoryExchange}>
      <TerritoryCanvas.Provider engine={engine}>
        <section
          aria-label="Territory canvas"
          className="flex h-[calc(100svh-14.5rem)] min-h-[32rem] flex-col overflow-hidden rounded-xl border border-border bg-card"
          data-meridian-territories="mounted"
          id="territory-mount"
        >
          <TerritoryCanvas.Workspace label="Meridian territories" />
          <Wire />
        </section>
      </TerritoryCanvas.Provider>
    </ResourceExchangeProvider>
  );
}
