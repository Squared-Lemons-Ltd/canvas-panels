"use client";

/* ------------------------------------------------------------------------ *
 *  The trail.
 *
 *  A Panel Stack is a path somebody walked through the data, and the Canvas
 *  presents it as position: the Panel you came from is to the left of the one
 *  you are reading. That reads perfectly once you already understand it, and
 *  not at all before — which is the whole difficulty with demonstrating this
 *  framework rather than merely using it.
 *
 *  So the path is drawn as a path. Every Panel is a station, every step
 *  between two of them is labelled with the relationship that produced it, and
 *  the whole thing stays on screen even when the Panels themselves have
 *  scrolled away or the presentation has hidden them.
 *
 *  Nothing here is stored. A Panel's descriptor is the id of the record it
 *  shows, so the stack plus the dataset is enough to work out both what each
 *  station is and how it was reached — which means the trail survives a deep
 *  link without the link having to carry it. That is not a coincidence: it is
 *  what descriptors-are-ids buys, made visible.
 * ------------------------------------------------------------------------ */

import type { PanelInstanceRef } from "@squared-lemons-ltd/canvas-panels/core";
import { useEffect, useMemo, useRef, useState } from "react";

import { PipelineCanvas } from "./pipeline-canvas";

type StationKind = "pipeline" | "deal" | "company" | "contact" | "stage";

export type TrailStation = Readonly<{
  /** Stable for as long as the Panel is open, and unique within this Canvas. */
  key: string;
  panel: PanelInstanceRef;
  kind: StationKind;
  title: string;
  /** The record this station shows, or `null` for the board itself. */
  recordId: string | null;
  /** The relationship that led here from the station before it. */
  step: string | null;
  active: boolean;
  /** Whether the responsive presentation is currently showing this Panel. */
  visible: boolean;
}>;

function isStationKind(kind: string): kind is StationKind {
  return (
    kind === "pipeline" ||
    kind === "deal" ||
    kind === "company" ||
    kind === "contact" ||
    kind === "stage"
  );
}

/** The one field a Panel descriptor carries, whichever Kind it belongs to. */
function recordIdOf(kind: StationKind, descriptor: unknown): string | null {
  if (typeof descriptor !== "object" || descriptor === null) return null;
  const field = {
    pipeline: null,
    deal: "dealId",
    company: "companyId",
    contact: "contactId",
    stage: "stage",
  }[kind];
  if (field === null) return null;
  const value = (descriptor as Record<string, unknown>)[field];
  return typeof value === "string" ? value : null;
}

/**
 * What the step from one Kind to the next means, in the reader's language
 * rather than the framework's.
 *
 * Only the pair of Kinds is needed, because the Panel Registry allows exactly
 * one relationship between any two of them: an account opened from a deal is
 * always *that deal's* account, because that is the only account a deal has.
 * Where a Kind could be reached two ways the label names the origin, so a step
 * never claims more than the stack can prove.
 */
const stepLabels: Readonly<Record<string, string>> = Object.freeze({
  "pipeline>deal": "deal",
  "pipeline>company": "account",
  "pipeline>contact": "person",
  "pipeline>stage": "stage",
  "stage>deal": "deal in this stage",
  "deal>company": "account",
  "deal>contact": "contact",
  "company>deal": "deal here",
  "company>contact": "person here",
  "contact>deal": "on this deal",
  "contact>company": "employer",
});

function stepLabel(from: StationKind, to: StationKind): string {
  return stepLabels[`${from}>${to}`] ?? "opened";
}

/**
 * The Panel Stack, read as a path.
 *
 * Exported because the tethers and the spines answer to the same reading of
 * the stack; two devices disagreeing about what the trail is would be worse
 * than either of them being absent.
 */
export function useTrail(): readonly TrailStation[] {
  const stack = PipelineCanvas.useStack();
  // `useStack` only publishes a new array when the stack really changed, and
  // the trail has to inherit that: anything watching it for arrivals and
  // departures would otherwise see one on every render.
  return useMemo(() => {
    const stations: TrailStation[] = [];
    for (const entry of stack) {
      if (!isStationKind(entry.kind)) continue;
      const previous = stations.at(-1);
      stations.push(
        Object.freeze({
          key: entry.panel.instanceId,
          panel: entry.panel,
          kind: entry.kind,
          title: entry.title,
          recordId: recordIdOf(entry.kind, entry.descriptor),
          step: previous ? stepLabel(previous.kind, entry.kind) : null,
          active: entry.active,
          visible: entry.visible,
        }),
      );
    }
    return Object.freeze(stations);
  }, [stack]);
}

/**
 * Stations that have just left the stack, kept on screen long enough to be
 * seen leaving.
 *
 * Branch Replacement is the Canvas behaviour that is hardest to believe and
 * easiest to miss: open something from a Panel halfway along the trail and
 * everything after it is closed. Removed instantly it looks like a redraw.
 * Given a moment to collapse, it reads as what it is.
 */
function useRetiringStations(
  stations: readonly TrailStation[],
): readonly TrailStation[] {
  const previous = useRef<readonly TrailStation[]>([]);
  const [retiring, setRetiring] = useState<readonly TrailStation[]>([]);

  useEffect(() => {
    const present = new Set(stations.map(({ key }) => key));
    const departed = previous.current.filter(({ key }) => !present.has(key));
    previous.current = stations;
    if (departed.length > 0) setRetiring(departed);
  }, [stations]);

  // The clock belongs to the departing stations rather than to the stack that
  // sent them away: sharing one effect lets a later render's cleanup cancel a
  // timer that has not fired, and the collapse never finishes.
  useEffect(() => {
    if (retiring.length === 0) return;
    const timer = setTimeout(() => setRetiring([]), 260);
    return () => clearTimeout(timer);
  }, [retiring]);

  // A station that comes back before its collapse finishes is present, not
  // departing, and must not be drawn twice.
  const present = new Set(stations.map(({ key }) => key));
  return retiring.filter(({ key }) => !present.has(key));
}

/**
 * The line between two stations, carrying the name of the relationship that
 * produced the step.
 *
 * The line runs behind the label rather than stopping either side of it, so
 * the trail reads as one continuous thing that the reader travelled along.
 * Past the Active Panel it fades: the stack still holds those Panels, but they
 * are ahead of where the reader is standing, which is the difference between
 * activating an earlier Panel and closing the ones after it.
 */
function Step({ label, ahead }: Readonly<{ label: string; ahead: boolean }>) {
  return (
    <span
      aria-hidden
      className={`relative mx-1 flex h-7 min-w-[6rem] shrink-0 items-center justify-center ${
        ahead ? "opacity-45" : ""
      }`}
    >
      <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" />
      <svg
        aria-hidden="true"
        className="absolute right-0 top-1/2 -translate-y-1/2 text-border"
        fill="none"
        height="7"
        role="presentation"
        viewBox="0 0 5 7"
        width="5"
      >
        <path
          d="M1 1l3 2.5L1 6"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.25"
        />
      </svg>
      <span
        className="relative bg-background px-1.5 text-[0.6875rem] leading-none tracking-tight text-muted-foreground"
        data-meridian-step=""
      >
        {label}
      </span>
    </span>
  );
}

/**
 * One station. Selecting it activates its Panel, which is the Canvas's own
 * answer to "take me back to where I was" and needs no history of its own.
 */
function Station({
  station,
  ahead,
  onActivate,
}: Readonly<{
  station: TrailStation;
  ahead: boolean;
  onActivate: (panel: PanelInstanceRef) => void;
}>) {
  return (
    <button
      aria-current={station.active ? "true" : undefined}
      className={`group relative flex shrink-0 items-center gap-2 rounded-full bg-background py-1 pl-1 pr-2.5 text-sm transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
        ahead ? "opacity-45" : ""
      }`}
      data-meridian-station={station.kind}
      onClick={() => onActivate(station.panel)}
      type="button"
    >
      <span
        aria-hidden
        className={
          station.active
            ? "size-2.5 shrink-0 rounded-full bg-primary ring-4 ring-primary/25"
            : "size-2.5 shrink-0 rounded-full border-[1.5px] border-muted-foreground/60 bg-background transition-colors group-hover:border-foreground"
        }
      />
      <span
        className={
          station.active
            ? "max-w-[15rem] shrink-0 truncate font-medium tracking-tight text-foreground"
            : "max-w-[11rem] shrink-0 truncate text-muted-foreground transition-colors group-hover:text-foreground"
        }
      >
        {station.title}
      </span>
    </button>
  );
}

export function CanvasTrail() {
  const stations = useTrail();
  const retiring = useRetiringStations(stations);
  const navigation = PipelineCanvas.useNavigation();
  const activeIndex = stations.findIndex(({ active }) => active);

  return (
    <nav
      aria-label="Trail through the pipeline"
      className="flex shrink-0 items-center overflow-x-auto border-b border-border bg-background px-3 py-2.5"
      data-meridian-trail=""
    >
      <ol className="flex w-max shrink-0 items-center">
        {stations.map((station, index) => {
          // Panels the reader has stepped back from are still open and still
          // reachable; they are simply not where the reader is.
          const ahead = activeIndex >= 0 && index > activeIndex;
          return (
            <li className="flex shrink-0 items-center" key={station.key}>
              {station.step === null ? null : (
                <Step ahead={ahead} label={station.step} />
              )}
              <Station
                ahead={ahead}
                onActivate={(panel) => navigation.activate(panel)}
                station={station}
              />
            </li>
          );
        })}
        {retiring.map((station) => (
          <li
            aria-hidden
            className="flex shrink-0 items-center"
            data-meridian-station-retiring=""
            key={station.key}
          >
            {station.step === null ? null : (
              <Step ahead={false} label={station.step} />
            )}
            <Station ahead={false} onActivate={() => {}} station={station} />
          </li>
        ))}
      </ol>
    </nav>
  );
}
