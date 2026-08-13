---
"@squaredlemons/canvas-panels": minor
---

Name the Panel's close control: `data-canvas-panel-close`.

A Panel's chrome carries one control most applications want to restyle, and it
was the only part of that chrome with nothing to select it by — reaching it
meant matching on the button's position in the header or on the English word
inside it, both of which break the moment the package rearranges anything.

The attribute joins the documented table alongside `data-canvas-panel-header`
and `data-canvas-panel-separator`. Nothing else changes: the control is still a
`<button>` reading `Close`, and its accessible name is still the `aria-label`
(`Close <title>`), which is what makes replacing the visible word with an icon
safe — a screen reader hears exactly what it heard before.
