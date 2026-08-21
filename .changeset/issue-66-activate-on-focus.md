---
"@squaredlemons/canvas-panels": minor
---

Let a Canvas Workspace activate the Panel someone focuses, and say plainly that
focus otherwise does not.

Focus and Activation have always been two things here. Clicking or tabbing into
a retained Panel records it as the DOM-Focused Panel and stops: it does not
become the Active Panel, so it keeps its retained width and styling, and every
`useNavigation()`, `usePanel()`, or `usePresentation()` call that defaults to
"the Active Panel" goes on resolving somewhere else. That split is deliberate,
and nothing in the README admitted to it — the package maintained a focus signal
that looked exactly like the input to click-to-select, and a consumer converting
a master–detail admin found out by debugging Panels that would not respond to
clicks. The README now states the rule under "Navigation", whether or not a
Canvas opts out of it.

`Canvas.Workspace` takes `activateOnFocus`. It defaults to `false`, so a Canvas
that does not ask behaves exactly as before; opting in is the addition, and
changing what an existing Canvas does would not have been. With it on, focus
arriving inside a retained Panel — by pointer, by Tab, or by F6 — makes that
Panel the Active Panel.

Only focus that arrives on its own counts. Focus the Canvas places itself is a
repair rather than an arrival and activates nothing: returning focus to the
control that opened a Guarded Transition, which usually sits in a Panel that is
no longer the active one, must not undo the move it has just made, and rescuing
focus out of a Panel the presentation has just hidden must not move the Active
Panel, which a Declared Breakpoint never does. Focus reaching a Panel behind an
open Guarded Transition dialog, where the Panels are inert, activates nothing
either. Activation stays silent in the live region however it was caused.

**Activation caused by focus already inside the Panel never moves that focus.**
Activating a Panel ordinarily hands focus to whatever it registered as
`initialFocus`. This one activation claims nothing, because the caret is already
in the field the user has just clicked into, and taking it anywhere else would
be the option's own accessibility defect.
