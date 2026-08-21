---
"@squaredlemons/canvas-panels": patch
---

Stop the Guarded Transition dialog naming a Panel twice when only one Panel is
dirty.

The dialog's heading names the Panel — "Unsaved changes in Draft" — and every
message line was prefixed with the same title again: "Draft: This panel has
unsaved changes." With a fixture title the repetition is barely visible. With a
real one it is the whole dialog: a consumer reported a 104-character record
title filling the top two thirds of the modal, printed twice before the three
decisions, and read out twice by a screen reader, the heading being
`aria-labelledby` and the message `aria-describedby`. Nothing an application
could do reached it — the prefix and the message are one text node, so CSS
cannot drop it, `usePanelEditor({ messages })` replaces only the half after it,
and hiding the message would break `aria-describedby`.

A single-Panel dialog now shows the message alone. Several dirty Panels are
unchanged and keep the prefix, because there the heading can only count them and
each line has to say which Panel it is about.
