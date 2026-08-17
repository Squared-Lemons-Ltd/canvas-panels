"use client";

import * as editor from "@squaredlemons/canvas-panels/extensions/editor";
import * as nextAdapter from "@squaredlemons/canvas-panels/next";
import * as overlay from "@squaredlemons/canvas-panels/overlay";
import * as canvasReact from "@squaredlemons/canvas-panels/react";
import * as resources from "@squaredlemons/canvas-panels/extensions/resources";
import * as testing from "@squaredlemons/canvas-panels/testing";
import * as ui from "@squaredlemons/canvas-panels/ui";

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
