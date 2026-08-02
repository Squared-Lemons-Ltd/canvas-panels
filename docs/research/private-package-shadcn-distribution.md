# Private package and shadcn distribution constraints

**Research ticket:** [Research private package and shadcn distribution constraints](https://github.com/Squared-Lemons-Ltd/canvas-panels/issues/5)  
**Researched:** 2026-08-02 (Europe/London)  
**Scope:** Current first-party constraints and supported patterns for distributing a private React 19 component package built with Tailwind CSS 4 and shadcn/ui. This note records options and trade-offs; it does **not** select the package architecture.

## Executive summary

The first-party documentation supports several different distribution models, but they make consumers own different parts of the system:

1. **A private npm package** can be published to npm's paid private-package service or GitHub Packages. This gives normal semver installation and package exports. npm private organization packages require a paid npm organization. GitHub Packages' npm registry requires scoped packages and authentication; local installation uses a personal access token (classic), while GitHub Actions can often use `GITHUB_TOKEN` when repository/package access is granted.
2. **A shadcn registry** is a code-distribution mechanism rather than a runtime package boundary. It can copy components, hooks, dependencies, CSS variables, themes, and other files into the consuming project. shadcn supports namespaced registries and authenticated private endpoints. Its direct GitHub-repository registry flow is explicitly for **public** repositories.
3. **Tailwind CSS 4 does not scan `node_modules` by default.** If the installed package ships class-bearing source for the consumer to compile, the consumer must register it with `@source`, and the package must use complete, statically detectable class names. Shipping precompiled CSS avoids this scan requirement but introduces a global CSS/cascade and duplication contract.
4. **Tokens can remain consumer-owned.** Tailwind theme variables and shadcn's semantic CSS-variable convention support a contract in which the package consumes named variables while the application defines their values in `:root`/`.dark`. Defaults, if shipped, change that contract from “required consumer tokens” to “overridable package defaults.”
5. **React client boundaries are module boundaries.** A file marked `'use client'` and all of its transitive dependencies become client code. Interactive package entry points need the directive preserved in published output; server-safe exports must not re-export client-only code accidentally. Props crossing a Server-to-Client boundary must be serializable.
6. **An App Router adapter can be a separate optional export.** Next.js advises library authors to put `'use client'` on client-only entry points. Next can transpile raw TypeScript/JSX dependencies with `transpilePackages`, but publishing built JavaScript avoids requiring that consumer configuration. A Next-specific export can remain optional rather than making `next` a requirement of the framework-neutral core.

## 1. Distribution channels

### 1.1 Private packages on npm

npm supports private user-scoped and organization-scoped packages. Private user packages require a paid npm user account; private organization packages require a paid npm organization. Scoped packages publish privately by default. npm also recommends reviewing the packed contents because “private” does not make secrets safe to publish.

A private npm package provides the familiar package-manager contract:

- scoped package names, versions, dist-tags, lockfile resolution, and normal `npm install`;
- npm access managed through the npm user/organization;
- `package.json` fields such as `files`, `exports`, `peerDependencies`, and `peerDependenciesMeta`;
- no GitHub-specific package token for consumers, but a separate npm billing/access-control surface.

**Trade-offs**

| Benefit | Cost / constraint |
|---|---|
| Registry-neutral npm workflow and conventional semver consumption | Paid npm account/organization is required for private packages |
| Package access can be managed independently of GitHub repository access | Adds another identity, billing, token, and access-management system |
| Works naturally for compiled JS, type declarations, and exported CSS | Does not solve Tailwind scanning or token ownership by itself |

Sources: npm, [Creating and publishing private packages](https://docs.npmjs.com/creating-and-publishing-private-packages/) and [package.json](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/) (accessed 2026-08-02).

### 1.2 GitHub Packages npm registry

GitHub Packages supports the npm registry at `https://npm.pkg.github.com`. The package name must be scoped (for this organization, a lowercase scope such as `@squared-lemons-ltd/...` would be required by npm naming rules), and the scope is mapped to GitHub Packages in `.npmrc` or with `npm login --scope ... --registry ...`.

Current authentication constraints are material:

- GitHub states that GitHub Packages supports authentication with a **personal access token (classic)**.
- A token is needed to publish, install, or delete packages, including private packages.
- For local/CI installation outside the publishing repository, a PAT (classic) needs at least `read:packages` and the user also needs access to the package.
- In GitHub Actions, `GITHUB_TOKEN` can publish a package associated with the workflow repository. It can install packages from other private repositories when the consuming repository has been granted package read access; otherwise a PAT (classic) is required.
- The npm registry supports granular user/organization-scoped package permissions. Visibility and package access can be managed separately from a connected repository, although a linked package inherits repository permissions by default unless inheritance is removed.

The `repository` field should point at the owning GitHub repository so the package can be linked correctly. Package/repository permissions therefore need an explicit policy: inherit from the source repository, or manage granular package access separately.

Example consumer configuration (credential injected by the environment, never committed):

```ini
@squared-lemons-ltd:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

**Trade-offs**

| Benefit | Cost / constraint |
|---|---|
| Keeps source, Actions publishing, organization identity, and package permissions in GitHub | Local installation depends on PAT (classic), not a fine-grained PAT |
| `GITHUB_TOKEN` can avoid a long-lived publishing secret and can install when package access is granted | Every consuming repository/workflow must be granted package access and configured correctly |
| Granular package permissions can differ from repository permissions | Separate package permissions can drift from repository/team membership; inherited permissions can be surprising if not documented |
| Conventional semver package installation | Consumers must configure the GitHub npm scope and authenticate even though source access may already exist |

Sources: GitHub, [Working with the npm registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry), [Configuring a package's access control and visibility](https://docs.github.com/en/packages/learn-github-packages/configuring-a-packages-access-control-and-visibility), and [About permissions for GitHub Packages](https://docs.github.com/en/packages/learn-github-packages/about-permissions-for-github-packages) (accessed 2026-08-02).

### 1.3 Private shadcn registry as an alternative or companion

shadcn describes its registry as a distribution system for code. A registry item can include files, npm dependencies, registry dependencies, CSS variables, themes, and other resources. Namespaced registries allow multiple sources in one `components.json`, including private registries. Authentication can be supplied through headers or query parameters with environment-variable interpolation, for example `Authorization: Bearer ${REGISTRY_TOKEN}`.

This is different from installing an npm library:

- the CLI copies files into the consumer's repository;
- the consumer owns and can edit the copied source;
- Tailwind can discover copied classes in the app's normal source tree;
- upgrades are a code synchronization/overwrite/merge concern rather than a semver runtime dependency update;
- registry items can inject dependencies and CSS variables into the consumer, which is powerful but makes installation consequential and should be reviewed.

shadcn's “GitHub Registries” flow says **any public GitHub repository** can become a registry. It removes the need for a registry server, but it is not the documented private-repository path. A private shadcn registry instead needs an authenticated endpoint (or another access-controlled hosting layer) that returns registry JSON and files.

**Trade-offs**

| Benefit | Cost / constraint |
|---|---|
| Matches shadcn's source-ownership model and gives consumers full control of component code and tokens | No opaque runtime package boundary; copied code can fork and drift |
| Copied classes are naturally visible to the consumer's Tailwind build | Upgrades may overwrite local edits or require merges and migration guidance |
| Registry schema can install npm/registry dependencies, files, CSS variables, and themes together | Registry installation can modify several parts of a project; review and trust are required |
| Authenticated, namespaced private registries are supported | Requires hosting, authorization, credential injection, and operational availability |
| Public GitHub repo can act as a zero-server registry | Official GitHub-repository flow is public, so it does not satisfy private-source requirements on its own |

Sources: shadcn/ui, [Registry](https://ui.shadcn.com/docs/registry), [Namespaces](https://ui.shadcn.com/docs/registry/namespace), [Authentication](https://ui.shadcn.com/docs/registry/authentication), [GitHub Registries](https://ui.shadcn.com/docs/registry/github), and [`registry-item.json`](https://ui.shadcn.com/docs/registry/registry-item-json) (accessed 2026-08-02).

## 2. Dependency ownership and peer dependencies

npm defines `peerDependencies` as a way to express compatibility with a host library. npm 7 and newer installs peers by default, and conflicting peer requirements can make the dependency tree unresolvable. npm therefore recommends broad compatible ranges rather than unnecessarily narrow patch-level ranges. `peerDependenciesMeta` can mark a peer optional; npm will not automatically install optional peers.

For this package, the fields encode architectural ownership rather than merely build mechanics:

| Dependency class | Supported treatment | Trade-off to record |
|---|---|---|
| `react` | Peer dependency covering the React 19 versions actually tested; also a development dependency for local build/tests | A peer avoids a second React instance and states host compatibility. A broad range reduces conflicts, but must not claim untested compatibility. |
| `react-dom` | Peer when published components import DOM APIs or portals; development dependency for tests/build | Making it a peer aligns renderer ownership with the app. Server-only consumers should not be forced to load DOM code through a server-safe entry. |
| shadcn primitive runtime packages (for example Radix/Base UI, `class-variance-authority`, icon libraries) | Runtime `dependencies`, peers, or copied registry dependencies | Runtime dependencies make the package self-contained and versioned; peers let the app unify versions but enlarge its setup contract; a shadcn registry can install them into the consumer and shifts source ownership. |
| `tailwindcss` | Build-time dev dependency for precompiled CSS; consumer/dev peer only if the published contract requires the consumer to compile Tailwind source | Requiring Tailwind as a peer couples every consumer to the same major. Avoiding the peer is possible only if the published output does not require the consumer's Tailwind processor. |
| `next` | Optional peer only for an adapter that imports Next APIs, or no dependency if the adapter is pure React | A required peer would make the framework-neutral package Next-specific. An optional peer needs a separate export and clear failure/setup documentation. |
| TypeScript and bundler tooling | `devDependencies` | Consumers should receive built JS/types unless the source-distribution model intentionally requires consumer compilation. |

Candidate peer range shapes (illustrative, not selected):

```json
{
  "peerDependencies": {
    "react": ">=19 <20",
    "react-dom": ">=19 <20",
    "next": ">=15 <17"
  },
  "peerDependenciesMeta": {
    "next": { "optional": true }
  }
}
```

The exact lower bounds must follow real compatibility tests. npm's guidance favors a broad compatible range, but that is not permission to advertise versions the package has not exercised.

Source: npm, [`peerDependencies` and `peerDependenciesMeta` in package.json](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#peerdependencies) (accessed 2026-08-02).

## 3. CSS distribution and Tailwind CSS 4 scanning

### 3.1 First-party constraints

Tailwind CSS 4 scans source files as plain text and generates CSS for complete class-name tokens that it recognizes. It does not understand string interpolation or concatenation, so code such as `` `bg-${color}-500` `` is not a supported discoverable pattern. Map variants to complete strings instead.

Tailwind excludes these relevant locations/types from automatic scanning:

- files in `.gitignore`;
- `node_modules`;
- CSS files;
- binary and lock files.

Tailwind documents `@source` for explicitly registering ignored external libraries:

```css
@import "tailwindcss";
@source "../node_modules/@squared-lemons-ltd/canvas-panels";
```

The path is relative to the stylesheet. If package managers produce a different physical layout, or the CSS file moves, that relative contract needs testing. `@source` can point at the package directory or a narrower exported source/dist directory.

Sources: Tailwind CSS, [Detecting classes in source files](https://tailwindcss.com/docs/detecting-classes-in-source-files) and [Functions and directives](https://tailwindcss.com/docs/functions-and-directives#source-directive) (accessed 2026-08-02).

### 3.2 Supported CSS delivery patterns

#### Pattern A — package exports precompiled component CSS

The package compiles the utilities/components it needs and exports a stable CSS subpath such as `@scope/canvas-panels/styles.css`. The app imports it once near its global stylesheet/root layout.

**Advantages**

- no consumer `@source` requirement;
- no consumer Tailwind dependency if the CSS is fully compiled;
- exact package version and CSS artifact travel together;
- predictable for non-Tailwind consumers.

**Costs / risks**

- CSS is not generated against the consumer's exact class usage, so it may be larger;
- global layers, specificity, resets/Preflight, and import order become public API concerns;
- bundling a second Tailwind base/preflight can conflict with the application's Tailwind output, so component CSS and resets must be separated deliberately;
- static color values reduce consumer themability unless declarations reference runtime CSS variables;
- the consumer must remember the side-effect CSS import. Marking CSS exports and package side effects correctly becomes part of package metadata/bundler compatibility.

#### Pattern B — package ships class-bearing JS/source; consumer compiles it

The package exports built JS that retains complete Tailwind class strings (or raw source), and the consumer adds `@source` for the installed package.

**Advantages**

- utilities are generated in the consumer's Tailwind build;
- one Tailwind layer/cascade can serve app and package;
- consumer theme variables and utilities are authoritative;
- potentially smaller app-specific CSS.

**Costs / risks**

- every consumer has a Tailwind 4 setup obligation and a path-sensitive `@source` rule;
- dynamic class construction will silently omit styles;
- moving/minifying class strings in published output can affect detection and needs fixture testing;
- raw TSX/modern syntax may additionally require framework transpilation, while built JS usually does not;
- package-manager layouts and exports must leave the scanned files physically present in the tarball.

#### Pattern C — package exports CSS source/theme contracts for consumer compilation

Tailwind documents putting shared `@theme` variables in a CSS file, then importing it into projects; it explicitly says shared theme variables can live in a monorepo package or be published to npm and imported as third-party CSS. A package could therefore export separate CSS entry points such as a token-to-utility mapping and component layers.

**Advantages**

- CSS-first Tailwind 4 composition;
- theme variables can be shared without a JavaScript config;
- lets the consumer control import order and compilation.

**Costs / risks**

- still couples the consumer to Tailwind processing and the package's Tailwind-major syntax;
- importing `@theme` changes which utilities exist in the consumer;
- token definitions and component source scanning are separate concerns; importing a theme file alone does not make `node_modules` component classes scannable.

#### Pattern D — shadcn registry copies source and style changes

A registry item can copy component files, declare npm/registry dependencies, and carry `cssVars`, styles, or themes into the consuming project.

**Advantages**

- aligns with shadcn's editable-source model;
- normal app scanning discovers copied component classes;
- the app owns final code and CSS.

**Costs / risks**

- no single immutable package implementation after install;
- local modifications complicate upgrades;
- token/theme installation can mutate global app styling;
- needs registry authentication/hosting for private delivery.

No first-party constraint requires one of these patterns. A package can also expose more than one channel (for example, compiled package plus optional shadcn source registry), but doing so creates two release/upgrade contracts that must be kept equivalent.

Source: Tailwind CSS, [Theme variables — Sharing across projects](https://tailwindcss.com/docs/theme#sharing-across-projects), and shadcn/ui, [`registry-item.json`](https://ui.shadcn.com/docs/registry/registry-item-json) (accessed 2026-08-02).

## 4. Consumer-owned token contract

Tailwind calls `@theme` variables design tokens that also control which utilities exist. It distinguishes them from ordinary `:root` variables: use `@theme` when a token should create a utility; use ordinary CSS variables when no utility should be generated. shadcn defaults `tailwind.cssVariables` to `true`, maps semantic tokens to utilities such as `bg-background` and `text-foreground`, and overrides the same tokens under `.dark` for dark mode. shadcn's convention uses semantic surface/foreground pairs such as `primary` and `primary-foreground`.

These facts support several ownership contracts:

### Contract option 1 — required consumer tokens

The package only consumes named variables and ships no global values:

```css
.canvas-panel {
  background: var(--canvas-panel-background);
  color: var(--canvas-panel-foreground);
  border-color: var(--canvas-panel-border);
}
```

The app defines values in `:root`, `.dark`, tenant wrappers, or product themes.

- **Benefit:** strongest consumer ownership and no surprise global palette.
- **Cost:** missing tokens can make UI invalid/unreadable; the package needs validation, documented required tokens, or intentional CSS fallbacks.

### Contract option 2 — overridable package defaults

The package supplies defaults in a low-precedence layer or scoped root, and the app overrides them.

- **Benefit:** works out of the box and remains customizable.
- **Cost:** the package now owns a default visual system and global/scoped cascade behavior; defaults can mask incomplete consumer integration.

### Contract option 3 — consume the host's shadcn semantic tokens

Components use the standard shadcn semantic names (`--background`, `--foreground`, `--primary`, `--primary-foreground`, and so on).

- **Benefit:** lowest setup in an existing shadcn app and coherent app-wide theming.
- **Cost:** package semantics can collide with host semantics; components may need more domain-specific states than the shared shadcn vocabulary; non-shadcn consumers inherit a larger token contract.

### Contract option 4 — package-prefixed semantic tokens mapped to host tokens

The app maps package-specific variables to its own design system:

```css
:root {
  --canvas-panel-background: var(--card);
  --canvas-panel-foreground: var(--card-foreground);
  --canvas-panel-accent: var(--primary);
}
```

- **Benefit:** package vocabulary remains stable while each consumer adapts it.
- **Cost:** additional mapping boilerplate and more variables in the cascade.

Regardless of option, token **names, meaning, expected CSS value type, fallback policy, inheritance scope, and dark/high-contrast behavior** are public API. If utilities are generated from variables that reference other variables, Tailwind's `@theme inline` behavior should be evaluated to avoid unexpected variable-resolution scope.

Sources: Tailwind CSS, [Theme variables](https://tailwindcss.com/docs/theme), and shadcn/ui, [Theming](https://ui.shadcn.com/docs/theming) (accessed 2026-08-02).

## 5. React 19 Server Component and client boundaries

### 5.1 React constraints

React's `'use client'` directive must be at the beginning of a file. It marks the module **and its transitive dependencies** as client code. When imported by a Server Component through a compatible bundler, that import is the server/client boundary. All code in that client module subtree is sent to and run by the client.

Consequences for package shape:

- adding `'use client'` to a broad barrel entry can pull every transitive export/dependency into the client graph;
- a server-safe module must not import or re-export client-only modules if the intent is to keep that path server-capable;
- interactive components using state, effects, event handlers, browser APIs, context providers, portals, measurements, or DOM listeners belong behind a client entry/boundary;
- pure types, deterministic helpers, schemas, serializable models, and non-interactive renderable pieces can remain in server-safe modules if they import no client-only subtree;
- values passed from a Server Component into a Client Component must be React-supported serializable values. Function props cannot cross that boundary, even though callbacks can be created and used entirely within a client subtree.

React 19's Server Component user-facing model is stable, but React warns that the underlying APIs used by bundlers/frameworks to implement RSC do not follow semver within React 19.x. This package should consume framework-supported boundaries, not implement an RSC bundler protocol.

Sources: React, [`'use client'`](https://react.dev/reference/rsc/use-client) and [Server Components](https://react.dev/reference/rsc/server-components) (accessed 2026-08-02).

### 5.2 Boundary/export patterns to compare

| Pattern | Effect | Trade-off |
|---|---|---|
| Entire package root begins with `'use client'` | Easiest import path; everything under the root is client code | Largest client graph and no meaningful server-safe API |
| Leaf component files carry `'use client'`; root exports them | Directives describe actual interactive leaves | A barrel can still create an unexpectedly broad graph depending on imports/build output; directive preservation must be tested |
| Separate `./client` and server-safe `.` entry points | Clear explicit boundary and room for server-only helpers/types | More import paths and documentation; accidental cross-imports need lint/tests |
| Per-component subpath exports | Fine-grained client bundles and explicit API surface | Larger export map and release compatibility surface |
| Consumer-created client wrapper | Works around a package that lacks directives | Next.js documents this as a workaround, but it transfers boilerplate and correctness to every consumer |

Build tooling must preserve the literal directive. Next.js explicitly warns library authors that some bundlers strip `'use client'`; published-artifact tests should inspect or import the packed output, not just source files.

Source: Next.js, [Server and Client Components — Advice for Library Authors](https://nextjs.org/docs/app/getting-started/server-and-client-components#advice-for-library-authors) (accessed 2026-08-02).

## 6. Package contents and exports

npm's `files` field controls which files are packed. Omitting it defaults broadly; an allowlist makes compiled JS, declarations, CSS, and any deliberately scannable source explicit. `npm pack --dry-run` should be a release check, both for completeness and to prevent private files entering the tarball.

npm's `exports` field supports multiple entry points and conditional resolution and prevents imports of undeclared package internals. That encapsulation is useful here because JavaScript, client entries, CSS, and a Next adapter have different contracts.

Illustrative export-map shape (not an architecture decision):

```json
{
  "files": ["dist", "styles"],
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./client": {
      "types": "./dist/client.d.ts",
      "import": "./dist/client.js"
    },
    "./styles.css": "./styles/index.css",
    "./tailwind.css": "./styles/tailwind.css",
    "./next": {
      "types": "./dist/next.d.ts",
      "import": "./dist/next.js"
    }
  }
}
```

Questions that remain open within this supported shape:

- Does `.` export only server-safe primitives/types, or the common interactive API?
- Is CSS compiled, Tailwind-processable source, token-only CSS, or multiple explicit entries?
- Are individual components exported as subpaths for tree-shaking and boundary clarity?
- Is CommonJS needed, or is ESM-only acceptable to all consumers?
- Is source included specifically for Tailwind scanning, or are complete class strings retained in built JS?
- Should CSS imports be explicit, or should JS import CSS as a side effect (which reduces consumer steps but increases bundler/framework coupling)?

Source: npm, [`files` and `exports` in package.json](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#files) (accessed 2026-08-02).

## 7. Optional Next.js App Router adapter

Next.js App Router uses Server Components for layouts/pages by default and Client Components for state, event handlers, effects, browser APIs, and custom hooks. It advises component-library authors to add `'use client'` to entry points that rely on client-only features so users can import them into Server Components without writing wrappers.

An optional adapter subpath can contain only the integrations that genuinely depend on Next.js, for example:

- a root-layout/provider composition entry;
- URL/search-parameter or router synchronization;
- route-aware wrappers;
- a Next-specific dynamic/lazy-loading strategy;
- Next image/link integrations if needed.

The framework-neutral core should not import that adapter. If the adapter imports `next/*`, `next` can be an optional peer tied to that subpath rather than a required peer for all consumers.

### Consumer transpilation

Current Next.js documentation says `transpilePackages` compiles and bundles dependencies from workspaces or `node_modules` that ship TypeScript, JSX, or modern syntax. Next does not compile code in `node_modules` by default; adding the package opts it in. Alternatively, the library can publish plain JavaScript and point `main`/`exports` at compiled output.

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@squared-lemons-ltd/canvas-panels'],
}
```

- **Publishing built JS:** fewer consumer steps and broader tool compatibility; requires a library build and source maps/declarations.
- **Publishing raw TSX/source:** easier source-level Tailwind scanning and debugging; requires consumer transpilation and couples package syntax to consumer tooling.

`serverExternalPackages` is not a normal UI-library integration mechanism. Next bundles dependencies used in Server Components/Route Handlers by default; `serverExternalPackages` opts packages using Node-specific features out to native `require`. A browser-oriented React UI library should not need it unless an adapter introduces a Node-only dependency, which would itself deserve scrutiny.

Sources: Next.js, [`'use client'`](https://nextjs.org/docs/app/api-reference/directives/use-client), [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components), [`transpilePackages`](https://nextjs.org/docs/app/api-reference/config/next-config-js/transpilePackages), and [`serverExternalPackages`](https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages) (accessed 2026-08-02).

## 8. Cross-cutting trade-off matrix

| Dimension | Compiled private npm package | Consumer-compiled package source | Private shadcn registry |
|---|---|---|---|
| Version/update model | Semver dependency update | Semver dependency update plus build contract | Copied-source synchronization/merge |
| Source ownership | Package | Package, though source may be visible | Consumer after install |
| Tailwind scanning | Not needed for precompiled CSS | Consumer must configure `@source` | Usually automatic after files are copied into app source |
| Consumer Tailwind requirement | Optional if CSS fully compiled | Required and coupled to supported major | Usually required for shadcn/Tailwind items |
| Token ownership | Runtime variable contract can leave values to consumer | Consumer can own both theme generation and values | Consumer owns resulting files/variables, unless registry writes defaults |
| RSC boundary | Controlled by published directives/exports | Controlled by source directives and consumer bundler | Copied directives become app source |
| Access control | npm paid private access or GitHub Packages permissions/tokens | Same registry constraints | Authenticated registry endpoint; public GitHub flow is not private |
| Upgrade drift | Low; immutable package versions | Low implementation drift, higher toolchain drift | High potential source drift, but maximum local control |
| Non-Next/non-Tailwind reach | Highest with built JS + compiled CSS | Lower | Depends on registry item; shadcn registry itself is framework-agnostic, but copied code may not be |

## 9. Constraints to carry into architecture decisions

The eventual design should explicitly decide and test all of the following; this research does not choose the answers:

1. **Registry:** npm private organization versus GitHub Packages, including billing, developer login, CI token, consuming-repository access, and incident/offboarding procedures.
2. **Distribution model:** immutable package, consumer-compiled package source, shadcn copied source, or multiple channels with a defined source of truth.
3. **Peer contract:** tested React/React DOM range; ownership of primitive libraries; whether Tailwind and Next are required, optional peers, or build-only dependencies.
4. **CSS contract:** precompiled CSS, consumer scanning with `@source`, CSS-first theme imports, registry-installed styles, or explicit combinations. Define import order and whether Preflight is included.
5. **Class detection:** no dynamically constructed Tailwind classes in any source expected to be scanned; test installed/packed artifacts under the supported package managers.
6. **Token API:** semantic names, required versus defaulted values, prefixing, fallbacks, dark/high-contrast states, inheritance/scoping, and breaking-change policy.
7. **RSC boundaries:** which exports are server-safe, which are client entries, how serializable props are enforced, and how the build verifies directives are preserved.
8. **Exports:** public subpaths for core/client/CSS/Next, ESM/CommonJS support, type declarations, CSS side effects, and deep-import prevention.
9. **Next adapter:** whether it imports Next APIs, supported Next range, and whether consumers ever need `transpilePackages`.
10. **Release verification:** `npm pack --dry-run`, install the tarball into React 19 fixtures, verify CSS in Tailwind and non-Tailwind modes as applicable, run an App Router server/client-boundary fixture, and test authenticated registry installation in CI.

## Source register

All sources are first-party and were accessed on **2026-08-02**.

### npm

- [Creating and publishing private packages](https://docs.npmjs.com/creating-and-publishing-private-packages/)
- [`package.json` reference (`files`, `exports`, `peerDependencies`, `peerDependenciesMeta`)](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/)

### GitHub Packages

- [Working with the npm registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry)
- [Configuring a package's access control and visibility](https://docs.github.com/en/packages/learn-github-packages/configuring-a-packages-access-control-and-visibility)
- [About permissions for GitHub Packages](https://docs.github.com/en/packages/learn-github-packages/about-permissions-for-github-packages)

### React

- [`'use client'` directive](https://react.dev/reference/rsc/use-client)
- [Server Components](https://react.dev/reference/rsc/server-components)

### Tailwind CSS

- [Detecting classes in source files](https://tailwindcss.com/docs/detecting-classes-in-source-files)
- [Theme variables](https://tailwindcss.com/docs/theme)
- [Functions and directives](https://tailwindcss.com/docs/functions-and-directives)

### shadcn/ui

- [Theming](https://ui.shadcn.com/docs/theming)
- [Monorepo](https://ui.shadcn.com/docs/monorepo)
- [Registry](https://ui.shadcn.com/docs/registry)
- [Namespaces](https://ui.shadcn.com/docs/registry/namespace)
- [Authentication](https://ui.shadcn.com/docs/registry/authentication)
- [GitHub Registries](https://ui.shadcn.com/docs/registry/github)
- [`registry-item.json`](https://ui.shadcn.com/docs/registry/registry-item-json)

### Next.js

- [`'use client'` directive](https://nextjs.org/docs/app/api-reference/directives/use-client)
- [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
- [`transpilePackages`](https://nextjs.org/docs/app/api-reference/config/next-config-js/transpilePackages)
- [`serverExternalPackages`](https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages)
