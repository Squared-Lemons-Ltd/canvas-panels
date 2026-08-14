/**
 * Canvas skins.
 *
 * A **skin** is not the colour theme. Light and dark are a property of the
 * application — the sidebar, the top bar and the page all follow it. A skin is
 * a property of the *Canvas*: how the Panels are dressed, and nothing else.
 * Every skin works in both light and dark, and switching one leaves the
 * application around the Canvas exactly as it was, which is the whole point.
 * A Canvas Workspace can be restyled to the house style of the product it is
 * dropped into without the product being restyled around it.
 *
 * All five are the same package, the same DOM, the same Panel Engine. Every
 * difference between them is a custom property: the `--canvas-*` tokens the
 * package publishes, plus a set this application publishes for its own Panel
 * *content* in exactly the same spirit. Nothing here is a fork, an option
 * passed to `createCanvasModule`, or a second set of renderers.
 *
 * Structure is a separate axis and belongs to the page. The Pipeline is a trail
 * — spines, a board that grows, a path drawn above it. The account book is a
 * column browser — a table that stays put, one preview slot, columns that
 * accumulate. Skins do not change either of those, and pages do not change the
 * skin; they are chosen independently and every combination is meant to work.
 */

export type SkinId =
  | "meridian"
  | "compact"
  | "float"
  | "ledger"
  | "brutalist"
  | "glass"
  | "paper"
  | "terminal";

export type Skin = Readonly<{
  id: SkinId;
  label: string;
  /**
   * One line on what this skin is, shown in the menu.
   *
   * Each one leads with the *geometry* — gutter, radius, shadow, density —
   * because that is what a reader notices first and what most of these
   * properties actually control. A skin is far more than a palette.
   */
  note: string;
}>;

export const skins: readonly Skin[] = Object.freeze([
  Object.freeze({
    id: "meridian",
    label: "Meridian",
    note: "The product's own. 8px gutter, soft radius, flat.",
  }),
  Object.freeze({
    id: "compact",
    label: "Compact",
    note: "Dense. No gutter, no radius, half the padding, smaller type.",
  }),
  Object.freeze({
    id: "float",
    label: "Float",
    note: "Airy. 24px gutters, 20px radii, Panels lifted off the bed.",
  }),
  Object.freeze({
    id: "ledger",
    label: "Ledger",
    note: "Flush and ruled. Hairlines, small caps, figures in mono.",
  }),
  Object.freeze({
    id: "brutalist",
    label: "Brutalist",
    note: "2px rules and a hard 6px offset shadow. Nothing is soft.",
  }),
  Object.freeze({
    id: "glass",
    label: "Glass",
    note: "Translucent over a gradient bed, blurred and lit.",
  }),
  Object.freeze({
    id: "paper",
    label: "Paper",
    note: "Editorial. Serif, warm stock, generous measure, no fills.",
  }),
  Object.freeze({
    id: "terminal",
    label: "Terminal",
    note: "Monospace, hard 1px rules, inverted header rails.",
  }),
]);

/** The choice a reader can make: a skin, or leave it to the section. */
export type SkinChoice = SkinId | "auto";

export const skinStorageKey = "meridian-canvas-skin";

export const defaultSkin: SkinId = "meridian";

/**
 * The skin a section wears when nobody has chosen one.
 *
 * Two surfaces built out of one package should not have to look alike to prove
 * they are different, and they should not have to look different to prove they
 * are the same package. Giving each section a skin of its own by default says
 * the first thing on arrival; the switcher says the second on demand.
 */
export const routeSkins: readonly (readonly [string, SkinId])[] = Object.freeze(
  [
    Object.freeze(["/accounts", "ledger"] as const),
    Object.freeze(["/contacts", "float"] as const),
    Object.freeze(["/territories", "glass"] as const),
    Object.freeze(["/reports", "paper"] as const),
  ],
);

export function skinForRoute(pathname: string): SkinId {
  const matched = routeSkins.find(
    ([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  return matched?.[1] ?? defaultSkin;
}

export function isSkinChoice(value: string): value is SkinChoice {
  return value === "auto" || skins.some(({ id }) => id === value);
}

/**
 * The skin applied before the first paint.
 *
 * It has to run as a blocking inline script, because a skin changes surfaces,
 * radii and type — resolving it in an effect would show every reader the wrong
 * Canvas for a frame. The route table is serialised from the list above rather
 * than written out again, so the script and the React code can never disagree
 * about which section wears what.
 */
export function skinBootstrapScript(): string {
  return [
    "try{",
    `var r=${JSON.stringify(routeSkins.map(([prefix, skin]) => [prefix, skin]))};`,
    `var c=localStorage.getItem(${JSON.stringify(skinStorageKey)});`,
    "var p=location.pathname,s=null;",
    "for(var i=0;i<r.length;i++){if(p===r[i][0]||p.indexOf(r[i][0]+'/')===0){s=r[i][1];break}}",
    `document.documentElement.setAttribute('data-canvas-skin',c||s||${JSON.stringify(defaultSkin)});`,
    "}catch(e){}",
  ].join("");
}
