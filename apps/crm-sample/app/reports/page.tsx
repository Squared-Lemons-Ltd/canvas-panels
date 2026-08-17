import { readCanvasNavigationState } from "@squared-lemons-ltd/canvas-panels/next/server";
import type { Metadata } from "next";
import { Suspense } from "react";

import { ReportMount } from "@/components/reports/report-mount";
import {
  openingReportDocument,
  reportParameterName,
} from "@/components/reports/report-panels";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Reports",
};

export default async function ReportsPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const requested = readCanvasNavigationState(await searchParams, {
    parameterName: reportParameterName,
  });
  const initialState =
    requested.status === "absent" && openingReportDocument !== null
      ? ({ status: "decoded", document: openingReportDocument } as const)
      : requested;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          The whole stack as the unit of navigation. A saved view is a set of
          Panels restored in one atomic transition; the summary beside them is
          pinned and refuses to close; one analysis throws every time it
          renders, and only its own Panel finds out.
        </p>
      </div>

      <Suspense
        fallback={
          <Skeleton className="h-[calc(100svh-14.5rem)] min-h-[32rem] w-full rounded-xl" />
        }
      >
        <ReportMount initialState={initialState} />
      </Suspense>
    </div>
  );
}
