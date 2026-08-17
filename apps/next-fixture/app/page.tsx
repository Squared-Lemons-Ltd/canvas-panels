import * as core from "@squared-lemons-ltd/canvas-panels/core";
import * as nextServer from "@squared-lemons-ltd/canvas-panels/next/server";
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
