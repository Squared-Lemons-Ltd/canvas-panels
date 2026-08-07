import * as core from "@squaredlemons/canvas-panels/core";
import * as editor from "@squaredlemons/canvas-panels/extensions/editor";
import * as resources from "@squaredlemons/canvas-panels/extensions/resources";
import * as overlay from "@squaredlemons/canvas-panels/overlay";
import * as canvasReact from "@squaredlemons/canvas-panels/react";
import "@squaredlemons/canvas-panels/styles.css";
import * as testing from "@squaredlemons/canvas-panels/testing";
import * as ui from "@squaredlemons/canvas-panels/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

const entrypoints = [
  core,
  editor,
  resources,
  overlay,
  canvasReact,
  testing,
  ui,
];
const root = document.getElementById("root");

if (!root) {
  throw new Error("React fixture root is missing");
}

createRoot(root).render(
  <StrictMode>
    <main data-package-entrypoints={entrypoints.length}>
      Canvas Panels package fixture
    </main>
  </StrictMode>,
);
