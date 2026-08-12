import { LayersIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

/* ------------------------------------------------------------------------ *
 *  PLACEHOLDER — the Canvas Workspace replaces everything below.
 *
 *  Swap the inner markup for the Bound Canvas Module's provider and Workspace,
 *  keep a labelled region around it, and flip `data-meridian-canvas` to "mounted"
 *  so the browser check can tell the two states apart.
 * ------------------------------------------------------------------------ */

export function CanvasMount() {
  return (
    <section
      id="canvas-mount"
      data-meridian-canvas="pending"
      aria-labelledby="canvas-mount-heading"
      className="flex min-h-[26rem] flex-1 flex-col items-center justify-center gap-6 rounded-xl border-2 border-dashed border-border bg-card/40 p-8 text-center"
    >
      <div
        aria-hidden="true"
        className="flex w-full max-w-2xl items-stretch gap-3 opacity-60"
      >
        <div className="flex w-1/4 flex-col gap-2">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
        <div className="flex w-1/3 flex-col gap-2">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>

      <div className="flex max-w-xl flex-col items-center gap-3">
        <Badge variant="outline" className="gap-1.5">
          <LayersIcon aria-hidden="true" className="size-3" />
          Placeholder
        </Badge>
        <h2 id="canvas-mount-heading" className="text-lg font-semibold">
          The Canvas Workspace mounts here
        </h2>
        <p className="text-sm leading-relaxed text-balance text-muted-foreground">
          This region is deliberately empty. The Pipeline Root Panel and the
          Panels it opens are wired up in a later step; the shell, theme and
          cascade-layer order around it are already final.
        </p>
        <code className="rounded-md bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
          apps/crm-sample/components/pipeline/canvas-mount.tsx
        </code>
      </div>
    </section>
  );
}
