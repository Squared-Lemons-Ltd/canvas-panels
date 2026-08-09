"use client";

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
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { ComponentType, ReactNode } from "react";

type PanelDefinitionShape = Readonly<{
  role: "panel";
  kind: string;
  deduplication: PanelDeduplication;
  closable: boolean;
  key?: (input: never) => string;
  title: (input: never) => string;
  reference: (input: never) => PanelReference<string, unknown>;
  update?: Readonly<{
    validate: (update: unknown) => boolean;
    validateResult: (value: unknown) => boolean;
    apply: (current: never, update: never) => unknown;
    navigation: "replace" | "none";
  }>;
}>;

type ReferenceOf<Definition> =
  Definition extends PanelDefinition<infer Kind, infer Input>
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
    : Definition extends PanelDefinition<infer Kind, infer Input>
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
      await resolveTransition({ decision });
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
        `Unsaved changes in ${transition.panelTitle}`,
      ),
      createElement("p", { id: messageId }, transition.message),
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
          "Save",
        ),
        createElement(
          "button",
          {
            disabled: busy,
            onClick: () => void decide("discard"),
            type: "button",
          },
          "Discard",
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
    useLayoutEffect(() => {
      latest.current = lifecycle;
    }, [lifecycle]);
    useEffect(
      () =>
        register(
          Object.freeze({
            guard: (transition) => latest.current.guard(transition),
            save: () => latest.current.save(),
            discard: () => latest.current.discard(),
          }),
        ),
      [register],
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
    const application = useRef<HTMLDivElement>(null);
    const returnFocus = useRef<HTMLElement | null>(null);
    const previousTransition = useRef(snapshot.transition);
    const renderers = config.renderers as Readonly<
      Record<string, ComponentType<CanvasPanelRenderProps<Reference>>>
    >;

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
          "aria-hidden": snapshot.transition ? true : undefined,
          inert: snapshot.transition ? true : undefined,
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
              createElement("h2", { id: headingId, tabIndex: -1 }, panel.title),
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
              registerLifecycle,
            }),
          );
        }),
      ),
      snapshot.transition
        ? createElement(GuardedTransitionDialog, {
            resolveTransition,
            transition: snapshot.transition,
          })
        : null,
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
