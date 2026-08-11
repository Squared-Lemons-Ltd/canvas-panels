/**
 * The bookkeeping a Navigation Adapter needs in order to tell Back from Forward
 * and to put the browser back where it was when a Guarded Transition is
 * cancelled.
 *
 * Everything here is pure. The browser is reached only through the port in
 * `./index.ts`, so this reasoning stays testable without a DOM and without a
 * session history a test could not traverse.
 */

/**
 * The single slot on `history.state` under which every Canvas History Entry is
 * stamped, keyed by History Namespace.
 *
 * A plain string key, not a symbol: `history.state` is structured-cloned by the
 * browser, and a symbol would not survive the round trip. Next.js copies its own
 * `__NA` and internals tree into whatever object is handed to `pushState`, so
 * writing beside them is safe as long as nothing else is dropped.
 */
export const canvasHistorySlot = "__canvasPanels";

/**
 * Opaque metadata identifying one history entry owned by a Canvas Workspace.
 *
 * `key` identifies the entry; `index` places it in the Workspace's own sequence
 * so a traversal distance can be computed without consulting the browser, which
 * exposes no such API.
 */
export type CanvasHistoryEntry = Readonly<{
  namespace: string;
  key: string;
  index: number;
}>;

export type CanvasHistoryRepairPlan =
  | Readonly<{ status: "settled" }>
  | Readonly<{ status: "repair"; delta: number }>
  | Readonly<{ status: "unrepairable" }>;

export function createCanvasHistoryEntry(
  entry: Readonly<{ namespace: string; key: string; index: number }>,
): CanvasHistoryEntry {
  return Object.freeze({
    namespace: entry.namespace,
    key: entry.key,
    index: entry.index,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Returns a new history state carrying `entry`, leaving every other key — most
 * importantly Next.js's own — untouched, and never mutating the input.
 *
 * The result is deliberately left unfrozen, unlike every other value this
 * package returns. Next.js's patched `pushState` assigns its own `__NA` and
 * internals tree directly onto the object it is handed, so a frozen one would
 * throw under the strict mode ES modules always run in.
 */
export function writeCanvasHistoryEntry(
  state: unknown,
  entry: CanvasHistoryEntry,
): Record<string, unknown> {
  const base = isRecord(state) ? state : {};
  const existing = base[canvasHistorySlot];
  return {
    ...base,
    [canvasHistorySlot]: {
      ...(isRecord(existing) ? existing : {}),
      [entry.namespace]: entry,
    },
  };
}

/**
 * Reads the entry `namespace` owns, or `null` when this history entry was not
 * stamped by that Canvas — which is how entries belonging to the application's
 * own routing, to another Workspace, or to a pre-hydration write stay delegated.
 */
export function readCanvasHistoryEntry(
  state: unknown,
  namespace: string,
): CanvasHistoryEntry | null {
  if (!isRecord(state)) return null;
  const slot = state[canvasHistorySlot];
  if (!isRecord(slot)) return null;
  const candidate = slot[namespace];
  if (!isRecord(candidate)) return null;

  const { namespace: claimed, key, index } = candidate;
  if (claimed !== namespace) return null;
  if (typeof key !== "string" || key === "") return null;
  if (typeof index !== "number" || !Number.isInteger(index) || index < 0) {
    return null;
  }

  return createCanvasHistoryEntry({ namespace, key, index });
}

export type CanvasHistoryClaim =
  | Readonly<{ status: "primary"; release: () => void }>
  | Readonly<{ status: "secondary"; reason: "namespace-claimed" }>;

/**
 * Which History Namespace each URL-Owning Canvas Workspace currently holds.
 *
 * The owner is recorded by identity rather than by a flag so a released claim
 * can never evict the Workspace that took ownership after it — the shape a
 * double-invoked StrictMode cleanup produces.
 */
const namespaceOwners = new Map<string, symbol>();

/**
 * Claims `namespace` for a Canvas Workspace.
 *
 * The first claimant owns the URL. Later claimants — a secondary Workspace on
 * the same page, or one nested inside a Panel — are told to keep their
 * navigation in memory instead. A collision is reported, never thrown: a nested
 * Workspace appearing on a route is a normal composition, not a defect.
 */
export function claimHistoryNamespace(namespace: string): CanvasHistoryClaim {
  if (namespaceOwners.has(namespace)) {
    return Object.freeze({
      status: "secondary",
      reason: "namespace-claimed",
    } as const);
  }

  const owner = Symbol(namespace);
  namespaceOwners.set(namespace, owner);
  return Object.freeze({
    status: "primary",
    release: () => {
      if (namespaceOwners.get(namespace) === owner) {
        namespaceOwners.delete(namespace);
      }
    },
  } as const);
}

/**
 * Plans the traversal that returns the browser from `to` — where a `popstate`
 * has already taken it — back to `from`, the entry the Workspace is still
 * showing.
 *
 * A missing entry on either side is reported as unrepairable rather than
 * resolved by guessing a direction: moving the wrong way would compound the
 * problem, and the browser offers no way to ask where an entry sits.
 */
export function planCanvasHistoryRepair(
  from: CanvasHistoryEntry | null,
  to: CanvasHistoryEntry | null,
): CanvasHistoryRepairPlan {
  if (!from || !to) return Object.freeze({ status: "unrepairable" } as const);
  if (from.namespace !== to.namespace) {
    return Object.freeze({ status: "unrepairable" } as const);
  }
  if (from.key === to.key) return Object.freeze({ status: "settled" } as const);
  // Distinct entries that claim the same position cannot yield a distance, so
  // the adapter is told to stop rather than traverse by zero and loop.
  if (from.index === to.index) {
    return Object.freeze({ status: "unrepairable" } as const);
  }
  return Object.freeze({
    status: "repair",
    delta: from.index - to.index,
  } as const);
}
