# Meridian — Canvas Panels CRM sample

A fictional B2B CRM, built as a visual demonstration of Canvas Panels in a real
Next.js App Router application. No backend, no database, no auth: every figure
on screen is invented.

```bash
pnpm --filter @canvas-panels/crm-sample dev     # http://localhost:3000
pnpm --filter @canvas-panels/crm-sample build
```

All five sections are built, and they are built to be unalike. **Pipeline** is a
trail — one path through the data, the Panels behind the reader folded into
spines. **Accounts** is a column browser — a table that stays put and one
preview slot records take turns in. **Contacts** is a Canvas *inside a Panel* of
another one. **Territories** is a cascade — change something at the top and
every Panel beneath it refreshes in place. **Reports** treats the whole stack as
the unit of navigation.

They share a package, a stylesheet, a dataset and an app shell. Everything that
looks or behaves differently between them is a policy on a Panel definition, an
Origin chosen at the call site, an Engine command, a Resource Key, or a
`--canvas-*` token — which is the point of having five.

## What is here

| Path | What it is |
| --- | --- |
| `app/layout.tsx` | Root layout: theme provider, tooltip provider, skip link, app shell |
| `app/globals.css` | Cascade layer order, theme tokens, the skin contract, per-section structure |
| `app/page.tsx` | Pipeline — the trail |
| `app/accounts/page.tsx` | Accounts — the column browser |
| `app/contacts/page.tsx` | Contacts — a Canvas inside a Panel |
| `app/territories/page.tsx` | Territories — updates that cascade downward |
| `app/reports/page.tsx` | Reports — the whole stack as the unit of navigation |
| `components/app-shell/` | Sidebar, top bar, mobile navigation, theme toggle, user menu |
| `components/canvas-skin/` | **The eight Canvas skins** and the switcher — see below |
| `components/pipeline/` | **The pipeline Canvas** — see below |
| `components/accounts/` | **The account book Canvas** — see below |
| `components/directory/` | **The contact directory, and the Canvas it nests** — see below |
| `components/territories/` | **The cascading Canvas** — see below |
| `components/reports/` | **The reading room Canvas** — see below |
| `components/ui/` | shadcn/ui components (New York style, Radix primitives) |
| `src/domain/` | The fixed dataset and its selectors, framework-free |

Installed shadcn components: `avatar`, `badge`, `button`, `card`, `checkbox`,
`dialog`, `dropdown-menu`, `input`, `label`, `scroll-area`, `select`,
`separator`, `sheet`, `skeleton`, `sonner`, `table`, `tabs`, `textarea`,
`toggle`, `toggle-group`, `tooltip`.

Six carry a one-line deviation from the registry output, each marked with a
comment. `dropdown-menu.tsx` and `sonner.tsx` forward an optional prop in a way
this repository's `exactOptionalPropertyTypes: true` accepts; `checkbox.tsx`,
`select.tsx`, `toggle.tsx` and `toggle-group.tsx` narrow a `React` or
`class-variance-authority` import to `import type`, which is what this
repository's `useImportType` lint asks for.

Nothing in a Panel is hand-rolled where the registry has a component for it.
The account book's scope filter is a `ToggleGroup`, its two orderings are
`Select`s, its row selection is `Checkbox`, and the account's view switcher is
Radix `Tabs` — all of which started as bespoke `<button>`s, a native `<select>`
and a hand-written `role="tablist"`, and all of which were missing the roving
focus, arrow-key movement and `aria-*` wiring that Radix supplies. A tablist a
keyboard cannot move through is worse than no tablist, because it has told a
screen reader to expect one.

Two things a Panel body cannot use shadcn for, and one trap:

- **The Panel header's controls are the package's**, not this application's.
  Close and every Canvas Action are rendered by the Workspace, so there is no
  `Button` to reach for. They are styled instead through the `--canvas-action-*`
  family — pointed at the values shadcn's ghost icon button uses, which is what
  stops them reading as boxed mini-buttons. `flex: 0 0 auto` is load-bearing
  there: they are flex items beside a title that has already ellipsised, and
  without it they were measured squashed to 16px against the 28px they ask for,
  under the 24px WCAG 2.5.8 wants of a pointer target.
- **`useHeader({ visualTitle })` does not replace the heading.** The package
  renders both — the `h2` for the accessible name and an `aria-hidden` span for
  whatever the application wants seen — so a visual title repeating the record's
  name prints it twice, which is exactly what this app did until it was spotted
  on screen. The heading keeps the name, because the heading is also the element
  the Canvas hands focus to on activation and a keyboard reader who lands on a
  visually-hidden target has been told nothing. The visual title carries only
  the ornament: here, the account's health mark, moved ahead of the heading with
  `order: -1`.
- **A controlled `Select` needs its label written out.** Radix reads a trigger's
  text from the selected *item*, and items live in a portal that is unmounted
  until the menu is first opened — so a `Select` that arrives with a value
  already chosen renders an empty trigger until somebody opens it. Passing
  children to `SelectValue` settles it on the first paint.

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

## Canvas skins

The palette icon in the top bar swaps the Canvas between eight looks. It is a
separate control from light/dark on purpose, because it is a separate idea.

| Skin | Gutter | Radius | Shadow | And |
| --- | --- | --- | --- | --- |
| **Meridian** | 8px | 10px | none | The product's own look |
| **Compact** | 0 | 0 | none | Half the padding, tighter type, 17rem columns |
| **Float** | 24px | 20px | 14px soft | Roomy padding, larger type, cards inset 20px from the frame and lifted off a tinted bed |
| **Ledger** | 0 | 0 | none | Hairline rules, small caps, figures in mono |
| **Brutalist** | 16px | 0 | 6px hard offset | 2px rules, solid-ink header rails, a bed nobody would call tasteful |
| **Glass** | 12px | 16px | 18px blur | Translucent Panels over a gradient bed |
| **Paper** | 0 | 0 | none | Serif, warm stock, generous measure, no fills |
| **Terminal** | 0 | 0 | none | Monospace, 1px rules, inverted header rails |

All eight are the same package, the same DOM and the same Panel Engine. There is
no second set of renderers, no option passed to `createCanvasModule`, and no
fork. Every difference between them is a custom property.

Most of what separates them is **geometry rather than colour** — gutter, radius,
shadow, padding, header height, column width, type scale. Meridian, Compact and
Float share a palette exactly and are still unmistakable side by side, which is
the more interesting half of the claim: a Canvas can be made to feel dense,
airy, or physical without being recoloured at all.

**A skin is not the colour theme.** Light and dark belong to the application:
switch one and the sidebar, the top bar and the page all follow. A skin belongs
to the Canvas and *stops at its edge* — the product around it is untouched
whichever is on, which is the thing worth demonstrating. A Canvas Workspace can
be dressed to the house style of whatever it is dropped into without the house
being redecorated. Every skin works in both light and dark, through the same
`light-dark()` the palette uses.

**A skin is not the structure either.** Which Panel grows, what collapses to a
spine, where the Canvas snaps, what the chrome around it says: those belong to
the page, and no skin changes them. The Pipeline is a trail in all eight; the
account book is a column browser in all eight. The two axes are chosen
independently and every combination is meant to work.

### How it is built

One flat set of `--skin-*` custom properties on `:root`, overridden per skin by
`:root[data-meridian-skin="…"]`. Two things read them, and they are the two halves
of a themed Canvas:

1. **The package's chrome**, through the `--canvas-*` tokens it publishes —
   surface, border, radius, gap, widths, header metrics, action colours. One
   mapping rule in the `components` layer, no conditionals; every skin reaches
   the Canvas through it.
2. **The Panel content**, through `data-meridian-*` hooks that this
   application's presentational parts publish — `hero`, `eyebrow`, `title`,
   `section`, `section-title`, `facts`, `tile`, `tag`. Both surfaces spell them
   the same way, which is what lets one skin block dress the Pipeline and the
   account book at once. It is the application doing for its own parts exactly
   what the package does for its chrome.

Three of them also hold their Panels off the edges of the Canvas — Float by
20px, Glass and Brutalist by 12px. That is not decoration: a card that runs into
the frame is not lying on anything, and a drop shadow with no room under it is
clipped to a dark line. The scroll container's `scroll-padding-inline` is
matched to the inset, so a sideways scroll cannot end with the last Panel jammed
against the edge the inset exists to keep it off.

A Panel's box is three tokens rather than one, because skins want three
different things from it: `--skin-panel-border` is the whole outline a detached
Panel needs, `--skin-panel-edge` is the single trailing rule that divides two
flush Panels, and `--skin-panel-last-edge` is what the Panel at the end of the
row keeps — nothing, for a flush skin, since a rule with nothing beyond it to
divide reads as an edge drawn in the middle of the Canvas.

The **type scale** is re-pointed too. Tailwind's size utilities read `--text-*`,
so a skin that overrides those inside a Canvas rescales every `text-sm` and
`text-xs` a renderer already wrote, and the line-height companions are ratios
that follow on their own. The application's own strips — trail, event channel,
inspector — deliberately reset it: they take the skin's colours and typeface but
not its scale, because they are laid out in fixed measures and a roomy skin
otherwise truncated every trail station to six letters.

Plus one trick worth knowing: inside a Canvas mount, the skin **re-points the
application's own tokens** — `--card`, `--border`, `--primary`, `--muted` and
the rest. Nineteen declarations, and every Tailwind utility a renderer already
uses (`bg-card`, `text-muted-foreground`, `bg-primary/18`) becomes skin-aware
without being rewritten, including inside components this app did not author.
`--input` is deliberately excluded from that sweep and given its own per-skin
value: it is the visible boundary of a form control, which WCAG 1.4.11 holds to
3:1, and a skin may restyle it but not quieten it to a hairline.

Because Meridian wants to say "the product's own card colour", and that very
token is what gets re-pointed inside a Canvas, the palette is aliased once into
`--src-*` names no skin ever touches. A custom property's `var()` is substituted
where it is *declared*, so each alias computes to the `:root` value once and is
inherited as that value however the token above it is later re-pointed — which
is what stops the two chasing each other.

### Two layers, and why

Content theming lives in a `skin` layer declared **after** `utilities`:

```css
@layer theme, base, canvas-panels, components, utilities, skin;
```

Panel content is built out of Tailwind utilities, and a utility outranks every
earlier layer — a skin that wanted a card to lose its radius would otherwise be
arguing with `rounded-lg` and losing. Everything that only has to beat the
package stays in `components` with the rest of the Canvas theming.

### Applied before paint

The skin is written onto `<html>` by a blocking inline script in the document
head, the same way `next-themes` writes `data-theme`. A skin changes surfaces,
radii and type, so resolving it in an effect would show every reader the wrong
Canvas for a frame. The script reads the stored choice, falls back to the
section's own default, and serialises its route table from the same list the
React code uses so the two cannot disagree.

The attribute goes on `<html>` rather than on either Canvas mount for two
reasons: the command palette is an Overlay Workspace portalled to the document
body and would never be reached by an attribute on a mount, and the properties
are declared on `:root`, so every Canvas on the page — primary, nested or
overlaid — inherits them without being told.

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
say. That mattered when this app was written: the package declared its defaults
in a rule matching `[data-canvas-workspace]` while documenting the opposite, and
an inline `--canvas-radius: 99rem` on the Workspace's parent was measured to
have no effect at all. Reported and fixed — the defaults now live on `:root`, so
an ancestor override works as documented. This app keeps declaring on the
element, which is correct either way.

### Where the tokens ran out — fixed

Two surfaces the Canvas painted in the CSS system colours `Canvas` and
`CanvasText` rather than in its own tokens, with no `--canvas-*` to redirect
them: the overlay layer's Workspace, and the Guarded Transition dialog. They
followed `color-scheme`, so they stayed readable in both themes — they were
simply not the product's colours, which was obvious the moment a dialog opened
over the Meridian graphite. The dialog's Save / Discard / Stay buttons carried
no styling at all, so under Tailwind's preflight they arrived as bare text with
no hit target.

Reported, and both fixed in the package. Both surfaces now answer to
`--canvas-surface-raised`, so `app/globals.css` sets a colour through the token
seam — `--canvas-surface-raised: var(--popover)` on the Workspace, re-pointed to
`var(--card)` on the overlay — and reaches the attributes only for the edge and
the inner layout. The dialog's three decisions ship a real control with a real
hit target, and each carries `data-canvas-transition-action="save" | "discard" |
"stay"`, so the skin names the primary rather than counting to it.

Three further reaches past the seam remain, and all three are now documented
hooks in the contract table at `packages/canvas-panels/README.md` rather than
implementation detail:

- `[data-canvas-visual-title]` — the span a registered visual title renders
  into. The skin no longer has to place it: the package renders it inside the
  `h2`, in the heading's visible place, with the Panel's own title hidden beside
  it for the reader. The `order: -1` that used to correct this is gone.
- `[data-canvas-dirty-label]` — restyled from muted body text into a tinted
  chip, so a Panel holding unapplied work still reads as such on a rail of
  small caps.
- `[data-canvas-panel-header] h2` — given the skin's own face, size, tracking
  and case. The package sets `font: inherit` here, so without this a Panel's
  title is the only text in the Canvas the skin does not reach.

The last two would still be better as tokens — `--canvas-dirty-label-*` and a
title type scale — which is the shape of the request rather than a complaint
about the workaround.

### The bed and the Panel corners were not tokens either — fixed

Every skin in the table above wants two things the token seam could not say. A
recessed bed is the first: `--canvas-surface` painted the Canvas bed *and* every
Panel from one value, so a gutter set with `--canvas-panel-gap` came out the
colour of the Panels beside it and separated nothing — Float's inset cards and
Glass's tinted ground are the whole point of those skins, and neither could be
asked for. A Panel's corners are the second: `--canvas-radius` reaches the
dialog and the overlay Workspace, not `[data-canvas-panel]`.

So this app painted the bed with a `background` written onto
`[data-canvas-application]`, and rounded the Panels with a `border-radius`
written onto `[data-canvas-panel]` — two overrides of the package's own painting
rather than two settings of it, each fighting whatever the package paints next.

Reported as “A Canvas bed and its Panels share one surface token, so
cards-on-a-ground is inexpressible” (#64), and fixed in the package:
`--canvas-surface-bed` paints the bed and `--canvas-panel-radius` rounds a
Panel. Both are mapped in the one seam rule now, beside every other skin value,
and both attribute rules are gone. The nested Workspace squares its Panels
through the same token rather than by reaching for the attribute, which is what
its own comment always said it wanted.

One thing does change, and it is the package doing what it now knows to: a
rounded Panel's body clips its scrolled content at the two corners it shares
with the Panel, which a radius written onto the attribute never got. Under
Meridian, Float, and Glass a table scrolled to the foot of a Panel is now cut to
the card's corner instead of painting over it.

### `data-canvas-panel-id` was not stable across a server render — fixed

Panel Instance IDs used to come from a counter that started afresh in each
process, so the id the server rendered into `data-canvas-panel-id` was never
the id the client's engine minted. React reported the mismatch and left the
server's value in the DOM, and every part of the package that finds a Panel by
that attribute — F6 region cycling, the resize separator, scroll restoration —
then looked up an element that did not exist. Measured here: on a hydrated page
F6 stopped cycling and landed on the first Panel every time, and a Panel's
separator reported `aria-valuenow="240"` for a Panel that was 542px wide.

Found by this app, reported as “Panel Instance IDs are not hydration-stable,
breaking every SSR consumer” (#52), and fixed in the package: ids are now
numbered within their own Panel Engine, so both renders agree. They are unique
within a Workspace rather than within the document, which matters here because
the command palette mounts a second Workspace. This app's own scroll-into-view
therefore still finds Panels by **position in the stack**, which needs no such
caveat; see `useActivePanelInView` in `canvas-mount.tsx`.

### A Panel body did not contain what it holds — fixed

Found by watching a short window: scrolling the account book carried the Panel
*headers* off the top of the frame and left a band of bare bed under the Panels.

The package makes each Panel `position: relative` and gives its body
`overflow-y: auto`. An absolutely positioned descendant of that body is
therefore laid out against the **Panel**, not the body — so the body's overflow
never clips it, and it sits at its static position somewhere down inside the
scrolled content, adding its height to the Panel's scroll box.

Which sounds theoretical until you notice that Tailwind's `sr-only` is
`position: absolute`. Every “Select *account*” and “Open the record” label in
the book's fourteen-row table is one, and together they gave the Canvas 323px of
vertical overflow — measured. Then the second half: the package sets
`overflow-x: auto` on the Canvas application, and CSS computes the other axis to
`auto` alongside it, so the whole Canvas became vertically scrollable and the
headers went with it.

Two declarations held it while it was open, in `app/globals.css`:

```css
[data-canvas-panel-body] { position: relative; }
[data-canvas-application] { overflow-y: hidden; }
```

The first is the fix — contained by the body, those labels are clipped by the
scroll they already sit in. The second says what the package means but cannot
express with one axis: a Canvas is a horizontal surface, and vertical scrolling
belongs to each Panel body, which keeps its header in place while it happens.

Both belonged in the package, because any consumer using a utility framework
hits the first the moment a Panel body contains a visually hidden label — which
is to say almost immediately. Both are now the package's own, and the two
declarations above have been deleted from this app.

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

## The account book

The second Canvas, at `/accounts`. It exists because one surface can only show
one set of answers, and the Pipeline gives every Panel the same ones: reuse the
record, persist it, restore it through a loader. Those are the right answers for
a trail. The book is built out of the others.

| File | What it is |
| --- | --- |
| `book-panels.ts` | The Panel Registry — book, peek, account, person, reassign — and the deep-link builder |
| `book-canvas.tsx` | The Bound Canvas Module, its five renderers, and the Context Signal they publish |
| `book-parts.tsx` | The ledger idiom: square, flush, hairline-ruled, figures in columns |
| `book-index.ts` | Filtering, ordering and summarising the book — pure, and no Canvas in sight |
| `book-store.ts` | The tab-lifetime working copy: owner reassignments and nothing else |
| `book-mount.tsx` | Engine, seeding, navigation sync under `book`, and the inspector strip |

### What it demonstrates

Five things the Pipeline shows nowhere:

- **`replace` deduplication on a constant Panel Key.** The preview slot. The key
  names the *slot*, not the record, so the next row you touch takes this column
  rather than opening beside it — the list-and-preview idiom expressed as a
  policy instead of as something the application must remember to close. It is
  transient, so a glance never reaches the address bar; opening the full record
  from it therefore opens from the *table*, because nesting the record under a
  transient Panel would drop it out of every link.
- **`allow-many`.** People. The only Panel Kind here with no semantic identity,
  so three colleagues give three columns. They are opened from the **deepest**
  Panel rather than from the account, which is what makes them line up instead
  of replacing one another — Origin is the whole difference between a column
  browser and a stack.
- **A typed `update` with a pure reducer.** The account's view tab lives in the
  descriptor, so changing it goes through the Panel Engine — validated, reduced,
  refused if it would change the Panel Key — and lands in the URL as
  `"view":"deals"`. Reload and you are back on the tab you left. `navigation:
  "replace"` keeps it out of the history stack: Back still means the previous
  column, not the previous tab.
- **A `block` Guard Outcome.** Reassigning owners is a write, and while it is in
  flight the Panel's guard blocks: closing it, clicking a row in the table, and
  Back are all *refused* rather than queued. The refusal comes back as a command
  outcome, and the application reads it and says so. Choose an owner without
  applying and the guard drops to `confirm` instead, which raises the package's
  Guarded Transition dialog — where **Save** runs the write and then commits the
  transition. Its descriptor is a *set* of ids, because a Panel Kind is a
  category of surface rather than a synonym for one row.
- **Context Signals.** Every column publishes an application-typed value saying
  what it is and which part of the package it is demonstrating. The strip under
  the Canvas reads one of them — the Active Panel's — and knows nothing about
  deals, accounts or people. No renderer knows the strip exists.

Two smaller ones: the Canvas's announcement templates are replaced so it says
*column* rather than *Panel*, and the Workspace is given its own
`PanelSizingBounds`, because how narrow a Panel may usefully get is a property
of what the application puts inside it.

### Two URL-owning Workspaces

The book claims `book`; the Pipeline claims `canvas`. A History Namespace is
named by its Navigation Parameter and the first Workspace to claim one owns it,
so naming a different one is what lets both exist in one application without
either being silently demoted to memory. `onOwnership` is wired to a toast
rather than ignored — a demo that quietly navigated in memory would be hiding
the one thing worth checking.

The Deals view links the other way, into `/?canvas=…`, so the two surfaces are
visibly the same application rather than two demos in one repository.

### No Resource Exchange, on purpose

Nothing in the book holds a draft that a colleague's change could overwrite, so
every Panel reads one store through `useSyncExternalStore` and re-renders. No
invalidation, no subscription, no per-Panel decision. The extensions are
optional and this is what it costs not to use them: nothing.

### Layout

The table is the column that takes the slack — every pixel it is given goes into
account names that were being truncated, where a record column widened past its
reading measure only puts a label further from its value. It grows into whatever
the records leave over, up to `44rem`, and hands the width back the moment the
reader drags the separator themselves.

The columns are flush: `--canvas-panel-gap: 0`, `--canvas-radius: 0`, headers as
a rail of small caps, the Active one marked by a violet rule along its top edge,
and `scroll-snap-type: x proximity` so the Canvas comes to rest on a column edge
rather than half way through one. The space past the last column is painted in
`--background` rather than the Panel surface, so it reads as canvas the next
column will open into.

**Not verified in the browser:** the narrow presentation. The automated Chrome
used here reported a fixed 2801px layout viewport whatever the window was
resized to, so the one `max-width: 63.999rem` rule — the table going full width
below the package's own breakpoint — has not been seen rendering.

## The contact directory

The third section, at `/contacts`, and the one that answers a question the other
two never raise: what happens if you put a Canvas Workspace *inside a Panel* of
another one?

| File | What it is |
| --- | --- |
| `directory-panels.ts` | The outer Panel Registry — an index and a person's file — under the `people` parameter |
| `network-panels.ts` | The **inner** Panel Registry, every Kind transient, because a nested Canvas has nowhere to persist to |
| `directory-canvas.tsx` | The outer module, and the Panel that mounts a second Workspace in its body |
| `network-canvas.tsx` | The inner module, and the React context that tells its Root Panel whose network it is |
| `directory-mount.tsx` | Engine, seeding, navigation sync, and a legend counting the Workspaces on the page |

### What it demonstrates

Open somebody and their file contains a whole second Canvas — its own Panel
Engine, its own Panel Stack, its own Active Panel, its own F6 regions. Walk it
from colleague to colleague and:

- **The address bar does not move.** The outer Workspace owns `people`; the
  inner one synchronises nothing. Where you are inside a dossier is not
  somewhere the application considers you to have been.
- **The two Engines cannot reach each other.** Each numbers its Panel Instance
  IDs from one, so the ids collide by design. It is the Panel Instance *Ref*
  that keeps them apart — a Ref from one Engine is refused by the other, where a
  bare id would have named that Engine's Panel at the same position and been
  honoured. That is the whole argument for Refs, made visible.
- **Nothing had to be told.** There is no "nested" mode, option or flag. A
  Workspace is a component; a component renders where it is put.
- **Open two dossiers and there are two inner Workspaces**, each with its own
  stack, neither aware of the other. Close a dossier and its Workspace goes with
  it.

One rule matters if a nested Workspace ever *does* want the URL: it must declare
`ownership: "memory"`. React commits effects child-first, so one left to race
would claim the History Namespace before its host and demote the host instead.
This one asks for nothing, which is the same answer with less machinery.

The Root Panel takes no input — none does — so whose network the inner Canvas
shows arrives through an ordinary React context from the Panel that hosts it. No
package support is needed for that, and none is offered: the host already knows.

Its presentational parts are the Pipeline's, reused unchanged. That is the skin
layer earning its place: two surfaces can share a vocabulary and still look
nothing alike, because what they look like is not in the components.

## The reading room

The fourth section, at `/reports`. The other three navigate a Panel at a time.
This one moves the whole stack.

| File | What it is |
| --- | --- |
| `report-panels.ts` | The Panel Registry — a shelf, a pinned summary, an analysis at descriptor version 2 — plus the saved views and a deliberately old address |
| `report-metrics.ts` | What the analyses compute, pure and framework-free. One of them throws |
| `report-canvas.tsx` | The module, its renderers, and `onRendererError` |
| `report-mount.tsx` | Engine, seeding, sync under `report`, and the handle that passes `restoreStack` down |

### What it demonstrates

Five things, none of which appears anywhere else in this application:

- **`restoreStack`.** A saved view is a set of Panel References handed to the
  Engine, which resolves every affected guard as one Guarded Transition and
  commits atomically. Panels the target stack shares with the current one keep
  their identity and are never guarded — switch between two views that both show
  Win rate and that Panel does not so much as blink. The Bound Canvas Module
  deliberately does not expose this: moving the whole stack is an Engine
  concern, so the mount passes it down.
- **`closable: false`.** The summary is the report's spine. The package renders
  no close control for it, and any command that would remove it — a close, a
  Branch Replacement, a restoration — is rejected atomically before anything
  moves. There is a button that tries anyway and reports the refusal. It is
  liveable rather than a trap because its Panel Key is constant, so every saved
  view shares it at position one and restoration never has to ask.
- **`collapse`.** Every analysis offers *Collapse to here*, which removes
  everything after it in one transition. The one navigation command the other
  three sections never call.

Opening a single analysis appends it from the **deepest** Panel rather than the
Root. Opening from the Root would replace everything after it, and everything
after it includes the pinned summary — which cannot be removed, so the command
came back `rejected: not-closable` and the row silently did nothing. Found by
clicking it. The refusal is now reported as well as avoided: a command that
quietly does nothing is the worst of both.
- **A renderer that throws.** One analysis fails on every render, on purpose.
  The failure is caught inside that Panel's body: it keeps its chrome and its
  place in the stack, the other Panels carry on, Retry remounts the renderer
  without replacing the Panel instance, and `onRendererError` hands the host
  `{ kind, panel }` and nothing else — not the error, not the stack, not the
  component.

  **Under `next dev` it also trips Next's own full-screen error overlay.** That
  is dev tooling doing its job — React reports a boundary-caught error to the
  overlay whether or not something handled it — and there is no per-error opt
  out. Dismiss it and the Panel is behind, showing the notice, with the rest of
  the Canvas working. Verified against `next build && next start`: in a
  production build only the notice appears. It is therefore reachable only by
  asking for it by name, from a row labelled *(dev overlay)*; no saved view
  includes it, so nobody meets it who did not go looking.
- **A descriptor migration.** `metric` is at version 2. Version 1 spelled the
  field `metric`; version 2 spells it `metricId`. Nothing writes the old shape
  any more, so the *Open a version 1 link* button carries an address built with
  `buildNavigationDocument` from `@squaredlemons/canvas-panels/testing` — which
  the package's own README calls the only way to exercise a migration from
  outside, since an Engine can only ever encode the current version. Opening it
  reconstructs the stack and the address in the bar silently becomes a version 2
  one, because a migrated document requests replace-history normalisation.

That button is a plain `<a>` rather than a `Link`, and the distinction is the
point: a Workspace is seeded once, when it is created, which is what makes a
deep link paint its whole stack in one pass. A client-side navigation would
change the address and leave the Engine exactly as it was. An old bookmark
arrives cold, so this one does too.

## The territory book

The fifth section, at `/territories`. Change something in one Panel and every
Panel beneath it re-reads itself in place.

| File | What it is |
| --- | --- |
| `territory-keys.ts` | The nested Resource Key space, and the only reason anything cascades |
| `territory-store.ts` | The session's working copy — deliberately *not* reactive |
| `territory-panels.ts` | The Panel Registry: a territory, an account in it, a deal on that account |
| `territory-canvas.tsx` | The renderers, each instrumented so a re-read can be watched |
| `territory-mount.tsx` | Engine, sync under `territory`, the exchange, and the wire strip |

### What it demonstrates

The Pipeline already publishes Resource Invalidations, but only ever about one
record, to Panels showing that record. This is the other half: an invalidation
published `nested`, which reaches every subscription **strictly beneath** the
key it names.

The keys are what make it work, and they are entirely the application's:

```
territories/{owner}
territories/{owner}/accounts/{company}
territories/{owner}/accounts/{company}/deals/{deal}
```

Canvas Panels compares keys segment by segment and never parses one, resolves
what it names, fetches it, caches it, or decides who may see it. Nesting the
segments is the whole mechanism.

- **Down.** Rename a territory and both the account and the deal beneath it
  re-read. Measured on screen: the account went from *Read 1×* to *2×*, the deal
  to *3×*, and both picked up the new label — through **one subscription each,
  on their own key**. Neither subscribed to the territory. A Panel names where
  it *is*; the publisher decides how far a change travels.
- **Not up.** Set a status on the account and only the deal moves. The
  territory's counter stays where it was. A child's change never implies
  anything about its parent, and no flag can make it — whether a parent's change
  means its children changed is a judgement only the application can make, so
  the publisher makes it with `nested`.
- **In place.** A re-read is the application's own function running again.
  Nothing remounts, nothing is replaced, no scroll position is lost. Each Panel
  counts its own reads and says so, which is the only reason any of this is
  visible: a refresh that lands correctly looks like nothing happening.
- **Not to the publisher.** Whoever wrote declares itself the `source` and is
  suppressed from its own announcement. The territory Panel stayed at *Read 1×*
  through its own rename.
- **Held when it would cost you something.** The deal Panel has a field you can
  leave unsaved. Type in it, then change the territory: the announcement reaches
  the Panel and *waits*, offering the choice, because an invalidation must never
  be the reason somebody loses what they typed. Take the update and it reads;
  keep the draft and it forgets the read. The Panel's ordinary Guarded
  Transition still guards the close on top of that.

The store underneath is deliberately **not** reactive. A write bumps a revision
and returns; the only thing that tells a Panel to look again is the exchange.
Keeping the two apart is what makes the cascade legible — a Panel that refreshed
did so because it was told, and one that did not was not told.

The strip under the Canvas is a reading of the exchange and nothing else: the
key, whether it was nested, and how many subscriptions it reached. Note that
`notified` counts *subscriptions* rather than Panels — the strip is one of them,
so the number is one higher than the columns you can see moving.

## Five Workspaces, five namespaces

| Section | Parameter | Structure | Default skin |
| --- | --- | --- | --- |
| Pipeline | `canvas` | A trail: spines, a board that grows, a path drawn above it | Meridian |
| Accounts | `book` | A column browser: a table that stays put, one preview slot | Ledger |
| Contacts | `people` | Master–detail, with a second Workspace inside the detail | Float |
| Territories | `territory` | A cascade: equal columns, so which one moved is the answer | Glass |
| Reports | `report` | Saved views: the whole stack as the unit of navigation | Paper |

A History Namespace is named by its Navigation Parameter and the first Workspace
to claim one owns it, so five differently-named parameters is what lets all five
sections own their own address. Every mount wires `onOwnership` to a toast
rather than ignoring it — a demo that quietly navigated in memory would be
hiding the one thing worth checking.
