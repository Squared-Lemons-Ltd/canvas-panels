"use client";

import { useEffect, useRef } from "react";

import type {
  NavigationIntent,
  NavigationRecoveryIntent,
  PanelEngine,
  PanelInstanceId,
  PanelReference,
} from "../core/index.js";
import {
  type CanvasHistoryEntry,
  claimHistoryNamespace,
  createCanvasHistoryEntry,
  planCanvasHistoryRepair,
  readCanvasHistoryEntry,
  writeCanvasHistoryEntry,
} from "./history.js";
import {
  applyCanvasNavigationParameter,
  canvasNavigationParameterName,
  readCanvasNavigationState,
  type CanvasNavigationState,
} from "./server.js";

// Types only: the server-safe reader and writer stay on `/next/server` so a
// client bundle never becomes the place applications reach for them.
export type {
  CanvasNavigationDiagnostic,
  CanvasNavigationState,
  CanvasSearchParams,
} from "./server.js";
export type { CanvasHistoryEntry } from "./history.js";

/**
 * The parts of the current URL the Canvas needs in order to write itself back
 * without disturbing the rest of the address. Supply these from Next's
 * `usePathname()` and `useSearchParams()`.
 */
export type CanvasNavigationLocation = Readonly<{
  pathname: string;
  search: string;
  hash?: string;
}>;

/**
 * The subset of Next's App Router the Canvas once used to write the URL.
 *
 * @deprecated Since browser-history integration, Canvas writes go through
 * {@link CanvasHistoryPort} instead. Next.js rewrites `history.state` after
 * `router.push`/`replace`, which would strip the Canvas History Entry off the
 * entry it just created; writing through the History API is the only path
 * Next.js preserves, because its patch copies its own internals *into* the
 * object it is given. The option is still accepted so existing callers keep
 * working, and is otherwise unused.
 */
export type CanvasNavigationRouter = Readonly<{
  replace: (url: string) => void;
}>;

/**
 * A `popstate` the Canvas must interpret, carrying the address the browser has
 * already moved to. The URL is delivered with the event because Next's
 * `usePathname`/`useSearchParams` do not update until after the traversal is
 * dispatched, which is too late to decide what to restore.
 */
export type CanvasHistoryPopState = Readonly<{ state: unknown; url: string }>;

/**
 * The browser History API as the Canvas needs it, injected rather than reached
 * for directly so the adapter stays testable without a session history a test
 * could traverse.
 */
export type CanvasHistoryPort = Readonly<{
  getState: () => unknown;
  push: (state: unknown, url: string) => void;
  replace: (state: unknown, url: string) => void;
  go: (delta: number) => void;
  subscribe: (listener: (event: CanvasHistoryPopState) => void) => () => void;
}>;

export type CanvasHistoryFailure = Readonly<{
  reason: "unrepairable-position";
  /** The entry the Workspace is still showing, when it is known. */
  expected: CanvasHistoryEntry | null;
  /** The entry the browser moved to, when it is known. */
  actual: CanvasHistoryEntry | null;
}>;

/**
 * Whether this Workspace owns the URL, or keeps its navigation in memory
 * because another Workspace already claimed the same History Namespace.
 */
export type CanvasHistoryOwnership = "url" | "memory";

function createWindowHistoryPort(): CanvasHistoryPort | null {
  if (typeof window === "undefined") return null;
  const read = () =>
    `${window.location.pathname}${window.location.search}${window.location.hash}`;
  return Object.freeze({
    getState: () => window.history.state,
    push: (state: unknown, url: string) =>
      window.history.pushState(state, "", url),
    replace: (state: unknown, url: string) =>
      window.history.replaceState(state, "", url),
    go: (delta: number) => window.history.go(delta),
    subscribe: (listener: (event: CanvasHistoryPopState) => void) => {
      const handle = () =>
        listener({ state: window.history.state, url: read() });
      window.addEventListener("popstate", handle);
      return () => window.removeEventListener("popstate", handle);
    },
  });
}

let historyKeySequence = 0;
function nextHistoryKey(namespace: string): string {
  historyKeySequence += 1;
  return `${namespace}-${historyKeySequence}`;
}

export type CanvasNavigationSeedOutcome =
  | Readonly<{ status: "absent" }>
  | Readonly<{ status: "seeded"; panelCount: number }>
  | Readonly<{
      status: "recovered";
      panelCount: number;
      recovery: NavigationRecoveryIntent;
    }>;

export type CanvasNavigationSyncOptions<
  Reference extends PanelReference = PanelReference,
> = Readonly<{
  engine: PanelEngine<Reference>;
  /** @deprecated Unused. See {@link CanvasNavigationRouter}. */
  router?: CanvasNavigationRouter;
  location: CanvasNavigationLocation;
  /** Defaults to a port bound to `window.history`. */
  history?: CanvasHistoryPort;
  initialState?: CanvasNavigationState;
  parameterName?: string;
  onRecovery?: (recovery: NavigationRecoveryIntent) => void;
  /**
   * Called when a cancelled traversal cannot be undone, so the address is left
   * disagreeing with the Canvas. Reaching this means the browser is somewhere
   * the Workspace cannot reason about; guessing a direction would compound it.
   */
  onHistoryFailure?: (failure: CanvasHistoryFailure) => void;
  /**
   * Whether this Workspace should try to own the URL at all. Defaults to `url`.
   *
   * A Workspace nested inside a Panel must declare `memory`: React commits
   * effects child-first, so a nested Workspace left to claim the History
   * Namespace would take it before its host and demote the host to memory.
   */
  ownership?: CanvasHistoryOwnership;
  /**
   * Called once the Workspace knows whether it owns the URL. A secondary or
   * nested Workspace is told `memory` and writes no history at all.
   */
  onOwnership?: (ownership: CanvasHistoryOwnership) => void;
}>;

function openReferences<Reference extends PanelReference>(
  engine: PanelEngine<Reference>,
  references: readonly Reference[],
): number {
  let originId: PanelInstanceId = engine.getSnapshot().panels[0]
    ?.instanceId as PanelInstanceId;
  let opened = 0;
  for (const panel of references) {
    const outcome = engine.open({ originId, panel });
    if (outcome.status !== "opened" && outcome.status !== "reused") break;
    originId = outcome.instanceId;
    opened += 1;
  }
  return opened;
}

/**
 * Reconstructs the Canvas Workspace from server-decoded navigation state
 * synchronously, so the first client render already shows the full contextual
 * stack instead of flashing the Root Panel.
 *
 * Panel Kinds that restore through a loader are still verified asynchronously
 * by {@link useCanvasNavigationSync}; seeding only replays what the registry can
 * decode on its own.
 */
export function seedCanvasNavigation<Reference extends PanelReference>(
  engine: PanelEngine<Reference>,
  state: CanvasNavigationState,
): CanvasNavigationSeedOutcome {
  if (state.status === "absent") {
    return Object.freeze({ status: "absent" } as const);
  }
  if (state.status === "rejected") {
    return Object.freeze({
      status: "recovered",
      panelCount: 0,
      recovery: Object.freeze({
        kind: "recovery-panel",
        reason: "invalid-document",
        failedPanelIndex: null,
      }),
    } as const);
  }

  const decoded = engine.decodeNavigationDocument(state.document);
  if (decoded.status === "rejected") {
    const failedPanelIndex = /\$\.panels\[(\d+)\]/.exec(
      decoded.diagnostic.path,
    );
    return Object.freeze({
      status: "recovered",
      panelCount: 0,
      recovery: Object.freeze({
        kind: "recovery-panel",
        reason: "invalid-document",
        failedPanelIndex: failedPanelIndex ? Number(failedPanelIndex[1]) : null,
      }),
    } as const);
  }

  const panelCount = openReferences(engine, decoded.references);
  return Object.freeze({ status: "seeded", panelCount } as const);
}

/**
 * Keeps the URL-Owning Canvas Workspace and the Next.js App Router URL in step.
 *
 * The Canvas only claims its parameter once it has contextual Panels open, so
 * unrelated routes stay delegated to the application. A write carries the
 * navigation intent the engine published with the stack it is writing, so an
 * `open` pushes an entry and Back pops exactly one Panel; only a repair the
 * user never asked for — trimming a Panel the Canvas could not verify —
 * replaces instead.
 */
export function useCanvasNavigationSync<Reference extends PanelReference>(
  options: CanvasNavigationSyncOptions<Reference>,
): void {
  const { engine, location, initialState } = options;
  const parameterName = options.parameterName ?? canvasNavigationParameterName;
  // The router, the current location, and the recovery callback are read
  // through this ref so a re-render never tears down the engine subscription.
  const latest = useRef(options);
  latest.current = options;

  const written = useRef<string | null>(null);
  // Set while the recovery pass trims Panels the Canvas could not verify, so
  // that repair is written with replace semantics rather than pushed.
  const normalizing = useRef(false);
  // A rejected parameter must not survive in the address, so a Canvas that
  // started from one claims the URL immediately in order to normalize it away.
  const rejectedInitialParameter = initialState?.status === "rejected";
  if (written.current === null) {
    const current = readCanvasNavigationState(
      new URLSearchParams(location.search),
      { parameterName },
    );
    written.current = current.status === "decoded" ? current.document : "";
  }

  useEffect(() => {
    const port = latest.current.history ?? createWindowHistoryPort();
    // A Workspace that declares itself secondary never even attempts the claim.
    // React commits effects child-first, so a Workspace nested inside a Panel
    // would otherwise claim the namespace ahead of its host and demote it; the
    // nesting is not something the adapter can detect on its own.
    if (latest.current.ownership === "memory") {
      latest.current.onOwnership?.("memory");
      return;
    }
    const claim = claimHistoryNamespace(parameterName);
    latest.current.onOwnership?.(claim.status === "primary" ? "url" : "memory");
    // A secondary Workspace keeps working; it simply navigates in memory and
    // never touches an address another Workspace owns.
    if (claim.status !== "primary") return;
    if (!port) return claim.release;

    // Where this Workspace believes the browser is.
    let current = readCanvasHistoryEntry(port.getState(), parameterName);
    // Set while a repair traversal is in flight, so the `popstate` it causes is
    // recognised as this Workspace's own and proposes nothing.
    let repairing: CanvasHistoryEntry | null = null;
    // Set while a traversal waits on a Guarded Transition the user has not
    // resolved.
    //
    // `staged` is the stack the engine was actually asked to restore, which is
    // what it will commit; `latest` is wherever the browser has since reached.
    // A further traversal moves `latest` only, so rapid Back/Forward raises one
    // dialog and settles against the position the browser really finished at.
    let pending: Readonly<{
      staged: CanvasHistoryEntry;
      stagedDocument: string | null;
      latest: CanvasHistoryEntry;
    }> | null = null;
    // Set while restoring, so the engine's own publish does not write the URL
    // back for a move the browser has already made.
    let traversing = false;

    /**
     * The current address, with the Navigation Parameter set to `parameter` —
     * or left exactly as the host wrote it when `parameter` is omitted.
     */
    const addressFor = (parameter?: string | null) => {
      const { location: currentLocation } = latest.current;
      const search =
        parameter === undefined
          ? currentLocation.search.replace(/^\?/, "")
          : applyCanvasNavigationParameter(
              new URLSearchParams(currentLocation.search),
              parameter,
              { parameterName },
            ).toString();
      return `${currentLocation.pathname}${search ? `?${search}` : ""}${
        currentLocation.hash ?? ""
      }`;
    };

    const stamp = (entry: CanvasHistoryEntry, url: string, push: boolean) => {
      // The existing state is carried forward rather than replaced: Next.js
      // stores its own routing internals there, and dropping them would make
      // the browser reload the page on the way back.
      const state = writeCanvasHistoryEntry(port.getState(), entry);
      if (push) port.push(state, url);
      else port.replace(state, url);
      current = entry;
    };

    // The entry the Canvas is about to leave must itself be stamped, or a later
    // Back onto it could not be recognised as belonging to this Workspace.
    const ensureBaseline = () => {
      if (current) return;
      stamp(
        createCanvasHistoryEntry({
          namespace: parameterName,
          key: nextHistoryKey(parameterName),
          index: 0,
        }),
        addressFor(),
        false,
      );
    };

    const write = (
      parameter: string | null,
      document: string,
      intent: NavigationIntent,
    ) => {
      const url = addressFor(parameter);
      if (intent === "push") {
        // Only a push leaves an entry behind, so only a push needs the entry it
        // is leaving to have been stamped first.
        ensureBaseline();
        const previous = current as CanvasHistoryEntry;
        stamp(
          createCanvasHistoryEntry({
            namespace: parameterName,
            key: nextHistoryKey(parameterName),
            index: previous.index + 1,
          }),
          url,
          true,
        );
      } else {
        stamp(
          current ??
            createCanvasHistoryEntry({
              namespace: parameterName,
              key: nextHistoryKey(parameterName),
              index: 0,
            }),
          url,
          false,
        );
      }
      // Record the Navigation Document behind the write, not the parameter, so
      // a Canvas resting at its Root Panel does not rewrite the URL repeatedly.
      written.current = document;
    };

    /**
     * Moves the browser from `to` back to `from` — the entry the Canvas is
     * actually showing — so the address and the Panel Stack agree again.
     */
    const repair = (
      from: CanvasHistoryEntry | null,
      to: CanvasHistoryEntry,
    ) => {
      const plan = planCanvasHistoryRepair(from, to);
      if (plan.status === "settled") return;
      if (plan.status === "unrepairable") {
        latest.current.onHistoryFailure?.(
          Object.freeze({
            reason: "unrepairable-position",
            expected: from,
            actual: to,
          } as const),
        );
        return;
      }
      repairing = from;
      port.go(plan.delta);
    };

    const synchronize = () => {
      if (traversing) return;
      // A Panel Stack too large to encode keeps working; it simply stops being
      // deep-linkable, and the address is left exactly as the host set it.
      let document: string;
      try {
        document = engine.encodeNavigationDocument();
      } catch {
        return;
      }
      const snapshot = engine.getSnapshot();

      if (pending) {
        // The dialog is still open; nothing is decided yet.
        if (snapshot.transition !== null) return;
        const committed =
          pending.stagedDocument === null
            ? snapshot.panels.length === 1
            : document === pending.stagedDocument;
        const { staged, latest: reached } = pending;
        pending = null;
        if (committed) {
          // The traversal went through, so the Canvas is now at `staged`. That
          // is only where the browser is too if nothing moved it since.
          written.current = document;
          current = staged;
          repair(staged, reached);
          return;
        }
        // The user kept their work, so the browser is the thing out of step.
        repair(current, reached);
        return;
      }

      if (document === written.current) return;
      const rootOnly = snapshot.panels.length === 1;
      // A Canvas that has never claimed the URL and still has no contextual
      // Panels leaves the address entirely to the application's own routing.
      if (written.current === "" && rootOnly && !rejectedInitialParameter) {
        return;
      }
      // Trimming an unreachable Panel is normalization, not navigation: the
      // user never asked to go anywhere, so it must not become a history entry.
      const intent = normalizing.current
        ? "replace"
        : snapshot.navigationIntent;
      write(rootOnly ? null : document, document, intent);
    };

    const documentFor = (url: string) => {
      const fragment = url.indexOf("#");
      const address = fragment === -1 ? url : url.slice(0, fragment);
      const query = address.indexOf("?");
      const state = readCanvasNavigationState(
        new URLSearchParams(query === -1 ? "" : address.slice(query)),
        { parameterName },
      );
      return state.status === "decoded" ? state.document : null;
    };

    const handlePopState = ({ state, url }: CanvasHistoryPopState) => {
      const target = readCanvasHistoryEntry(state, parameterName);

      if (repairing) {
        const landed = repairing;
        // The latch is released on the first `popstate` either way. Holding it
        // until a matching key arrives would deafen the Workspace for the rest
        // of the session whenever the repair failed to land — for instance
        // because an intervening push truncated the entry it aimed at.
        repairing = null;
        if (target && target.key === landed.key) {
          current = landed;
          return;
        }
        // The repair went somewhere unexpected, so this is a position the
        // Workspace has to interpret from scratch rather than trust.
      }

      // An entry this Workspace never stamped belongs to the application's own
      // routing, so the traversal is left entirely alone.
      if (!target) return;

      const targetDocument = documentFor(url);
      // A traversal is already awaiting an answer. Only the browser's position
      // moves on: the engine has already staged the first target and will
      // commit that, so rapid Back/Forward raises one dialog, not two.
      if (pending) {
        pending = Object.freeze({ ...pending, latest: target });
        return;
      }

      const decoded =
        targetDocument === null
          ? null
          : engine.decodeNavigationDocument(targetDocument);
      const references =
        decoded && decoded.status === "decoded" ? decoded.references : [];

      traversing = true;
      let outcome: ReturnType<typeof engine.restoreStack>;
      try {
        // The browser has already moved, so the restoration itself must not
        // record any further history.
        outcome = engine.restoreStack({ references, navigationIntent: "none" });
      } finally {
        traversing = false;
      }

      if (outcome.status === "confirmation-required") {
        pending = Object.freeze({
          staged: target,
          stagedDocument: targetDocument,
          latest: target,
        });
        return;
      }
      if (outcome.status === "rejected") {
        repair(current, target);
        return;
      }

      current = target;
      try {
        written.current = engine.encodeNavigationDocument();
      } catch {
        // An unencodable stack simply stops matching the address.
      }
    };

    synchronize();
    const unsubscribeEngine = engine.subscribe(synchronize);
    const unsubscribeHistory = port.subscribe(handlePopState);
    return () => {
      unsubscribeHistory();
      unsubscribeEngine();
      claim.release();
    };
  }, [engine, parameterName, rejectedInitialParameter]);

  const initialDocument =
    initialState?.status === "decoded" ? initialState.document : null;

  useEffect(() => {
    if (initialDocument === null) return;
    const controller = new AbortController();

    void engine
      .restoreNavigationDocument(initialDocument, {
        signal: controller.signal,
      })
      .then((outcome) => {
        if (controller.signal.aborted || outcome.status !== "recovered") return;
        const panels = engine.getSnapshot().panels;
        // Closing the first unreachable Panel removes it and everything to its
        // right, leaving exactly the prefix the engine could verify.
        const firstUnreachable = panels[outcome.references.length + 1];
        if (firstUnreachable) {
          normalizing.current = true;
          try {
            engine.close({ target: firstUnreachable.instanceRef });
          } finally {
            normalizing.current = false;
          }
        }
        latest.current.onRecovery?.(outcome.recovery);
      });

    return () => controller.abort();
  }, [engine, initialDocument]);
}
