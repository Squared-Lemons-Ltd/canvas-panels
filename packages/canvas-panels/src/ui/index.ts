"use client";

import type {
  ComponentType,
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
  PointerEvent as ReactPointerEvent,
  RefObject,
  UIEvent,
} from "react";
import {
  Component,
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
  canvasBreakpointQueries,
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
  type PanelWidth,
  type PendingGuardedTransition,
  type RootPanelDefinition,
} from "../core/index.js";
import { type CanvasBinding, createCanvasBindings } from "../react/index.js";
import {
  type CanvasAnnouncementState,
  type CanvasAnnouncementTemplates,
  canvasAnnouncementTemplates,
  canvasPanelSizingBounds,
  cyclePanelRegion,
  describeStructuralChange,
  type PanelSizingBounds,
  resizePanel,
  type SizingCommand,
  sizingCommandForKey,
} from "./interaction.js";

// The breakpoint queries are declared beside the breakpoints themselves in
// `core`, so a server entry point can read them; the Canvas keeps re-exporting
// them because this is the entry point an application aligning its own layout
// already imports.
export { canvasBreakpointQueries } from "../core/index.js";
export type {
  CanvasAnnouncementPanel,
  CanvasAnnouncementState,
  CanvasAnnouncementTemplates,
  PanelRegionDirection,
  PanelSizing,
  PanelSizingBounds,
  PanelSizingOutcome,
  SizingCommand,
} from "./interaction.js";
// The interaction grammar is part of the Canvas's public surface: announcement
// templates have to be replaceable to localize, and the sizing engine is what
// an application reuses if it renders its own separator.
export {
  canvasAnnouncementTemplates,
  canvasPanelSizingBounds,
  cyclePanelRegion,
  describeStructuralChange,
  resizePanel,
  sizingCommandForKey,
} from "./interaction.js";

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

// The boundary reports that it swapped a Panel's body; it never moves focus
// itself. Focus for every appearance of a Panel body has one owner — the
// Workspace — and a second claimant inside the Panel is exactly what made the
// two fight over the same moment.
class PanelRendererBoundary extends Component<
  Readonly<{
    children?: ReactNode;
    kind: string;
    noticeId: string;
    panel: PanelInstanceRef;
    onBodyReplaced: () => void;
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
    this.props.onBodyReplaced();
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
      {
        // Landing on the notice is only useful if it says what it is, and the
        // sentence it already shows is that name.
        "aria-labelledby": `${this.props.noticeId}-message`,
        "data-canvas-panel-notice": "",
        id: this.props.noticeId,
        role: "alert",
        tabIndex: -1,
      },
      createElement(
        "p",
        { id: `${this.props.noticeId}-message` },
        "This Panel could not be displayed.",
      ),
      createElement(
        "button",
        {
          onClick: () => {
            this.setState(({ retryKey }) => ({
              failed: false,
              retryKey: retryKey + 1,
            }));
            this.props.onBodyReplaced();
          },
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
  width?: PanelWidth;
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
  /**
   * Replaces the English sentences the Canvas live region announces. Spread
   * {@link canvasAnnouncementTemplates} and override only what you need.
   */
  announcements?: CanvasAnnouncementTemplates;
  /**
   * The sizes a Panel may be resized between. Defaults to
   * {@link canvasPanelSizingBounds}.
   */
  sizing?: PanelSizingBounds;
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
  const dialog = useRef<HTMLDivElement>(null);
  const errorMessage = useRef<HTMLParagraphElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useLayoutEffect(() => {
    stayButton.current?.focus({ preventScroll: true });
  }, []);

  // Deciding disables every button, which would drop focus to the body and
  // strand a keyboard user outside the modal they are still inside. Focus moves
  // to the dialog itself for the duration.
  useLayoutEffect(() => {
    if (!busy) return;
    const active = document.activeElement;
    // Deliberately no `instanceof HTMLButtonElement`: that global does not
    // exist in every environment this renders in, and reaching for it here
    // would throw during the layout effect rather than fail quietly.
    const strandedOnDisabledControl =
      active !== null &&
      dialog.current?.contains(active) === true &&
      "disabled" in active &&
      active.disabled === true;
    if (strandedOnDisabledControl) {
      dialog.current?.focus({ preventScroll: true });
    }
  }, [busy]);

  // A failed decision has to be read, not just announced: focus lands on the
  // explanation so the next Tab reaches the buttons that can act on it.
  useLayoutEffect(() => {
    if (error === undefined) return;
    errorMessage.current?.focus({ preventScroll: true });
  }, [error]);

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
        "aria-busy": busy || undefined,
        "data-canvas-transition-dialog": "",
        ref: dialog,
        tabIndex: -1,
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
      error
        ? createElement(
            "p",
            { ref: errorMessage, role: "alert", tabIndex: -1 },
            error,
          )
        : null,
      createElement(
        "div",
        { "data-canvas-transition-actions": "" },
        // Each decision is named, so an application can restyle the three
        // controls it most needs to without matching the English in a label.
        createElement(
          "button",
          {
            "data-canvas-transition-action": "save",
            disabled: busy,
            onClick: () => void decide("save"),
            type: "button",
          },
          transition.panels.length === 1 ? "Save" : "Save all",
        ),
        createElement(
          "button",
          {
            "data-canvas-transition-action": "discard",
            disabled: busy,
            onClick: () => void decide("discard"),
            type: "button",
          },
          transition.panels.length === 1 ? "Discard" : "Discard all",
        ),
        createElement(
          "button",
          {
            "data-canvas-transition-action": "stay",
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

/**
 * Whether two Context Signals are the same signal, compared **one level deep**:
 * the same value by `Object.is`, or two plain objects — or two arrays — with
 * the same own enumerable entries, each compared by `Object.is`.
 *
 * The depth is the whole design. A Context Signal is an opaque
 * application-typed value, so it may be arbitrarily nested, hold functions,
 * `Date`s, or class instances, and contain cycles; a comparison that walked it
 * would cost O(document) on every render of every publisher, and would hang or
 * throw on the values it was never told about. Nothing here recurses, so the
 * comparison costs the signal's own entry count, cannot loop on a cyclic value,
 * and cannot throw. Anything that is not a plain object or an array — including
 * a `Date`, a `Map`, or a class instance — is compared by identity, and so is a
 * nested object: a signal that rebuilds one every render republishes every
 * render, which is what `useMemo` at the call site is still for.
 */
function sameContextSignal(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (
    typeof left !== "object" ||
    typeof right !== "object" ||
    left === null ||
    right === null
  ) {
    return false;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => Object.is(value, right[index]))
    );
  }
  // Plain objects only. Two class instances with matching fields are two
  // instances, and deciding otherwise would mean answering for a `Map`, a
  // `Date`, or a proxy the package has never seen by reading its properties.
  const plain = (value: object) => {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  };
  if (!plain(left) || !plain(right)) return false;
  const entries = Object.entries(left);
  return (
    entries.length === Object.keys(right).length &&
    entries.every(
      ([key, value]) =>
        Object.hasOwn(right, key) &&
        Object.is(value, (right as Record<string, unknown>)[key]),
    )
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
  /*
   * Each Panel Kind's declared width, resolved once per module onto the two
   * custom properties the stylesheet reads. `core` carries the declaration as
   * data because it renders nothing; this is the layer that renders the Panel
   * element, so this is where a declaration becomes a value on it.
   *
   * Custom properties rather than `flex-basis` is the whole design. The Panel
   * rules resolve `var(--canvas-panel-width)` and `var(--canvas-panel-active-
   * width)` on the element, so a declared value simply replaces what those two
   * rules read — which means the transition between the two widths still runs,
   * the narrow presentations that set `flex-basis: 100%` still override both,
   * and a Panel Separator drag, which writes `flex-basis` inline, still wins.
   * A declared `flex-basis` would have flattened all three.
   *
   * The cost, and it is the documented trade: a declaration on the element
   * beats a token inherited into it from anywhere — `:root`, an ancestor, or
   * the Workspace element itself. For a Kind that declares a width, the
   * stylesheet no longer sets it. Declare it, or theme it in CSS, not both.
   */
  const declaredPanelWidths = new Map<string, CSSProperties>();
  for (const definition of config.panels) {
    const width = definition.width;
    if (width === undefined) continue;
    declaredPanelWidths.set(
      definition.kind,
      Object.freeze({
        ...(width.resting === undefined
          ? {}
          : { "--canvas-panel-width": width.resting }),
        ...(width.active === undefined
          ? {}
          : { "--canvas-panel-active-width": width.active }),
      }) as CSSProperties,
    );
  }

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
    // The signal is held rather than keyed on its object identity. The natural
    // call site builds it inline from props — which is exactly what derived
    // state looks like — and handing a fresh object to the dependency array
    // republished it on every render, waking every Context Target reader for a
    // value that had not changed. `sameContextSignal` decides that instead, one
    // level deep; a signal it calls different is published immediately, and the
    // effect still returns `publish`'s own cleanup, so unmounting unpublishes.
    const held = useRef(signal);
    if (!sameContextSignal(held.current, signal)) held.current = signal;
    const published = held.current;
    useEffect(
      () => store.publish(scope.panel.instanceRef, published),
      [published, scope, store],
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

  function Workspace({ label, announcements, sizing }: CanvasWorkspaceProps) {
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
    const focusedPanelId = useRef<PanelInstanceId | null>(null);
    const panelScrollOffsets = useRef(new Map<PanelInstanceId, number>());
    const breadcrumbTrail = useRef<HTMLOListElement>(null);
    const previouslyVisiblePanelIds = useRef<readonly PanelInstanceId[]>([]);
    const previousTransition = useRef(snapshot.transition);
    const initiallyFocusedPanel = useRef<PanelInstanceId | null>(null);
    const honouredReplacements = useRef(new Map<PanelInstanceId, number>());

    // A Panel Instance ID is unique within its own Panel Engine and nowhere
    // else, so every lookup by one is confined to the Panels this Workspace
    // itself renders — the immediate children of its application element. A
    // descendant selector would reach into a Workspace nested inside a Panel,
    // where the same id names an entirely different Panel, and answer with it.
    const ownPanelElement = useCallback(
      (panelId: PanelInstanceId, part?: "body") =>
        application.current?.querySelector<HTMLElement>(
          `:scope > [data-canvas-panel-id="${panelId}"]${
            part === "body" ? " > [data-canvas-panel-body]" : ""
          }`,
        ) ?? null,
      [],
    );
    // For the same reason, a Panel read back out of the document is only this
    // Workspace's to reason about when this Workspace rendered it. A node
    // inside a nested Workspace answers `null` rather than an id that would be
    // mistaken for one of these Panels.
    const ownPanelIdOf = useCallback((node: Element | null) => {
      const panel = node?.closest("[data-canvas-panel]") ?? null;
      return panel?.parentElement === application.current
        ? panel.getAttribute("data-canvas-panel-id")
        : null;
    }, []);
    const [dirtyPanelIds, setDirtyPanelIds] = useState<
      ReadonlySet<PanelInstanceId>
    >(() => new Set());
    const [headerRegistrations, setHeaderRegistrations] = useState<
      ReadonlyMap<PanelInstanceId, ReadonlyMap<object, HeaderRegistration>>
    >(() => new Map());
    // How many times each Panel's renderer boundary has swapped the body for
    // its failure notice or back again. It only ever counts up, which is what
    // lets the focus pass below recognise a swap it has already dealt with.
    const [bodyReplacements, setBodyReplacements] = useState<
      ReadonlyMap<PanelInstanceId, number>
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
    const noteBodyReplaced = useCallback((panel: PanelInstanceRef) => {
      setBodyReplacements((current) => {
        const next = new Map(current);
        next.set(panel.instanceId, (current.get(panel.instanceId) ?? 0) + 1);
        return next;
      });
    }, []);
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

    // A closed Panel takes its focus bookkeeping with it, so neither map grows
    // for the lifetime of the Workspace.
    useEffect(() => {
      const open = (instanceId: PanelInstanceId) =>
        snapshot.panels.some((panel) => panel.instanceId === instanceId);
      for (const instanceId of honouredReplacements.current.keys()) {
        if (!open(instanceId)) honouredReplacements.current.delete(instanceId);
      }
      setBodyReplacements((current) => {
        const next = new Map([...current].filter(([id]) => open(id)));
        return next.size === current.size ? current : next;
      });
    }, [snapshot.panels]);

    useEffect(() => {
      if (previousTransition.current && !snapshot.transition) {
        const preferred = returnFocus.current;
        const activeHeaders = headerRegistrations.get(snapshot.activePanelId);
        const registeredFallback = activeHeaders
          ? [...activeHeaders.values()].find(
              ({ fallbackFocus }) => fallbackFocus?.current?.isConnected,
            )?.fallbackFocus?.current
          : null;
        const fallback = application.current?.querySelector<HTMLElement>(
          ":scope > [data-active] h2",
        );
        (preferred?.isConnected
          ? preferred
          : (registeredFallback ?? fallback)
        )?.focus();
        returnFocus.current = null;
      }
      previousTransition.current = snapshot.transition;
    }, [headerRegistrations, snapshot.activePanelId, snapshot.transition]);

    const activePanelId = snapshot.activePanelId;
    const activeReplacements = bodyReplacements.get(activePanelId) ?? 0;

    // Every part the package itself renders into a Panel is named from this
    // Workspace's own id, so a Workspace nested inside a Panel can never be
    // mistaken for its host — which a descendant selector would do.
    const panelPartIdFor = useCallback(
      (panelId: string, part: "heading" | "notice") => {
        const index = snapshot.panels.findIndex(
          ({ instanceId }) => instanceId === panelId,
        );
        return index < 0 ? null : `${workspaceId}-panel-${index}-${part}`;
      },
      [snapshot.panels, workspaceId],
    );

    // This is the only place a Canvas Workspace decides where focus goes when a
    // Panel body appears, and it honours each claim exactly once. That is what
    // keeps focus from feeding back into it: moving focus re-renders whatever
    // reads the Context Signal store, and this effect then re-runs against a
    // claim it has already settled and does nothing. Nothing rendered inside a
    // Panel may claim the same moment — a second claimant is what made the
    // render loop rather than settle.
    //
    // Two different things count as a body appearing, and conflating them is
    // what a Panel that has recovered once would pay for ever after. Activating
    // a Panel is the case that already existed. A renderer boundary swapping
    // the body for its failure notice, or restoring it on a retry, is the
    // other, and it is counted per Panel because the same Panel can break and
    // recover any number of times.
    useEffect(() => {
      // A Guarded Transition dialog owns focus for as long as it is up, and the
      // Panels behind it are inert. Whatever the boundary did back there is
      // recorded as settled rather than dragged out in front of the dialog.
      if (deepestTransition) {
        honouredReplacements.current.set(activePanelId, activeReplacements);
        initiallyFocusedPanel.current = activePanelId;
        return;
      }
      if (
        activeReplacements > 0 &&
        honouredReplacements.current.get(activePanelId) !== activeReplacements
      ) {
        // Whatever the user was standing on has just been destroyed under them,
        // so this Panel is owed a landing place whatever it registered. The
        // notice explains the failure; once the body is back, the Panel's own
        // heading puts the user at the top of what returned. Both are rendered
        // by the package, so this never waits on an application registration
        // and settles in the commit that raised the claim.
        const elementFor = (part: "heading" | "notice") => {
          const id = panelPartIdFor(activePanelId, part);
          return id === null ? null : document.getElementById(id);
        };
        const target = elementFor("notice") ?? elementFor("heading");
        if (!target?.isConnected) return;
        honouredReplacements.current.set(activePanelId, activeReplacements);
        // A replacement has just put focus inside this Panel, so activation has
        // nothing left to claim for it.
        initiallyFocusedPanel.current = activePanelId;
        target.focus({ preventScroll: true });
        return;
      }
      // Activating a Panel hands focus to whatever that Panel registered, once.
      // A Panel that registered nothing is left exactly as the application left
      // it.
      if (initiallyFocusedPanel.current === activePanelId) return;
      const registrations = headerRegistrations.get(activePanelId);
      const registered = registrations
        ? [...registrations.values()].find(({ initialFocus }) => initialFocus)
            ?.initialFocus?.current
        : null;
      if (!registered?.isConnected) return;
      initiallyFocusedPanel.current = activePanelId;
      registered.focus({ preventScroll: true });
    }, [
      activePanelId,
      activeReplacements,
      deepestTransition,
      headerRegistrations,
      panelPartIdFor,
    ]);

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

    const activeIndex = snapshot.panels.findIndex(
      ({ instanceId }) => instanceId === snapshot.activePanelId,
    );
    const visiblePanelIds = snapshot.visiblePanelIds;

    // Where focus belongs once the presentation changes: the Active Panel when
    // it is still shown, otherwise the deepest Panel the presentation kept.
    const focusRefugeHeadingId = (() => {
      const refugeId = visiblePanelIds.includes(snapshot.activePanelId)
        ? snapshot.activePanelId
        : visiblePanelIds.at(-1);
      const index = snapshot.panels.findIndex(
        ({ instanceId }) => instanceId === refugeId,
      );
      return index < 0 ? null : `${workspaceId}-panel-${index}-heading`;
    })();

    // A retained Panel that leaves the current presentation must not keep the
    // browser's focus, or keyboard users would be stranded on inert content.
    // The Panel that owned focus is recorded as it happens, because by the time
    // this effect runs the browser has already blurred the hidden element and
    // `document.activeElement` no longer names the Panel that lost it.
    useEffect(() => {
      const strandedPanelId = focusedPanelId.current;
      if (!strandedPanelId || visiblePanelIds.includes(strandedPanelId)) return;
      focusedPanelId.current = null;
      const focused = document.activeElement;
      const stillInsideStranded = ownPanelIdOf(focused) === strandedPanelId;
      // Only reclaim focus the Canvas itself just lost: a browser drops it to
      // the body, while an environment without `inert` leaves it in place.
      const stranded =
        focused === null || focused === document.body || stillInsideStranded;
      if (!stranded) return;
      const heading = focusRefugeHeadingId
        ? document.getElementById(focusRefugeHeadingId)
        : null;
      (heading ?? application.current)?.focus();
    }, [visiblePanelIds, focusRefugeHeadingId, ownPanelIdOf]);

    // Retained Panels are hidden with `display: none`, which resets their
    // scroll offset, so each body's offset is recorded as it scrolls and
    // restored when the presentation shows that Panel again.
    useLayoutEffect(() => {
      const revealed = visiblePanelIds.filter(
        (panelId) => !previouslyVisiblePanelIds.current.includes(panelId),
      );
      previouslyVisiblePanelIds.current = visiblePanelIds;
      for (const panelId of revealed) {
        const offset = panelScrollOffsets.current.get(panelId);
        if (offset === undefined) continue;
        const body = ownPanelElement(panelId, "body");
        if (body && body.scrollTop !== offset) body.scrollTop = offset;
      }
    }, [visiblePanelIds, ownPanelElement]);

    // The breadcrumb trail is one scrolling line, and where it rests is a
    // decision, not a default: the crumb for the Active Panel is the last one
    // the trail renders, so a trail left at its inline start hides the very
    // crumb that says where you are. It is put at its inline end whenever the
    // Active Panel changes — which is the same position a trail short enough to
    // fit already has, so nothing moves until something is actually out of
    // view. Closing a deeper Panel leaves the trail alone, because the trail
    // ends at the Active Panel and never showed that Panel in the first place.
    //
    // Written directly rather than scrolled to: `scrollIntoView` would scroll
    // every ancestor that could scroll, including the document, and this is
    // one element's own offset. The write is instant, so there is no motion
    // for a reduced-motion preference to have an opinion about; an application
    // that has asked for `scroll-behavior: smooth` is honoured here as it is
    // anywhere else, and the package's own reduced-motion block already forces
    // that back to `auto`.
    useLayoutEffect(() => {
      const trail = breadcrumbTrail.current;
      // Only a narrow presentation renders a trail, and only a Canvas with an
      // Active Panel has a crumb to rest on.
      if (!trail || snapshot.breakpoint !== "mobile" || activeIndex < 0) return;
      // In a right-to-left Canvas the inline end is the negative extreme; the
      // browser clamps either request to the real scroll range.
      const inlineEnd =
        typeof window !== "undefined" &&
        window.getComputedStyle(trail).direction === "rtl"
          ? -trail.scrollWidth
          : trail.scrollWidth;
      trail.scrollLeft = inlineEnd;
    }, [activeIndex, snapshot.breakpoint]);

    const rememberFocus = useCallback(() => {
      returnFocus.current =
        typeof document !== "undefined" &&
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
    }, []);

    // F6 is the only key the Canvas claims. Tab order is left exactly as the
    // DOM defines it, and no arrow or letter shortcut is registered globally,
    // so an application's own controls keep every key they expect.
    const cycleRegions = useCallback(
      (event: ReactKeyboardEvent<HTMLDivElement>) => {
        if (
          event.key !== "F6" ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey
        )
          return;
        // Where focus actually is, read from the document rather than from the
        // Panel's own focus handler: focus also arrives by routes that handler
        // never observes — the Canvas moving it itself when a Panel opens, or
        // the browser restoring it — and a stale answer silently sends every
        // F6 back to the first region.
        const focusedRegion = ownPanelIdOf(document.activeElement);
        const target = cyclePanelRegion(
          visiblePanelIds,
          focusedRegion,
          event.shiftKey ? "backward" : "forward",
        );
        if (target === null) return;
        const headingId = panelPartIdFor(target, "heading");
        const heading = headingId ? document.getElementById(headingId) : null;
        if (!heading) return;
        event.preventDefault();
        heading.focus();
      },
      [ownPanelIdOf, panelPartIdFor, visiblePanelIds],
    );

    const announcementTemplates = announcements ?? canvasAnnouncementTemplates;
    const announcementState = useMemo<CanvasAnnouncementState>(
      () =>
        Object.freeze({
          panels: snapshot.panels.map(({ instanceId, title }) =>
            Object.freeze({ instanceId, title }),
          ),
          activePanelId: snapshot.activePanelId,
          breakpoint: snapshot.breakpoint,
          visiblePanelIds,
        }),
      [
        snapshot.panels,
        snapshot.activePanelId,
        snapshot.breakpoint,
        visiblePanelIds,
      ],
    );
    const [announcement, setAnnouncement] = useState("");
    const announcedState = useRef<CanvasAnnouncementState | null>(null);

    const bounds = sizing ?? canvasPanelSizingBounds;
    const [panelWidths, setPanelWidths] = useState<
      ReadonlyMap<PanelInstanceId, number>
    >(() => new Map());
    // The width a Panel had before anyone resized it, which is what a reset
    // returns to. Measured rather than assumed, because the natural width comes
    // from the stylesheet and the application may have retokened it.
    const naturalWidths = useRef(new Map<PanelInstanceId, number>());
    const drag = useRef<{
      panelId: PanelInstanceId;
      startX: number;
      startWidth: number;
      /** Whether the drag ever actually moved the edge. */
      moved: boolean;
    } | null>(null);
    const [resizing, setResizing] = useState(false);

    // A separator has to report the width the Panel really has, from the first
    // render. Until a Panel is measured its natural width comes from the
    // stylesheet, which only the browser can resolve, so it is read back after
    // layout rather than assumed to be the minimum.
    const [measuredWidths, setMeasuredWidths] = useState<
      ReadonlyMap<PanelInstanceId, number>
    >(() => new Map());
    useLayoutEffect(() => {
      const measured = new Map<PanelInstanceId, number>();
      for (const panelId of visiblePanelIds) {
        if (panelWidths.has(panelId) || measuredWidths.has(panelId)) continue;
        const width = ownPanelElement(panelId)?.offsetWidth;
        if (width) measured.set(panelId, width);
      }
      if (measured.size === 0) return;
      for (const [panelId, width] of measured) {
        naturalWidths.current.set(panelId, width);
      }
      setMeasuredWidths((current) => new Map([...current, ...measured]));
    }, [visiblePanelIds, panelWidths, measuredWidths, ownPanelElement]);

    const widthOf = useCallback(
      (panelId: PanelInstanceId) =>
        panelWidths.get(panelId) ?? measuredWidths.get(panelId) ?? bounds.min,
      [bounds.min, measuredWidths, panelWidths],
    );

    const applySizing = useCallback(
      (panelId: PanelInstanceId, command: SizingCommand) => {
        const element = ownPanelElement(panelId);
        const measured = element?.offsetWidth ?? bounds.min;
        if (!naturalWidths.current.has(panelId)) {
          naturalWidths.current.set(panelId, measured);
        }
        const outcome = resizePanel({
          ...bounds,
          size: panelWidths.get(panelId) ?? measured,
          initial: naturalWidths.current.get(panelId) ?? measured,
          command,
        });
        if (outcome.changed) {
          setPanelWidths((current) =>
            new Map(current).set(panelId, outcome.size),
          );
        }
        return outcome;
      },
      [bounds, ownPanelElement, panelWidths],
    );

    // One region, and it only ever carries a message the move actually earned:
    // comparing against the last announced state is what stops a re-render, or
    // a change that was not structural, from repeating itself.
    useEffect(() => {
      const message = describeStructuralChange(
        announcedState.current,
        announcementState,
        announcementTemplates,
      );
      announcedState.current = announcementState;
      if (message !== null) setAnnouncement(message);
    }, [announcementState, announcementTemplates]);

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
            onKeyDown: cycleRegions,
            role: "region",
          },
          // A bare live region, deliberately without `role="status"`: that role
          // implies exactly this politeness, and claiming it would put a second
          // status element into every application's `getByRole` queries.
          createElement(
            "div",
            {
              "aria-atomic": true,
              "aria-live": "polite",
              "data-canvas-announcer": "",
            },
            announcement,
          ),
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
                  { "data-canvas-breadcrumbs": "", ref: breadcrumbTrail },
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
              "data-canvas-resizing": resizing ? "" : undefined,
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
              // The Kind's declared width, and the width a Panel Separator drag
              // gave this instance. A Kind that declared nothing and has not
              // been dragged carries no style attribute at all, exactly as
              // before.
              const declaredWidth = declaredPanelWidths.get(panel.kind);
              const resizedWidth = panelWidths.get(panel.instanceId);
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
                  // An explicitly chosen width is applied inline so it outranks
                  // both the Panel and Active Panel rules without either needing
                  // to become more specific. A drag beats the Kind's own
                  // declaration, because a person moved it.
                  style:
                    resizedWidth === undefined
                      ? declaredWidth
                      : { ...declaredWidth, flexBasis: `${resizedWidth}px` },
                  onBlurCapture: (event) => {
                    if (!event.currentTarget.contains(event.relatedTarget))
                      signalStore.setFocused(null);
                  },
                  onFocusCapture: () => {
                    focusedPanelId.current = panel.instanceId;
                    signalStore.setFocused(panel.instanceRef);
                  },
                  role: "region",
                },
                createElement(
                  "header",
                  { "data-canvas-panel-header": "" },
                  // A registered visual title takes the heading's visible place
                  // rather than printing beside it. Both used to render, so an
                  // application whose visual title carried the record's name
                  // showed that name twice.
                  //
                  // The heading stays one element either way: it is the Panel's
                  // accessible name, what the region's `aria-labelledby` points
                  // at, and where the Panel Focus Owner puts focus. Hiding it
                  // and focusing the ornament instead would land a keyboard
                  // reader on a 1px target that had been told nothing — so the
                  // Panel title moves inside the heading and is hidden there,
                  // still read, out of the way of the title the application
                  // chose to show.
                  createElement(
                    "h2",
                    { id: headingId, tabIndex: -1 },
                    ...(visualTitle === undefined
                      ? [panel.title]
                      : [
                          createElement(
                            "span",
                            { "data-canvas-panel-title": "", key: "title" },
                            panel.title,
                          ),
                          createElement(
                            "span",
                            {
                              "aria-hidden": true,
                              "data-canvas-visual-title": "",
                              key: "visual-title",
                            },
                            visualTitle,
                          ),
                        ]),
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
                        // The id the application already gave this Action,
                        // which until now the Canvas spent only as a React key.
                        // Without it an application cannot tell its own Actions
                        // apart in the DOM, so styling one means matching the
                        // English in its label.
                        "data-canvas-action": action.id,
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
                          // Named so an application can restyle the one control
                          // in a Panel's chrome it is most likely to want as an
                          // icon. The word is the visible label only — the
                          // accessible name is the `aria-label` above — so
                          // replacing it costs a screen reader nothing.
                          "data-canvas-panel-close": "",
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
                  {
                    "data-canvas-panel-body": "",
                    onScroll: (event: UIEvent<HTMLDivElement>) => {
                      panelScrollOffsets.current.set(
                        panel.instanceId,
                        event.currentTarget.scrollTop,
                      );
                    },
                  },
                  createElement(
                    PanelRendererBoundary,
                    {
                      kind: panel.kind,
                      noticeId: `${workspaceId}-panel-${panelIndex}-notice`,
                      onBodyReplaced: () => noteBodyReplaced(panel.instanceRef),
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
                // A separator sizes the Panel it belongs to, not the gap after
                // it — so the deepest visible Panel has a width worth setting
                // like any other, and the Canvas simply reaches further or less
                // far to its right. Withholding one there left the Panel the
                // reader is most often in the only one they could not size.
                //
                // A presentation showing a single Panel still offers nothing:
                // that Panel is the Canvas, and dragging its edge would resize
                // the surface rather than divide anything on it.
                !visible || visiblePanelIds.length < 2
                  ? null
                  : createElement("div", {
                      "aria-label": announcementTemplates.resizeLabel({
                        title: panel.title,
                      }),
                      "aria-orientation": "vertical",
                      "aria-valuemax": bounds.max,
                      "aria-valuemin": bounds.min,
                      "aria-valuenow": Math.round(widthOf(panel.instanceId)),
                      "data-canvas-panel-separator": "",
                      onKeyDown: (
                        event: ReactKeyboardEvent<HTMLDivElement>,
                      ) => {
                        const command = sizingCommandForKey(event);
                        if (command === null) return;
                        event.preventDefault();
                        // Only a size that actually moved is worth saying; at a
                        // bound, a held key would otherwise flood the region.
                        const outcome = applySizing(panel.instanceId, command);
                        if (outcome.changed) {
                          setAnnouncement(
                            announcementTemplates.resized({
                              title: panel.title,
                              size: Math.round(outcome.size),
                            }),
                          );
                        }
                      },
                      onPointerDown: (
                        event: ReactPointerEvent<HTMLDivElement>,
                      ) => {
                        const element = ownPanelElement(panel.instanceId);
                        if (!element) return;
                        event.preventDefault();
                        event.currentTarget.setPointerCapture(event.pointerId);
                        drag.current = {
                          panelId: panel.instanceId,
                          startX: event.clientX,
                          startWidth:
                            panelWidths.get(panel.instanceId) ??
                            element.offsetWidth,
                          moved: false,
                        };
                        setResizing(true);
                      },
                      onPointerMove: (
                        event: ReactPointerEvent<HTMLDivElement>,
                      ) => {
                        const active = drag.current;
                        if (active?.panelId !== panel.instanceId) return;
                        const outcome = applySizing(panel.instanceId, {
                          to:
                            active.startWidth + (event.clientX - active.startX),
                        });
                        if (outcome.changed) active.moved = true;
                      },
                      onPointerUp: (
                        event: ReactPointerEvent<HTMLDivElement>,
                      ) => {
                        const active = drag.current;
                        if (active?.panelId !== panel.instanceId) return;
                        drag.current = null;
                        setResizing(false);
                        event.currentTarget.releasePointerCapture(
                          event.pointerId,
                        );
                        // A drag announces once it settles, never per pointer
                        // move. A press that moved nothing is not a resize and
                        // must not claim one.
                        if (!active.moved) return;
                        setAnnouncement(
                          announcementTemplates.resized({
                            title: panel.title,
                            size: Math.round(widthOf(panel.instanceId)),
                          }),
                        );
                      },
                      role: "separator",
                      tabIndex: 0,
                    }),
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
