/**
 * Everything an overlay Workspace decides that does not need React or a DOM:
 * which namespace its persistence claims, whether it is currently presenting
 * anything, and who owns an Escape keypress.
 *
 * The React layer in `./index.ts` is a thin shell over these, so the rules can
 * be read and tested without rendering anything.
 */

import {
  navigationParameterName,
  type PanelEngineSnapshot,
  type PanelInstanceRef,
} from "../core/index.js";

/**
 * The prefix every overlay's Navigation Parameter carries.
 *
 * It is reserved: an overlay namespace is minted rather than accepted verbatim,
 * so an overlay can never be handed the name a primary Canvas Workspace owns.
 */
export const overlayNavigationParameterPrefix = "canvas-overlay-";

/**
 * How an overlay Workspace presents. A modal overlay owns the page while it is
 * up — focus is trapped inside it and the main Canvas is inert. A non-modal one
 * is ordinary content that happens to float: Tab order runs straight through it
 * and out the other side, exactly as the DOM defines it.
 */
export type OverlayModality = "modal" | "non-modal";

export type OverlayWorkspaceDefinition = Readonly<{
  /** The accessible name of the overlay layer. */
  label: string;
  /** The name the application chose, as written. */
  name: string;
  modality: OverlayModality;
  /**
   * The Navigation Parameter name this overlay's persistence claims, distinct
   * from every primary Canvas namespace by construction. Hand it to a
   * Navigation Adapter as its `parameterName` to persist the overlay; it is a
   * History Namespace like any other and is claimed the same way.
   */
  namespace: string;
}>;

const overlayNamePattern = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Declares one overlay Workspace.
 *
 * The namespace is required and minted here rather than defaulted, because an
 * overlay that silently shared the primary Canvas's Navigation Parameter would
 * overwrite the application's own address on its first navigation.
 */
export function defineOverlayWorkspace(
  options: Readonly<{
    label: string;
    name: string;
    modality?: OverlayModality;
    /**
     * The Navigation Parameter the primary Canvas Workspace owns. Supply it
     * when the application renamed it; the default is the package's own.
     */
    primaryNamespace?: string;
  }>,
): OverlayWorkspaceDefinition {
  if (!overlayNamePattern.test(options.name)) {
    throw new Error(
      `An overlay Workspace name must be lowercase, URL-safe, and non-empty: ${JSON.stringify(options.name)}`,
    );
  }
  const primary = options.primaryNamespace ?? navigationParameterName;
  const namespace = `${overlayNavigationParameterPrefix}${options.name}`;
  if (namespace === primary) {
    throw new Error(
      `An overlay Workspace namespace must not collide with the primary Canvas namespace: ${primary}`,
    );
  }
  return Object.freeze({
    label: options.label,
    modality: options.modality ?? "modal",
    name: options.name,
    namespace,
  });
}

export type OverlayPresentation = Readonly<{
  /** Whether the overlay currently has anything routed into it. */
  presented: boolean;
  /** How many Panels the overlay is showing beyond its own Root Panel. */
  panelCount: number;
  /**
   * The Panel a dismissal closes. Closing the shallowest routed Panel takes
   * everything opened from it with it, so one ordinary close command empties
   * the overlay through the ordinary guards.
   */
  dismissTarget: PanelInstanceRef | null;
}>;

/**
 * What an overlay Workspace is showing.
 *
 * An overlay is presented when something has been routed into it, which is
 * exactly when its Panel Stack holds more than its own Root Panel. There is no
 * separate open flag to keep in step with the stack.
 */
export function overlayPresentation(
  snapshot: PanelEngineSnapshot,
): OverlayPresentation {
  const routed = snapshot.panels.slice(1);
  return Object.freeze({
    dismissTarget: routed[0]?.instanceRef ?? null,
    panelCount: routed.length,
    presented: routed.length > 0,
  });
}

export type OverlayEscapeContext = Readonly<{
  /** How many application-owned Overlay Inner Layers are open inside it. */
  innerLayers: number;
  /** Whether the overlay Workspace has a Guarded Transition dialog up. */
  transitionPending: boolean;
}>;

export type OverlayEscapeAction =
  | "guarded-transition"
  | "inner-layer"
  | "dismiss-overlay";

/**
 * Who owns an Escape that reached a presented overlay layer.
 *
 * Nesting runs innermost first. A Guarded Transition dialog is the innermost
 * thing there can be: it is raised by the overlay's own dismissal, it renders
 * above everything else with the rest of the layer inert, and its Escape means
 * "Stay" — cancel the dismissal that raised it. Letting the overlay act on the
 * same keypress would cancel a dismissal and immediately request it again. It
 * is named here rather than simply left alone so that a caller has to decide
 * about it, and `guarded-transition` means the overlay claims nothing.
 *
 * Below the dialog come the application's own Overlay Inner Layers, then the
 * modal overlay itself.
 *
 * There is deliberately no answer here for an overlay that is not presenting.
 * Nothing then renders the layer, so no Escape can reach it and the key goes to
 * the focused Canvas Panel and the application by the ordinary route — an
 * outcome this function could only pretend to decide.
 */
export function resolveOverlayEscape(
  context: OverlayEscapeContext,
): OverlayEscapeAction {
  if (context.transitionPending) return "guarded-transition";
  if (context.innerLayers > 0) return "inner-layer";
  return "dismiss-overlay";
}
