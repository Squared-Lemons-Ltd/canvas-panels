"use client";

import { useEffect, useRef } from "react";

import type {
  NavigationRecoveryIntent,
  PanelEngine,
  PanelInstanceId,
  PanelReference,
} from "../core/index.js";
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
 * The subset of Next's App Router used by the Canvas. Supply `useRouter()`.
 */
export type CanvasNavigationRouter = Readonly<{
  replace: (url: string) => void;
}>;

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
  router: CanvasNavigationRouter;
  location: CanvasNavigationLocation;
  initialState?: CanvasNavigationState;
  parameterName?: string;
  onRecovery?: (recovery: NavigationRecoveryIntent) => void;
}>;

function isRootOnly(document: string): boolean {
  try {
    const parsed: unknown = JSON.parse(document);
    return (
      typeof parsed === "object" &&
      parsed !== null &&
      Array.isArray((parsed as { panels?: unknown }).panels) &&
      (parsed as { panels: readonly unknown[] }).panels.length === 0
    );
  } catch {
    return false;
  }
}

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
 * unrelated routes stay delegated to the application. Every write uses replace
 * semantics: meaningful history entries are the browser-history adapter's
 * responsibility, not the deep-link contract's.
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
  if (written.current === null) {
    const current = readCanvasNavigationState(
      new URLSearchParams(location.search),
      { parameterName },
    );
    written.current = current.status === "decoded" ? current.document : "";
  }

  useEffect(() => {
    const write = (document: string) => {
      const { location: currentLocation, router: currentRouter } =
        latest.current;
      const search = applyCanvasNavigationParameter(
        new URLSearchParams(currentLocation.search),
        isRootOnly(document) ? null : document,
        { parameterName },
      ).toString();
      currentRouter.replace(
        `${currentLocation.pathname}${search ? `?${search}` : ""}${
          currentLocation.hash ?? ""
        }`,
      );
      written.current = document;
    };

    const synchronize = () => {
      const document = engine.encodeNavigationDocument();
      if (document === written.current) return;
      // A Canvas that has never claimed the URL and still has no contextual
      // Panels leaves the address entirely to the application's own routing.
      if (written.current === "" && isRootOnly(document)) return;
      write(document);
    };

    synchronize();
    return engine.subscribe(synchronize);
  }, [engine, parameterName]);

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
        if (firstUnreachable)
          engine.close({ target: firstUnreachable.instanceRef });
        latest.current.onRecovery?.(outcome.recovery);
      });

    return () => controller.abort();
  }, [engine, initialDocument]);
}
