---
"@squaredlemons/canvas-panels": minor
---

Publish as MIT-licensed open source on the public npm registry, renamed to `@squaredlemons/canvas-panels`.

**The package has been renamed.** Update the dependency and every import:

```diff
-"@squared-lemons-ltd/canvas-panels": "0.1.0"
+"@squaredlemons/canvas-panels": "0.2.0"
```

```diff
-import { definePanel } from "@squared-lemons-ltd/canvas-panels/core";
+import { definePanel } from "@squaredlemons/canvas-panels/core";
```

The nine subpaths, every export, the result discriminants, the Navigation Parameter, the custom properties, and the `canvas-panels` cascade layer are all unchanged — this release moves the package, it does not alter the Public Contract.

**Delete the registry configuration.** The `.npmrc` that pointed the scope at GitHub Packages and supplied a `read:packages` token is no longer needed anywhere — not in a consuming repository, and not in its CI:

```diff
-@squared-lemons-ltd:registry=https://npm.pkg.github.com
-//npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}
```

`pnpm add @squaredlemons/canvas-panels` is now the whole instruction.

Why the move, given that the previous one was recent and deliberate: the package went to GitHub Packages because npm charges for *private* packages and the first publish was refused with `402 Payment Required`. Opening the repository removed that premise entirely — a public package on npm is free, while GitHub Packages requires an access token to install a package whether it is public or private. Staying would have kept every cost of the private arrangement and returned none of its benefit. Two things came back with the move: the scope is a free choice again rather than the repository owner's name, which is the only reason it ever carried a legal suffix; and releases now carry an npm provenance attestation, generated automatically by trusted publishing, which `docs/delivery/release-evidence.md` previously had to stand in for.

`0.1.0` was not republished under the new name. It was private, had no consumer outside this repository, and its record is kept in `docs/delivery/release-evidence.md`; the public history starts here.
