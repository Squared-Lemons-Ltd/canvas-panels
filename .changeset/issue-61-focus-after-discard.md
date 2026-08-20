---
"@squaredlemons/canvas-panels": patch
---

Put focus back inside the Workspace when a Guarded Transition resolves, instead
of on the document body.

In an Overlay Workspace the sequence was: make a Panel dirty, press Escape, and
answer the Save / Discard / Stay dialog with **Discard**. The transition
committed, focus landed on `<body>` — outside the layer — and because the
overlay's Escape is a handler on the layer, the very next Escape reached
nothing and the overlay would not dismiss. Clicking inside the overlay first, or
using the Panel's own ✕, worked; the keyboard alone did not.

The Workspace returns focus to the control that initiated the transition, and it
was deciding whether that control was still usable by asking whether it was
connected to the document. `document.body` is connected, and it is what
`document.activeElement` is whenever the control that started the navigation
never took DOM focus — a row that is not focusable, a browser that does not focus
a button when it is clicked, a keyboard shortcut. So the Workspace "returned"
focus to the body and never reached the retained Active Panel's heading behind
it. The same held for a control that survived into a Panel the presentation had
just hidden, where `focus()` is refused and reports nothing.

A resolved transition now leaves focus inside the Workspace whichever way it
resolved: on the initiating control while that control is still somewhere focus
can go, and on the retained Active Panel's own heading otherwise. Save, Discard,
and Stay all keep returning focus where they already did when the control they
came from survives. The primary Canvas Workspace had the same defect — it is the
same focus-return path — and is fixed by the same change.
