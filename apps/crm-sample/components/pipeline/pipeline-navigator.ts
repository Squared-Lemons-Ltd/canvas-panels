"use client";

/**
 * The application's own handle on the pipeline Canvas Workspace.
 *
 * The command palette is an Overlay Workspace mounted in the root layout, so
 * that ⌘K works on every route. That puts its layer outside the pipeline
 * Canvas's Provider, and a Panel Kind cannot be routed into a Workspace whose
 * React context you are not inside — routing is explicit by design, and the
 * package offers no ambient way to reach another Workspace.
 *
 * So the application keeps the handle itself. The pipeline Canvas registers
 * one while it is mounted; the palette asks for it, and falls back to a deep
 * link when the pipeline is not on screen at all.
 */

import type { RecordRef } from "./panels";

export type PipelineNavigator = Readonly<{
  open: (record: RecordRef) => void;
}>;

let mounted: PipelineNavigator | null = null;

export function registerPipelineNavigator(
  navigator: PipelineNavigator,
): () => void {
  mounted = navigator;
  return () => {
    if (mounted === navigator) mounted = null;
  };
}

export function pipelineNavigator(): PipelineNavigator | null {
  return mounted;
}
