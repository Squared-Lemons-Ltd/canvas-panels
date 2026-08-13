"use client";

/* ------------------------------------------------------------------------ *
 *  Tethers.
 *
 *  The rail says which Panels are open and how each step was named. It cannot
 *  say which line on the page produced the next Panel — and that is the part a
 *  reader has to take on trust otherwise, because the moment an account opens,
 *  the row that opened it stops being distinguishable from its neighbours.
 *
 *  This layer draws that link: the row a Panel came from stays lit, and a line
 *  runs from it to the Panel it opened.
 *
 *  It reads the same trail the rail reads, so the two can never disagree about
 *  what the stack is. Everything else it needs is measured out of the DOM,
 *  because where a row sits inside a scrolled Panel is not something the Panel
 *  Engine knows or should.
 *
 *  Nothing here is load-bearing. Every Panel is completely readable with the
 *  tethers absent, and every path out of this file when the geometry cannot be
 *  had is to draw nothing at all.
 * ------------------------------------------------------------------------ */

import { useEffect, useRef, useState } from "react";

import { type TrailStation, useTrail } from "./trail";

/**
 * The contract with the Panel renderers, in both directions.
 *
 * `data-meridian-record` is written by `pipeline-canvas.tsx` and
 * `record-parts.tsx` onto every control that opens a record, carrying that
 * record's id. This layer never has to know what a deal card or a related-
 * account row is; it only has to ask a Panel for the element naming the record
 * the *next* Panel shows.
 *
 * `data-meridian-tethered` goes back the other way: this layer writes it onto
 * the element it found, and those two files carry the styling for it. It is an
 * attribute rather than a class because React owns `className` on those
 * elements and would wipe a class the next time it re-rendered one.
 */
const recordAttribute = "data-meridian-record";
const litAttribute = "data-meridian-tethered";

/** Where a tether starts and where it lands, in the overlay's own coordinates. */
type Tether = Readonly<{
  key: string;
  path: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
}>;

/** One step of the trail, resolved to the three elements it is drawn between. */
type Pair = Readonly<{
  key: string;
  /** The control inside `origin` that names the record `opened` shows. */
  source: HTMLElement;
  origin: HTMLElement;
  opened: HTMLElement;
}>;

/**
 * Panel elements are found by instance id, but only ever as a *direct child* of
 * this Canvas's own application element. Instance ids survive a server render
 * now, yet they are unique only within one Canvas Workspace — and this app
 * mounts a second Workspace for the command palette, so a document-wide lookup
 * would sooner or later measure the wrong Canvas entirely.
 */
function panelElement(
  application: HTMLElement,
  instanceId: string,
): HTMLElement | null {
  return application.querySelector<HTMLElement>(
    `:scope > [data-canvas-panel-id="${CSS.escape(instanceId)}"]`,
  );
}

/**
 * The trail, read as the pairs it can actually be drawn between.
 *
 * A step survives to here only if both its Panels are in the presentation the
 * responsive layout has chosen: a Panel the Canvas has marked `hidden` and
 * `inert` is still open and still on the rail, but it has no box, so anything
 * measured against it would be a line drawn to the origin of the page.
 */
function collectPairs(
  application: HTMLElement,
  stations: readonly TrailStation[],
): readonly Pair[] {
  const pairs: Pair[] = [];
  for (let index = 0; index + 1 < stations.length; index += 1) {
    const from = stations[index];
    const to = stations[index + 1];
    if (!from || !to || !from.visible || !to.visible) continue;
    if (to.recordId === null) continue;
    const origin = panelElement(application, from.panel.instanceId);
    const opened = panelElement(application, to.panel.instanceId);
    if (!origin || !opened || origin.hidden || opened.hidden) continue;
    const source = origin.querySelector<HTMLElement>(
      `[${recordAttribute}="${CSS.escape(to.recordId)}"]`,
    );
    if (!source) continue;
    pairs.push({ key: `${from.key}>${to.key}`, source, origin, opened });
  }
  return pairs;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * One tether, or nothing.
 *
 * The refusals matter more than the arithmetic. A source scrolled out of its
 * own Panel body would otherwise be drawn to a point sitting behind the Panel
 * header, which claims a row is there when it is not; a Panel scrolled out of
 * the Canvas sideways is the same lie told horizontally. Both are better said
 * by an absent line than by a wrong one.
 */
function measurePair(
  pair: Pair,
  layer: DOMRect,
  canvas: DOMRect,
): Tether | null {
  const sourceBox = pair.source.getBoundingClientRect();
  const openedBox = pair.opened.getBoundingClientRect();
  if (sourceBox.width === 0 || openedBox.width === 0) return null;

  const sourceY = sourceBox.top + sourceBox.height / 2;
  const body = pair.origin.querySelector<HTMLElement>(
    ":scope > [data-canvas-panel-body]",
  );
  if (body) {
    const bodyBox = body.getBoundingClientRect();
    if (sourceY < bodyBox.top || sourceY > bodyBox.bottom) return null;
  }
  if (sourceBox.right < canvas.left || sourceBox.left > canvas.right) {
    return null;
  }

  // The line lands on the opened Panel's header rather than its middle: the
  // header is where that Panel says what it is, which is the sentence the
  // tether is completing.
  const header = pair.opened.querySelector<HTMLElement>(
    ":scope > [data-canvas-panel-header]",
  );
  const headerBox = header?.getBoundingClientRect();
  const sourceX = round(sourceBox.right - layer.left);
  const targetX = round(openedBox.left - layer.left);
  const targetY = round(
    (headerBox ? headerBox.top + headerBox.height / 2 : openedBox.top + 24) -
      layer.top,
  );
  const start = round(sourceY - layer.top);
  const reach = Math.max(20, (targetX - sourceX) * 0.55);

  return {
    key: pair.key,
    path: `M ${sourceX} ${start} C ${round(sourceX + reach)} ${start}, ${round(targetX - reach)} ${targetY}, ${targetX} ${targetY}`,
    sourceX,
    sourceY: start,
    targetX,
    targetY,
  };
}

/**
 * One tether's arrival.
 *
 * The line draws itself from the row towards the Panel, which is the direction
 * the reader's own click travelled; the anchor on the row and the whole of the
 * Panel beneath are there in full from the first frame, so nothing anybody has
 * to read is waiting on this. It runs once, when a step is genuinely new — a
 * tether that was already on screen is remeasured, not re-announced.
 */
function TetherPath({
  animate,
  tether,
}: Readonly<{ animate: boolean; tether: Tether }>) {
  const [drawn, setDrawn] = useState(!animate);
  useEffect(() => {
    if (drawn) return;
    const frame = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(frame);
  }, [drawn]);

  // `pathLength` normalises the curve to 1 so the dash that hides it needs no
  // measurement of its own — the length changes on every scroll, and a dash
  // array computed from it would have to be recomputed with it.
  const line = {
    d: tether.path,
    fill: "none",
    pathLength: 1,
    stroke: "currentColor",
    strokeDasharray: 1,
    strokeDashoffset: drawn ? 0 : 1,
    strokeLinecap: "round" as const,
    ...(animate
      ? {
          style: {
            transition: "stroke-dashoffset 320ms cubic-bezier(0.16, 1, 0.3, 1)",
          },
        }
      : {}),
  };

  return (
    <g>
      {/* The tether crosses Panel borders and body text, so it carries the page
          colour under it rather than relying on the line being dark enough. */}
      <path {...line} className="text-background" strokeWidth={4} />
      <path {...line} className="text-primary" strokeWidth={1.75} />
      <circle
        className="text-background"
        cx={tether.sourceX}
        cy={tether.sourceY}
        fill="currentColor"
        r={4.5}
      />
      <circle
        className="text-primary"
        cx={tether.sourceX}
        cy={tether.sourceY}
        fill="currentColor"
        r={2.75}
      />
      {/* Both ends of the curve leave horizontally, so the head needs no
          rotation to point the way the line arrives. */}
      <path
        className="text-primary"
        d={`M ${round(tether.targetX - 4.5)} ${round(tether.targetY - 3.5)} L ${tether.targetX} ${tether.targetY} L ${round(tether.targetX - 4.5)} ${round(tether.targetY + 3.5)}`}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.75}
        {...(animate
          ? {
              style: {
                opacity: drawn ? 1 : 0,
                transition: "opacity 200ms cubic-bezier(0.16, 1, 0.3, 1) 160ms",
              },
            }
          : {})}
      />
    </g>
  );
}

export function TetherLayer() {
  const stations = useTrail();
  const layer = useRef<HTMLDivElement>(null);
  const [tethers, setTethers] = useState<readonly Tether[]>([]);
  // A deep link arrives with its whole stack already open. Every tether on it
  // is new, and animating all of them would show the reader a picture being
  // assembled that was finished before they got here.
  const painted = useRef(false);
  // Whether this reader has asked for motion at all, taken from the Canvas
  // rather than from `matchMedia`. The package forces its own transitions to
  // zero under a reduced-motion preference, so a Panel that is not going to
  // animate is the same reader who should not be shown a line drawing itself —
  // and one source for the answer cannot drift from the other.
  const motion = useRef(false);
  const [settling, setSettling] = useState(false);

  useEffect(() => {
    const overlay = layer.current;
    const container = overlay?.parentElement;
    const application = container?.querySelector<HTMLElement>(
      "[data-canvas-application]",
    );
    if (!overlay || !container || !application) return;

    // Every element this run has lit, rather than the ones it lit first. A
    // Panel body that re-renders its list hands back a different element for
    // the same row, and putting the light out has to reach that one too.
    const lit = new Set<HTMLElement>();
    const light = (element: HTMLElement) => {
      element.setAttribute(litAttribute, "");
      lit.add(element);
    };

    // Lighting the sources is settled the moment the stack is: it needs no
    // geometry, so it must not wait on any. Measuring, below, does.
    const pairs = collectPairs(application, stations);
    for (const pair of pairs) light(pair.source);

    let frame = 0;
    // A Panel measured mid-transition gives the wrong number. The Canvas
    // animates `flex-basis` when a Panel opens, so the effect that observed the
    // stack change is running against a layout that has not finished moving —
    // a Panel reads 576 wide on its way to 384. Nothing is drawn until it has.
    let moving = true;

    const measure = () => {
      const layerBox = overlay.getBoundingClientRect();
      const canvasBox = application.getBoundingClientRect();
      const drawn: Tether[] = [];
      for (const pair of collectPairs(application, stations)) {
        // Re-asserted rather than assumed: a Panel body that re-rendered its
        // list since the marking above would have dropped the attribute with
        // the old element, and a lit row is not something to lose quietly.
        light(pair.source);
        const tether = measurePair(pair, layerBox, canvasBox);
        if (tether) drawn.push(tether);
      }
      setTethers(drawn);
      setSettling(false);
      painted.current = true;
    };

    const schedule = () => {
      if (moving || frame !== 0) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };

    const first = pairs[0];
    const duration = first
      ? Number.parseFloat(getComputedStyle(first.origin).transitionDuration) *
        1000
      : 0;
    const settle = Number.isFinite(duration) ? duration : 0;
    motion.current = settle > 0;
    // Held at zero rather than torn down: the tethers that survive this change
    // keep their elements, and so keep the fact that they have already been
    // drawn once. Only genuinely new steps arrive with an animation to run.
    setSettling(settle > 0);
    // Later than the Canvas's own settle by more than a frame, and deliberately
    // later than `useActivePanelInView`, which brings the newly opened Panel
    // into view at the same moment the transition ends. Measuring first would
    // read every Panel at the position it is about to be scrolled away from.
    const timer = window.setTimeout(() => {
      moving = false;
      measure();
    }, settle + 90);

    // Scroll events do not bubble, but they are still delivered to capturing
    // listeners on the way down — which is the only way to hear both the
    // Canvas's own sideways scroll and the vertical scroll of every Panel body
    // without re-binding as Panels come and go.
    container.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(overlay);
    observer.observe(application);
    // Every Panel in the stack appears in some pair, and dragging any Panel's
    // resize handle moves every Panel to its right.
    for (const pair of pairs) {
      observer.observe(pair.origin);
      observer.observe(pair.opened);
    }

    return () => {
      window.clearTimeout(timer);
      if (frame !== 0) cancelAnimationFrame(frame);
      observer.disconnect();
      container.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      for (const element of lit) element.removeAttribute(litAttribute);
    };
  }, [stations]);

  return (
    <div
      aria-hidden="true"
      // Above the Canvas rather than merely after it: the Panel resize handles
      // are positioned and stacked, so document order alone would let one of
      // them paint over the line. `pointer-events-none` is what keeps that from
      // costing the reader a click.
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
      data-meridian-tethers=""
      ref={layer}
    >
      <svg
        aria-hidden="true"
        className="absolute inset-0 size-full"
        role="presentation"
        style={{
          opacity: settling ? 0 : 1,
          transition: "opacity 120ms linear",
        }}
      >
        {tethers.map((tether) => (
          <TetherPath
            animate={painted.current && motion.current}
            key={tether.key}
            tether={tether}
          />
        ))}
      </svg>
    </div>
  );
}
