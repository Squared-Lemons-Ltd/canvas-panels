import * as core from "@squaredlemons/canvas-panels/core";
import * as nextServer from "@squaredlemons/canvas-panels/next/server";
import { ClientProbe } from "./client-probe";

export default function Page() {
  const entrypoints = [core, nextServer];

  return (
    <main data-server-entrypoints={entrypoints.length}>
      <h1>Canvas Panels Next fixture</h1>
      <ClientProbe />
    </main>
  );
}
