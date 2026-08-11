import {
  decodeNavigationParameter,
  encodeNavigationParameter,
  navigationParameterName,
  type NavigationParameterDiagnostic,
} from "../core/index.js";

/**
 * The query parameter a URL-Owning Canvas Workspace claims by default.
 */
export const canvasNavigationParameterName = navigationParameterName;

/**
 * The shapes Next.js hands a Server Component: a `URLSearchParams` from a
 * request URL, or the resolved `searchParams` record of a page.
 */
export type CanvasSearchParams =
  | URLSearchParams
  | Readonly<Record<string, string | readonly string[] | undefined>>;

export type CanvasNavigationDiagnostic =
  | NavigationParameterDiagnostic
  | Readonly<{ code: "repeated-parameter"; path: string }>;

export type CanvasNavigationState =
  | Readonly<{ status: "absent" }>
  | Readonly<{ status: "decoded"; document: string }>
  | Readonly<{ status: "rejected"; diagnostic: CanvasNavigationDiagnostic }>;

export type CanvasNavigationParameterOptions = Readonly<{
  parameterName?: string;
}>;

function readParameterValues(
  search: CanvasSearchParams,
  parameterName: string,
): readonly string[] {
  if (search instanceof URLSearchParams) return search.getAll(parameterName);
  const value = (
    search as Readonly<Record<string, string | readonly string[] | undefined>>
  )[parameterName];
  if (value === undefined) return [];
  return typeof value === "string" ? [value] : [...value];
}

/**
 * Reads the Canvas navigation parameter from a server request without touching
 * client-only APIs. The returned document is transport-valid only; the Panel
 * Engine still validates and restores it.
 */
export function readCanvasNavigationState(
  search: CanvasSearchParams,
  options: CanvasNavigationParameterOptions = {},
): CanvasNavigationState {
  const parameterName = options.parameterName ?? canvasNavigationParameterName;
  const values = readParameterValues(search, parameterName);
  if (values.length === 0) return Object.freeze({ status: "absent" } as const);
  if (values.length > 1) {
    // A repeated parameter is ambiguous; resolving it silently would let one
    // Canvas state win arbitrarily over another.
    return Object.freeze({
      status: "rejected",
      diagnostic: Object.freeze({
        code: "repeated-parameter",
        path: `$.${parameterName}`,
      }),
    } as const);
  }
  const decoded = decodeNavigationParameter(values[0] as string);
  if (decoded.status === "rejected") {
    return Object.freeze({
      status: "rejected",
      diagnostic: decoded.diagnostic,
    } as const);
  }
  return Object.freeze({
    status: "decoded",
    document: decoded.document,
  } as const);
}

/**
 * Returns a copy of `search` carrying the encoded Navigation Document, leaving
 * every unrelated query parameter in place. Passing `null` removes the Canvas
 * parameter without disturbing the rest of the query string.
 */
export function applyCanvasNavigationParameter(
  search: CanvasSearchParams,
  document: string | null,
  options: CanvasNavigationParameterOptions = {},
): URLSearchParams {
  const parameterName = options.parameterName ?? canvasNavigationParameterName;
  const applied = new URLSearchParams(
    search instanceof URLSearchParams
      ? search
      : Object.entries(search).flatMap(([key, value]) =>
          value === undefined
            ? []
            : typeof value === "string"
              ? [[key, value] as [string, string]]
              : value.map((entry) => [key, entry] as [string, string]),
        ),
  );
  applied.delete(parameterName);
  if (document !== null) {
    applied.set(parameterName, encodeNavigationParameter(document));
  }
  return applied;
}
