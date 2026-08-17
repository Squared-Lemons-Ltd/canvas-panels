"use client";

import * as editor from "@squared-lemons-ltd/canvas-panels/extensions/editor";
import * as nextAdapter from "@squared-lemons-ltd/canvas-panels/next";
import * as overlay from "@squared-lemons-ltd/canvas-panels/overlay";
import * as canvasReact from "@squared-lemons-ltd/canvas-panels/react";
import * as resources from "@squared-lemons-ltd/canvas-panels/extensions/resources";
import * as testing from "@squared-lemons-ltd/canvas-panels/testing";
import * as ui from "@squared-lemons-ltd/canvas-panels/ui";

export function ClientProbe() {
  const entrypoints = [
    editor,
    nextAdapter,
    overlay,
    canvasReact,
    resources,
    testing,
    ui,
  ];

  return (
    <p data-client-entrypoints={entrypoints.length}>
      Client entry points resolved
    </p>
  );
}
