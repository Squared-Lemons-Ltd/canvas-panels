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
  useCallback,
  useContext,
  useRef,
  useSyncExternalStore,
} from "react";
import type { ComponentType, ReactElement, ReactNode } from "react";

export type CanvasProviderProps<Reference extends PanelReference> = Readonly<{
  engine: PanelEngine<Reference>;
  children?: ReactNode;
}>;

export type CanvasBinding<Reference extends PanelReference> = Readonly<{
  snapshot: PanelEngineSnapshot;
  open: PanelEngine<Reference>["open"];
  activate: PanelEngine<Reference>["activate"];
  collapse: PanelEngine<Reference>["collapse"];
  update: PanelEngine<Reference>["update"];
  close: (target?: PanelInstanceRef) => ClosePanelOutcome;
  registerLifecycle: (command: {
    target: PanelInstanceRef;
    lifecycle: PanelLifecycle;
  }) => () => void;
  resolveTransition: PanelEngine<Reference>["resolveTransition"];
}>;

export type CanvasBindings<Reference extends PanelReference> = Readonly<{
  Provider: ComponentType<CanvasProviderProps<Reference>>;
  useEngine: () => PanelEngine<Reference>;
  useSelector: <Selection>(
    selector: (snapshot: PanelEngineSnapshot) => Selection,
    equal?: (left: Selection, right: Selection) => boolean,
  ) => Selection;
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
    const engine = useEngine();

    const snapshot = useSyncExternalStore(
      engine.subscribe,
      engine.getSnapshot,
      engine.getSnapshot,
    );

    return Object.freeze({
      snapshot,
      open: engine.open,
      activate: engine.activate,
      collapse: engine.collapse,
      update: engine.update,
      close: (target) => engine.close(target ? { target } : undefined),
      registerLifecycle: engine.registerLifecycle,
      resolveTransition: engine.resolveTransition,
    });
  }

  function useEngine(): PanelEngine<Reference> {
    const engine = useContext(CanvasEngineContext);
    if (!engine) {
      throw new Error("Canvas hooks must be used within a Canvas Provider");
    }
    return engine;
  }

  function useSelector<Selection>(
    selector: (snapshot: PanelEngineSnapshot) => Selection,
    equal: (left: Selection, right: Selection) => boolean = Object.is,
  ): Selection {
    const engine = useEngine();
    const selectorRef = useRef(selector);
    const equalRef = useRef(equal);
    selectorRef.current = selector;
    equalRef.current = equal;
    const cache = useRef<
      | Readonly<{
          snapshot: PanelEngineSnapshot;
          selection: Selection;
          selector: (snapshot: PanelEngineSnapshot) => Selection;
        }>
      | undefined
    >(undefined);
    const getSelection = useCallback(() => {
      const snapshot = engine.getSnapshot();
      const currentSelector = selectorRef.current;
      if (
        cache.current?.snapshot === snapshot &&
        cache.current.selector === currentSelector
      )
        return cache.current.selection;
      const next = currentSelector(snapshot);
      const selection =
        cache.current && equalRef.current(cache.current.selection, next)
          ? cache.current.selection
          : next;
      cache.current = Object.freeze({
        selection,
        selector: currentSelector,
        snapshot,
      });
      return selection;
    }, [engine]);
    return useSyncExternalStore(engine.subscribe, getSelection, getSelection);
  }

  return Object.freeze({
    Provider,
    useCanvas: useCanvasBinding,
    useEngine,
    useSelector,
  });
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
