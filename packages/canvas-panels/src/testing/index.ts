import { canvasBreakpointQueries } from "../core/index.js";
import type {
  CanvasBreakpoint,
  GuardedTransitionProposal,
  GuardOutcome,
  JsonValue,
  PanelInstanceId,
  PanelInstanceRef,
  PanelLifecycle,
  PanelLifecycleOperation,
  PanelRestoreOutcome,
  WorkspaceId,
} from "../core/index.js";
import type {
  CanvasHistoryPopState,
  CanvasHistoryPort,
} from "../next/index.js";
import type {
  CanvasPanelReadModel,
  CanvasPresentation,
  CanvasTransitionStatus,
} from "../ui/index.js";

/**
 * Stable Workspace and Panel identities for one test. The Panel Engine numbers
 * its own Workspaces from a process-wide counter, so the identity a Panel gets
 * depends on how many engines ran before it; a factory starts at one every
 * time, which is what lets an expected value be written down as a literal.
 */
export type TestIdentities = Readonly<{
  workspace: () => WorkspaceId;
  panel: () => PanelInstanceId;
  /**
   * A Panel Instance Ref for a read model. The Panel Engine only accepts the
   * refs it issued itself, so a fabricated one is for building what a component
   * reads — never for addressing a command, which rejects it as
   * `invalid-panel-reference`.
   */
  ref: (kind: string) => PanelInstanceRef;
  reset: () => void;
}>;

/**
 * One Workspace's worth of stable identities, numbered from one. Pass the same
 * factory to several builders to keep a stack in one Workspace.
 */
export function createTestIdentities(
  options: Readonly<{ prefix?: string }> = {},
): TestIdentities {
  const prefix = options.prefix ?? "test";
  let workspaces = 0;
  let panels = 0;
  // Every ref a factory mints belongs to the same Workspace, because a stack a
  // test builds is one stack: refs from two Workspaces are exactly what the
  // Panel Engine refuses to mix.
  let workspaceId: WorkspaceId | null = null;

  const identities: TestIdentities = Object.freeze({
    panel: () => `${prefix}-panel-${++panels}` as PanelInstanceId,
    ref: (kind: string) => {
      workspaceId ??= identities.workspace();
      return Object.freeze({
        workspaceId,
        instanceId: identities.panel(),
        kind,
      });
    },
    reset: () => {
      workspaces = 0;
      panels = 0;
      workspaceId = null;
    },
    workspace: () => `${prefix}-workspace-${++workspaces}` as WorkspaceId,
  });

  return identities;
}

/** What a test wants to pin about one Panel; everything else is defaulted. */
export type TestPanelReadModelOptions = Readonly<{
  identities?: TestIdentities;
  kind?: string;
  title?: string;
  descriptor?: unknown;
  panel?: PanelInstanceRef;
  closable?: boolean;
  active?: boolean;
  deepest?: boolean;
  visible?: boolean;
}>;

/**
 * One entry of what `useStack` and `usePanel` publish, built whole so a
 * component under test reads a complete read model even for the fields the test
 * did not care about.
 */
export function buildPanelReadModel(
  options: TestPanelReadModelOptions = {},
): CanvasPanelReadModel {
  const kind = options.kind ?? "panel";
  const identities = options.identities ?? createTestIdentities();

  return Object.freeze({
    active: options.active ?? false,
    closable: options.closable ?? true,
    deepest: options.deepest ?? false,
    descriptor: options.descriptor,
    kind,
    panel: (options.panel ?? identities.ref(kind)) as PanelInstanceRef &
      Readonly<{ kind: string }>,
    title: options.title ?? kind,
    visible: options.visible ?? true,
  }) as CanvasPanelReadModel;
}

/**
 * A whole Panel Stack in the state a Canvas is in after opening: the Root Panel
 * first and non-closable, the Deepest Panel last and Active. Any of it can be
 * overridden per Panel.
 */
export function buildPanelStack(
  panels: readonly TestPanelReadModelOptions[],
  options: Readonly<{ identities?: TestIdentities }> = {},
): readonly CanvasPanelReadModel[] {
  const identities = options.identities ?? createTestIdentities();
  const last = panels.length - 1;

  return Object.freeze(
    panels.map((panel, index) =>
      buildPanelReadModel({
        identities,
        closable: index > 0,
        deepest: index === last,
        active: index === last,
        ...panel,
      }),
    ),
  );
}

/**
 * What `useTransitionStatus` publishes. Naming a command means a transition is
 * pending, because that is the only way the Canvas reports one.
 */
export function buildTransitionStatus(
  options: Readonly<{
    command?: "open" | "close" | null;
    panelCount?: number;
    pending?: boolean;
  }> = {},
): CanvasTransitionStatus {
  const command = options.command ?? null;

  return Object.freeze({
    command,
    panelCount: options.panelCount ?? 0,
    pending: options.pending ?? command !== null,
  });
}

/**
 * Whether an operation a test owns settles as soon as it is asked for, or waits
 * for the test to settle it. `manual` is what lets a test observe a Canvas
 * while a write is still outstanding.
 */
export type TestSettleMode = "immediate" | "manual";

/** A Transition Guard that lets a destructive transition through. */
export function allowTransition(): GuardOutcome {
  return Object.freeze({ status: "allow" } as const);
}

/** A Transition Guard that asks a human, showing `message` in the dialog. */
export function confirmTransition(message: string): GuardOutcome {
  return Object.freeze({ status: "confirm", message } as const);
}

/** A Transition Guard that refuses for now, explaining why. */
export function blockTransition(reason: string): GuardOutcome {
  return Object.freeze({ status: "block", reason } as const);
}

/**
 * One `save` or `discard` the Panel Engine has started. In `manual` mode it
 * stays in flight until the test settles it, which is the only way to observe
 * what a Canvas does while a write is outstanding.
 */
export type TestLifecycleCall = Readonly<{
  operation: PanelLifecycleOperation;
  settle: () => void;
  fail: (error?: unknown) => void;
  readonly settled: boolean;
}>;

export type TestLifecycle = Readonly<{
  /** Register through `engine.registerLifecycle` or the Bound `useLifecycle`. */
  lifecycle: PanelLifecycle;
  readonly guards: readonly GuardedTransitionProposal[];
  readonly saves: readonly TestLifecycleCall[];
  readonly discards: readonly TestLifecycleCall[];
}>;

export type TestLifecycleOptions = Readonly<{
  /**
   * A fixed outcome, or one decided per proposal. Defaults to asking a human,
   * because a lifecycle that allows everything never reaches the dialog a test
   * is usually there to exercise.
   */
  guard?:
    | GuardOutcome
    | ((transition: GuardedTransitionProposal) => GuardOutcome);
  /**
   * Whether the Panel has unsaved work. The Panel Engine consults `guard` only
   * for a Panel that reports itself dirty, so this defaults to `true`; note
   * that the same flag drives the header's dirty label and `beforeunload`.
   */
  dirty?: boolean;
  /**
   * `immediate` settles every write as soon as it is asked for. `manual` hands
   * the test the settle, so it can hold a transition open.
   */
  mode?: TestSettleMode;
}>;

/**
 * The half of an in-flight call a test holds: how to settle it, how to fail it,
 * and whether it has already gone. Both the lifecycle and the availability
 * loader hand one out, so they resolve `manual` mode the same way.
 */
type Deferred<Value> = Readonly<{
  promise: Promise<Value>;
  settle: (value: Value) => void;
  fail: (error?: unknown) => void;
  readonly settled: boolean;
}>;

function createDeferred<Value>(failureMessage: string): Deferred<Value> {
  let settle = (_value: Value): void => {};
  let fail = (_error?: unknown): void => {};
  let settled = false;
  const promise = new Promise<Value>((resolve, reject) => {
    settle = (value: Value) => {
      settled = true;
      resolve(value);
    };
    fail = (error?: unknown) => {
      settled = true;
      reject(error ?? new Error(failureMessage));
    };
  });

  return Object.freeze({
    fail: (error?: unknown) => {
      fail(error);
    },
    promise,
    get settled() {
      return settled;
    },
    settle: (value: Value) => {
      settle(value);
    },
  });
}

function createLifecycleRecorder(
  calls: TestLifecycleCall[],
  mode: TestSettleMode,
): (operation: PanelLifecycleOperation) => Promise<void> {
  return (operation) => {
    const deferred = createDeferred<void>("Test lifecycle operation failed");
    calls.push(
      Object.freeze({
        fail: deferred.fail,
        operation,
        settle: () => {
          deferred.settle();
        },
        get settled() {
          return deferred.settled;
        },
      }),
    );
    if (mode === "immediate") deferred.settle();
    return deferred.promise;
  };
}

/**
 * A Panel Lifecycle a test owns: it reports the guard outcome the test asked
 * for, records the proposal it was given, and — in `manual` mode — leaves each
 * write in flight until the test settles or fails it.
 */
export function createTestLifecycle(
  options: TestLifecycleOptions = {},
): TestLifecycle {
  const mode = options.mode ?? "immediate";
  const decide = options.guard ?? confirmTransition("Unsaved changes");
  const guards: GuardedTransitionProposal[] = [];
  const saves: TestLifecycleCall[] = [];
  const discards: TestLifecycleCall[] = [];

  // The logs are handed out as frozen copies: a test reads what the Canvas did,
  // and cannot quietly rewrite the record it is asserting against.
  return Object.freeze({
    get discards() {
      return Object.freeze([...discards]);
    },
    get guards() {
      return Object.freeze([...guards]);
    },
    lifecycle: Object.freeze({
      dirty: options.dirty ?? true,
      discard: createLifecycleRecorder(discards, mode),
      guard: (transition: GuardedTransitionProposal) => {
        guards.push(transition);
        return typeof decide === "function" ? decide(transition) : decide;
      },
      save: createLifecycleRecorder(saves, mode),
    }),
    get saves() {
      return Object.freeze([...saves]);
    },
  });
}

/**
 * Canonical JSON: object keys sorted at every depth, so a document a test
 * writes down is byte-identical to one the Panel Engine encoded.
 */
function canonicalize(value: JsonValue): JsonValue {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const entries = value as Readonly<{ [key: string]: JsonValue }>;
  return Object.fromEntries(
    Object.keys(entries)
      .sort()
      .map((key) => [key, canonicalize(entries[key] as JsonValue)]),
  );
}

/** One persistent Panel as a Navigation Document records it. */
export type TestNavigationPanel = Readonly<{
  kind: string;
  version: number;
  descriptor: JsonValue;
}>;

/**
 * A Navigation Document in the canonical form `decodeNavigationDocument` and
 * `restoreNavigationDocument` read. Writing one by hand is how a test pins a
 * *historical* descriptor version — the engine can only ever encode the current
 * one, so a migration has no other way to be exercised from outside.
 *
 * The Root Panel is implicit and is never serialized.
 */
export function buildNavigationDocument(
  panels: readonly TestNavigationPanel[],
  options: Readonly<{ version?: number }> = {},
): string {
  return JSON.stringify(
    canonicalize({
      panels: panels.map(({ descriptor, kind, version }) => ({
        descriptor,
        kind,
        version,
      })),
      version: options.version ?? 1,
    } as JsonValue),
  );
}

/** One availability check the Panel Engine has started. */
export type TestRestoreCall = Readonly<{
  input: unknown;
  signal: AbortSignal;
  settle: (outcome?: PanelRestoreOutcome) => void;
  fail: (error?: unknown) => void;
  readonly settled: boolean;
}>;

export type TestRestore = Readonly<{
  /** Pass as a Panel Kind's `persistence.restore`. */
  restore: (
    input: never,
    context: Readonly<{ signal: AbortSignal }>,
  ) => Promise<PanelRestoreOutcome>;
  readonly calls: readonly TestRestoreCall[];
}>;

export type TestRestoreOptions = Readonly<{
  /** Consumed one per call; the last one repeats once the list runs out. */
  outcomes?: readonly PanelRestoreOutcome[];
  /** `manual` leaves each check outstanding until the test settles it. */
  mode?: TestSettleMode;
}>;

/**
 * An availability loader a test owns. It records the descriptor it was given
 * and the signal that cancels it, and reports the outcomes the test listed —
 * `available`, `unavailable`, or `denied`. Content fetching stays renderer-owned,
 * so a loader never returns a record.
 */
export function createTestRestore(
  options: TestRestoreOptions = {},
): TestRestore {
  const mode = options.mode ?? "immediate";
  const outcomes = options.outcomes ?? [
    Object.freeze({ status: "available" } as const),
  ];
  const calls: TestRestoreCall[] = [];

  return Object.freeze({
    get calls() {
      return Object.freeze([...calls]);
    },
    restore: (input: never, context: Readonly<{ signal: AbortSignal }>) => {
      const planned =
        outcomes[Math.min(calls.length, outcomes.length - 1)] ??
        Object.freeze({ status: "available" } as const);
      const deferred = createDeferred<PanelRestoreOutcome>(
        "Test restore failed",
      );
      calls.push(
        Object.freeze({
          fail: deferred.fail,
          input,
          settle: (outcome?: PanelRestoreOutcome) => {
            deferred.settle(outcome ?? planned);
          },
          get settled() {
            return deferred.settled;
          },
          signal: context.signal,
        }),
      );
      if (mode === "immediate") deferred.settle(planned);
      return deferred.promise;
    },
  });
}

/** One entry in the session history, as the browser would hold it. */
export type TestHistoryEntry = Readonly<{ state: unknown; url: string }>;

/** Something a Navigation Adapter did to the session history. */
export type TestHistoryWrite =
  | Readonly<{ method: "push"; url: string }>
  | Readonly<{ method: "replace"; url: string }>
  | Readonly<{ method: "go"; delta: number }>;

export type TestHistory = Readonly<{
  /** Pass as `useCanvasNavigationSync`'s `history`. */
  port: CanvasHistoryPort;
  readonly entries: readonly TestHistoryEntry[];
  /** Where the session history currently sits. */
  readonly index: number;
  /** Everything the adapter did, in order. Traversals the test performs are absent. */
  readonly writes: readonly TestHistoryWrite[];
  /** Traversal as the user performs it: emits a popstate, records no write. */
  back: () => void;
  forward: () => void;
  go: (delta: number) => void;
}>;

/**
 * A session history a test can actually traverse. jsdom implements neither
 * `history.go` nor the entry list it would move through, so a Navigation
 * Adapter's Back and Forward handling has no other way to be exercised.
 *
 * Movement the adapter performs is recorded as a write; movement the *test*
 * performs is not, so an assertion about what the Canvas wrote never has to
 * subtract the test's own Back out of the list first.
 */
export function createTestHistory(
  options: Readonly<{ url?: string; state?: unknown }> = {},
): TestHistory {
  const entries: TestHistoryEntry[] = [
    Object.freeze({ state: options.state ?? null, url: options.url ?? "/" }),
  ];
  const writes: TestHistoryWrite[] = [];
  const listeners = new Set<(event: CanvasHistoryPopState) => void>();
  let index = 0;

  const at = (position: number): TestHistoryEntry => {
    const entry = entries[position];
    if (!entry) throw new Error(`No history entry at ${position}`);
    return entry;
  };

  const traverse = (delta: number): void => {
    const target = index + delta;
    if (target < 0 || target >= entries.length) return;
    index = target;
    const entry = at(index);
    for (const listener of [...listeners]) {
      listener({ state: entry.state, url: entry.url });
    }
  };

  return Object.freeze({
    back: () => traverse(-1),
    get entries() {
      return Object.freeze([...entries]);
    },
    forward: () => traverse(1),
    go: (delta: number) => traverse(delta),
    get index() {
      return index;
    },
    port: Object.freeze({
      getState: () => at(index).state,
      go: (delta: number) => {
        writes.push(Object.freeze({ delta, method: "go" } as const));
        traverse(delta);
      },
      push: (state: unknown, url: string) => {
        // A push discards whatever the user could previously go Forward to.
        entries.length = index + 1;
        entries.push(Object.freeze({ state, url }));
        index = entries.length - 1;
        writes.push(Object.freeze({ method: "push", url } as const));
      },
      replace: (state: unknown, url: string) => {
        entries[index] = Object.freeze({ state, url });
        writes.push(Object.freeze({ method: "replace", url } as const));
      },
      subscribe: (listener: (event: CanvasHistoryPopState) => void) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    }),
    get writes() {
      return Object.freeze([...writes]);
    },
  });
}

/** A handle to one scheduled callback, for cancelling it. */
export type TestTimer = Readonly<{ id: number }>;

export type TestClock = Readonly<{
  now: () => number;
  setTimeout: (callback: () => void, delay?: number) => TestTimer;
  clearTimeout: (timer: TestTimer) => void;
  /** Timers scheduled and not yet run. */
  readonly pending: number;
  /**
   * Moves time forward, running everything that falls due — including timers
   * scheduled by those callbacks. Returns how many ran.
   */
  advance: (milliseconds: number) => number;
}>;

/**
 * A clock a test owns. Canvas Panels reads no clock of its own — nothing in the
 * package is scheduled — so this is for the application code around a Canvas:
 * the debounce in front of a search Panel, the poll behind a Resource
 * Invalidation, the timeout on a save. Inject it where that code would
 * otherwise reach for `setTimeout`.
 */
export function createTestClock(
  options: Readonly<{ start?: number }> = {},
): TestClock {
  type Scheduled = Readonly<{
    at: number;
    callback: () => void;
    id: number;
    sequence: number;
  }>;
  let current = options.start ?? 0;
  let nextId = 1;
  let sequence = 0;
  let scheduled: Scheduled[] = [];

  return Object.freeze({
    advance: (milliseconds: number) => {
      // Time never runs backwards, so a negative advance is a mistake worth
      // reporting rather than a rewind that would fire due timers again.
      if (!(milliseconds >= 0)) {
        throw new RangeError("A test clock cannot advance by a negative time");
      }
      const until = current + milliseconds;
      let ran = 0;
      for (;;) {
        // Scanned each time rather than sorted once: a callback may schedule or
        // cancel work, so the next timer due is only known after the last ran.
        let due: Scheduled | undefined;
        for (const timer of scheduled) {
          if (timer.at > until) continue;
          if (
            !due ||
            timer.at < due.at ||
            (timer.at === due.at && timer.sequence < due.sequence)
          ) {
            due = timer;
          }
        }
        if (!due) break;
        const running = due;
        scheduled = scheduled.filter((timer) => timer.id !== running.id);
        // Time is at the timer's own due point while it runs, so a callback
        // reading the clock sees when it was due rather than where the advance
        // happens to end.
        current = Math.max(current, running.at);
        ran += 1;
        running.callback();
      }
      current = until;
      return ran;
    },
    clearTimeout: (timer: TestTimer) => {
      scheduled = scheduled.filter((entry) => entry.id !== timer.id);
    },
    now: () => current,
    get pending() {
      return scheduled.length;
    },
    setTimeout: (callback: () => void, delay = 0) => {
      const id = nextId++;
      scheduled.push(
        Object.freeze({
          at: current + Math.max(0, delay),
          callback,
          id,
          sequence: sequence++,
        }),
      );
      return Object.freeze({ id });
    },
  });
}

export type TestFocusTarget = Readonly<{
  /** Register as a Panel Lifecycle's `initialFocus` or `fallbackFocus`. */
  ref: Readonly<{ current: HTMLElement | null }>;
  readonly focusCount: number;
  readonly focused: boolean;
  /** The options each `focus()` was called with, in order. */
  readonly calls: readonly FocusOptions[];
  /** Detach it, as unmounting an element does. The Canvas then declines it. */
  disconnect: () => void;
}>;

/**
 * Somewhere a Panel can ask focus to go, without a DOM. It answers the two
 * things the Panel Focus Owner actually asks of a registered target — whether
 * it is still connected, and to take focus — so a stub that drifts from what
 * the Workspace requires fails rather than quietly never being focused.
 *
 * It records focus; it never claims it. Nothing in the testing tools moves
 * focus on its own, because a second claimant for one moment is what makes two
 * owners re-render each other indefinitely.
 */
export function createTestFocusTarget(
  options: Readonly<{ connected?: boolean }> = {},
): TestFocusTarget {
  const calls: FocusOptions[] = [];
  let connected = options.connected ?? true;

  const element = {
    focus(focusOptions?: FocusOptions) {
      calls.push(Object.freeze({ ...focusOptions }));
    },
    get isConnected() {
      return connected;
    },
  };

  return Object.freeze({
    get calls() {
      return Object.freeze([...calls]);
    },
    disconnect: () => {
      connected = false;
    },
    get focusCount() {
      return calls.length;
    },
    get focused() {
      return calls.length > 0;
    },
    ref: Object.freeze({ current: element as unknown as HTMLElement }),
  });
}

type TestMediaQueryList = Readonly<{
  media: string;
  readonly matches: boolean;
  addEventListener: (type: string, listener: (event: unknown) => void) => void;
  removeEventListener: (
    type: string,
    listener: (event: unknown) => void,
  ) => void;
}>;

export type TestViewport = Readonly<{
  /** Assign to `window.matchMedia`, or use `install`. */
  matchMedia: (query: string) => TestMediaQueryList;
  /** The declared breakpoint queries this viewport answers for. */
  readonly queries: readonly (readonly [CanvasBreakpoint, string])[];
  readonly breakpoint: CanvasBreakpoint;
  /** Move to a Declared Breakpoint and notify the Canvas, as a resize does. */
  resizeTo: (breakpoint: CanvasBreakpoint) => void;
  /** Install onto a window and return the restore. */
  install: (target: Readonly<{ matchMedia?: unknown }>) => () => void;
}>;

/**
 * The Declared Breakpoints as a viewport a test can resize. It answers the
 * package's own breakpoint queries, so a test never restates them and cannot
 * drift from the presentation the Canvas actually selects.
 */
export function createTestViewport(
  options: Readonly<{ breakpoint?: CanvasBreakpoint }> = {},
): TestViewport {
  const queryFor = new Map<CanvasBreakpoint, string>(
    canvasBreakpointQueries.map(([breakpoint, query]) => [breakpoint, query]),
  );
  const listeners = new Map<(event: unknown) => void, string>();
  let current: CanvasBreakpoint = options.breakpoint ?? "desktop";

  const matchMedia = (query: string): TestMediaQueryList =>
    Object.freeze({
      addEventListener: (_type: string, listener: (event: unknown) => void) => {
        listeners.set(listener, query);
      },
      get matches() {
        return queryFor.get(current) === query;
      },
      media: query,
      removeEventListener: (
        _type: string,
        listener: (event: unknown) => void,
      ) => {
        listeners.delete(listener);
      },
    });

  return Object.freeze({
    get breakpoint() {
      return current;
    },
    install: (target: Readonly<{ matchMedia?: unknown }>) => {
      const owner = target as { matchMedia?: unknown };
      const previous = owner.matchMedia;
      owner.matchMedia = matchMedia;
      return () => {
        owner.matchMedia = previous;
      };
    },
    matchMedia,
    queries: canvasBreakpointQueries,
    resizeTo: (breakpoint: CanvasBreakpoint) => {
      current = breakpoint;
      for (const [listener, query] of [...listeners]) {
        listener({ matches: queryFor.get(breakpoint) === query });
      }
    },
  });
}

/** What `usePresentation` publishes for one Panel. */
export function buildPresentation(
  options: Readonly<{
    active?: boolean;
    closable?: boolean;
    deepest?: boolean;
    title?: string;
    visible?: boolean;
  }> = {},
): CanvasPresentation {
  return Object.freeze({
    active: options.active ?? true,
    closable: options.closable ?? true,
    deepest: options.deepest ?? true,
    title: options.title ?? "Panel",
    visible: options.visible ?? true,
  });
}
