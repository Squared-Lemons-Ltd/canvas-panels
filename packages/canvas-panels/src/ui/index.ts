"use client";

import { Component } from "react";
import type { ComponentType, ReactNode, RefObject } from "react";
import {
  createContext,
  createElement,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  type CanvasBreakpoint,
  createPanelEngine,
  type DeepReadonly,
  type OpenPanel,
  type PanelDeduplication,
  type PanelDefinition,
  type PanelEngine,
  type PanelEngineSnapshot,
  type PanelInstanceId,
  type PanelInstanceRef,
  type PanelLifecycle,
  type PanelReference,
  type PendingGuardedTransition,
  type RootPanelDefinition,
} from "../core/index.js";
import { type CanvasBinding, createCanvasBindings } from "../react/index.js";

/**
 * The media queries that select each declared breakpoint, ordered from the
 * narrowest presentation to the widest. They are part of the Public Contract so
 * applications can align their own layout with the Canvas.
 */
export const canvasBreakpointQueries: readonly (readonly [
  CanvasBreakpoint,
  string,
])[] = Object.freeze([
  Object.freeze(["mobile", "(max-width: 47.999rem)"] as const),
  Object.freeze([
    "tablet",
    "(min-width: 48rem) and (max-width: 79.999rem)",
  ] as const),
  Object.freeze(["desktop", "(min-width: 80rem)"] as const),
]);

/**
 * Observes the declared breakpoints and reports presentation changes to the
 * Panel Engine. Environments without `matchMedia` — servers and pre-hydration
 * renders — present the desktop Canvas, which the stylesheet mirrors so the
 * first paint never flashes the wrong presentation.
 */
function useBreakpointPresentation<Reference extends PanelReference>(
  engine: PanelEngine<Reference>,
): void {
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const lists = canvasBreakpointQueries.map(
      ([breakpoint, query]) => [breakpoint, window.matchMedia(query)] as const,
    );
    const apply = () => {
      const matched = lists.find(([, list]) => list.matches);
      engine.setPresentation({ breakpoint: matched?.[0] ?? "desktop" });
    };
    apply();
    for (const [, list] of lists) list.addEventListener("change", apply);
    return () => {
      for (const [, list] of lists) list.removeEventListener("change", apply);
    };
  }, [engine]);
}

type WorkspaceHierarchy = Readonly<{
  reportPending: (workspaceId: string, pending: boolean) => void;
}>;

const WorkspaceHierarchyContext = createContext<WorkspaceHierarchy | null>(
  null,
);
const NavigationInitiatorContext = createContext<(() => void) | null>(null);

export type RendererErrorReport = Readonly<{
  kind: string;
  panel: PanelInstanceRef;
}>;

declare const canvasContextBrand: unique symbol;

export type CanvasContextDefinition<Signal> = Readonly<{
  readonly [canvasContextBrand]: Signal;
}>;

export function defineCanvasContext<Signal>(): CanvasContextDefinition<Signal> {
  return Object.freeze({}) as CanvasContextDefinition<Signal>;
}

export type CanvasActionProps = Readonly<{
  id: string;
  label: string;
  priority?: number;
  disabled?: boolean;
  destructive?: boolean;
  onSelect: () => void;
}>;

export type CanvasPanelLifecycle = PanelLifecycle &
  Readonly<{
    dirtyLabel?: string;
    initialFocus?: RefObject<HTMLElement | null>;
    fallbackFocus?: RefObject<HTMLElement | null>;
  }>;

class PanelRendererBoundary extends Component<
  Readonly<{
    children?: ReactNode;
    kind: string;
    panel: PanelInstanceRef;
    onError?: (report: RendererErrorReport) => void;
  }>,
  Readonly<{ failed: boolean; retryKey: number }>
> {
  state = Object.freeze({ failed: false, retryKey: 0 });

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError?.(
      Object.freeze({ kind: this.props.kind, panel: this.props.panel }),
    );
  }

  render() {
    if (!this.state.failed) {
      return createElement(
        Fragment,
        { key: this.state.retryKey },
        this.props.children,
      );
    }
    return createElement(
      "div",
      { role: "alert" },
      createElement("p", null, "This Panel could not be displayed."),
      createElement(
        "button",
        {
          onClick: () =>
            this.setState(({ retryKey }) => ({
              failed: false,
              retryKey: retryKey + 1,
            })),
          type: "button",
        },
        "Retry panel",
      ),
    );
  }
}

type PanelDefinitionShape = Readonly<{
  role: "panel";
  kind: string;
  deduplication: PanelDeduplication;
  closable: boolean;
  key?: (input: never) => string;
  title: (input: never) => string;
  reference: (input: never) => PanelReference<string, unknown>;
  persistence: unknown;
  update?: Readonly<{
    validate: (update: unknown) => boolean;
    validateResult: (value: unknown) => boolean;
    apply: (current: never, update: never) => unknown;
    navigation: "replace" | "none";
  }>;
}>;

type ReferenceOf<Definition> =
  Definition extends PanelDefinition<
    infer Kind,
    infer Input,
    infer _Update,
    infer _Descriptor
  >
    ? PanelReference<Kind, Input>
    : never;

type AllowedReference<Definitions extends readonly PanelDefinitionShape[]> =
  ReferenceOf<Definitions[number]>;

type InputOf<Definition> = Definition extends RootPanelDefinition
  ? undefined
  : Definition extends PanelDefinition<
        string,
        infer Input,
        infer _Update,
        infer _Descriptor
      >
    ? Input
    : never;

type UpdateOf<Definition> =
  Definition extends PanelDefinition<
    string,
    infer _Input,
    infer Update,
    infer _Descriptor
  >
    ? Update
    : never;

export type CanvasPanelRenderProps<
  Descriptor = unknown,
  Kind extends string = string,
> = Readonly<{
  panel: PanelInstanceRef & Readonly<{ kind: Kind }>;
  descriptor: DeepReadonly<Descriptor>;
}>;

type RenderPropsForDefinition<Definition> =
  Definition extends RootPanelDefinition<infer Kind>
    ? CanvasPanelRenderProps<undefined, Kind>
    : Definition extends PanelDefinition<
          infer Kind,
          infer Input,
          infer _Update,
          infer _Descriptor
        >
      ? CanvasPanelRenderProps<Input, Kind>
      : never;

type CanvasRendererMap<
  Root extends RootPanelDefinition,
  Definitions extends readonly PanelDefinitionShape[],
> = Readonly<{
  [Definition in
    | Root
    | Definitions[number] as Definition["kind"]]: ComponentType<
    RenderPropsForDefinition<Definition>
  >;
}>;

export type CanvasWorkspaceProps = Readonly<{
  label: string;
}>;

export type CanvasModuleProviderProps<
  Reference extends PanelReference = PanelReference,
> = Readonly<{
  children: ReactNode;
  /**
   * An application-owned Panel Engine. Supply one when the Canvas Workspace
   * must exist before it is rendered — restoring a deep link, for instance,
   * has to seed the stack ahead of the first paint. Omit it and the Bound
   * Canvas Module creates and owns its own engine.
   */
  engine?: PanelEngine<Reference>;
}>;

type InternalCanvasModuleProviderProps<Reference extends PanelReference> =
  CanvasModuleProviderProps<Reference>;

export type CanvasPanelReadModel<
  Descriptor = unknown,
  Kind extends string = string,
> = Readonly<{
  panel: PanelInstanceRef & Readonly<{ kind: Kind }>;
  descriptor: DeepReadonly<Descriptor>;
  kind: Kind;
  title: string;
  closable: boolean;
  active: boolean;
  deepest: boolean;
  visible: boolean;
}>;

type ReadModelForDefinition<Definition> = CanvasPanelReadModel<
  InputOf<Definition>,
  Definition extends { kind: infer Kind extends string } ? Kind : never
>;

export type CanvasTransitionStatus = Readonly<{
  pending: boolean;
  command: "open" | "close" | null;
  panelCount: number;
}>;

export type CanvasPresentation = Readonly<{
  active: boolean;
  deepest: boolean;
  visible: boolean;
  closable: boolean;
  title: string;
}>;

export type CanvasNavigation<
  Reference extends PanelReference,
  RegisteredDefinition extends PanelDefinitionShape,
> = Readonly<{
  open: <Definition extends RegisteredDefinition>(
    definition: Definition,
    descriptor: InputOf<Definition>,
    options?: Readonly<{ origin?: PanelInstanceRef }>,
  ) => ReturnType<PanelEngine<Reference>["open"]>;
  update: <Definition extends RegisteredDefinition>(
    definition: Definition,
    update: UpdateOf<Definition>,
    target?: PanelInstanceRef,
  ) => ReturnType<PanelEngine<Reference>["update"]>;
  activate: (target?: PanelInstanceRef) => ReturnType<PanelEngine["activate"]>;
  collapse: (target?: PanelInstanceRef) => ReturnType<PanelEngine["collapse"]>;
  close: (target?: PanelInstanceRef) => ReturnType<PanelEngine["close"]>;
}>;

export type BoundCanvasModule<
  Reference extends PanelReference,
  Root extends RootPanelDefinition,
  RegisteredDefinition extends PanelDefinitionShape = PanelDefinitionShape,
  Signal = never,
> = Readonly<{
  Action: ComponentType<CanvasActionProps>;
  Provider: ComponentType<CanvasModuleProviderProps<Reference>>;
  Workspace: ComponentType<CanvasWorkspaceProps>;
  useNavigation: () => CanvasNavigation<Reference, RegisteredDefinition>;
  usePanel: {
    (
      target?: PanelInstanceRef,
    ): ReadModelForDefinition<Root | RegisteredDefinition>;
    <Definition extends Root | RegisteredDefinition>(
      definition: Definition,
      target: PanelInstanceRef & Readonly<{ kind: Definition["kind"] }>,
    ): ReadModelForDefinition<Definition> | null;
  };
  useStack: () => readonly CanvasPanelReadModel[];
  useTransitionStatus: () => CanvasTransitionStatus;
  usePresentation: (target?: PanelInstanceRef) => CanvasPresentation;
  useLifecycle: (lifecycle: CanvasPanelLifecycle) => void;
  useHeader: (header: Readonly<{ visualTitle?: ReactNode }>) => void;
  useContextSignal: (signal: Signal) => void;
  useContextTarget: (
    target?: "active" | "deepest" | "focused" | PanelInstanceRef,
  ) => Readonly<{ panel: PanelInstanceRef | null; signal: Signal | undefined }>;
}>;

function GuardedTransitionDialog({
  transition,
  resolveTransition,
}: Readonly<{
  transition: PendingGuardedTransition;
  resolveTransition: PanelEngine["resolveTransition"];
}>) {
  const titleId = useId();
  const messageId = useId();
  const stayButton = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useLayoutEffect(() => {
    stayButton.current?.focus({ preventScroll: true });
  }, []);

  const decide = async (decision: "save" | "discard" | "stay") => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const outcome = await resolveTransition({ decision });
      if (outcome.status === "rejected") {
        setError(
          outcome.reason === "transition-decision-conflict"
            ? "Retry the original Save or Discard decision, or choose Stay."
            : "Another transition operation is already in progress.",
        );
        setBusy(false);
      }
    } catch {
      setError(
        "The transition could not be completed. Your work is still open.",
      );
      setBusy(false);
    }
  };

  return createElement(
    "div",
    {
      "data-testid": "canvas-panels-transition-backdrop",
      "data-canvas-transition-backdrop": "",
      onMouseDown: (event) => {
        event.preventDefault();
        event.stopPropagation();
      },
    },
    createElement(
      "div",
      {
        "aria-describedby": messageId,
        "aria-labelledby": titleId,
        "aria-modal": true,
        "data-canvas-transition-dialog": "",
        onKeyDown: (event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            void decide("stay");
            return;
          }
          if (event.key !== "Tab") return;
          const actions = Array.from(
            event.currentTarget.querySelectorAll<HTMLButtonElement>(
              "button:not(:disabled)",
            ),
          );
          const first = actions[0];
          const last = actions.at(-1);
          if (
            first &&
            last &&
            ((!event.shiftKey && document.activeElement === last) ||
              (event.shiftKey && document.activeElement === first))
          ) {
            event.preventDefault();
            (event.shiftKey ? last : first).focus();
          }
        },
        role: "alertdialog",
      },
      createElement(
        "h2",
        { id: titleId },
        transition.panels.length === 1
          ? `Unsaved changes in ${transition.panels[0]?.panelTitle}`
          : `Unsaved changes in ${transition.panels.length} panels`,
      ),
      createElement(
        "div",
        { id: messageId },
        transition.panels.map((panel) =>
          createElement(
            "p",
            { key: panel.panelId },
            `${panel.panelTitle}: ${panel.message}`,
          ),
        ),
      ),
      error ? createElement("p", { role: "alert" }, error) : null,
      createElement(
        "div",
        { "data-canvas-transition-actions": "" },
        createElement(
          "button",
          {
            disabled: busy,
            onClick: () => void decide("save"),
            type: "button",
          },
          transition.panels.length === 1 ? "Save" : "Save all",
        ),
        createElement(
          "button",
          {
            disabled: busy,
            onClick: () => void decide("discard"),
            type: "button",
          },
          transition.panels.length === 1 ? "Discard" : "Discard all",
        ),
        createElement(
          "button",
          {
            disabled: busy,
            onClick: () => void decide("stay"),
            ref: stayButton,
            type: "button",
          },
          "Stay",
        ),
      ),
    ),
  );
}

export function createCanvasModule<
  const Root extends RootPanelDefinition,
  const Definitions extends readonly PanelDefinitionShape[],
  Signal = never,
>(config: {
  context?: CanvasContextDefinition<Signal>;
  root: Root;
  panels: Definitions;
  renderers: CanvasRendererMap<Root, Definitions>;
  onRendererError?: (report: RendererErrorReport) => void;
}): BoundCanvasModule<
  AllowedReference<Definitions>,
  Root,
  Definitions[number],
  Signal
> {
  type Reference = AllowedReference<Definitions>;
  const bindings = createCanvasBindings<Reference>();
  const LifecycleRegistrationContext = createContext<
    ((lifecycle: PanelLifecycle) => () => void) | null
  >(null);
  type HeaderRegistration = Readonly<{
    visualTitle?: ReactNode;
    dirtyLabel?: string;
    initialFocus?: RefObject<HTMLElement | null>;
    fallbackFocus?: RefObject<HTMLElement | null>;
  }>;
  type PanelScope = Readonly<{
    panel: OpenPanel;
    registerAction: (action: CanvasActionProps) => () => void;
    registerHeader: (header: HeaderRegistration) => () => void;
  }>;
  type SignalStore = Readonly<{
    subscribe: (listener: () => void) => () => void;
    getVersion: () => number;
    publish: (panel: PanelInstanceRef, signal: Signal) => () => void;
    read: (panel: PanelInstanceRef) => Signal | undefined;
    setFocused: (panel: PanelInstanceRef | null) => void;
    getFocused: () => PanelInstanceRef | null;
  }>;
  const PanelScopeContext = createContext<PanelScope | null>(null);
  const SignalStoreContext = createContext<SignalStore | null>(null);
  const createEngine = () =>
    createPanelEngine({ root: config.root, panels: config.panels });

  function useLifecycle(lifecycle: CanvasPanelLifecycle): void {
    const register = useContext(LifecycleRegistrationContext);
    const scope = useContext(PanelScopeContext);
    if (!register || !scope) {
      throw new Error(
        "Canvas lifecycle hooks must run inside a Panel renderer",
      );
    }
    const latest = useRef(lifecycle);
    const dirty = lifecycle.dirty;
    useLayoutEffect(() => {
      latest.current = lifecycle;
    }, [lifecycle]);
    useEffect(() => {
      const unregisterLifecycle = register(
        Object.freeze<PanelLifecycle>({
          ...(dirty === undefined ? {} : { dirty }),
          guard: (transition) => latest.current.guard(transition),
          save: (operation) => latest.current.save(operation),
          discard: (operation) => latest.current.discard(operation),
        }),
      );
      const unregisterHeader = scope.registerHeader({
        ...(lifecycle.dirtyLabel === undefined
          ? {}
          : { dirtyLabel: lifecycle.dirtyLabel }),
        ...(lifecycle.initialFocus === undefined
          ? {}
          : { initialFocus: lifecycle.initialFocus }),
        ...(lifecycle.fallbackFocus === undefined
          ? {}
          : { fallbackFocus: lifecycle.fallbackFocus }),
      });
      return () => {
        unregisterHeader();
        unregisterLifecycle();
      };
    }, [
      dirty,
      lifecycle.dirtyLabel,
      lifecycle.fallbackFocus,
      lifecycle.initialFocus,
      register,
      scope,
    ]);
  }

  function useHeader(header: Readonly<{ visualTitle?: ReactNode }>): void {
    const scope = useContext(PanelScopeContext);
    if (!scope)
      throw new Error("Canvas header hooks must run inside a Panel renderer");
    const { visualTitle } = header;
    useEffect(
      () => scope.registerHeader({ visualTitle }),
      [scope, visualTitle],
    );
  }

  function Action(action: CanvasActionProps): null {
    const scope = useContext(PanelScopeContext);
    if (!scope)
      throw new Error("Canvas Actions must render inside a Panel renderer");
    const { destructive, disabled, id, label, onSelect, priority } = action;
    const latest = useRef(onSelect);
    useLayoutEffect(() => {
      latest.current = onSelect;
    }, [onSelect]);
    useEffect(
      () =>
        scope.registerAction({
          id,
          label,
          onSelect: () => latest.current(),
          ...(destructive === undefined ? {} : { destructive }),
          ...(disabled === undefined ? {} : { disabled }),
          ...(priority === undefined ? {} : { priority }),
        }),
      [destructive, disabled, id, label, priority, scope],
    );
    return null;
  }

  function useContextSignal(signal: Signal): void {
    const scope = useContext(PanelScopeContext);
    const store = useContext(SignalStoreContext);
    if (!scope || !store) {
      throw new Error(
        "Canvas Context Signals must run inside a Panel renderer",
      );
    }
    useEffect(
      () => store.publish(scope.panel.instanceRef, signal),
      [scope, signal, store],
    );
  }

  function useContextTarget(
    target: "active" | "deepest" | "focused" | PanelInstanceRef = "active",
  ): Readonly<{ panel: PanelInstanceRef | null; signal: Signal | undefined }> {
    const store = useContext(SignalStoreContext);
    if (!store)
      throw new Error("Canvas Context Target requires a Canvas Provider");
    const selectedPanel = bindings.useSelector((snapshot) =>
      typeof target === "object"
        ? (snapshot.panels.find(({ instanceRef }) => instanceRef === target)
            ?.instanceRef ?? null)
        : target === "focused"
          ? null
          : (snapshot.panels.find(
              ({ instanceId }) =>
                instanceId ===
                (target === "deepest"
                  ? snapshot.deepestPanelId
                  : snapshot.activePanelId),
            )?.instanceRef ?? null),
    );
    useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion);
    const panel = target === "focused" ? store.getFocused() : selectedPanel;
    return Object.freeze({
      panel,
      signal: panel ? store.read(panel) : undefined,
    });
  }

  function currentTarget(
    scoped: PanelScope | null,
    snapshot: PanelEngineSnapshot,
  ): PanelInstanceRef {
    const target =
      scoped?.panel.instanceRef ??
      snapshot.panels.find(
        ({ instanceId }) => instanceId === snapshot.activePanelId,
      )?.instanceRef;
    if (!target) throw new Error("Canvas navigation requires a Panel target");
    return target;
  }

  function useNavigation(): CanvasNavigation<Reference, Definitions[number]> {
    const engine = bindings.useEngine();
    const scoped = useContext(PanelScopeContext);
    const rememberInitiator = useContext(NavigationInitiatorContext);
    return Object.freeze({
      open: <Definition extends Definitions[number]>(
        definition: Definition,
        descriptor: InputOf<Definition>,
        options?: Readonly<{ origin?: PanelInstanceRef }>,
      ) => {
        rememberInitiator?.();
        return engine.open({
          originId: (
            options?.origin ?? currentTarget(scoped, engine.getSnapshot())
          ).instanceId,
          panel: definition.reference(descriptor as never) as Reference,
        });
      },
      update: <Definition extends Definitions[number]>(
        definition: Definition,
        update: UpdateOf<Definition>,
        target?: PanelInstanceRef,
      ) => {
        rememberInitiator?.();
        return engine.update({
          definition: definition as never,
          target: target ?? currentTarget(scoped, engine.getSnapshot()),
          update: update as never,
        });
      },
      activate: (target?: PanelInstanceRef) =>
        engine.activate({
          target: target ?? currentTarget(scoped, engine.getSnapshot()),
        }),
      collapse: (target?: PanelInstanceRef) => {
        rememberInitiator?.();
        return engine.collapse({
          target: target ?? currentTarget(scoped, engine.getSnapshot()),
        });
      },
      close: (target?: PanelInstanceRef) => {
        rememberInitiator?.();
        return engine.close({
          target: target ?? currentTarget(scoped, engine.getSnapshot()),
        });
      },
    });
  }

  function toPanelReadModel(
    panel: OpenPanel,
    snapshot: PanelEngineSnapshot,
  ): CanvasPanelReadModel {
    return Object.freeze({
      panel: panel.instanceRef,
      descriptor: panel.reference.input,
      kind: panel.kind,
      title: panel.title,
      closable: panel.closable,
      active: panel.instanceId === snapshot.activePanelId,
      deepest: panel.instanceId === snapshot.deepestPanelId,
      visible: snapshot.visiblePanelIds.includes(panel.instanceId),
    });
  }

  function usePanel(
    target?: PanelInstanceRef,
  ): ReadModelForDefinition<Root | Definitions[number]>;
  function usePanel<Definition extends Root | Definitions[number]>(
    definition: Definition,
    target: PanelInstanceRef & Readonly<{ kind: Definition["kind"] }>,
  ): ReadModelForDefinition<Definition> | null;
  function usePanel(
    definitionOrTarget?: Root | Definitions[number] | PanelInstanceRef,
    explicitTarget?: PanelInstanceRef,
  ): CanvasPanelReadModel | null {
    const scoped = useContext(PanelScopeContext);
    const definition =
      definitionOrTarget && "role" in definitionOrTarget
        ? definitionOrTarget
        : null;
    const target = definition
      ? explicitTarget
      : (definitionOrTarget as PanelInstanceRef | undefined);
    const selected = bindings.useSelector(
      (snapshot) => {
        const instanceId =
          target?.instanceId ??
          scoped?.panel.instanceId ??
          snapshot.activePanelId;
        const panel = snapshot.panels.find(
          (candidate) => candidate.instanceId === instanceId,
        );
        return panel && (!definition || panel.kind === definition.kind)
          ? toPanelReadModel(panel, snapshot)
          : null;
      },
      (left, right) =>
        left === right ||
        (left !== null &&
          right !== null &&
          left.panel === right.panel &&
          left.descriptor === right.descriptor &&
          left.title === right.title &&
          left.closable === right.closable &&
          left.active === right.active &&
          left.deepest === right.deepest &&
          left.visible === right.visible),
    );
    if (!selected && definition) return null;
    if (!selected) throw new Error("Canvas usePanel target is not current");
    return selected;
  }

  function useStack(): readonly CanvasPanelReadModel[] {
    return bindings.useSelector(
      (snapshot) =>
        Object.freeze(
          snapshot.panels.map((panel) => toPanelReadModel(panel, snapshot)),
        ),
      (left, right) =>
        left.length === right.length &&
        left.every(
          (panel, index) =>
            panel.panel === right[index]?.panel &&
            panel.descriptor === right[index]?.descriptor &&
            panel.kind === right[index]?.kind &&
            panel.title === right[index]?.title &&
            panel.closable === right[index]?.closable &&
            panel.active === right[index]?.active &&
            panel.deepest === right[index]?.deepest &&
            panel.visible === right[index]?.visible,
        ),
    );
  }

  function useTransitionStatus(): CanvasTransitionStatus {
    return bindings.useSelector(
      (snapshot) =>
        Object.freeze({
          pending: snapshot.transition !== null,
          command: snapshot.transition?.command ?? null,
          panelCount: snapshot.transition?.panels.length ?? 0,
        }),
      (left, right) =>
        left.pending === right.pending &&
        left.command === right.command &&
        left.panelCount === right.panelCount,
    );
  }

  function usePresentation(target?: PanelInstanceRef): CanvasPresentation {
    const scoped = useContext(PanelScopeContext);
    return bindings.useSelector(
      (snapshot) => {
        const instanceId =
          target?.instanceId ??
          scoped?.panel.instanceId ??
          snapshot.activePanelId;
        const panel = snapshot.panels.find(
          (candidate) => candidate.instanceId === instanceId,
        );
        if (!panel)
          throw new Error("Canvas usePresentation target is not current");
        return Object.freeze({
          active: panel.instanceId === snapshot.activePanelId,
          deepest: panel.instanceId === snapshot.deepestPanelId,
          visible: snapshot.visiblePanelIds.includes(panel.instanceId),
          closable: panel.closable,
          title: panel.title,
        });
      },
      (left, right) =>
        left.active === right.active &&
        left.deepest === right.deepest &&
        left.visible === right.visible &&
        left.closable === right.closable &&
        left.title === right.title,
    );
  }

  function ScopedRenderer({
    Renderer,
    panel,
    registerLifecycle,
    registerAction,
    registerHeader,
  }: Readonly<{
    Renderer: ComponentType<Record<string, unknown>>;
    panel: OpenPanel;
    registerLifecycle: CanvasBinding<Reference>["registerLifecycle"];
    registerAction: (
      panel: PanelInstanceRef,
      action: CanvasActionProps,
    ) => () => void;
    registerHeader: (
      panel: PanelInstanceRef,
      header: HeaderRegistration,
    ) => () => void;
  }>) {
    const lifecycleOwner = useRef(false);
    const register = useCallback(
      (lifecycle: PanelLifecycle) => {
        if (lifecycleOwner.current) {
          throw new Error("A Panel renderer may register only one lifecycle");
        }
        lifecycleOwner.current = true;
        const unregister = registerLifecycle({
          target: panel.instanceRef,
          lifecycle,
        });
        return () => {
          lifecycleOwner.current = false;
          unregister();
        };
      },
      [panel.instanceRef, registerLifecycle],
    );
    const scope = useMemo<PanelScope>(
      () =>
        Object.freeze({
          panel,
          registerAction: (action: CanvasActionProps) =>
            registerAction(panel.instanceRef, action),
          registerHeader: (header: HeaderRegistration) =>
            registerHeader(panel.instanceRef, header),
        }),
      [panel, registerAction, registerHeader],
    );
    return createElement(
      PanelScopeContext.Provider,
      { value: scope },
      createElement(
        LifecycleRegistrationContext.Provider,
        { value: register },
        createElement(Renderer, {
          descriptor: panel.reference.input,
          panel: panel.instanceRef,
        }),
      ),
    );
  }

  function Provider({
    children,
    engine: suppliedEngine,
  }: InternalCanvasModuleProviderProps<Reference>) {
    const [engine] = useState(() => suppliedEngine ?? createEngine());
    const [signalStore] = useState<SignalStore>(() => {
      const signals = new Map<
        PanelInstanceId,
        Readonly<{ owner: object; value: Signal }>
      >();
      const listeners = new Set<() => void>();
      let version = 0;
      let focused: PanelInstanceRef | null = null;
      const publish = () => {
        version += 1;
        for (const listener of listeners) listener();
      };
      return Object.freeze({
        subscribe: (listener: () => void) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        getVersion: () => version,
        publish: (panel: PanelInstanceRef, value: Signal) => {
          const owner = Object.freeze({});
          signals.set(panel.instanceId, Object.freeze({ owner, value }));
          publish();
          return () => {
            if (signals.get(panel.instanceId)?.owner === owner) {
              signals.delete(panel.instanceId);
              publish();
            }
          };
        },
        read: (panel: PanelInstanceRef) => signals.get(panel.instanceId)?.value,
        setFocused: (panel: PanelInstanceRef | null) => {
          if (focused?.instanceId === panel?.instanceId) return;
          focused = panel;
          publish();
        },
        getFocused: () => focused,
      });
    });
    return createElement(
      bindings.Provider,
      { engine },
      createElement(
        SignalStoreContext.Provider,
        { value: signalStore },
        children,
      ),
    );
  }

  function Workspace({ label }: CanvasWorkspaceProps) {
    const { snapshot, activate, close, registerLifecycle, resolveTransition } =
      bindings.useCanvas();
    useBreakpointPresentation(bindings.useEngine());
    const workspaceId = useId();
    const parentWorkspace = useContext(WorkspaceHierarchyContext);
    const signalStore = useContext(SignalStoreContext);
    if (!signalStore)
      throw new Error("Canvas Workspace requires a Canvas Provider");
    const application = useRef<HTMLDivElement>(null);
    const returnFocus = useRef<HTMLElement | null>(null);
    const previousTransition = useRef(snapshot.transition);
    const initiallyFocusedPanel = useRef<PanelInstanceId | null>(null);
    const [dirtyPanelIds, setDirtyPanelIds] = useState<
      ReadonlySet<PanelInstanceId>
    >(() => new Set());
    const [headerRegistrations, setHeaderRegistrations] = useState<
      ReadonlyMap<PanelInstanceId, ReadonlyMap<object, HeaderRegistration>>
    >(() => new Map());
    const [actionRegistrations, setActionRegistrations] = useState<
      ReadonlyMap<PanelInstanceId, ReadonlyMap<object, CanvasActionProps>>
    >(() => new Map());
    const [pendingDescendantIds, setPendingDescendantIds] = useState<
      ReadonlySet<string>
    >(() => new Set());
    const renderers = config.renderers as Readonly<
      Record<string, ComponentType<Record<string, unknown>>>
    >;
    const registerHeader = useCallback(
      (panel: PanelInstanceRef, header: HeaderRegistration) => {
        const owner = Object.freeze({});
        setHeaderRegistrations((current) => {
          const next = new Map(current);
          const registrations = new Map(next.get(panel.instanceId));
          registrations.set(owner, header);
          next.set(panel.instanceId, registrations);
          return next;
        });
        return () =>
          setHeaderRegistrations((current) => {
            const registrations = current.get(panel.instanceId);
            if (!registrations?.has(owner)) return current;
            const next = new Map(current);
            const remaining = new Map(registrations);
            remaining.delete(owner);
            if (remaining.size === 0) next.delete(panel.instanceId);
            else next.set(panel.instanceId, remaining);
            return next;
          });
      },
      [],
    );
    const registerAction = useCallback(
      (panel: PanelInstanceRef, action: CanvasActionProps) => {
        const owner = Object.freeze({});
        setActionRegistrations((current) => {
          const next = new Map(current);
          const registrations = new Map(next.get(panel.instanceId));
          if ([...registrations.values()].some(({ id }) => id === action.id)) {
            throw new Error(`Duplicate Canvas Action ID: ${action.id}`);
          }
          registrations.set(owner, action);
          next.set(panel.instanceId, registrations);
          return next;
        });
        return () =>
          setActionRegistrations((current) => {
            const registrations = current.get(panel.instanceId);
            if (!registrations?.has(owner)) return current;
            const next = new Map(current);
            const remaining = new Map(registrations);
            remaining.delete(owner);
            if (remaining.size === 0) next.delete(panel.instanceId);
            else next.set(panel.instanceId, remaining);
            return next;
          });
      },
      [],
    );
    const reportPending = useCallback(
      (descendantWorkspaceId: string, pending: boolean) => {
        setPendingDescendantIds((current) => {
          if (current.has(descendantWorkspaceId) === pending) return current;
          const next = new Set(current);
          if (pending) next.add(descendantWorkspaceId);
          else next.delete(descendantWorkspaceId);
          return next;
        });
      },
      [],
    );
    const hierarchy = useMemo<WorkspaceHierarchy>(
      () => Object.freeze({ reportPending }),
      [reportPending],
    );
    const hasPendingInSubtree =
      snapshot.transition !== null || pendingDescendantIds.size > 0;
    const deepestTransition =
      pendingDescendantIds.size === 0 ? snapshot.transition : null;

    useEffect(() => {
      parentWorkspace?.reportPending(workspaceId, hasPendingInSubtree);
      return () => parentWorkspace?.reportPending(workspaceId, false);
    }, [hasPendingInSubtree, parentWorkspace, workspaceId]);

    useEffect(() => {
      const focused = signalStore.getFocused();
      if (
        focused &&
        !snapshot.panels.some(({ instanceRef }) => instanceRef === focused)
      ) {
        signalStore.setFocused(null);
      }
    }, [signalStore, snapshot.panels]);

    useEffect(() => {
      if (previousTransition.current && !snapshot.transition) {
        const preferred = returnFocus.current;
        const activeHeaders = headerRegistrations.get(snapshot.activePanelId);
        const registeredFallback = activeHeaders
          ? [...activeHeaders.values()].find(
              ({ fallbackFocus }) => fallbackFocus?.current?.isConnected,
            )?.fallbackFocus?.current
          : null;
        const fallback =
          application.current?.querySelector<HTMLElement>("[data-active] h2");
        (preferred?.isConnected
          ? preferred
          : (registeredFallback ?? fallback)
        )?.focus();
        returnFocus.current = null;
      }
      previousTransition.current = snapshot.transition;
    }, [headerRegistrations, snapshot.activePanelId, snapshot.transition]);

    useEffect(() => {
      const registrations = headerRegistrations.get(snapshot.activePanelId);
      const initialFocus = registrations
        ? [...registrations.values()].find(({ initialFocus }) => initialFocus)
            ?.initialFocus?.current
        : null;
      if (
        initiallyFocusedPanel.current !== snapshot.activePanelId &&
        initialFocus?.isConnected
      ) {
        initialFocus.focus({ preventScroll: true });
        initiallyFocusedPanel.current = snapshot.activePanelId;
      }
    }, [headerRegistrations, snapshot.activePanelId]);

    const registerWorkspaceLifecycle = useCallback<
      CanvasBinding<Reference>["registerLifecycle"]
    >(
      (command) => {
        const unregister = registerLifecycle(command);
        const panelId = command.target.instanceId;
        if (command.lifecycle.dirty ?? true) {
          setDirtyPanelIds((current) => {
            if (current.has(panelId)) return current;
            const next = new Set(current);
            next.add(panelId);
            return next;
          });
        }
        return () => {
          unregister();
          setDirtyPanelIds((current) => {
            if (!current.has(panelId)) return current;
            const next = new Set(current);
            next.delete(panelId);
            return next;
          });
        };
      },
      [registerLifecycle],
    );

    useEffect(() => {
      if (dirtyPanelIds.size === 0 || typeof window === "undefined") return;
      const preventUnload = (event: BeforeUnloadEvent) => {
        event.preventDefault();
        event.returnValue = "";
      };
      window.addEventListener("beforeunload", preventUnload);
      return () => window.removeEventListener("beforeunload", preventUnload);
    }, [dirtyPanelIds]);

    // A retained Panel that leaves the current presentation must not keep the
    // browser's focus, or keyboard users would be stranded on inert content.
    const activeIndex = snapshot.panels.findIndex(
      ({ instanceId }) => instanceId === snapshot.activePanelId,
    );

    // Where focus belongs once the presentation changes: the Active Panel when
    // it is still shown, otherwise the deepest Panel the presentation kept.
    const focusRefugeHeadingId = (() => {
      const refugeId = snapshot.visiblePanelIds.includes(snapshot.activePanelId)
        ? snapshot.activePanelId
        : snapshot.visiblePanelIds.at(-1);
      const index = snapshot.panels.findIndex(
        ({ instanceId }) => instanceId === refugeId,
      );
      return index < 0 ? null : `${workspaceId}-panel-${index}-heading`;
    })();

    // A retained Panel that leaves the current presentation must not keep the
    // browser's focus, or keyboard users would be stranded on inert content.
    const visiblePanelIds = snapshot.visiblePanelIds;
    useEffect(() => {
      const focused = document.activeElement;
      if (!(focused instanceof HTMLElement)) return;
      const owner = focused
        .closest("[data-canvas-panel]")
        ?.getAttribute("data-canvas-panel-id");
      if (!owner || visiblePanelIds.includes(owner as PanelInstanceId)) return;
      const heading = focusRefugeHeadingId
        ? document.getElementById(focusRefugeHeadingId)
        : null;
      (heading ?? application.current)?.focus();
    }, [visiblePanelIds, focusRefugeHeadingId]);

    const rememberFocus = useCallback(() => {
      returnFocus.current =
        typeof document !== "undefined" &&
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
    }, []);

    return createElement(
      WorkspaceHierarchyContext.Provider,
      { value: hierarchy },
      createElement(
        NavigationInitiatorContext.Provider,
        { value: rememberFocus },
        createElement(
          "div",
          {
            "aria-label": label,
            "data-canvas-breakpoint": snapshot.breakpoint,
            "data-canvas-workspace": "",
            role: "region",
          },
          snapshot.breakpoint !== "mobile"
            ? null
            : createElement(
                "nav",
                {
                  "aria-label": `${label} navigation`,
                  "data-canvas-mobile-navigation": "",
                },
                activeIndex > 0
                  ? createElement(
                      "button",
                      {
                        "data-canvas-back": "",
                        onClick: () => {
                          rememberFocus();
                          const previous = snapshot.panels[activeIndex - 1];
                          if (previous)
                            activate({ target: previous.instanceRef });
                        },
                        type: "button",
                      },
                      "Back",
                    )
                  : null,
                createElement(
                  "ol",
                  { "data-canvas-breadcrumbs": "" },
                  ...snapshot.panels
                    .slice(0, activeIndex + 1)
                    .map((panel, breadcrumbIndex) =>
                      createElement(
                        "li",
                        { key: panel.instanceId },
                        createElement(
                          "button",
                          {
                            "aria-current":
                              breadcrumbIndex === activeIndex
                                ? "page"
                                : undefined,
                            onClick: () => {
                              rememberFocus();
                              activate({ target: panel.instanceRef });
                            },
                            type: "button",
                          },
                          panel.title,
                        ),
                      ),
                    ),
                ),
              ),
          createElement(
            "div",
            {
              "data-canvas-application": "",
              "data-testid": "canvas-panels-application",
              "aria-hidden": deepestTransition ? true : undefined,
              inert: deepestTransition ? true : undefined,
              ref: application,
            },
            snapshot.panels.map((panel, panelIndex) => {
              const headingId = `${workspaceId}-panel-${panelIndex}-heading`;
              const visible = snapshot.visiblePanelIds.includes(
                panel.instanceId,
              );
              const active = panel.instanceId === snapshot.activePanelId;
              const Renderer = renderers[panel.kind];
              if (!Renderer) {
                throw new Error(
                  `No renderer registered for Panel Kind: ${panel.kind}`,
                );
              }
              const headers = [
                ...(headerRegistrations.get(panel.instanceId)?.values() ?? []),
              ];
              const visualTitle = [...headers]
                .reverse()
                .find(
                  ({ visualTitle }) => visualTitle !== undefined,
                )?.visualTitle;
              const dirtyLabel = dirtyPanelIds.has(panel.instanceId)
                ? [...headers]
                    .reverse()
                    .find(({ dirtyLabel }) => dirtyLabel !== undefined)
                    ?.dirtyLabel
                : undefined;
              const actions = [
                ...(actionRegistrations.get(panel.instanceId)?.values() ?? []),
              ].sort(
                (left, right) =>
                  (right.priority ?? 0) - (left.priority ?? 0) ||
                  left.id.localeCompare(right.id),
              );

              return createElement(
                "section",
                {
                  "aria-hidden": visible ? undefined : true,
                  "aria-labelledby": headingId,
                  "data-active": active ? "" : undefined,
                  "data-canvas-panel": "",
                  "data-canvas-panel-context":
                    visible && !active ? "previous" : undefined,
                  "data-canvas-panel-id": panel.instanceId,
                  "data-panel-kind": panel.kind,
                  hidden: !visible,
                  inert: !visible,
                  key: panel.instanceId,
                  onBlurCapture: (event) => {
                    if (!event.currentTarget.contains(event.relatedTarget))
                      signalStore.setFocused(null);
                  },
                  onFocusCapture: () =>
                    signalStore.setFocused(panel.instanceRef),
                  role: "region",
                },
                createElement(
                  "header",
                  { "data-canvas-panel-header": "" },
                  createElement(
                    "h2",
                    { id: headingId, tabIndex: -1 },
                    panel.title,
                  ),
                  visualTitle === undefined
                    ? null
                    : createElement(
                        "span",
                        { "aria-hidden": true, "data-canvas-visual-title": "" },
                        visualTitle,
                      ),
                  dirtyLabel === undefined
                    ? null
                    : createElement(
                        "span",
                        { "data-canvas-dirty-label": "" },
                        dirtyLabel,
                      ),
                  ...actions.map((action) =>
                    createElement(
                      "button",
                      {
                        "aria-label": action.label,
                        "data-destructive": action.destructive ? "" : undefined,
                        disabled: action.disabled,
                        key: action.id,
                        onClick: action.onSelect,
                        type: "button",
                      },
                      action.label,
                    ),
                  ),
                  !panel.closable
                    ? null
                    : createElement(
                        "button",
                        {
                          "aria-label": `Close ${panel.title}`,
                          onClick: () => {
                            rememberFocus();
                            close(panel.instanceRef);
                          },
                          type: "button",
                        },
                        "Close",
                      ),
                ),
                createElement(
                  "div",
                  { "data-canvas-panel-body": "" },
                  createElement(
                    PanelRendererBoundary,
                    {
                      kind: panel.kind,
                      panel: panel.instanceRef,
                      ...(config.onRendererError
                        ? { onError: config.onRendererError }
                        : {}),
                    },
                    createElement(ScopedRenderer, {
                      Renderer,
                      panel,
                      registerAction,
                      registerHeader,
                      registerLifecycle: registerWorkspaceLifecycle,
                    }),
                  ),
                ),
              );
            }),
          ),
          deepestTransition
            ? createElement(GuardedTransitionDialog, {
                resolveTransition,
                transition: deepestTransition,
              })
            : null,
        ),
      ),
    );
  }

  return Object.freeze({
    Action,
    Provider,
    Workspace,
    useContextSignal,
    useContextTarget,
    useHeader,
    useLifecycle,
    useNavigation,
    usePanel,
    usePresentation,
    useStack,
    useTransitionStatus,
  });
}
