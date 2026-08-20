---
"@squaredlemons/canvas-panels": patch
---

Clamp the narrow presentation's breadcrumb trail to one scrolling line.

`[data-canvas-breadcrumbs]` was a wrapping flex row carrying each retained
Panel's full title, which made the trail's height unbounded in the length of
those titles. A fixture never shows it — "Class A" fits three-abreast on one row
— and a real application always does: the first consumer to render the mobile
presentation against its own data measured a **three-deep stack at 284px tall on
a 390×844 viewport**, roughly a third of the screen spent on breadcrumbs before
any Panel content.

The trail is now one line that scrolls within itself. Each crumb is clamped to a
line, ellipsised, and capped at `12rem`; the trail is the only flex item in the
navigation bar that may take or lose the leftover width, so the bar no longer
wraps either. Height is now the same at every depth and for any title — measured
in Chromium at 390px with a three-deep stack of application-length titles, the
navigation bar went from **236px to 54px**, and the document gained no
horizontal scrollbar at 320, 390, 480, or 767px.

Two details of how it rests, both deliberate:

- **The trail rests at the crumb for the Active Panel**, which is the last one it
  renders. A scrolling trail parked at its inline start would hide the crumb that
  says where you are, which is a worse defect than the one being fixed. The
  offset is written directly, so there is no motion to reduce, and a right-to-left
  Canvas is scrolled to its own inline end.
- **Every crumb stays an ordinary button in Tab order.** A crumb scrolled out of
  view is reached by Tab, and the browser scrolls it back in on focus; the trail
  itself claims no tab stop, so nothing is added in front of the crumbs.

**If you have already styled the trail yourself**, your override now sits on top
of a different default. Check it before upgrading: rules that undid the wrap —
`flex-wrap: nowrap`, `overflow-x: auto`, `white-space: nowrap` on a crumb — are
now what the package does, and are harmless to keep or delete. A rule that
*depended* on the wrap, or that set a height on `[data-canvas-breadcrumbs]`, is
the one to look at. To show more of each title, raise the cap on the same
documented attribute:

```css
[data-canvas-breadcrumbs] li button { max-inline-size: 20rem; }
```

No attribute, custom property, or export changed, and nothing narrow moved
outside the trail.

This also corrects a row in the README's known limitations. "The narrow
presentations are verified by test, not by eye" said that nothing narrow had been
seen rendering in a real application — no longer true, and it produced this
defect the moment it stopped being true. The row now says what a consumer has
actually rendered, what held, and what is still unseen: the tablet presentation,
a dialog or Overlay Workspace at either narrow width, and any of it on a real
phone rather than a resized browser.
