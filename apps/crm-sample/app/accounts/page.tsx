import { readCanvasNavigationState } from "@squaredlemons/canvas-panels/next/server";
import type { Metadata } from "next";
import { Suspense } from "react";

import { BookMount } from "@/components/accounts/book-mount";
import {
  bookParameterName,
  openingBookDocument,
} from "@/components/accounts/book-panels";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Accounts",
};

export default async function AccountsPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  // The same server-side decode the Pipeline does, against this Canvas's own
  // parameter. Two Workspaces, two namespaces, one application — and a
  // malformed address degrades to the table rather than failing.
  const requested = readCanvasNavigationState(await searchParams, {
    parameterName: bookParameterName,
  });
  const initialState =
    requested.status === "absent" && openingBookDocument !== null
      ? ({ status: "decoded", document: openingBookDocument } as const)
      : requested;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          The same Canvas Panels package as the Pipeline, asked for something
          else entirely. A table that stays put, one preview slot that records
          take turns in, and the people you want to keep lined up beside each
          other. Everything below the strip at the bottom says which part of the
          package is responsible for what you are looking at.
        </p>
      </div>

      <Suspense
        fallback={
          <Skeleton className="h-[calc(100svh-14.5rem)] min-h-[32rem] w-full rounded-md" />
        }
      >
        <BookMount initialState={initialState} />
      </Suspense>
    </div>
  );
}
