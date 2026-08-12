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
| `components/pipeline/canvas-mount.tsx` | **The placeholder the Canvas replaces** |
| `components/ui/` | shadcn/ui components (New York style, Radix primitives) |

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

**This belongs in the package's own README.** A consumer cannot discover the
layer name or the required order from the package's documentation today; both
are only visible by reading `dist/styles.css`.

### Theming the Canvas

The package's `--canvas-*` tokens are the supported way to restyle the Canvas —
but they must be redeclared **on the Workspace element itself**, not on an
ancestor. The package declares its defaults in a rule that matches
`[data-canvas-workspace]`, and a value declared on an element always beats a
value inherited from its parent, whatever the layers say. Measured: an inline
`--canvas-radius: 99rem` on the Workspace's parent has no effect at all.

So the override targets the element, and lives in the `components` layer, which
the order above puts above `canvas-panels`:

```css
@layer components {
  [data-canvas-workspace] {
    --canvas-surface: var(--card);
    --canvas-border: var(--border);
    /* … */
  }
}
```

The package currently documents the opposite — `packages/canvas-panels/README.md`
("Override them on any ancestor of the Workspace") and the comment at the top of
`packages/canvas-panels/src/styles.css`. Both are wrong and worth correcting;
this app does not touch the package, so the correction is reported rather than
made.

## Where the Canvas goes

`components/pipeline/canvas-mount.tsx` is a clearly marked placeholder rendered
by `app/page.tsx`. Replace its contents with the Bound Canvas Module's provider
and Canvas Workspace, keep a labelled region around them, and flip
`data-meridian-canvas="pending"` to `"mounted"`.

The theming block in `app/globals.css` already maps `--canvas-*` onto this
app's tokens, so a Workspace mounted there picks up the Meridian palette in both
light and dark with no further work.
