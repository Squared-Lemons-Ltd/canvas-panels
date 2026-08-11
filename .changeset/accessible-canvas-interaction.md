---
"@squaredlemons/canvas-panels": minor
---

Complete the package-owned interaction grammar for keyboard movement, announcements, motion, and Panel resizing.

- F6 and Shift+F6 cycle the visible Panel regions. It is the only key the Canvas claims: Tab order is left as the DOM defines it, and no arrow or letter shortcut is registered globally.
- One polite live region announces meaningful structural changes — opening, closing, Branch Replacement, and presentation changes — and stays silent for activation, focus, and sizing. Sentences come from replaceable templates (`canvasAnnouncementTemplates`) so they can be localized. Dialog errors keep their assertive `role="alert"`.
- Panel separators are real ARIA separators, resizable by pointer and by Arrow, Shift+Arrow, Home, End, and Enter through one sizing engine (`resizePanel`), announcing only once a resize settles.
- A reduced-motion preference can no longer be overridden by application CSS, and forced-colours modes get explicit Panel borders now that shadows are dropped.

New exports from `@squaredlemons/canvas-panels/ui`: `canvasAnnouncementTemplates`, `canvasPanelSizingBounds`, `cyclePanelRegion`, `describeStructuralChange`, `resizePanel`, `sizingCommandForKey`. `Canvas.Workspace` accepts `announcements` and `sizing`.
