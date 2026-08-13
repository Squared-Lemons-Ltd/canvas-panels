---
"@squaredlemons/canvas-panels": minor
---

Give the deepest visible Panel a Panel Separator of its own.

A Separator sizes the Panel it belongs to — its label is `Resize <title>` and
its `aria-valuenow` is that Panel's width — not the gap after it. The deepest
visible Panel was nevertheless refused one, on the reasoning that it had
"nothing to its right to resize against". It has a width worth setting like any
other Panel; the Canvas simply reaches further, or less far, to its right.

The effect was that the Panel a reader spends most of their time in was the only
one they could not size, by pointer or by keyboard.

A presentation showing a single Panel still offers nothing to resize. That Panel
is the Canvas, and dragging its edge would size the surface rather than divide
anything on it.

**Two consequences worth knowing.** Every visible Panel now carries a Separator
when two or more are shown, so a Workspace has one more tab stop than before and
it sits after the deepest Panel's content — a focus trap or a tab-order
assertion that assumed the last Panel ended the Workspace will need to look
again. And an application that gives a Panel `flex-grow` will find a dragged
width swallowed: the package writes the drag as an inline `flex-basis`, which a
Panel still told to grow immediately absorbs, so the Separator moves and the
Panel does not. Stand the grow down for a Panel the reader has sized.
