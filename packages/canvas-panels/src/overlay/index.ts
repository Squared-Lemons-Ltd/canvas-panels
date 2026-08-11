"use client";

/**
 * The optional overlay composition path: a second Canvas Workspace presented
 * above the application for global or modal Panels.
 *
 * Nothing here is a new navigation mechanism. An overlay is an ordinary Panel
 * Engine with an ordinary Bound Canvas Module rendered into it, so Panels open,
 * close, guard, and announce exactly as they do in the primary Canvas. What the
 * overlay adds is presentation: a modal layer that traps and restores focus
 * while the main Canvas is inert, and an Escape order that runs innermost
 * first.
 *
 * Routing into it is explicit and always has been. The overlay object returned
 * by {@link createOverlayWorkspace} is the only way to open a Panel in it;
 * there is deliberately no context, no hook, and no ambient "global layer" a
 * Panel could reach for without naming it. A Panel that calls its own Canvas's
 * `useNavigation()` opens in its own Workspace whether an overlay is presented
 * or not.
 */

import type { ComponentType, KeyboardEvent, ReactNode } from "react";
import {
  createElement,
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import type {
  ClosePanelOutcome,
  OpenPanelOutcome,
  PanelEngine,
  PanelInstanceRef,
  PanelReference,
} from "../core/index.js";
import {
  type OverlayPresentation,
  type OverlayWorkspaceDefinition,
  overlayPresentation,
  resolveOverlayEscape,
} from "./routing.js";

export {
  defineOverlayWorkspace,
  overlayNavigationParameterPrefix,
  overlayPresentation,
  resolveOverlayEscape,
} from "./routing.js";
export type {
  OverlayEscapeAction,
  OverlayEscapeContext,
  OverlayModality,
  OverlayPresentation,
  OverlayWorkspaceDefinition,
} from "./routing.js";

/**
 * The part of a Bound Canvas Module an overlay needs: somewhere to put the
 * engine and something to render the Panel Stack.
 *
 * Structural on purpose. A Bound Canvas Module satisfies it, and stating only
 * what is used keeps the overlay subpath free of any runtime dependency on the
 * `ui` entry point — importing the overlay pulls in nothing an application was
 * not already paying for.
 */
export type OverlayCanvasModule<Reference extends PanelReference> = Readonly<{
  Provider: ComponentType<
    Readonly<{ children: ReactNode; engine?: PanelEngine<Reference> }>
  >;
  Workspace: ComponentType<Readonly<{ label: string }>>;
}>;

/**
 * An application-owned menu, popover, or listbox open inside the overlay.
 * Registering one takes Escape for as long as it is open, so the key closes it
 * before it reaches the overlay.
 */
export type OverlayInnerLayer = Readonly<{
  open: boolean;
  onEscape: () => void;
}>;

export type OverlayHostProps = Readonly<{
  /**
   * The application's main content, including its primary Canvas Workspace. It
   * is made inert while a modal overlay is presented.
   */
  children: ReactNode;
}>;

export type OverlayWorkspace<Reference extends PanelReference> = Readonly<{
  definition: OverlayWorkspaceDefinition;
  engine: PanelEngine<Reference>;
  /**
   * Wraps the application's main content and renders the overlay layer above
   * it. Mount exactly one, as high in the tree as the overlay should cover.
   */
  Host: ComponentType<OverlayHostProps>;
  /** Routes a Panel into this overlay Workspace, and only into this one. */
  open: (
    panel: Reference,
    options?: Readonly<{ origin?: PanelInstanceRef }>,
  ) => OpenPanelOutcome;
  /**
   * Closes the shallowest routed Panel, which empties the overlay through the
   * ordinary Guarded Transition. Refused as `root-panel` when nothing is
   * routed in, because there is then nothing to dismiss.
   */
  dismiss: () => ClosePanelOutcome;
  usePresentation: () => OverlayPresentation;
  useInnerLayer: (layer: OverlayInnerLayer) => void;
}>;

const focusableSelector = [
  "a[href]",
  "button:not(:disabled)",
  "input:not(:disabled)",
  "select:not(:disabled)",
  "textarea:not(:disabled)",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * Creates one overlay Workspace.
 *
 * The engine is supplied rather than created here so the application keeps a
 * single, named handle on the Workspace it is routing to — which is what makes
 * the routing explicit rather than ambient.
 */
export function createOverlayWorkspace<Reference extends PanelReference>(
  options: Readonly<{
    canvas: OverlayCanvasModule<Reference>;
    definition: OverlayWorkspaceDefinition;
    engine: PanelEngine<Reference>;
  }>,
): OverlayWorkspace<Reference> {
  const { canvas, definition, engine } = options;
  const modal = definition.modality === "modal";
  // Registered innermost-last, because a menu opened from a popover mounts
  // after it. Escape asks the last one registered and stops there.
  const innerLayers: { onEscape: () => void }[] = [];

  function useSnapshot() {
    return useSyncExternalStore(
      engine.subscribe,
      engine.getSnapshot,
      engine.getSnapshot,
    );
  }

  function usePresentation(): OverlayPresentation {
    return overlayPresentation(useSnapshot());
  }

  function useInnerLayer(layer: OverlayInnerLayer): void {
    const latest = useRef(layer.onEscape);
    useLayoutEffect(() => {
      latest.current = layer.onEscape;
    }, [layer.onEscape]);
    const open = layer.open;
    useEffect(() => {
      if (!open) return;
      const entry = { onEscape: () => latest.current() };
      innerLayers.push(entry);
      return () => {
        const index = innerLayers.indexOf(entry);
        if (index >= 0) innerLayers.splice(index, 1);
      };
    }, [open]);
  }

  function dismiss(): ClosePanelOutcome {
    const target = overlayPresentation(engine.getSnapshot()).dismissTarget;
    // Nothing routed in means nothing to dismiss. Asking the engine to close
    // without a target reaches its Root Panel, which reports `root-panel` — the
    // engine's own answer, rather than one invented here.
    return engine.close(target ? { target } : undefined);
  }

  function Layer({
    transitionPending,
  }: Readonly<{ transitionPending: boolean }>) {
    const layer = useRef<HTMLDivElement>(null);

    // Presenting the overlay is one claim on focus, honoured exactly once: a
    // presentation is one mount of this component, so an empty dependency list
    // is the whole guard. It must stay that way. The Panel Focus Owner inside
    // the overlay — its own Canvas Workspace — is the only thing that decides
    // where focus goes when a Panel body appears, and this pass is deliberately
    // passive so it runs after that one. It moves focus only when the Workspace
    // put it nowhere, and only onto the layer itself, so a modal overlay always
    // has somewhere for its trap to stand.
    useEffect(() => {
      if (!modal) return;
      const container = layer.current;
      if (!container) return;
      if (container.contains(document.activeElement)) return;
      container.focus({ preventScroll: true });
    }, []);

    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.defaultPrevented) return;
      if (event.key === "Escape") {
        const action = resolveOverlayEscape({
          innerLayers: innerLayers.length,
          transitionPending,
        });
        // The Guarded Transition dialog owns its own keypress; claiming it here
        // would cancel a dismissal and immediately request it again.
        if (action === "guarded-transition") return;
        event.preventDefault();
        event.stopPropagation();
        if (action === "inner-layer") {
          innerLayers.at(-1)?.onEscape();
          return;
        }
        dismiss();
        return;
      }
      // A non-modal overlay is ordinary content: Tab runs through it and out,
      // exactly as the DOM orders it. So does the Guarded Transition dialog's
      // own trap, which is inside this layer and is the innermost modal there
      // is — trapping across the whole layer while it is up would drag focus
      // into the Panels it has made inert.
      if (event.key !== "Tab" || !modal || transitionPending) return;
      const container = layer.current;
      if (!container) return;
      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>(focusableSelector),
      ).filter((element) => !element.closest("[hidden],[inert]"));
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) {
        // Nothing to move between, so the trap holds focus on the layer rather
        // than letting Tab escape into content the overlay has made inert.
        event.preventDefault();
        container.focus({ preventScroll: true });
        return;
      }
      const active = document.activeElement;
      const leaving = event.shiftKey
        ? active === first || active === container
        : active === last;
      if (!leaving) return;
      event.preventDefault();
      (event.shiftKey ? last : first).focus({ preventScroll: true });
    };

    return createElement(
      "div",
      {
        "aria-label": definition.label,
        "aria-modal": modal || undefined,
        "data-canvas-overlay": "",
        "data-canvas-overlay-modality": definition.modality,
        onKeyDown,
        ref: layer,
        role: modal ? "dialog" : "group",
        tabIndex: -1,
      },
      createElement(canvas.Provider, {
        // biome-ignore lint/correctness/noChildrenProp: a Bound Canvas Module's Provider declares `children` as a required prop, so a third argument to `createElement` satisfies React but not the type. The prop form is what keeps the accepted contract honest.
        children: createElement(canvas.Workspace, {
          label: definition.label,
        }),
        engine,
      }),
    );
  }

  function Host({ children }: OverlayHostProps) {
    const snapshot = useSnapshot();
    const { presented } = overlayPresentation(snapshot);
    const covered = presented && modal;
    const main = useRef<HTMLDivElement>(null);
    // Where focus was in the application before the overlay took it.
    //
    // Read here, during the render that first decides to present, and not from
    // any effect: presenting makes the main content inert, and a browser blurs
    // whatever was focused inside an inert subtree during that same commit. By
    // the time the earliest layout effect could look, `document.activeElement`
    // is already the document body and the element to return to has been
    // forgotten. Reading it before the commit is the only moment it still
    // exists. (A focus listener would be the other way, but focus events do not
    // fire at all while the browser window is in the background, and a modal
    // that only restores focus in a foregrounded window is not a guarantee.)
    const returnFocus = useRef<HTMLElement | null>(null);
    const wasPresented = useRef(false);
    if (modal && presented && !wasPresented.current) {
      const active =
        typeof document === "undefined" ? null : document.activeElement;
      // Deliberately no `instanceof HTMLElement`: that global does not exist in
      // every environment this renders in, and reaching for it here would throw
      // during a server render rather than fail quietly.
      const restorable =
        active !== null &&
        typeof (active as Partial<HTMLElement>).focus === "function" &&
        main.current?.contains(active) === true;
      returnFocus.current = restorable ? (active as HTMLElement) : null;
    }
    wasPresented.current = presented;

    // Focus goes back where the overlay found it, and here rather than in the
    // layer's own unmount cleanup. React tears the layer down during the
    // mutation phase, while the main content still carries `inert`, and
    // focusing an inert element is refused outright — so the restore has to
    // wait for the layout phase, once the whole commit has landed and the main
    // content is reachable again.
    useLayoutEffect(() => {
      if (!modal || presented) return;
      const preferred = returnFocus.current;
      returnFocus.current = null;
      if (preferred?.isConnected) preferred.focus({ preventScroll: true });
    }, [presented]);

    return createElement(
      Fragment,
      null,
      createElement(
        "div",
        {
          "aria-hidden": covered ? true : undefined,
          "data-canvas-overlay-main": "",
          inert: covered ? true : undefined,
          ref: main,
        },
        children,
      ),
      presented
        ? createElement(Layer, {
            transitionPending: snapshot.transition !== null,
          })
        : null,
    );
  }

  return Object.freeze({
    Host,
    definition,
    dismiss,
    engine,
    open: (
      panel: Reference,
      openOptions?: Readonly<{ origin?: PanelInstanceRef }>,
    ) =>
      engine.open({
        ...(openOptions?.origin
          ? { originId: openOptions.origin.instanceId }
          : {}),
        panel,
      }),
    useInnerLayer,
    usePresentation,
  });
}
