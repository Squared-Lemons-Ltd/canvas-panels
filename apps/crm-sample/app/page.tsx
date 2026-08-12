import { PlusIcon } from "lucide-react";
import type { Metadata } from "next";

import { CanvasMount } from "@/components/pipeline/canvas-mount";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Pipeline",
};

export default function PipelinePage() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Pipeline</h1>
          <p className="text-sm text-muted-foreground">
            Open a deal, then an account, then a contact — without ever losing
            the column you started in.
          </p>
        </div>
        <Button disabled>
          <PlusIcon aria-hidden="true" />
          New deal
        </Button>
      </div>

      <CanvasMount />
    </div>
  );
}
