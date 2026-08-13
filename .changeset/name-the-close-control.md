---
"@squaredlemons/canvas-panels": minor
---

Name the controls in a Panel's chrome: `data-canvas-panel-close` and
`data-canvas-action`.

A Panel's header carries the two controls an application is most likely to want
as icons, and neither had anything to select it by. Reaching the close button
meant matching its position in the header or the English word inside it;
telling one Canvas Action from another meant matching its label, even though the
application had already given each Action a stable `id` that the Canvas spent
only as a React key. Both break the moment the package rearranges anything or
the product is translated.

Both attributes join the documented table alongside `data-canvas-panel-header`
and `data-canvas-panel-separator`. `data-canvas-action` carries the Action's own
`id`; `data-canvas-panel-close` is present on a closable Panel's close button.

Nothing else changes. Each control is still a `<button>` whose visible text is
its label, and its accessible name is still the `aria-label` — which is what
makes replacing the visible word with an icon safe, because a screen reader
hears exactly what it heard before.
