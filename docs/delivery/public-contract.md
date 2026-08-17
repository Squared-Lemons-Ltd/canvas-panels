# The Canvas Panels Public Contract

What `@squared-lemons-ltd/canvas-panels` promises, in one list, so that "is this a breaking change?" has an answer that does not depend on who is asked.

The **Public Contract** is the documented package exports, result discriminants, behaviours, schemas, accessibility guarantees, compatibility ranges, semantic styling hooks, and integration attributes described here and in the package README. Everything else — internal module layout, the spelling of a generated id, the DOM shape inside a Panel body, `data-testid` — is implementation detail and may change in any release.

This document is **enforced, not descriptive**. The contract suite compares the export lists and the result discriminants below against the built package on every run, so an export added, removed, or renamed without an edit here fails the gate.

## Freeze policy

While the package is `0.x`, a minor release may contain a breaking change; each is described in the changelog with the edit a consumer has to make. From `1.0.0` the ordinary semantic-versioning rules apply to everything in this document: a breaking change is a major release, an addition is a minor one.

Adding to the contract is a minor release. Removing from it, or narrowing what an entry accepts, is a breaking change and is deprecated for at least one minor release first — see "Support" in the package README.

## Exports

Nine code subpaths and the stylesheet, and no root export. Every name below is public; a name reachable only through a deep import is not.

### `@squared-lemons-ltd/canvas-panels/core`

`canvasBreakpointQueries`, `canvasBreakpoints`, `createPanelEngine`, `decodeNavigationParameter`, `definePanel`, `defineRootPanel`, `encodeNavigationParameter`, `maximumNavigationParameterLength`, `navigationParameterName`

### `@squared-lemons-ltd/canvas-panels/react`

`CanvasProvider`, `createCanvasBindings`, `useCanvas`

### `@squared-lemons-ltd/canvas-panels/ui`

`canvasAnnouncementTemplates`, `canvasBreakpointQueries`, `canvasPanelSizingBounds`, `createCanvasModule`, `cyclePanelRegion`, `defineCanvasContext`, `describeStructuralChange`, `resizePanel`, `sizingCommandForKey`

### `@squared-lemons-ltd/canvas-panels/next`

`seedCanvasNavigation`, `useCanvasNavigationSync`

### `@squared-lemons-ltd/canvas-panels/next/server`

`applyCanvasNavigationParameter`, `canvasNavigationParameterName`, `readCanvasNavigationState`

### `@squared-lemons-ltd/canvas-panels/extensions/editor`

`createPanelEditor`, `editorGuardMessages`, `editorLifecycleDirty`, `editorStatus`, `resolveEditorGuard`, `usePanelEditor`

### `@squared-lemons-ltd/canvas-panels/extensions/resources`

`ResourceExchangeProvider`, `createPanelResource`, `createResourceExchange`, `resolveResourceDeferral`, `resourceInvalidationMatches`, `resourceKeyMatches`, `usePanelResource`, `useResourceExchange`, `useResourceSubscription`

### `@squared-lemons-ltd/canvas-panels/overlay`

`createOverlayWorkspace`, `defineOverlayWorkspace`, `overlayNavigationParameterPrefix`, `overlayPresentation`, `resolveOverlayEscape`

### `@squared-lemons-ltd/canvas-panels/testing`

`allowTransition`, `blockTransition`, `buildNavigationDocument`, `buildPanelReadModel`, `buildPanelStack`, `buildPresentation`, `buildTransitionStatus`, `confirmTransition`, `createTestClock`, `createTestFocusTarget`, `createTestHistory`, `createTestIdentities`, `createTestLifecycle`, `createTestRestore`, `createTestViewport`

### `@squared-lemons-ltd/canvas-panels/styles.css`

The compiled stylesheet. One cascade layer, named `canvas-panels`; the name is part of the contract.

The type declarations shipped beside each entry point are part of the contract too: a type that changes shape is a change to the contract even where the runtime value does not move.

## Result discriminants

Commands and coordinators report outcomes as discriminated unions rather than by throwing, so a caller can exhaust them. Both lists below are frozen: a new member is an addition, a removed or renamed member is a breaking change.

**`status`**

`aborted`, `absent`, `activated`, `allow`, `applied`, `available`, `block`, `cancelled`, `closed`, `collapsed`, `committed`, `completed`, `confirm`, `confirmation-required`, `decoded`, `denied`, `failed`, `opened`, `primary`, `published`, `recovered`, `rejected`, `repair`, `replaced`, `restored`, `reused`, `secondary`, `seeded`, `settled`, `stayed`, `unavailable`, `unchanged`, `unrepairable`, `updated`

**`reason`**, carried by a rejected result

`deduplication-conflict`, `invalid-panel-reference`, `namespace-claimed`, `no-pending-transition`, `not-closable`, `stale-origin`, `stale-panel`, `stale-transition`, `transition-blocked`, `transition-in-progress`, `unrepairable-position`, `unsupported-breakpoint`

A rejection never carries descriptor content or an application exception message. That is a guarantee about what a diagnostic may contain, not only about its shape.

## Behaviour, accessibility, and styling hooks

These live in the package README, which ships inside the tarball, and each is enforced by the contract suite:

| Area | Where | What is frozen |
| --- | --- | --- |
| Navigation and guards | README "API", "Navigation" | Branch Replacement, Guard Outcomes, atomic commit, document limits and fail-closed rules |
| Accessibility | README "Accessibility" | F6 region cycling as the only claimed key, one polite live region, the single Panel Focus Owner, dialog inertness and focus return, reduced motion |
| Custom properties | README "Theming" | every `--canvas-*` token the package reads, its default, and the three override positions. The suite fails on a token the stylesheet knows and the table does not, and on a documented default that has drifted from the one declared |
| Integration attributes | README "Theming" | the complete `data-canvas-*` table; an attribute the package emits and that table does not name fails the gate |
| Cascade layer | README "Theming" | the layer name `canvas-panels`, and that nothing is emitted outside it |
| Testing tools | README "Testing" | a fake or builder for every published seam |

## Navigation documents, fixtures, and migrations

The persisted contract is versioned separately from the package, and outlives it: a bookmarked URL may be arbitrarily old.

- **The Navigation Parameter** is `v<n>.<base64url-canonical-json>`, written to the query string named by `navigationParameterName` (`canvas` by default). Its `v<n>.` prefix versions the transport. An unrecognised version fails closed to a Recovery Panel rather than a partially reconstructed stack.
- **Descriptor versions** are per Panel Kind and owned by the application. The ordered migration chain must be complete back to version 1, and a historical migration is never removed.
- **Limits**: 16 KiB, 32 Panels, 32 levels of descriptor nesting. Unknown fields, duplicate keys, unsafe property names, transient or unknown Kinds, unsupported future versions, malformed descriptors, and codec failures all fail closed.
- **Fixtures**: `buildNavigationDocument` from the testing subpath is the only way to construct a *historical* descriptor version from outside the engine, which can encode the current one only. Pin each historical version with a test that migrates it forward; that test is the fixture, and it is what makes "never remove a migration" checkable.

Restoration is a Guarded Transition: `restoreStack({ references })` moves the stack in one operation, and Panels shared with the current stack keep their identity and are never guarded.

## Compatibility and the runtime support matrix

| Requirement | Supported | Verified how |
| --- | --- | --- |
| Node.js | `^22` or `^24` | the complete gate runs on both |
| React | `>=19 <20`, required peer | packed clean consumer |
| React DOM | `>=19 <20`, required peer | packed clean consumer |
| Next.js | `>=15 <17`, optional peer | packed clean consumer builds against Next 16; the lower half of the range is declaration only |
| Module format | ESM only, ES2022, no global polyfills, no CommonJS build | packed artifact inspection |
| Runtime dependencies | none | packed artifact inspection |
| Browsers | current Chromium, Firefox, Safari and their mobile equivalents | automated in Chromium only; the rest are declared from the standard features used — `inert`, `structuredClone`, `AbortSignal`, cascade layers, `color-mix()`, `matchMedia` |

Peer ranges are part of the contract: widening one is a minor release, narrowing one is breaking.

## Not in the contract

- `data-testid` attributes, and the DOM structure inside a Panel body.
- The spelling of a Panel Instance ID. Its *scope* — numbered from one within its own Panel Engine — is contractual; `canvas-panel-<n>` is not.
- Any module path other than the nine code subpaths and the stylesheet above. Deep imports into `dist` are unsupported and are proven unreachable by the packed-consumer gate.
- The internal module layout, and the identity of any object the package does not document as stable.

## Known limitations

Recorded in "Support" in the package README, so a consumer reads them from the tarball rather than from this repository. None blocks a release; all are true at the time of the version that ships them.
