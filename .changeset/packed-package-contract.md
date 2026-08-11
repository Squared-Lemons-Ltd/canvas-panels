---
"@squaredlemons/canvas-panels": minor
---

Complete the packed-package contract: public testing tools, artifact inspection, and documentation executable from the package output alone.

- Add the runner-neutral testing tools at the `@squaredlemons/canvas-panels/testing` subpath. `createTestIdentities` mints deterministic Workspace and Panel identities — the Panel Engine numbers its own from a process-wide counter, so what a Panel gets depends on how many engines a run built first — and `createTestClock` gives the application code around a Canvas a clock whose `advance()` runs each timer at its own due point, including timers those callbacks schedule.
- Add a fake or builder for every seam an application has to stand in for: `allowTransition`/`confirmTransition`/`blockTransition` and `createTestLifecycle` for guards, `createTestRestore` and `buildNavigationDocument` for restoration, `createTestHistory` for browser navigation, `createTestFocusTarget` for focus, `createTestViewport` for the Declared Breakpoints, and `buildPanelReadModel`/`buildPanelStack`/`buildTransitionStatus`/`buildPresentation` for the public read models.
- `createTestLifecycle` and `createTestRestore` both accept `mode: "manual"`, which leaves each write or availability check in flight until the test settles or fails it. That is the only way to observe a Canvas while a write is outstanding, which is exactly when it must not commit.
- `buildNavigationDocument` writes a canonical document at a *historical* descriptor version. The engine can only ever encode the current one, so before this there was no way to exercise a migration from outside the package.
- The testing subpath is server-safe and imports no test runner, no React, and no Canvas module. It reaches only the Declared Breakpoint queries in `core`, so it costs a consumer nothing and works unchanged under `node:test`, Vitest, or Jest.
- `canvasBreakpointQueries` now lives in `@squaredlemons/canvas-panels/core` alongside the breakpoints it describes, and is still re-exported unchanged from `@squaredlemons/canvas-panels/ui`. Both entry points expose the same frozen value, so the testing viewport cannot answer for a different breakpoint set than the Canvas presents by.
- Artifact inspection now rejects, against the package a clean consumer actually installed: secret material, a second React or React DOM, private deep imports past the exports map, a missing or stray `"use client"` directive, and an entry point that re-exports another wholesale. Against the built distribution it additionally rejects a root barrel or wildcard subpath, CommonJS or a down-levelling shim in any module, a global assignment, and any runtime dependency or install script. The packed probe drives the testing tools and a historical Navigation Document migration through the real engine.
- The package README is restructured to cover installation, architecture, API, accessibility, navigation, theming, Next.js, extensions, testing, compatibility, migration, and rollback. The tarball ships `dist` and that one README, so the gate asserts every required area is present and that every declared subpath is documented and every documented subpath is declared.

The react fixture's project Panel gains an `update` policy, and its Resource re-read now calls it. Without one, a rename heard through the Resource Exchange refreshed the Panel body while the Panel header kept the name captured when it was opened — the showcase demonstrated half the seam.

Known limitations, recorded rather than satisfied:

- A full WCAG 2.2 AA sign-off still requires a manual VoiceOver and Safari pass, which no automated gate can produce.
- Browser evidence is Chromium-only. Firefox and WebKit are not in an automated matrix, and true narrow-viewport reflow is not verifiable with the current tooling.
- The packed Next consumer builds against Next 16 only. The declared `>=15 <17` range is therefore verified at its upper end; Next 15 is supported by declaration, not by an automated build.
- The security and bundle lines are covered by structural checks — zero runtime dependencies, no install scripts, and the module-graph isolation that keeps each optional subpath out of every bundle that does not name it — rather than by a vulnerability scanner or a size budget.
