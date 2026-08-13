"use client";

/* ------------------------------------------------------------------------ *
 *  The event channel.
 *
 *  Most of what this framework does, it does silently and correctly: a Panel
 *  is reused rather than opened twice, a branch is replaced, a close is held
 *  because a Panel has unsaved work, a record changes under three Panels at
 *  once and each decides for itself what to do about it.
 *
 *  Silent and correct is right for a product and useless for a demonstration.
 *  This says what the Canvas just did, in the reader's language.
 *
 *  Everything here is derived rather than reported. The Canvas publishes a
 *  Panel Stack and a transition status; it does not publish the commands that
 *  produced them. So this reads the effect and describes it — and where two
 *  commands leave the Canvas in the same state, it says only what the stack
 *  proves and admits the rest in the expanded view. A demonstration that
 *  overclaims teaches the reader something false about the framework, which is
 *  worse than teaching them nothing.
 *
 *  Nothing here is load-bearing. Ignore the strip entirely and the app works
 *  exactly as it did.
 * ------------------------------------------------------------------------ */

import {
  type ResourceInvalidation,
  useResourceSubscription,
} from "@squaredlemons/canvas-panels/extensions/resources";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CircleDotIcon,
  CornerUpLeftIcon,
  Link2OffIcon,
  LinkIcon,
  type LucideIcon,
  PauseIcon,
  RadioTowerIcon,
  ScissorsIcon,
  WaypointsIcon,
  XIcon,
} from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { getCompany, getContact, getDeal } from "@/src/domain";

import { PipelineCanvas } from "./pipeline-canvas";
import { meridianSnapshot } from "./session-store";
import { type TrailStation, useTrail } from "./trail";

/** How many entries the reader can look back through. */
const retained = 8;

type EventKind =
  | "opened"
  | "replaced"
  | "closed"
  | "moved"
  | "held"
  | "resolved"
  | "stayed"
  | "restored"
  | "trimmed"
  | "invalidated";

type CanvasEvent = Readonly<{
  /**
   * Monotonic rather than derived from the sentence: two identical sentences
   * in a row are two things happening, and the arrival of the second one has
   * to be visible as an arrival.
   */
  id: number;
  kind: EventKind;
  sentence: string;
}>;

type Description = Readonly<{ kind: EventKind; sentence: string }>;

/**
 * The framework's own word for what happened, kept as the label rather than
 * folded into the sentence. The sentence is about Meridian's records; the
 * label is the thing a reader would go and look up.
 */
const eventTerms: Readonly<Record<EventKind, string>> = Object.freeze({
  closed: "Closed",
  held: "Guarded Transition",
  invalidated: "Resource Exchange",
  moved: "Active Panel",
  opened: "Opened",
  replaced: "Branch Replacement",
  resolved: "Guarded Transition",
  restored: "Deep link",
  stayed: "Guarded Transition",
  trimmed: "Deep link",
});

const eventIcons: Readonly<Record<EventKind, LucideIcon>> = Object.freeze({
  closed: XIcon,
  held: PauseIcon,
  invalidated: RadioTowerIcon,
  moved: CircleDotIcon,
  opened: WaypointsIcon,
  replaced: ScissorsIcon,
  resolved: CheckIcon,
  restored: LinkIcon,
  stayed: CornerUpLeftIcon,
  trimmed: Link2OffIcon,
});

function panels(count: number): string {
  return count === 1 ? "1 Panel" : `${count} Panels`;
}

// --- Reading the Panel Stack -------------------------------------------------

type StackChange = Description &
  Readonly<{
    arrived: number;
    departed: number;
  }>;

/**
 * What changed between two readings of the trail, in a sentence.
 *
 * The trail is already an ordered path with a title per station, so arrivals
 * and departures fall straight out of it — and reusing that reading rather
 * than diffing the stack again means the strip can never disagree with the
 * line drawn above it about what is open.
 *
 * Two honest limits are baked into the wording. A departure is described as a
 * close because a close and a Panel Key match that cut the branch back leave
 * the stack in exactly the same state; and the Active Panel moving with
 * nothing opened or closed is described as a move, because activating an
 * already-open Panel and reusing one by its Panel Key are the same event from
 * out here. Naming the command either way would be a guess.
 */
function describeStackChange(
  before: readonly TrailStation[],
  after: readonly TrailStation[],
): StackChange | null {
  const beforeKeys = new Set(before.map(({ key }) => key));
  const afterKeys = new Set(after.map(({ key }) => key));
  const arrived = after.filter(({ key }) => !beforeKeys.has(key));
  const departed = before.filter(({ key }) => !afterKeys.has(key));

  const opened = arrived.at(-1);
  if (opened) {
    // The Origin is the station before the *first* arrival: a link replayed as
    // several opens in a row would otherwise name one of its own new Panels as
    // the place the reader came from.
    const origin = after[after.indexOf(arrived[0] ?? opened) - 1];
    const from = origin ? ` from ${origin.title}` : "";
    const what =
      arrived.length === 1
        ? `Opened ${opened.title}${from}.`
        : `Opened ${panels(arrived.length)}${from}, ending at ${opened.title}.`;
    return Object.freeze({
      arrived: arrived.length,
      departed: departed.length,
      kind: departed.length > 0 ? "replaced" : "opened",
      sentence:
        departed.length > 0
          ? `${what.slice(0, -1)}, which closed the ${
              departed.length === 1 ? "Panel" : `${departed.length} Panels`
            } after it.`
          : what,
    });
  }

  if (departed.length > 0) {
    const landed = after.at(-1);
    return Object.freeze({
      arrived: 0,
      departed: departed.length,
      kind: "closed",
      sentence:
        departed.length === 1
          ? `Closed ${departed[0]?.title ?? "a Panel"}.`
          : `Closed ${panels(departed.length)}, back to ${landed?.title ?? "the pipeline"}.`,
    });
  }

  const wasActive = before.find(({ active }) => active);
  const nowActive = after.find(({ active }) => active);
  if (nowActive && wasActive?.key !== nowActive.key) {
    return Object.freeze({
      arrived: 0,
      departed: 0,
      kind: "moved",
      sentence: `The Active Panel moved to ${nowActive.title}, which was already open.`,
    });
  }

  // A title or a responsive presentation changing is not something the reader
  // did, and a channel that narrated a window resize would be noise.
  return null;
}

// --- Reading the Resource Exchange -------------------------------------------

/**
 * The record a Resource Key names, in the reader's words rather than the key's.
 *
 * Read from the live dataset rather than the one the Panel Registry loaded at
 * import, so a deal an invalidation has just renamed is announced under the
 * name the reader can see.
 */
function recordName(collection: string, id: string): string | null {
  const dataset = meridianSnapshot();
  if (collection === "deals") return getDeal(dataset, id)?.title ?? null;
  if (collection === "companies") return getCompany(dataset, id)?.name ?? null;
  if (collection === "contacts") return getContact(dataset, id)?.name ?? null;
  return null;
}

/**
 * One invalidation, named by the record it is about.
 *
 * The count is of open Panels *showing* that record, which is deliberately not
 * the same as the number the exchange delivered to: an account Panel also
 * subscribes to every deal beneath it, and the publisher is suppressed from
 * its own announcement. Only the publisher is told how many subscriptions
 * matched, so the honest thing to count from out here is what is on screen.
 */
function describeInvalidation(
  invalidation: ResourceInvalidation,
  stations: readonly TrailStation[],
): Description {
  const [collection = "", id = ""] = invalidation.key.split("/");
  const name = recordName(collection, id) ?? "A record";
  const showing = stations.filter(({ recordId }) => recordId === id).length;
  const what =
    invalidation.kind === "deleted" ? `${name} is gone` : `${name} changed`;
  return Object.freeze({
    kind: "invalidated",
    sentence:
      showing === 0
        ? `${what}. No open Panel shows it.`
        : `${what}. ${panels(showing)} here ${showing === 1 ? "shows" : "show"} it, and each decides for itself what to do.`,
  });
}

// --- The channel -------------------------------------------------------------

/**
 * Everything the Canvas has done this session, newest first.
 *
 * The stack and the transition status are read together in one effect on
 * purpose: both are selectors over the same Panel Engine snapshot, so a
 * Guarded Transition committing changes both in a single render. Watching them
 * separately would report the resolution and the Panels it closed as two
 * unrelated events, which is precisely the thing this is here to join up.
 */
function useCanvasEvents(): readonly CanvasEvent[] {
  const stations = useTrail();
  const transition = PipelineCanvas.useTransitionStatus();
  const [events, setEvents] = useState<readonly CanvasEvent[]>([]);
  const sequence = useRef(0);
  const previousStations = useRef<readonly TrailStation[] | null>(null);
  const previousTransition = useRef(transition);
  const heldCommand = useRef<"open" | "close" | null>(null);
  const touched = useRef(false);

  const record = useCallback((description: Description) => {
    sequence.current += 1;
    const entry = Object.freeze({
      id: sequence.current,
      kind: description.kind,
      sentence: description.sentence,
    });
    setEvents((current) =>
      Object.freeze([entry, ...current].slice(0, retained)),
    );
  }, []);

  // Whether the reader has done anything at all yet. Before they have, a Panel
  // can only leave the stack because the link that opened it named a record
  // the loader could not find — which is the one moment where a departure is
  // worth explaining rather than just reporting.
  useEffect(() => {
    const options = { capture: true, once: true, passive: true } as const;
    const touch = () => {
      touched.current = true;
    };
    window.addEventListener("pointerdown", touch, options);
    window.addEventListener("keydown", touch, options);
    return () => {
      window.removeEventListener("pointerdown", touch, { capture: true });
      window.removeEventListener("keydown", touch, { capture: true });
    };
  }, []);

  useEffect(() => {
    const before = previousStations.current;
    const wasPending = previousTransition.current.pending;
    previousStations.current = stations;
    previousTransition.current = transition;

    if (before === null) {
      const restored = stations.length - 1;
      if (restored > 0) {
        record({
          kind: "restored",
          sentence: `Restored ${panels(restored)} from the address bar, ending at ${stations.at(-1)?.title ?? "the pipeline"}.`,
        });
      }
      return;
    }

    const change = describeStackChange(before, stations);

    if (transition.pending && !wasPending) {
      heldCommand.current = transition.command;
      record({
        kind: "held",
        sentence: `${panels(transition.panelCount)} ${transition.panelCount === 1 ? "has" : "have"} unsaved work, so the Canvas is holding the ${transition.command ?? "transition"} until it is answered.`,
      });
      return;
    }

    if (!transition.pending && wasPending) {
      const command = heldCommand.current ?? "transition";
      heldCommand.current = null;
      record(
        change
          ? {
              kind: "resolved",
              sentence: `The held ${command} went ahead. ${change.sentence}`,
            }
          : {
              kind: "stayed",
              sentence: `The held ${command} did not happen. The unsaved work is still where it was.`,
            },
      );
      return;
    }

    if (!change) return;

    if (!touched.current && change.kind === "closed") {
      record({
        kind: "trimmed",
        sentence: `${panels(change.departed)} named by the link could not be restored: ${change.departed === 1 ? "that record is" : "those records are"} no longer there.`,
      });
      return;
    }

    record(change);
  }, [stations, transition, record]);

  // Every Resource Key this app publishes is a collection and an id, so three
  // single-segment wildcards hear all of them. No source is declared: the
  // channel publishes nothing, and suppressing it from its own announcements
  // would silence nothing while looking as though it did.
  useResourceSubscription({
    keys: ["deals/*", "companies/*", "contacts/*"],
    notify: (invalidation) => {
      record(describeInvalidation(invalidation, stations));
    },
  });

  return events;
}

/**
 * One entry.
 *
 * The arrival is a starting style rather than a keyframe, so the resting state
 * is the authored one: a reader who arrives on a deep link, or who opens the
 * history, sees a settled strip instead of one assembling itself in front of
 * them. Remounting on the id is what replays it — an entry that repeated the
 * previous sentence would otherwise slide in silently.
 */
function Entry({
  event,
  prominent,
}: Readonly<{ event: CanvasEvent; prominent: boolean }>) {
  const Icon = eventIcons[event.kind];
  // The resting state names both animated properties rather than leaving them
  // to their initial values: `translate: none` is not the same declaration as
  // a length pair, and a transition between the two is not one every engine
  // agrees to run.
  return (
    <span
      className={`flex min-w-0 translate-y-0 items-start gap-2 opacity-100 transition-[opacity,translate] duration-[260ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
        prominent ? "flex-1 starting:translate-y-1.5 starting:opacity-0" : ""
      }`}
    >
      <Icon
        aria-hidden="true"
        className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
      />
      <span className={`min-w-0 text-sm ${prominent ? "truncate" : ""}`}>
        <span className="font-medium text-foreground">
          {eventTerms[event.kind]}
        </span>
        <span className="text-muted-foreground"> — {event.sentence}</span>
      </span>
    </span>
  );
}

export function EventChannel() {
  const events = useCanvasEvents();
  const [expanded, setExpanded] = useState(false);
  const historyId = useId();
  const latest = events[0];
  const historyLabel = events.length > 0 ? `Last ${events.length}` : "History";

  return (
    // Deliberately not a live region. The Canvas Workspace already ships one
    // polite announcer for structural change — exactly one, and the package
    // has a test holding it to that — so a second one in here would read every
    // open, close and Branch Replacement twice over: once in the Canvas's
    // words and once in these. Announcing is the Canvas's job and stays there;
    // this is a reading for anyone who goes looking for it.
    <div
      aria-live="off"
      className="shrink-0 border-t border-border bg-card"
      data-meridian-event-channel=""
    >
      <div
        className="max-h-44 overflow-y-auto border-b border-border px-3 py-2"
        hidden={!expanded}
        id={historyId}
      >
        <ol className="flex flex-col gap-1.5">
          {events.map((event) => (
            <li className="flex" key={event.id}>
              <Entry event={event} prominent={false} />
            </li>
          ))}
        </ol>
        <p className="mt-2.5 border-t border-border pt-2.5 text-xs leading-relaxed text-muted-foreground">
          The Canvas publishes its Panel Stack, not the commands that changed
          it. Activating a Panel that was already open and reusing one by its
          Panel Key look identical from here, and so do closing a Panel and
          reusing one further back — so this names only what the stack proves.
        </p>
      </div>
      <div className="flex items-center gap-3 px-3 py-2">
        {latest ? (
          <Entry event={latest} key={latest.id} prominent />
        ) : (
          <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
            Nothing yet. Whatever the Canvas does next is named here as it
            happens.
          </p>
        )}
        <button
          aria-controls={historyId}
          aria-expanded={expanded}
          className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          onClick={() => setExpanded((open) => !open)}
          type="button"
        >
          {expanded ? "Hide" : historyLabel}
          {expanded ? (
            <ChevronDownIcon aria-hidden="true" className="size-3.5" />
          ) : (
            <ChevronUpIcon aria-hidden="true" className="size-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}
