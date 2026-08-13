import { readCanvasNavigationState } from "@squaredlemons/canvas-panels/next/server";
import { PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { CanvasMount } from "@/components/pipeline/canvas-mount";
import { openingTrailDocument } from "@/components/pipeline/panels";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Pipeline",
};

export default async function PipelinePage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  // Decoded on the server, so the first HTML already describes the deep-linked
  // stack. A malformed address degrades to the board rather than failing.
  const requested = readCanvasNavigationState(await searchParams);
  // An address naming nothing opens the demo part-way along a trail rather than
  // on the board alone. What this framework is for only becomes visible with
  // depth — the board collapsed to a spine, the path named above it — and a
  // reader who has to build that themselves before anything looks different
  // from an ordinary CRM will have stopped before they get there.
  const initialState =
    requested.status === "absent" && openingTrailDocument !== null
      ? ({ status: "decoded", document: openingTrailDocument } as const)
      : requested;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Pipeline</h1>
          <p className="text-sm text-muted-foreground">
            Follow a deal to its account, to another deal, to the person behind
            it. Every Panel you opened stays where you left it, and any path you
            take becomes a link you can send to somebody else.
          </p>
        </div>
        <Button disabled>
          <PlusIcon aria-hidden="true" />
          New deal
        </Button>
      </div>

      <Suspense
        fallback={
          <Skeleton className="h-[calc(100svh-13.5rem)] min-h-[32rem] w-full rounded-xl" />
        }
      >
        <CanvasMount initialState={initialState} />
      </Suspense>
    </div>
  );
}
