import { readCanvasNavigationState } from "@squaredlemons/canvas-panels/next/server";

import { ClassesCanvas } from "./classes-canvas";

export default async function CanvasPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  // Decoding happens on the server so the very first HTML already describes the
  // deep-linked stack. Malformed state degrades to the Root Panel rather than
  // failing the route.
  const initialState = readCanvasNavigationState(await searchParams);

  return (
    <main>
      <h1>Classes</h1>
      <p data-navigation-status={initialState.status}>
        Initial navigation state: {initialState.status}
      </p>
      <ClassesCanvas initialState={initialState} />
    </main>
  );
}
