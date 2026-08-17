import { readCanvasNavigationState } from "@squared-lemons-ltd/canvas-panels/next/server";
import type { Metadata } from "next";
import { Suspense } from "react";

import { DirectoryMount } from "@/components/directory/directory-mount";
import {
  directoryParameterName,
  openingDirectoryDocument,
} from "@/components/directory/directory-panels";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Contacts",
};

export default async function ContactsPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const requested = readCanvasNavigationState(await searchParams, {
    parameterName: directoryParameterName,
  });
  const initialState =
    requested.status === "absent" && openingDirectoryDocument !== null
      ? ({ status: "decoded", document: openingDirectoryDocument } as const)
      : requested;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Contacts</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          A Canvas Workspace inside a Panel of another one. Open somebody, then
          walk their network from colleague to colleague without leaving their
          file — two Panel Engines, two Panel Stacks, two sets of Panel Instance
          IDs both numbered from one, and neither able to reach the other.
        </p>
      </div>

      <Suspense
        fallback={
          <Skeleton className="h-[calc(100svh-14.5rem)] min-h-[32rem] w-full rounded-xl" />
        }
      >
        <DirectoryMount initialState={initialState} />
      </Suspense>
    </div>
  );
}
