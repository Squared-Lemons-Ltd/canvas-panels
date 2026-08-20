---
"@squaredlemons/canvas-panels": patch
---

Make the README useful to someone who has just landed on the npm page.

The README is the package page, and it was written for a reader who already had
the repository open. Three things changed for the one who does not.

**There is somewhere to look before installing.** A sample CRM built on the
package is linked from the top, with the two minutes' worth of it that show what
the package is for: open an account, follow a contact out of it, try to close a
Panel with unsaved work in it, then copy the URL into a new tab and watch the
whole stack come back.

**The install instruction no longer assumes pnpm.** All four package managers are
given. `pnpm add` as the only line asked a reader on npm or yarn to translate it
before they could start, which is a strange thing to do to someone deciding
whether to bother.

**The peers are stated as ranges rather than as a command.** `react@^19` in an
install command reads like an instruction to run it, and running it rewrites the
React range of an application that already had one. The requirement is
`>=19 <20` for React and React DOM and `>=15 <17` for Next.js — which an existing
React application already satisfies, so there is usually nothing to run at all.

No code changed, and the ranges themselves are exactly what the manifest has
always declared. This is the listing catching up with the package.
