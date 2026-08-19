---
"@squaredlemons/canvas-panels": patch
---

Say what the package is on its own npm listing.

The description read "Reusable Canvas Panels interaction framework for Squared
Lemons applications" — written while the package was private, and still the line
under the name in npm search results after it went public under MIT. It now
describes the thing rather than its former owner, and the first line of the
shipped README matches it.

The package also carried no `keywords`, which is npm's only search signal beyond
the name: nobody could find it without already knowing what it was called.

No code changed. Both are metadata, and both only reach the registry on a
release, which is why they are worth one.
