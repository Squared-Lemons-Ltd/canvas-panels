---
"@squaredlemons/canvas-panels": minor
---

Make Panel Instance IDs survive a server render, so a hydrated Canvas works.

`data-canvas-panel-id` was minted from a module-level counter that restarted in
each process. A server increments it once per request while a browser always
starts from the same place, so the two never agreed after the first request.
React reported the mismatch and left the server's value in the DOM, and every
package lookup by that attribute then missed: F6 stopped cycling between Panels,
scroll offsets were not restored, and a resize separator reported
`aria-valuenow="240"` for a Panel that was 542px wide — so a screen reader
announced the wrong size. Every SSR consumer was affected, which is the
package's flagship integration.

A Panel Instance ID is now numbered from one within its own Panel Engine and
depends on nothing outside it, so an Engine seeded the same way issues the same
identities in any process. The presentation confines every lookup by one to the
Panels its own Workspace renders, which is what per-Engine numbering needs and
which also stops a Workspace nested inside a Panel being mistaken for its host.

**The Public Contract now states the scope of the identity, not its spelling.**
A Panel Instance ID is unique within its Panel Engine; the `canvas-panel-<n>`
format is not contractual and may change. Two consequences worth knowing:

- The value is no longer document-unique. Two Workspaces on one page each number
  their own Panels, so scope any lookup to the Workspace you mean.
- A bare Panel Instance ID handed to a *different* Panel Engine now names that
  Engine's Panel at the same position instead of being rejected as an invalid
  origin. Panel Instance Refs are unchanged and still cannot cross a Workspace —
  every command that can take a Ref takes one, and a foreign Ref is still
  refused as `foreign-workspace`.

The packed-package contract gains a server-render-then-hydrate check, so an
identity that disagrees across that boundary fails a gate instead of reaching a
consumer.
