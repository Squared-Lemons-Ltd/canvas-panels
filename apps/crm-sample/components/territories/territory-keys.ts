/**
 * The Resource Key space this section navigates, and the whole reason it
 * exists.
 *
 * A Resource Key is opaque to Canvas Panels: it compares keys segment by
 * segment and never parses one, resolves what it names, fetches it, caches it,
 * or decides who may see it. What the *application* puts in those segments is
 * therefore the only thing that decides what cascades to what — and nesting the
 * segments is what makes a change at one level reach everything beneath it.
 *
 *     territories/{owner}
 *     territories/{owner}/accounts/{company}
 *     territories/{owner}/accounts/{company}/deals/{deal}
 *
 * Published `nested`, an invalidation on a territory reaches every subscription
 * *strictly beneath* that key: every account in it and every deal on those
 * accounts. Published on an account, it reaches that account's deals and stops.
 *
 * Propagation runs downward only, and that is a deliberate asymmetry rather
 * than a missing feature. Whether a parent's change means its children changed
 * is a judgement only the application can make, so the publisher makes it with
 * `nested`. A child's change never implies anything about its parent, so no
 * flag can make it: a deal being renamed does not make its territory stale, and
 * an exchange that guessed otherwise would refresh half the screen every time
 * anybody typed.
 */

export function territoryKey(ownerId: string): string {
  return `territories/${ownerId}`;
}

export function accountKey(ownerId: string, companyId: string): string {
  return `${territoryKey(ownerId)}/accounts/${companyId}`;
}

export function dealKey(
  ownerId: string,
  companyId: string,
  dealId: string,
): string {
  return `${accountKey(ownerId, companyId)}/deals/${dealId}`;
}

/**
 * The three depths, as the wildcard patterns something listening to everything
 * needs.
 *
 * A pattern's `*` stands for exactly one segment, so it never matches across
 * depths — `territories/*` matches a territory and neither the collection above
 * it nor an account below it. A listener that wants the whole space has to name
 * every depth in it, which is the same rule that stops a Panel hearing things
 * it did not ask for.
 */
export const everyResourceKey: readonly string[] = Object.freeze([
  "territories/*",
  "territories/*/accounts/*",
  "territories/*/accounts/*/deals/*",
]);

/** What a key names, for a strip that reports invalidations in English. */
export function describeKey(key: string): string {
  const segments = key.split("/");
  if (segments.length === 2) return "a territory";
  if (segments.length === 4) return "an account";
  if (segments.length === 6) return "a deal";
  return "something";
}

/** How many depths sit strictly beneath a key. */
export function depthsBeneath(key: string): number {
  const segments = key.split("/").length;
  if (segments === 2) return 2;
  if (segments === 4) return 1;
  return 0;
}
