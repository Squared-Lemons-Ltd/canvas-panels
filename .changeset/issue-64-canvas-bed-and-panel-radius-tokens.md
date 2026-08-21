---
"@squaredlemons/canvas-panels": minor
---

**The Canvas bed and a Panel's corners each answer to a token of their own.**
`--canvas-surface` painted the bed and every Panel from one value, so "Panels as
cards on a distinct ground" was inexpressible at any setting of it: whatever the
value, the gutter `--canvas-panel-gap` opens was the same colour as the things it
separates, and a gap nobody can see is not a gutter. A Panel had no radius token
either — `--canvas-radius` reaches the Guarded Transition dialog and an Overlay
Workspace, not `[data-canvas-panel]` — so a card treatment meant reaching past
the documented seam and writing rules against the package's own attributes,
which is an override fighting whatever the package paints next.

Two additions:

- `--canvas-surface-bed` paints the Canvas bed. It has no default of its own: it
  derives from `--canvas-surface` on the bed element, the way the action colours
  derive from `--canvas-text-muted` on the action, so an application that
  recolours the surface still carries the bed with it and one that names a bed
  takes it out of the arrangement.
- `--canvas-panel-radius` rounds a Panel, and defaults to `0`.

Together with `--canvas-panel-gap` they are the whole recipe, and the README's
"Theming" section states it:

```css
.app-canvas {
  --canvas-surface-bed: color-mix(in srgb, CanvasText 6%, Canvas);
  --canvas-panel-gap: 0.75rem;
  --canvas-panel-radius: 0.75rem;
}
```

**Nothing changes for a consumer who sets neither.** Both defaults are the Canvas
the package already drew — one surface behind the Panels and square corners — so
a Canvas that names neither token renders exactly as it did in 0.3.0. A Panel
keeps its `border-right`, and the package gives it no `overflow` to clip with:
the resize handle deliberately straddles that edge, and clipping the Panel would
cut the outer half of its pointer target off. What a rounded Panel needs clipped
is what scrolls inside it, so the Panel body — already a scroll container — takes
the two radii that meet the Panel's bottom edge, which is inert at `0`.

**Additions to the Public Contract**: the `--canvas-surface-bed` and
`--canvas-panel-radius` custom properties. Nothing is removed, and no existing
override changes meaning. An application that had reached onto
`[data-canvas-application]` or `[data-canvas-panel]` to paint a bed or round a
Panel can move those rules onto the tokens.

Closes #64.
