"use client";

import type { ComponentType, ReactNode } from "react";
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  createPanelEngine,
  type OpenPanel,
  type PanelDeduplication,
  type PanelDefinition,
  type PanelEngine,
  type PanelLifecycle,
  type PanelReference,
  type PendingGuardedTransition,
  type RootPanelDefinition,
} from "../core/index.js";
import { type CanvasBinding, createCanvasBindings } from "../react/index.js";

type WorkspaceHierarchy = Readonly<{
  reportPending: (workspaceId: string, pending: boolean) => void;
}>;

const WorkspaceHierarchyContext = createContext<WorkspaceHierarchy | null>(
  null,
);

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

type OpenPanelForDefinition<Definition> =
  Definition extends RootPanelDefinition<infer Kind>
    ? Omit<OpenPanel, "isRoot" | "kind" | "reference"> &
        Readonly<{
          isRoot: true;
          kind: Kind;
          reference: PanelReference<Kind, undefined>;
        }>
    : Definition extends PanelDefinition<
          infer Kind,
          infer Input,
          infer _Update,
          infer _Descriptor
        >
      ? Omit<OpenPanel, "isRoot" | "kind" | "reference"> &
          Readonly<{
            isRoot: false;
            kind: Kind;
            reference: PanelReference<Kind, Input>;
          }>
      : never;

export type CanvasPanelRenderProps<
  Reference extends PanelReference = PanelReference,
  Panel extends OpenPanel = OpenPanel,
> = Readonly<{
  panel: Panel;
  open: PanelEngine<Reference>["open"];
  close: CanvasBinding<Reference>["close"];
}>;

type CanvasRendererMap<
  Root extends RootPanelDefinition,
  Definitions extends readonly PanelDefinitionShape[],
> = Readonly<{
  [Definition in
    | Root
    | Definitions[number] as Definition["kind"]]: ComponentType<
    CanvasPanelRenderProps<
      AllowedReference<Definitions>,
      OpenPanelForDefinition<Definition>
    >
  >;
}>;

export type CanvasWorkspaceProps = Readonly<{
  label: string;
}>;

export type CanvasModuleProviderProps<
  Reference extends PanelReference = PanelReference,
> = Readonly<{
  children: ReactNode;
  engine?: PanelEngine<Reference>;
}>;

export type BoundCanvasModule<Reference extends PanelReference> = Readonly<{
  Provider: ComponentType<CanvasModuleProviderProps<Reference>>;
  Workspace: ComponentType<CanvasWorkspaceProps>;
  createEngine: () => PanelEngine<Reference>;
  useCanvas: () => CanvasBinding<Reference>;
  useLifecycle: (lifecycle: PanelLifecycle) => void;
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
>(config: {
  root: Root;
  panels: Definitions;
  renderers: CanvasRendererMap<Root, Definitions>;
}): BoundCanvasModule<AllowedReference<Definitions>> {
  type Reference = AllowedReference<Definitions>;
  const bindings = createCanvasBindings<Reference>();
  const LifecycleRegistrationContext = createContext<
    ((lifecycle: PanelLifecycle) => () => void) | null
  >(null);
  const createEngine = () =>
    createPanelEngine({ root: config.root, panels: config.panels });

  function useLifecycle(lifecycle: PanelLifecycle): void {
    const register = useContext(LifecycleRegistrationContext);
    if (!register) {
      throw new Error(
        "Canvas lifecycle hooks must run inside a Panel renderer",
      );
    }
    const latest = useRef(lifecycle);
    const dirty = lifecycle.dirty;
    useLayoutEffect(() => {
      latest.current = lifecycle;
    }, [lifecycle]);
    useEffect(
      () =>
        register(
          Object.freeze<PanelLifecycle>({
            ...(dirty === undefined ? {} : { dirty }),
            guard: (transition) => latest.current.guard(transition),
            save: (operation) => latest.current.save(operation),
            discard: (operation) => latest.current.discard(operation),
          }),
        ),
      [dirty, register],
    );
  }

  function ScopedRenderer({
    Renderer,
    panel,
    open,
    close,
    registerLifecycle,
  }: Readonly<{
    Renderer: ComponentType<CanvasPanelRenderProps<Reference>>;
    panel: OpenPanel;
    open: PanelEngine<Reference>["open"];
    close: CanvasBinding<Reference>["close"];
    registerLifecycle: CanvasBinding<Reference>["registerLifecycle"];
  }>) {
    const register = useCallback(
      (lifecycle: PanelLifecycle) =>
        registerLifecycle({ target: panel.instanceRef, lifecycle }),
      [panel.instanceRef, registerLifecycle],
    );
    return createElement(
      LifecycleRegistrationContext.Provider,
      { value: register },
      createElement(Renderer, { panel, open, close }),
    );
  }

  function Provider({
    children,
    engine: suppliedEngine,
  }: CanvasModuleProviderProps<Reference>) {
    const [engine] = useState(() => suppliedEngine ?? createEngine());
    return createElement(bindings.Provider, { children, engine });
  }

  function Workspace({ label }: CanvasWorkspaceProps) {
    const { snapshot, open, close, registerLifecycle, resolveTransition } =
      bindings.useCanvas();
    const workspaceId = useId();
    const parentWorkspace = useContext(WorkspaceHierarchyContext);
    const application = useRef<HTMLDivElement>(null);
    const returnFocus = useRef<HTMLElement | null>(null);
    const previousTransition = useRef(snapshot.transition);
    const [dirtyPanelIds, setDirtyPanelIds] = useState<ReadonlySet<string>>(
      () => new Set(),
    );
    const [pendingDescendantIds, setPendingDescendantIds] = useState<
      ReadonlySet<string>
    >(() => new Set());
    const renderers = config.renderers as Readonly<
      Record<string, ComponentType<CanvasPanelRenderProps<Reference>>>
    >;
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
      if (previousTransition.current && !snapshot.transition) {
        const preferred = returnFocus.current;
        const fallback =
          application.current?.querySelector<HTMLElement>("[data-active] h2");
        (preferred?.isConnected ? preferred : fallback)?.focus();
        returnFocus.current = null;
      }
      previousTransition.current = snapshot.transition;
    }, [snapshot.transition]);

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

    const rememberFocus = () => {
      returnFocus.current =
        typeof document !== "undefined" &&
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
    };
    const guardedOpen: typeof open = (command) => {
      rememberFocus();
      return open(command);
    };

    return createElement(
      WorkspaceHierarchyContext.Provider,
      { value: hierarchy },
      createElement(
        "div",
        {
          "aria-label": label,
          "data-canvas-workspace": "",
          role: "region",
        },
        createElement(
          "div",
          {
            "data-testid": "canvas-panels-application",
            "aria-hidden": deepestTransition ? true : undefined,
            inert: deepestTransition ? true : undefined,
            ref: application,
          },
          snapshot.panels.map((panel, panelIndex) => {
            const headingId = `${workspaceId}-panel-${panelIndex}-heading`;
            const Renderer = renderers[panel.kind];
            if (!Renderer) {
              throw new Error(
                `No renderer registered for Panel Kind: ${panel.kind}`,
              );
            }

            return createElement(
              "section",
              {
                "aria-labelledby": headingId,
                "data-active":
                  panel.instanceId === snapshot.activePanelId ? "" : undefined,
                "data-canvas-panel": "",
                "data-panel-kind": panel.kind,
                key: panel.instanceId,
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
              createElement(ScopedRenderer, {
                Renderer,
                panel,
                open: guardedOpen,
                close,
                registerLifecycle: registerWorkspaceLifecycle,
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
    );
  }

  return Object.freeze({
    Provider,
    Workspace,
    createEngine,
    useCanvas: bindings.useCanvas,
    useLifecycle,
  });
}
