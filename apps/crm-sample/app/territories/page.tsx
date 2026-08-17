import { readCanvasNavigationState } from "@squaredlemons/canvas-panels/next/server";
import type { Metadata } from "next";
import { Suspense } from "react";

import { TerritoryMount } from "@/components/territories/territory-mount";
import {
  openingTerritoryDocument,
  territoryParameterName,
} from "@/components/territories/territory-panels";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Territories",
};

export default async function TerritoriesPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const requested = readCanvasNavigationState(await searchParams, {
    parameterName: territoryParameterName,
  });
  const initialState =
    requested.status === "absent" && openingTerritoryDocument !== null
      ? ({ status: "decoded", document: openingTerritoryDocument } as const)
      : requested;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Territories</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Change something at the top and everything beneath it refreshes itself
          in place — no remount, no reload, no scroll lost. Change something in
          the middle and only what is under <em>that</em> moves. Each Panel
          counts its own re-reads, so both halves of the claim can be watched.
        </p>
      </div>

      <Suspense
        fallback={
          <Skeleton className="h-[calc(100svh-14.5rem)] min-h-[32rem] w-full rounded-xl" />
        }
      >
        <TerritoryMount initialState={initialState} />
      </Suspense>
    </div>
  );
}
