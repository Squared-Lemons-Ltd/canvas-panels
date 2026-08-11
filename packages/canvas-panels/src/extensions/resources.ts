"use client";

import type { ReactElement, ReactNode } from "react";
import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

/**
 * An opaque, application-defined name for something an application's Panels
 * show. Canvas Panels compares Resource Keys segment by segment and never
 * parses, resolves, fetches, or authorizes what one names.
 */
export type ResourceKey = string;

/**
 * A subscription's reach: either a Resource Key, or one with `*` standing in
 * for a single segment. See {@link resourceKeyMatches} for the whole rule.
 */
export type ResourceKeyPattern = string;

/**
 * An opaque application token naming whoever published an invalidation, used
 * only to suppress delivery back to itself. Canvas Panels never interprets it.
 */
export type ResourceSource = string;

/** Whether the Resource still exists. Nothing else is inferred from either. */
export type ResourceInvalidationKind = "changed" | "deleted";

/** What an application asks the exchange to announce. */
export type ResourceAnnouncement = Readonly<{
  kind: ResourceInvalidationKind;
  key: ResourceKey;
  /** Suppresses delivery to subscriptions declaring the same source. */
  source?: ResourceSource;
  /** Also invalidates the Resource Keys nested beneath `key`. */
  nested?: boolean;
}>;

/** One announcement as the exchange delivered it. */
export type ResourceInvalidation = Readonly<{
  kind: ResourceInvalidationKind;
  key: ResourceKey;
  source: ResourceSource | null;
  nested: boolean;
  /**
   * The exchange's own monotonically increasing publication number, which is
   * what puts two invalidations from one exchange in order.
   */
  sequence: number;
}>;

const wildcardSegment = "*";

function segmentsOf(key: string): readonly string[] {
  return key.split("/");
}

/**
 * The whole matching rule, exported because a subscription's reach is part of
 * the contract rather than an implementation detail.
 *
 * A pattern matches a key when they have the same number of segments and every
 * segment is either identical or the single-segment wildcard `*`. `*` stands
 * for exactly one segment, in any position: `projects/*` matches
 * `projects/atlas` but neither `projects` nor `projects/atlas/briefs/direction`.
 */
export function resourceKeyMatches(
  pattern: ResourceKeyPattern,
  key: ResourceKey,
): boolean {
  const patternSegments = segmentsOf(pattern);
  const keySegments = segmentsOf(key);
  if (patternSegments.length !== keySegments.length) return false;
  return segmentsMatch(patternSegments, keySegments);
}

/** Whether the pattern accounts for every segment the key has. */
function segmentsMatch(
  patternSegments: readonly string[],
  keySegments: readonly string[],
): boolean {
  return keySegments.every(
    (segment, index) =>
      patternSegments[index] === wildcardSegment ||
      patternSegments[index] === segment,
  );
}

/**
 * An optional source, as an object to spread. `exactOptionalPropertyTypes`
 * makes `{ source: undefined }` and an absent source different things, and
 * only the second one means "not declared".
 */
function declaredSource(
  source: ResourceSource | undefined,
): Readonly<{ source?: ResourceSource }> {
  return source === undefined ? {} : { source };
}

/**
 * Whether one subscription hears one invalidation.
 *
 * A subscription hears an invalidation whose key it matches. A `nested`
 * invalidation additionally reaches every subscription strictly beneath that
 * key — `projects/atlas` nested reaches `projects/atlas/briefs/direction`.
 *
 * Propagation runs downward only. Whether a parent's change means its children
 * changed is the application's judgement, so the publisher makes it; a child's
 * change never implies anything about its parent, so no flag can make it.
 */
export function resourceInvalidationMatches(
  pattern: ResourceKeyPattern,
  invalidation: ResourceInvalidation,
): boolean {
  if (resourceKeyMatches(pattern, invalidation.key)) return true;
  if (!invalidation.nested) return false;
  const patternSegments = segmentsOf(pattern);
  const keySegments = segmentsOf(invalidation.key);
  if (patternSegments.length <= keySegments.length) return false;
  return segmentsMatch(patternSegments, keySegments);
}

export type ResourceSubscription = Readonly<{
  /** The exact and wildcard patterns this subscription listens on. */
  keys: readonly ResourceKeyPattern[];
  /** Declared to be suppressed from this subscription's own publications. */
  source?: ResourceSource;
  notify: (invalidation: ResourceInvalidation) => void;
}>;

export type ResourcePublishOutcome = Readonly<{
  status: "published";
  invalidation: ResourceInvalidation;
  /**
   * How many subscriptions the invalidation was addressed to. Recipients are
   * fixed when the invalidation is published, so this counts the subscriptions
   * that matched then, minus the publisher's own.
   */
  notified: number;
}>;

export type ResourceExchangeOptions = Readonly<{
  /**
   * Reports a subscriber that threw. A failing subscriber never stops the
   * remaining ones and never changes the outcome of the publication.
   */
  onSubscriberError?: (
    error: unknown,
    invalidation: ResourceInvalidation,
  ) => void;
}>;

/**
 * Where an application's Panels tell each other that something they show has
 * changed or gone. It carries opaque keys and nothing else: no fetching, no
 * cache, no repository, no permission, and no knowledge of what a key names.
 */
export type ResourceExchange = Readonly<{
  publish: (announcement: ResourceAnnouncement) => ResourcePublishOutcome;
  /** Returns the function that cancels the subscription. */
  subscribe: (subscription: ResourceSubscription) => () => void;
}>;

type ResourceDelivery = Readonly<{
  invalidation: ResourceInvalidation;
  recipients: readonly ResourceSubscription[];
}>;

export function createResourceExchange(
  options: ResourceExchangeOptions = {},
): ResourceExchange {
  const subscriptions = new Set<ResourceSubscription>();
  const pending: ResourceDelivery[] = [];
  let sequence = 0;
  let delivering = false;

  function hears(
    subscription: ResourceSubscription,
    invalidation: ResourceInvalidation,
  ): boolean {
    if (
      invalidation.source !== null &&
      subscription.source === invalidation.source
    ) {
      return false;
    }
    return subscription.keys.some((pattern) =>
      resourceInvalidationMatches(pattern, invalidation),
    );
  }

  function drain(): void {
    delivering = true;
    try {
      for (
        let delivery = pending.shift();
        delivery !== undefined;
        delivery = pending.shift()
      ) {
        for (const subscription of delivery.recipients) {
          // Addressed before delivery began, so one cancelled in between is
          // not called after it stopped.
          if (!subscriptions.has(subscription)) continue;
          try {
            subscription.notify(delivery.invalidation);
          } catch (error) {
            options.onSubscriberError?.(error, delivery.invalidation);
          }
        }
      }
    } finally {
      delivering = false;
    }
  }

  return Object.freeze({
    publish: (announcement) => {
      sequence += 1;
      const invalidation: ResourceInvalidation = Object.freeze({
        key: announcement.key,
        kind: announcement.kind,
        nested: announcement.nested === true,
        sequence,
        source: announcement.source ?? null,
      });
      // Recipients are fixed here rather than at delivery, so a Panel that
      // subscribes in response to being told hears only what follows.
      const recipients = [...subscriptions].filter((subscription) =>
        hears(subscription, invalidation),
      );
      pending.push(Object.freeze({ invalidation, recipients }));
      // A publication made while another is being delivered waits its turn, so
      // the two are never interleaved and the order is the publication order.
      if (!delivering) drain();
      return Object.freeze({
        invalidation,
        notified: recipients.length,
        status: "published",
      } as const);
    },
    subscribe: (subscription) => {
      subscriptions.add(subscription);
      return () => {
        subscriptions.delete(subscription);
      };
    },
  });
}

export type ResourceDeferralState = Readonly<{
  /** The invalidation the consumer has not resolved yet, or `null`. */
  pending: ResourceInvalidation | null;
  /** Unsaved work a re-read would replace. */
  dirty: boolean;
  /** Whether the application supplied a re-read at all. */
  reloadable: boolean;
  /** Whether a re-read is already running. */
  reloading: boolean;
  /** Whether the last re-read failed and has not been retried. */
  failed: boolean;
}>;

/** Reload it now, hold it for a decision, or there is nothing to resolve. */
export type ResourceDeferral = "reload" | "hold" | "settled";

/**
 * Decides what an invalidation may do to a consumer without being asked.
 *
 * Only one case reads on the consumer's behalf: a change reaching a consumer
 * with nothing to lose and a re-read to run. Unsaved work is held, because an
 * invalidation must never be the reason a human loses what they typed — the
 * Panel's ordinary lifecycle settles the edit, and the held read follows. A
 * deletion is held because it is a decision, not a refresh: a record that has
 * gone cannot be read again. A read that failed is held rather than retried,
 * so a refresh cannot become a hot loop against an unhappy service.
 *
 * It is exported so an application coordinating its own re-reads gets the same
 * ordering the extension applies.
 */
export function resolveResourceDeferral(
  state: ResourceDeferralState,
): ResourceDeferral {
  if (state.pending === null) return "settled";
  if (state.reloading || state.failed || !state.reloadable) return "hold";
  if (state.pending.kind === "deleted") return "hold";
  return state.dirty ? "hold" : "reload";
}

/** What a Panel announces: its source is its own and is added for it. */
export type PanelResourceAnnouncement = Readonly<{
  kind: ResourceInvalidationKind;
  key: ResourceKey;
  nested?: boolean;
}>;

/**
 * Everything the extension needs from one Panel, and nothing more. The
 * application keeps its fetching, its cache, and its records: it names the
 * Resource Keys it shows, reports whether it has unsaved work, and supplies
 * the re-read that resolves an invalidation.
 */
export type PanelResourceOptions = Readonly<{
  exchange: ResourceExchange;
  keys: readonly ResourceKeyPattern[];
  /** This Panel's opaque token, suppressing its own publications. */
  source?: ResourceSource;
  /**
   * Whether there is something here a re-read would disturb. Defaults to
   * `false`. Alongside a Panel Editor that is `editor.dirty || editor.busy`:
   * an operation part-way through is as much in the way as an unsaved draft.
   */
  dirty?: boolean;
  /** Omit it and an invalidation is held for the application to resolve. */
  reload?: (invalidation: ResourceInvalidation) => void | Promise<void>;
}>;

export type ResourceFailure = Readonly<{
  invalidation: ResourceInvalidation;
  error: unknown;
}>;

export type PanelResourceState = Readonly<{
  /** The invalidation waiting on this Panel, or `null`. */
  pending: ResourceInvalidation | null;
  /** Whether what is waiting is a deletion. */
  deleted: boolean;
  /** Whether a re-read started by this consumer is running. */
  reloading: boolean;
  /** The last re-read failure, cleared by the next attempt. */
  failure: ResourceFailure | null;
}>;

export type PanelResourceOutcome =
  | Readonly<{ status: "applied"; invalidation: ResourceInvalidation }>
  | Readonly<{
      status: "failed";
      invalidation: ResourceInvalidation;
      error: unknown;
    }>
  | Readonly<{ status: "rejected"; reason: PanelResourceRejectionReason }>;

export type PanelResourceRejectionReason =
  | "nothing-pending"
  | "unsupported"
  | "reload-in-progress";

export type PanelResource = Readonly<{
  getState: () => PanelResourceState;
  subscribe: (listener: () => void) => () => void;
  /** Republishes the Panel's keys, source, unsaved work, and re-read. */
  update: (options: PanelResourceOptions) => void;
  /** Publishes through the exchange with this Panel as the source. */
  publish: (announcement: PanelResourceAnnouncement) => ResourcePublishOutcome;
  /** Runs the held re-read now, over unsaved work if there is any. */
  apply: () => Promise<PanelResourceOutcome>;
  /** Forgets what is held without re-reading it. */
  dismiss: () => void;
  /**
   * Begins listening to the exchange, and returns the function that stops it.
   * A coordinator does not listen until it is asked to, so one that is created
   * and thrown away — as React does when it double-invokes an initializer —
   * leaves nothing subscribed behind it.
   */
  start: () => () => void;
}>;

function sameKeys(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((key, index) => key === right[index])
  );
}

/**
 * One Panel's standing interest in a set of Resource Keys, and the decision of
 * when what it hears may replace what it is showing.
 */
export function createPanelResource(
  initialOptions: PanelResourceOptions,
): PanelResource {
  let options = initialOptions;
  let pending: ResourceInvalidation | null = null;
  let reloading = false;
  let failure: ResourceFailure | null = null;
  let state: PanelResourceState = deriveState();
  let stopSubscription: (() => void) | null = null;
  // Counts the times listening has been asked for, not the times the
  // subscription has been replaced: changing the keys leaves the coordinator
  // listening, so the stopper handed out at the start must still stop it.
  let listening = 0;
  const listeners = new Set<() => void>();

  function deriveState(): PanelResourceState {
    return Object.freeze({
      deleted: pending?.kind === "deleted",
      failure,
      pending,
      reloading,
    });
  }

  function publishState(): void {
    const next = deriveState();
    if (
      next.pending === state.pending &&
      next.reloading === state.reloading &&
      next.failure === state.failure
    ) {
      return;
    }
    state = next;
    for (const listener of listeners) listener();
  }

  function listen(): () => void {
    return options.exchange.subscribe({
      keys: options.keys,
      notify: received,
      ...declaredSource(options.source),
    });
  }

  function received(invalidation: ResourceInvalidation): void {
    // A deletion is a decision waiting on a human. A Panel showing several
    // Resources must not have that decision quietly erased by something else
    // it also shows changing — only news about the same key supersedes it.
    if (
      pending !== null &&
      pending.kind === "deleted" &&
      pending.key !== invalidation.key
    ) {
      return;
    }
    // Otherwise the newest invalidation is the one that describes the Resource
    // now, so a consumer holding an older one replaces it rather than queueing.
    pending = invalidation;
    failure = null;
    publishState();
    settle();
  }

  function settle(): void {
    const held = pending;
    const run = options.reload;
    if (held === null || run === undefined) return;
    if (
      resolveResourceDeferral({
        dirty: options.dirty === true,
        failed: failure !== null,
        pending: held,
        reloadable: true,
        reloading,
      }) !== "reload"
    ) {
      return;
    }
    void runReload(held, run);
  }

  function runReload(
    invalidation: ResourceInvalidation,
    run: NonNullable<PanelResourceOptions["reload"]>,
  ): Promise<PanelResourceOutcome> {
    pending = null;
    failure = null;
    reloading = true;
    publishState();
    let running: Promise<void>;
    try {
      running = Promise.resolve(run(invalidation));
    } catch (error) {
      running = Promise.reject(error);
    }
    return running.then(
      () => {
        finish(invalidation, false, null);
        return Object.freeze({
          invalidation,
          status: "applied",
        } as const);
      },
      (error: unknown) => {
        finish(invalidation, true, error);
        return Object.freeze({
          error,
          invalidation,
          status: "failed",
        } as const);
      },
    );
  }

  function finish(
    invalidation: ResourceInvalidation,
    failed: boolean,
    error: unknown,
  ): void {
    reloading = false;
    if (failed) {
      failure = Object.freeze({ error, invalidation });
      // Nothing newer arrived while the read was running, so what it failed to
      // apply is still what this Panel is waiting on.
      if (pending === null || pending.sequence < invalidation.sequence) {
        pending = invalidation;
      }
    }
    publishState();
    settle();
  }

  function rejected(
    reason: PanelResourceRejectionReason,
  ): Promise<PanelResourceOutcome> {
    return Promise.resolve(
      Object.freeze({ reason, status: "rejected" } as const),
    );
  }

  return Object.freeze({
    apply: () => {
      const run = options.reload;
      if (pending === null) return rejected("nothing-pending");
      if (run === undefined) return rejected("unsupported");
      if (reloading) return rejected("reload-in-progress");
      return runReload(pending, run);
    },
    dismiss: () => {
      if (pending === null && failure === null) return;
      pending = null;
      failure = null;
      publishState();
    },
    getState: () => state,
    publish: (announcement) =>
      options.exchange.publish({
        ...announcement,
        ...declaredSource(options.source),
      }),
    start: () => {
      if (stopSubscription === null) {
        listening += 1;
        stopSubscription = listen();
      }
      const started = listening;
      return () => {
        // Only what this call started, so a stop arriving after a restart
        // cannot silence the subscription now listening.
        if (started !== listening || stopSubscription === null) return;
        stopSubscription();
        stopSubscription = null;
      };
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    update: (next) => {
      const resubscribe =
        next.exchange !== options.exchange ||
        next.source !== options.source ||
        !sameKeys(next.keys, options.keys);
      options = next;
      if (resubscribe && stopSubscription !== null) {
        stopSubscription();
        stopSubscription = listen();
      }
      publishState();
      settle();
    },
  });
}

const ResourceExchangeContext = createContext<ResourceExchange | null>(null);

export type ResourceExchangeProviderProps = Readonly<{
  exchange: ResourceExchange;
  children?: ReactNode;
}>;

/**
 * Scopes one exchange to everything below it. A Canvas Workspace nested inside
 * a Panel can be given its own, and then nothing it publishes leaves it.
 */
export function ResourceExchangeProvider({
  exchange,
  children,
}: ResourceExchangeProviderProps): ReactElement {
  return createElement(
    ResourceExchangeContext.Provider,
    { value: exchange },
    children,
  );
}

export function useResourceExchange(): ResourceExchange {
  const exchange = useContext(ResourceExchangeContext);
  if (!exchange) {
    throw new Error(
      "Canvas Panels resource hooks must be used within a ResourceExchangeProvider",
    );
  }
  return exchange;
}

/**
 * Subscribes for as long as the component is mounted. The handler is read
 * afresh on every delivery, so an inline one does not churn the subscription;
 * only the keys and the source do.
 */
export function useResourceSubscription(
  subscription: ResourceSubscription,
): void {
  const exchange = useResourceExchange();
  const { source } = subscription;
  const current = useRef(subscription);
  current.current = subscription;
  // Only the keys themselves decide when to resubscribe; a fresh array of the
  // same keys, or a fresh inline handler, is not a change of interest.
  const declaredKeys = JSON.stringify(subscription.keys);
  // biome-ignore lint/correctness/useExhaustiveDependencies: declaredKeys stands in for the keys array read through the ref, which is a new array on every render.
  useEffect(
    () =>
      exchange.subscribe({
        keys: current.current.keys,
        notify: (invalidation) => current.current.notify(invalidation),
        ...declaredSource(source),
      }),
    [exchange, declaredKeys, source],
  );
}

/** Everything the extension needs from a Panel, bar the exchange it is under. */
export type PanelResourceHookOptions = Omit<PanelResourceOptions, "exchange">;

export type PanelResourceBinding = PanelResourceState &
  Readonly<{
    apply: () => Promise<PanelResourceOutcome>;
    dismiss: () => void;
    publish: (
      announcement: PanelResourceAnnouncement,
    ) => ResourcePublishOutcome;
  }>;

/**
 * Coordinates one Panel's interest in the Resources it shows. The application
 * still owns its reads and its records: it names its keys, reports whether it
 * has unsaved work, and supplies the re-read, and this decides when what it
 * hears may replace what it is showing.
 */
export function usePanelResource(
  options: PanelResourceHookOptions,
): PanelResourceBinding {
  const exchange = useResourceExchange();
  const [resource] = useState(() =>
    createPanelResource({ ...options, exchange }),
  );
  // Republished before paint, so an invalidation arriving with the very next
  // interaction reads the unsaved work this render described.
  useLayoutEffect(() => {
    resource.update({ ...options, exchange });
  });
  // Listening starts on mount rather than in the initializer, so a coordinator
  // React created and threw away never subscribed at all.
  useEffect(() => resource.start(), [resource]);
  const state = useSyncExternalStore(
    resource.subscribe,
    resource.getState,
    resource.getState,
  );

  return useMemo(
    () =>
      Object.freeze({
        apply: resource.apply,
        deleted: state.deleted,
        dismiss: resource.dismiss,
        failure: state.failure,
        pending: state.pending,
        publish: resource.publish,
        reloading: state.reloading,
      }),
    [resource, state],
  );
}
