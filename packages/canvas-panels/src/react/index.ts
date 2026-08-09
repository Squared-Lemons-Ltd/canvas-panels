"use client";

import type {
  ClosePanelOutcome,
  PanelEngine,
  PanelEngineSnapshot,
  PanelInstanceRef,
  PanelLifecycle,
  PanelReference,
} from "../core/index.js";
import {
  createContext,
  createElement,
  useContext,
  useSyncExternalStore,
} from "react";
import type { ComponentType, ReactElement, ReactNode } from "react";

export type CanvasProviderProps<Reference extends PanelReference> = Readonly<{
  engine: PanelEngine<Reference>;
  children: ReactNode;
}>;

export type CanvasBinding<Reference extends PanelReference> = Readonly<{
  snapshot: PanelEngineSnapshot;
  open: PanelEngine<Reference>["open"];
  close: (target?: PanelInstanceRef) => ClosePanelOutcome;
  registerLifecycle: (command: {
    target: PanelInstanceRef;
    lifecycle: PanelLifecycle;
  }) => () => void;
  resolveTransition: PanelEngine<Reference>["resolveTransition"];
}>;

export type CanvasBindings<Reference extends PanelReference> = Readonly<{
  Provider: ComponentType<CanvasProviderProps<Reference>>;
  useCanvas: () => CanvasBinding<Reference>;
}>;

export function createCanvasBindings<
  Reference extends PanelReference = PanelReference,
>(): CanvasBindings<Reference> {
  const CanvasEngineContext = createContext<PanelEngine<Reference> | null>(
    null,
  );

  function Provider({
    engine,
    children,
  }: CanvasProviderProps<Reference>): ReactElement {
    return createElement(
      CanvasEngineContext.Provider,
      { value: engine },
      children,
    );
  }

  function useCanvasBinding(): CanvasBinding<Reference> {
    const engine = useContext(CanvasEngineContext);
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
      close: (target) => engine.close(target ? { target } : undefined),
      registerLifecycle: engine.registerLifecycle,
      resolveTransition: engine.resolveTransition,
    });
  }

  return Object.freeze({ Provider, useCanvas: useCanvasBinding });
}

const defaultCanvasBindings = createCanvasBindings();

export function CanvasProvider<Reference extends PanelReference>({
  engine,
  children,
}: CanvasProviderProps<Reference>): ReactElement {
  return createElement(defaultCanvasBindings.Provider, {
    children,
    engine: engine as unknown as PanelEngine,
  });
}

export function useCanvas<
  Reference extends PanelReference = PanelReference,
>(): CanvasBinding<Reference> {
  return defaultCanvasBindings.useCanvas() as CanvasBinding<Reference>;
}
