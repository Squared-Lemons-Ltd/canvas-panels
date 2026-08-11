"use client";

import {
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import type {
  GuardedTransitionProposal,
  GuardOutcome,
  PanelLifecycle,
  PanelLifecycleOperation,
} from "../core/index.js";

/**
 * The three operations an editor coordinates. Saving and discarding are also
 * driven by the Guarded Transition coordinator; reloading is only ever asked
 * for by the application.
 */
export type EditorOperationKind = "save" | "discard" | "reload";

export type EditorOperation = Readonly<{
  kind: EditorOperationKind;
  signal: AbortSignal;
  /**
   * The Guarded Transition that asked for this operation, or `null` when the
   * application asked for it directly.
   */
  transition: GuardedTransitionProposal | null;
}>;

/**
 * Everything the extension needs from the application, and nothing more. The
 * application keeps its form, its validation, and its repository: it reports
 * whether there is unsaved work and supplies the operations that resolve it.
 */
export type EditorSource = Readonly<{
  dirty: boolean;
  /** Reported while the application is reading the record being edited. */
  loading?: boolean;
  /**
   * Replaces the English sentences the guard produces. Spread
   * {@link editorGuardMessages} and override only what you need.
   */
  messages?: EditorGuardMessages;
  save: (operation: EditorOperation) => Promise<void>;
  discard: (operation: EditorOperation) => Promise<void>;
  /** Omit it and {@link PanelEditor.reload} reports `unsupported`. */
  reload?: (operation: EditorOperation) => Promise<void>;
}>;

export type EditorStatus =
  | "idle"
  | "loading"
  | "saving"
  | "discarding"
  | "reloading";

export type EditorFailure = Readonly<{
  operation: EditorOperationKind;
  error: unknown;
}>;

export type EditorState = Readonly<{
  status: EditorStatus;
  /** The running operation, or `null` while merely loading or idle. */
  operation: EditorOperationKind | null;
  dirty: boolean;
  busy: boolean;
  failure: EditorFailure | null;
}>;

export type EditorOperationOutcome =
  | Readonly<{ status: "completed"; operation: EditorOperationKind }>
  | Readonly<{ status: "aborted"; operation: EditorOperationKind }>
  | Readonly<{
      status: "failed";
      operation: EditorOperationKind;
      error: unknown;
    }>
  | Readonly<{
      status: "rejected";
      operation: EditorOperationKind;
      reason: EditorRejectionReason;
    }>;

export type EditorRejectionReason =
  | "operation-in-progress"
  | "unsupported"
  | "unsaved-changes";

export type EditorGuardMessages = Readonly<{
  unsavedChanges: string;
  saving: string;
  discarding: string;
}>;

/**
 * The sentences the Guarded Transition dialog shows for an editor. They are
 * templates rather than fixed strings so a Canvas can be localized.
 */
export const editorGuardMessages: EditorGuardMessages = Object.freeze({
  discarding: "This panel is still discarding its changes.",
  saving: "This panel is still saving its changes.",
  unsavedChanges: "This panel has unsaved changes.",
});

export type EditorGuardState = Readonly<{
  dirty: boolean;
  status: EditorStatus;
  messages?: EditorGuardMessages;
}>;

/**
 * Decides what a destructive transition may do to an editor. A write in flight
 * blocks: the transition cannot commit over a half-written record, and asking
 * a human to decide again would only race it. Reading — whether the first load
 * or a reload — never blocks, because a read has nothing to lose. Otherwise
 * unsaved work is a decision for a human, and a settled editor is free to go.
 *
 * It is exported so an application coordinating its own editor gets the same
 * ordering the extension applies.
 */
export function resolveEditorGuard(state: EditorGuardState): GuardOutcome {
  const messages = state.messages ?? editorGuardMessages;
  if (state.status === "saving" || state.status === "discarding") {
    return Object.freeze({ reason: messages[state.status], status: "block" });
  }
  if (state.dirty) {
    return Object.freeze({
      message: messages.unsavedChanges,
      status: "confirm",
    });
  }
  return Object.freeze({ status: "allow" });
}

export type EditorReloadOptions = Readonly<{
  /** Required to reload over unsaved work, which the reload replaces. */
  discardChanges?: boolean;
}>;

export type PanelEditor = Readonly<{
  getState: () => EditorState;
  /**
   * The lifecycle to register through the Panel's own `useLifecycle`. The
   * extension deliberately does not register it: one Panel has one lifecycle,
   * and it stays the application's to hand over.
   */
  getLifecycle: () => PanelLifecycle;
  subscribe: (listener: () => void) => () => void;
  /** Republishes the application's dirty state and operations. */
  update: (source: EditorSource) => void;
  save: () => Promise<EditorOperationOutcome>;
  discard: () => Promise<EditorOperationOutcome>;
  reload: (options?: EditorReloadOptions) => Promise<EditorOperationOutcome>;
  /** Aborts the operation this editor started, if one is running. */
  abort: () => void;
  dismissFailure: () => void;
}>;

type RunningOperation = Readonly<{
  kind: EditorOperationKind;
  promise: Promise<void>;
  signal: AbortSignal;
  /** Present only for an operation the application asked for. */
  controller: AbortController | null;
}>;

const statusForOperation: Readonly<Record<EditorOperationKind, EditorStatus>> =
  Object.freeze({
    discard: "discarding",
    reload: "reloading",
    save: "saving",
  });

/**
 * A write in flight leaves the Panel something to lose, so it stays guarded
 * even once the draft itself is clean. A reload does not: it reads, and a
 * Panel with nothing to lose must not stand in the way of navigation.
 *
 * The React binding and the store both need this from their own view of what
 * is running, so the rule lives in one place rather than in each of them.
 */
export function editorLifecycleDirty(
  dirty: boolean,
  operation: EditorOperationKind | null,
): boolean {
  return dirty || (operation !== null && operation !== "reload");
}

/** A running operation names the status; otherwise the application does. */
export function editorStatus(
  operation: EditorOperationKind | null,
  loading: boolean | undefined,
): EditorStatus {
  if (operation !== null) return statusForOperation[operation];
  return loading === true ? "loading" : "idle";
}

export function createPanelEditor(initialSource: EditorSource): PanelEditor {
  let source = initialSource;
  let running: RunningOperation | null = null;
  let failure: EditorFailure | null = null;
  let state: EditorState = deriveState();
  let lifecycle: PanelLifecycle = deriveLifecycle();
  const listeners = new Set<() => void>();

  function currentStatus(): EditorStatus {
    return editorStatus(running?.kind ?? null, source.loading);
  }

  function deriveState(): EditorState {
    const status = currentStatus();
    return Object.freeze({
      busy: status !== "idle",
      dirty: source.dirty,
      failure,
      operation: running?.kind ?? null,
      status,
    });
  }

  // The lifecycle's three functions never change identity, so only its `dirty`
  // flag can make a Panel re-register.
  function guard(): GuardOutcome {
    return resolveEditorGuard({
      dirty: source.dirty,
      status: currentStatus(),
      ...(source.messages === undefined ? {} : { messages: source.messages }),
    });
  }

  function coordinatedSave(operation: PanelLifecycleOperation): Promise<void> {
    return runForCoordinator("save", operation);
  }

  function coordinatedDiscard(
    operation: PanelLifecycleOperation,
  ): Promise<void> {
    return runForCoordinator("discard", operation);
  }

  function deriveLifecycle(): PanelLifecycle {
    return Object.freeze({
      dirty: editorLifecycleDirty(source.dirty, running?.kind ?? null),
      discard: coordinatedDiscard,
      guard,
      save: coordinatedSave,
    });
  }

  function publish(): void {
    const next = deriveState();
    if (
      next.status === state.status &&
      next.dirty === state.dirty &&
      next.failure === state.failure
    ) {
      return;
    }
    state = next;
    lifecycle = deriveLifecycle();
    for (const listener of listeners) listener();
  }

  function start(
    kind: EditorOperationKind,
    operation: EditorOperation,
    controller: AbortController | null,
  ): Promise<void> {
    const run = source[kind];
    if (!run) throw new Error(`The editor has no ${kind} operation`);
    failure = null;
    const promise = run(operation);
    const started: RunningOperation = Object.freeze({
      controller,
      kind,
      promise,
      signal: operation.signal,
    });
    running = started;
    publish();
    promise.then(
      () => settle(started, false, undefined),
      (error: unknown) => settle(started, true, error),
    );
    return promise;
  }

  function settle(
    started: RunningOperation,
    failed: boolean,
    error: unknown,
  ): void {
    if (running !== started) return;
    running = null;
    // An operation that was cancelled is not a failure to report, whether the
    // application abandoned it or the coordinator gave up on the transition.
    if (failed && !started.signal.aborted) {
      failure = Object.freeze({ error, operation: started.kind });
    }
    publish();
  }

  function runForApplication(
    kind: EditorOperationKind,
    operation: EditorOperation,
    controller: AbortController,
  ): Promise<EditorOperationOutcome> {
    return start(kind, operation, controller).then(
      () => Object.freeze({ operation: kind, status: "completed" } as const),
      (error: unknown) =>
        controller.signal.aborted
          ? Object.freeze({ operation: kind, status: "aborted" } as const)
          : Object.freeze({
              error,
              operation: kind,
              status: "failed",
            } as const),
    );
  }

  async function runForCoordinator(
    kind: "save" | "discard",
    operation: Readonly<{
      signal: AbortSignal;
      transition: GuardedTransitionProposal;
    }>,
  ): Promise<void> {
    const inFlight = running;
    if (inFlight) {
      // The same work already under way is the work the coordinator wants, so
      // join it rather than writing the record twice; anything else has to
      // settle before this operation may touch the same record.
      if (inFlight.kind === kind) return inFlight.promise;
      await inFlight.promise.catch(() => {});
    }
    return start(
      kind,
      Object.freeze({
        kind,
        signal: operation.signal,
        transition: operation.transition,
      }),
      null,
    );
  }

  function applicationOperation(
    kind: EditorOperationKind,
  ): Promise<EditorOperationOutcome> {
    const controller = new AbortController();
    return runForApplication(
      kind,
      Object.freeze({ kind, signal: controller.signal, transition: null }),
      controller,
    );
  }

  function rejected(
    operation: EditorOperationKind,
    reason: EditorRejectionReason,
  ): Promise<EditorOperationOutcome> {
    return Promise.resolve(
      Object.freeze({ operation, reason, status: "rejected" } as const),
    );
  }

  return Object.freeze({
    abort: () => {
      running?.controller?.abort();
    },
    discard: () =>
      running
        ? rejected("discard", "operation-in-progress")
        : applicationOperation("discard"),
    dismissFailure: () => {
      if (failure === null) return;
      failure = null;
      publish();
    },
    getLifecycle: () => lifecycle,
    getState: () => state,
    reload: (options) => {
      if (!source.reload) return rejected("reload", "unsupported");
      if (running) return rejected("reload", "operation-in-progress");
      if (source.dirty && options?.discardChanges !== true) {
        return rejected("reload", "unsaved-changes");
      }
      return applicationOperation("reload");
    },
    save: () =>
      running
        ? rejected("save", "operation-in-progress")
        : applicationOperation("save"),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    update: (next) => {
      source = next;
      publish();
    },
  });
}

export type PanelEditorBinding = EditorState &
  Readonly<{
    /**
     * Hand this to the Panel's `useLifecycle`. It is the one lifecycle the
     * Panel registers, so an editor and a hand-written guard never compete.
     */
    lifecycle: PanelLifecycle;
    save: () => Promise<EditorOperationOutcome>;
    discard: () => Promise<EditorOperationOutcome>;
    reload: (options?: EditorReloadOptions) => Promise<EditorOperationOutcome>;
    abort: () => void;
    dismissFailure: () => void;
  }>;

/**
 * Coordinates one Panel's editor. The application still owns its form, its
 * validation, and its data: it reports whether there is unsaved work and
 * supplies the operations, and this decides how those meet the Panel's
 * Guarded Transitions.
 */
export function usePanelEditor(source: EditorSource): PanelEditorBinding {
  const [editor] = useState(() => createPanelEditor(source));
  // Republished before paint, so a guard raised by the very next interaction
  // reads what this render described rather than the previous one.
  useLayoutEffect(() => {
    editor.update(source);
  });
  const published = useSyncExternalStore(
    editor.subscribe,
    editor.getState,
    editor.getState,
  );
  // What is running comes from the store; what the application declared comes
  // from this render. A Panel registers its lifecycle from what it rendered, so
  // deferring `dirty` to the layout effect would leave it unguarded for a
  // commit.
  const { operation } = published;
  const status = editorStatus(operation, source.loading);
  const dirty = editorLifecycleDirty(source.dirty, operation);
  const lifecycle = useMemo(
    () => Object.freeze({ ...editor.getLifecycle(), dirty }),
    [dirty, editor],
  );

  return useMemo(
    () =>
      Object.freeze({
        abort: editor.abort,
        busy: status !== "idle",
        dirty: source.dirty,
        discard: editor.discard,
        dismissFailure: editor.dismissFailure,
        failure: published.failure,
        lifecycle,
        operation,
        reload: editor.reload,
        save: editor.save,
        status,
      }),
    [editor, lifecycle, operation, published.failure, source.dirty, status],
  );
}
