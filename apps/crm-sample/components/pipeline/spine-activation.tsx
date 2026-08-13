"use client";

/* ------------------------------------------------------------------------ *
 *  Clicking a spine.
 *
 *  A Panel the reader has gone past is compressed to its edge, which is a
 *  legible thing to look at and an obvious thing to want to click. The Canvas
 *  offers no affordance for it: a Panel's own chrome carries no control that
 *  activates it, so the rail above is the only pointer route back.
 *
 *  Clicking a spine did do something, which was worse than nothing — the
 *  heading takes focus, `:focus-within` expands the Panel, and it shuts again
 *  the moment focus moves. A peek that looks like a navigation.
 *
 *  So the click is handled here instead, on the Canvas rather than on any one
 *  Panel, because the Panels are the package's to render and this application
 *  has nowhere inside them to put a handler.
 * ------------------------------------------------------------------------ */

import { useEffect, useLayoutEffect, useRef } from "react";

import { PipelineCanvas } from "./pipeline-canvas";
import { useTrail } from "./trail";

/**
 * The property the spine rule declares on a Panel it has collapsed.
 *
 * Asked of the Panel rather than re-stating the selector that collapsed it:
 * the rule already carries a decision about which Panels are behind the reader
 * and at what width, and a second copy of it here would be free to disagree.
 */
const spineMarker = "--meridian-spine-width";

export function SpineActivation() {
  const stations = useTrail();
  const navigation = PipelineCanvas.useNavigation();

  // `useNavigation()` hands back a new frozen object on every render, so it can
  // never be an effect dependency — the effect would detach and reattach its
  // listener on every render of the Canvas. The ref is the workaround; the
  // package gap is written up in the README.
  const latest = useRef(navigation);
  useLayoutEffect(() => {
    latest.current = navigation;
  });

  useEffect(() => {
    const application = document
      .getElementById("canvas-mount")
      ?.querySelector<HTMLElement>("[data-canvas-application]");
    if (!application) return;

    // On `pointerdown`, not `click`. Pressing a spine focuses the heading
    // inside it, `:focus-within` expands the Panel, and all of that happens
    // before the click event arrives — so by then the Panel under the pointer
    // is no longer a spine and the test below refuses a press that was
    // unambiguously on one.
    const activate = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const panel = target.closest<HTMLElement>("[data-canvas-panel]");
      // Direct children only: a Workspace nested inside a Panel would
      // otherwise hand back one of its own Panels, which this Canvas has never
      // heard of.
      if (!panel || panel.parentElement !== application) return;
      if (
        getComputedStyle(panel).getPropertyValue(spineMarker).trim().length ===
        0
      ) {
        return;
      }
      const station = stations.find(
        ({ key }) => key === panel.getAttribute("data-canvas-panel-id"),
      );
      if (!station) return;
      latest.current.activate(station.panel);
    };

    application.addEventListener("pointerdown", activate);
    return () => application.removeEventListener("pointerdown", activate);
  }, [stations]);

  return null;
}
