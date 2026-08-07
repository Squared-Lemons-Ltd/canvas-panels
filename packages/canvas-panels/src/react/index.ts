"use client";

import type {
  PanelEngine,
  PanelEngineSnapshot,
  PanelInstanceId,
  PanelReference,
} from "../core/index.js";
import {
  createContext,
  createElement,
  useContext,
  useSyncExternalStore,
} from "react";
import type { ReactElement, ReactNode } from "react";

const CanvasEngineContext = createContext<PanelEngine | null>(null);

export type CanvasProviderProps<Reference extends PanelReference> = Readonly<{
  engine: PanelEngine<Reference>;
  children: ReactNode;
}>;

export type CanvasBinding<Reference extends PanelReference> = Readonly<{
  snapshot: PanelEngineSnapshot;
  open: PanelEngine<Reference>["open"];
  close: (instanceId: PanelInstanceId) => boolean;
}>;

export function CanvasProvider<Reference extends PanelReference>({
  engine,
  children,
}: CanvasProviderProps<Reference>): ReactElement {
  return createElement(
    CanvasEngineContext.Provider,
    { value: engine as unknown as PanelEngine },
    children,
  );
}

export function useCanvas<
  Reference extends PanelReference = PanelReference,
>(): CanvasBinding<Reference> {
  const engine = useContext(
    CanvasEngineContext,
  ) as PanelEngine<Reference> | null;
  if (!engine) {
    throw new Error("Canvas hooks must be used within a Canvas Provider");
  }

  const snapshot = useSyncExternalStore(
    engine.subscribe,
    engine.getSnapshot,
    engine.getSnapshot,
  );

  return Object.freeze({
    snapshot,
    open: engine.open,
    close: engine.close,
  });
}
