# Meridian — Canvas Panels CRM sample

A fictional B2B CRM, built as a visual demonstration of Canvas Panels in a real
Next.js App Router application. No backend, no database, no auth: every figure
on screen is invented.

```bash
pnpm --filter @canvas-panels/crm-sample dev     # http://localhost:3000
pnpm --filter @canvas-panels/crm-sample build
```

## What is here

| Path | What it is |
| --- | --- |
| `app/layout.tsx` | Root layout: theme provider, tooltip provider, skip link, app shell |
| `app/globals.css` | Cascade layer order, theme tokens, Canvas Panels theming |
| `app/page.tsx` | Pipeline — the only section the demo builds |
| `app/{accounts,contacts,reports}/page.tsx` | Signposts, so the navigation tells the truth |
| `components/app-shell/` | Sidebar, top bar, mobile navigation, theme toggle, user menu |
| `components/pipeline/` | **The Canvas** — see below |
| `components/ui/` | shadcn/ui components (New York style, Radix primitives) |
| `src/domain/` | The fixed dataset and its selectors, framework-free |

Installed shadcn components: `avatar`, `badge`, `button`, `card`, `dialog`,
`dropdown-menu`, `input`, `label`, `scroll-area`, `separator`, `sheet`,
`skeleton`, `sonner`, `table`, `tabs`, `textarea`, `tooltip`.

Two of them carry a one-line deviation from the registry output, marked with a
comment: `dropdown-menu.tsx` and `sonner.tsx` forward an optional prop in a way
this repository's `exactOptionalPropertyTypes: true` accepts.

## Theming

Tokens are the standard shadcn set plus `success` and `warning`, defined in
`app/globals.css`. Dark mode is preference-first: `prefers-color-scheme` decides
unless the reader picks a theme in the top bar, which writes `data-theme` onto
`<html>` (via `next-themes`) and wins.

That decision is written down once, as `color-scheme` on `:root`, and every
token reads it through `light-dark()` — so there is a single palette block, not
a light one and a dark one that can drift apart. The `dark:` variant repeats the
condition because a variant is a selector rather than a value, but it repeats
the same two branches.

`--input` is deliberately much stronger than `--border`: it is the visible
boundary of a form control, which WCAG 1.4.11 holds to 3:1 against the page
(measured 3.3:1 light, 3.5:1 dark).

## Composing Canvas Panels with Tailwind

Both stylesheets use cascade layers, and out of the box they compose **by
accident**. A consumer has to say what they want explicitly.

### The finding

`@squaredlemons/canvas-panels/styles.css` puts everything it ships inside one
`@layer canvas-panels`. Tailwind v4 puts everything it generates inside `theme`,
`base`, `components` and `utilities`. Nothing in either stylesheet states how
the two sets relate, so the relationship falls out of **source order**, because
a layer's position is fixed by where its name is first seen:

- import the package **after** `tailwindcss` → `canvas-panels` sorts last, and
  every package rule outranks every Tailwind utility. A `className="p-6"` on a
  Panel body silently loses.
- import it **before** `tailwindcss` → `canvas-panels` sorts first, below
  Tailwind's `base`, so Tailwind's preflight can reach into the Canvas.

Neither is what you want, and neither is stable: it changes if someone reorders
two adjacent import lines, and in Next.js the order is even less obvious when
one stylesheet is imported from CSS and another from a layout module.

### What this app does

Declare the order once, at the very top of the global stylesheet, before any
`@import` (a `@layer` statement is one of the few things allowed to precede
imports):

```css
@layer theme, base, canvas-panels, components, utilities;

@import "tailwindcss";
@import "@squaredlemons/canvas-panels/styles.css";
```

That places the Canvas above Tailwind's preflight and below anything the
application writes. Verified in the browser against the built stylesheet:

- with the statement, the emitted order is `properties, theme, base,
  canvas-panels, components, utilities`; without it, `canvas-panels` is emitted
  after `utilities`. (`properties` is Tailwind's own internal layer for
  `@property` fallbacks. It is not named in the statement and sorts first by
  source order — the one piece of ordering here that is still implicit, and
  harmless, because nothing in it is a visual rule.)
- with the statement, `class="text-primary"` on a `[data-canvas-workspace]`
  element wins over the package's own `color` rule.

Importing the package stylesheet from CSS rather than from `app/layout.tsx`
keeps everything the browser has to order in one file, where it can be read.

**This belongs in the package's own README.** At the time this app was written a
consumer could not discover the layer name or the required order from the
package's documentation; both were visible only by reading `dist/styles.css`.
Reported, not worked around.

### Theming the Canvas

The package's `--canvas-*` tokens are the supported way to restyle the Canvas.
This app declares them **on the Workspace element itself**, in the `components`
layer that the order above puts above `canvas-panels`:

```css
@layer components {
  [data-canvas-workspace] {
    --canvas-surface: var(--card);
    --canvas-border: var(--border);
    /* … */
  }
}
```

Declaring them on the element rather than on an ancestor is the arrangement that
holds whichever way the package places its own defaults, because a value
declared on an element beats one inherited from an ancestor whatever the layers
say. That matters, because at the time of writing the package declared its
defaults in a rule matching `[data-canvas-workspace]` while documenting the
opposite — `packages/canvas-panels/README.md` says "Override them on any
ancestor of the Workspace", and an inline `--canvas-radius: 99rem` on the
Workspace's parent was measured to have no effect at all. Reported; this app
does not touch the package.

### Where the tokens run out

Two surfaces the Canvas paints in the CSS system colours `Canvas` and
`CanvasText` rather than in its own tokens, with no `--canvas-*` to redirect
them: the overlay layer's Workspace, and the Guarded Transition dialog. They
follow `color-scheme`, so they stay readable in both themes — they are simply
not the product's colours, which is obvious the moment a dialog opens over the
Meridian graphite.

The dialog's Save / Discard / Stay buttons carry no styling at all, so under
Tailwind's preflight they arrive as bare text with no hit target.

Both are overridden in `app/globals.css` by reaching past the token seam and on
to the `[data-canvas-*]` attributes, which the package calls implementation
detail. Reported rather than papered over silently — see the comments there.

### `data-canvas-panel-id` is not stable across a server render

Panel Instance IDs come from a counter that starts afresh in each process, so
the id the server renders into `data-canvas-panel-id` is never the id the
client's engine mints. React reports the mismatch and leaves the server's value
in the DOM, and every part of the package that finds a Panel by that
attribute — F6 region cycling, the resize separator, scroll restoration — then
looks up an element that does not exist.

Measured here: on a hydrated page F6 stops cycling and lands on the first Panel
every time, and a Panel's separator reports `aria-valuenow="240"` for a Panel
that is 542px wide. Reported to the package. This app's own scroll-into-view
therefore finds Panels by **position in the stack**, which both renders agree
on; see `useActivePanelInView` in `pipeline-canvas.tsx`.

## The Canvas

| File | What it is |
| --- | --- |
| `panels.ts` | The Panel Registry — board, deal, account, contact, stage — and the deep-link builder |
| `pipeline-canvas.tsx` | The Bound Canvas Module and its five renderers |
| `pieces.tsx` | Presentational parts that know nothing about Panels |
| `session-store.ts` | The tab-lifetime working copy of the dataset |
| `canvas-mount.tsx` | Engine, seeding, navigation sync, Resource Exchange |
| `command-palette.tsx` | The Overlay Workspace, its host, and the ⌘K trigger |
| `pipeline-navigator.ts` | The application's own handle on the pipeline Workspace |

### What it demonstrates

- **A board as the Root Panel.** Four open stages as columns, each header
  carrying its stage total and weighted forecast. Closed Won and Closed Lost
  open as Panels of their own.
- **Cross-entity navigation, deep-linked.** Deal → account → that account's
  other deals → contact → back to their deals, with the URL tracking the whole
  stack. The address is the package's Navigation Parameter:
  `/?canvas=v1.<base64url-canonical-json>`, holding only record ids. A cold load
  of one rebuilds the stack server-side before the first paint; a link naming a
  record that has gone is trimmed on arrival and explained in a toast.
- **A command palette in an Overlay Workspace.** ⌘K anywhere. Its scope menu is
  registered as an Overlay Inner Layer, so Escape closes the menu, then the
  palette, then goes back to the page.
- **An editor on `Deal.notes` and the deal's next step.** Editing marks the
  Panel unsaved; closing it raises the Guarded Transition dialog.
- **A colleague's change, arriving from outside.** The board's *Team activity*
  card publishes Resource Invalidations as if a teammate had moved a deal. A
  clean Deal Panel re-reads; one with an unsaved draft holds the change and
  offers the choice; Panels showing other records are untouched.

### Layout

The board is the Panel that grows: records keep a steady reading width and the
board takes whatever is left, reflowing between one, two and four columns
through container queries. That, and the two height rules that let each Panel
body scroll instead of the document, are the only layout the app adds — see the
`components` layer in `app/globals.css`.

The theming block there maps `--canvas-*` onto this app's tokens, so the
Workspace picks up the Meridian palette in both light and dark.
