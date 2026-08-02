# Project Holly Canvas Panels consumer audit

**Research ticket:** [Audit Project Holly as the first Canvas Panels consumer](https://github.com/Squared-Lemons-Ltd/canvas-panels/issues/4)  
**Project Holly snapshot inspected:** local tracked source at commit `5f02a321cb605ead9636fb02421b79601e98495a`  
**Canvas Panels repository base:** `3a49b94d0ef03b46e9b64a8823f83f548a720354`

## Executive answer

Project Holly contains two relevant but separate implementations:

1. A **legacy Learning Manager** is a standalone, dependency-free HTML/CSS/JavaScript application served by a Bun/SQLite admin server. This is where the existing horizontal Canvas Panels interaction lives. It is a useful behavioural reference, but it is not a viable package-consumer proof because it is not React and has no package manifest of its own.
2. The **current SaaS teacher application** is a Next.js App Router application on React 19, Tailwind CSS 4 and shadcn-style UI primitives. It currently uses route-level list/detail pages rather than Canvas Panels. This is the correct first package consumer.

The strongest low-risk proof is a **read-only Classes → Class → Student drill-down in the current SaaS teacher application**. The proof should preserve the existing tenant-scoped server queries and domain content, replacing only the navigation/composition surface for this journey. It exercises nested panel opening, ordered history, responsive presentation and returning to context without involving profile edits, membership changes, deletes, lesson generation or learner-facing code.

This recommendation is deliberately a proof boundary, not a package design. Public API, routing semantics, mobile interaction and guarded lifecycle remain decisions for the downstream capability, prototype and grilling tickets.

## Scope and privacy

This audit inspected only tracked source, repository metadata and synthetic test fixtures. It did **not** inspect local learner profile directories, databases, credentials, deployment records or live services. No learner names, local deployment URLs or other personal data are reproduced here.

## 1. Current architecture

### 1.1 Legacy Learning Manager: the existing Canvas Panels reference

The `/manage-learning` command starts a separate Bun admin server after the lesson server and opens the Learning Manager locally. The command documents the split between the lesson viewer and Learning Manager and their shared SQLite database (`ProjectHolly/.claude/commands/manage-learning.md:33-54`, `ProjectHolly/.claude/commands/manage-learning.md:125-137`).

The admin server:

- is a standalone Bun HTTP server (`ProjectHolly/.holly/admin/server.js:1-15`);
- initializes and directly accesses SQLite (`ProjectHolly/.holly/admin/server.js:40-61`);
- serves `index.html` for `/`, proving that the panel implementation in that file is the active legacy UI rather than `index-v2.html` (`ProjectHolly/.holly/admin/server.js:1493-1527`); and
- owns profile and class API routes in the same file, including list/detail profile routes and class routes (`ProjectHolly/.holly/admin/server.js:933-954`, `ProjectHolly/.holly/admin/server.js:1019-1047`, `ProjectHolly/.holly/admin/server.js:1292-1312`, `ProjectHolly/.holly/admin/server.js:1350-1377`).

The UI is a 2,731-line single HTML file containing CSS, markup, state, data fetching, rendering and mutation logic. There are no imports or framework boundaries around the panel system (`ProjectHolly/.holly/admin/index.html:1-7`, `ProjectHolly/.holly/admin/index.html:1271-1297`).

### 1.2 Current SaaS application: the viable consumer

Project Holly is now also a pnpm/Turborepo workspace. Its root scripts delegate development, build, tests and typechecking through Turbo (`ProjectHolly/package.json:1-14`). The current web application is a Next.js App Router application whose relevant versions are:

| Constraint | Current version/source |
|---|---|
| Package manager | `pnpm@10.18.3` (`ProjectHolly/package.json:2-4`) |
| TypeScript | `^6.0.2` (`ProjectHolly/package.json:11-14`) |
| Next.js | `16.2.1` (`ProjectHolly/apps/web/package.json:22-38`) |
| React / React DOM | `19.2.4` (`ProjectHolly/apps/web/package.json:35-38`) |
| Tailwind CSS | `4.2.2` (`ProjectHolly/apps/web/package.json:44-53`) |
| shadcn CLI | `^4.1.1` (`ProjectHolly/apps/web/package.json:35-42`) |
| UI primitive foundation | `@base-ui/react ^1.3.0` (`ProjectHolly/apps/web/package.json:22-30`) |
| Playwright | `^1.58.2` (`ProjectHolly/apps/web/package.json:44-46`) |
| Test runner | Bun via `bun test` (`ProjectHolly/apps/web/package.json:6-17`) |

The teacher shell is an authenticated App Router server layout. It resolves the session and active organisation on the server, queries teacher-shell counts in parallel, and renders a desktop sidebar plus mobile navigation (`ProjectHolly/apps/web/src/app/(teacher)/layout.tsx:1-28`, `ProjectHolly/apps/web/src/app/(teacher)/layout.tsx:30-55`).

Tenant isolation is explicit: every server component/action accessing scoped data must call `requireTenantSession()` and pass `organisationId` into the repository layer (`ProjectHolly/apps/web/src/lib/tenant.ts:1-6`, `ProjectHolly/apps/web/src/lib/tenant.ts:16-34`). The query layer repeats that contract and scopes class/student lookups to the organisation (`ProjectHolly/apps/web/src/lib/queries.ts:1-7`, `ProjectHolly/apps/web/src/lib/queries.ts:98-127`, `ProjectHolly/apps/web/src/lib/queries.ts:140-144`).

**Integration consequence:** the reusable package must not become a data, authentication or permissions layer. Project Holly must continue to resolve tenant context and load domain data through its server components/query layer. A client-side panel surface will need consumer-owned content/loading boundaries rather than direct access to Holly repositories.

### 1.3 Package repository readiness

The new package repository currently has only repository guidance and a two-line README describing a reusable framework; it has no `package.json`, source tree, build, test or release configuration (`README.md:1-2`; repository file inventory at base commit). Therefore this audit cannot validate installation yet. The proof must be performed after the package foundation and private distribution work establish a real installable artifact.

## 2. Existing Canvas Panels behaviour

### 2.1 Layout and visual model

The legacy layout has a fixed 200px sidebar beside a horizontally scrolling flex canvas (`ProjectHolly/.holly/admin/index.html:81-98`, `ProjectHolly/.holly/admin/index.html:161-173`). Panels have fixed defaults and hard limits: 420px default, 320px minimum, 900px maximum; list and wide variants are 500px and 600px (`ProjectHolly/.holly/admin/index.html:189-217`).

The DOM has one focusable canvas container. Panels are generated into it dynamically, while sidebar buttons switch between Classes and Students; Courses is disabled (`ProjectHolly/.holly/admin/index.html:1214-1240`).

### 2.2 State and navigation

State is held in page-level mutable arrays/objects:

- ordered `panels`;
- one `activePanelId`;
- `sidebarView`;
- loaded `profiles`, `classes` and memberships; and
- per-panel state for tabs, forms, fetched details and dirty flags (`ProjectHolly/.holly/admin/index.html:1273-1297`).

Initial loading fetches profile/class lists in parallel, then performs one membership request per profile (`ProjectHolly/.holly/admin/index.html:1310-1333`). Switching sidebar view rewrites the root list panel and truncates all panels to its right (`ProjectHolly/.holly/admin/index.html:1349-1370`).

Opening an entity:

- reactivates it if it is already open;
- truncates descendants after the source panel;
- appends one new panel;
- rerenders the whole canvas; and
- scrolls the new panel into view (`ProjectHolly/.holly/admin/index.html:1425-1465`).

Closing a panel removes it and every descendant to its right. A direct close checks the panel's dirty flag and offers save/discard (`ProjectHolly/.holly/admin/index.html:1468-1497`, `ProjectHolly/.holly/admin/index.html:1499-1515`). However, opening a different branch silently discards dirty descendant state (`ProjectHolly/.holly/admin/index.html:1434-1447`). This inconsistency is a behavioural risk to resolve in the package lifecycle contract, not copy as-is.

### 2.3 Deep links, history and keyboard

The stack serializes as `view` and comma-separated `type:id` query parameters. Initialization reconstructs list, class and student panels from that query (`ProjectHolly/.holly/admin/index.html:1381-1423`). Updates use `history.replaceState`, not push-state history (`ProjectHolly/.holly/admin/index.html:1529-1546`). There is no `popstate` handler in the file, so browser Back/Forward does not reconstruct panel transitions after initial load.

When the canvas itself has focus, Arrow Left/Right moves the active panel, Home/End moves to either edge, and Escape closes the active detail panel (`ProjectHolly/.holly/admin/index.html:1548-1591`). The implementation rerenders the full canvas for active-state changes (`ProjectHolly/.holly/admin/index.html:1517-1520`, `ProjectHolly/.holly/admin/index.html:1597-1613`), so focus continuity is not explicit.

The HTML uses clickable `div` cards for entity navigation (`ProjectHolly/.holly/admin/index.html:1711-1747`) and panel containers use click handlers rather than semantic region/list structures (`ProjectHolly/.holly/admin/index.html:1646-1667`, `ProjectHolly/.holly/admin/index.html:1686-1707`). This is useful prototype behaviour but insufficient accessibility evidence for a reusable v1.

### 2.4 Representative workflows already supported

The legacy Canvas supports these concrete workflows:

1. **Classes list → class → student.** A class member opens a student panel to the right of the class panel (`ProjectHolly/.holly/admin/index.html:2155-2176`).
2. **Students list → student → related class membership editing.** Student tabs include Basic, Interests, Classes, Learning, Display and Summary (`ProjectHolly/.holly/admin/index.html:1785-1818`); membership checkboxes save through class-member endpoints (`ProjectHolly/.holly/admin/index.html:1897-1917`, `ProjectHolly/.holly/admin/index.html:2382-2408`).
3. **Class member management.** A class panel can add a student through a search popup or remove a member in-place (`ProjectHolly/.holly/admin/index.html:2155-2176`, `ProjectHolly/.holly/admin/index.html:2542-2558`, `ProjectHolly/.holly/admin/index.html:2608-2616`).
4. **Entity editing with guarded close.** Forms set per-panel dirty state and save through consumer-owned endpoints (`ProjectHolly/.holly/admin/index.html:2281-2334`).

The strongest reusable interaction is the first workflow. The remaining workflows add mutation, confirmation, error handling and privacy-sensitive content before basic package installation/navigation has been proved.

## 3. Current responsive state

### 3.1 Legacy Canvas Panels

The legacy panel implementation is desktop-first rather than responsive:

- there are no `@media` rules in `ProjectHolly/.holly/admin/index.html`;
- the sidebar remains a fixed 200px and panels retain a 320px minimum width (`ProjectHolly/.holly/admin/index.html:85-98`, `ProjectHolly/.holly/admin/index.html:189-195`);
- overflow is handled by horizontal scrolling rather than a distinct tablet/mobile presentation (`ProjectHolly/.holly/admin/index.html:165-173`); and
- resizing is mouse-only (`mousedown`/`mousemove`/`mouseup`) with 320–900px clamping and no pointer/touch equivalent (`ProjectHolly/.holly/admin/index.html:2697-2728`).

Thus the legacy code demonstrates a desktop panel chain, not the map's required full desktop/tablet/mobile v1 behaviour.

### 3.2 Current SaaS shell

The modern teacher application already has a responsive shell:

- its desktop sidebar is hidden below the `md` breakpoint (`ProjectHolly/apps/web/src/components/teacher/app-sidebar.tsx:61-68`);
- a `md:hidden` menu opens navigation in a left-side Sheet on smaller screens (`ProjectHolly/apps/web/src/components/teacher/mobile-nav.tsx:57-80`); and
- the classes index changes from one to two to three columns across base, `sm` and `lg` breakpoints (`ProjectHolly/apps/web/src/app/(teacher)/classes/page.tsx:14-26`, `ProjectHolly/apps/web/src/app/(teacher)/classes/page.tsx:46-49`).

This shell is the right place to prove the package's eventual responsive model. The proof should not assume that the legacy horizontal overflow behaviour is the mobile answer; that interaction is owned by the responsive prototype ticket.

## 4. Test state and evidence gaps

### 4.1 Legacy panel implementation

No test files reference `.holly/admin/index.html` or exercise its panel stack. Its behaviour is therefore supported by implementation and historical notes, not automated regression evidence. The project's recorded learning explains the original modal-context problem, the intended ordered panel chain, URL serialization and on-demand profile loading (`ProjectHolly/LEARNINGS.md:9-25`, `ProjectHolly/LEARNINGS.md:36-79`).

### 4.2 Current SaaS application

The current application has meaningful lower-layer coverage relevant to the proof:

- query tests verify active class members, ordering and empty states (`ProjectHolly/apps/web/src/lib/__tests__/queries.test.ts:241-290`);
- query tests verify learner detail with related classes and empty relationships (`ProjectHolly/apps/web/src/lib/__tests__/queries.test.ts:512-545`); and
- class-management E2E tests cover synthetic learner creation/listing and invalid inputs (`ProjectHolly/apps/web/e2e/tests/teacher/class-management.spec.ts:1-20`, `ProjectHolly/apps/web/e2e/tests/teacher/class-management.spec.ts:47-107`).

But those E2E tests interact through an API helper, not the App Router teacher UI. The Playwright project runs only Desktop Chrome and has no tablet/mobile project (`ProjectHolly/apps/web/e2e/playwright.config.ts:28-45`). CI runs the E2E suite against PostgreSQL but does not add browser/device coverage beyond that config (`ProjectHolly/.github/workflows/e2e.yml:8-45`).

**Proof acceptance implication:** package installation is not genuinely proved by unit tests in the package alone. Project Holly needs a browser test that opens the teacher Classes surface, drills into a class, opens one synthetic student, verifies the ordered contexts, and exercises the package's agreed narrow/mobile presentation at representative viewport(s). The test must use synthetic records only and assert no personal content.

## 5. Recommended first proof workflow

### Workflow

**Teacher Classes index → open a class context → open one student context from that class → close/back to class → close/back to Classes.**

Use existing synthetic fixtures and keep all content read-only for the first acceptance slice.

### Why this is the strongest low-risk proof

1. **It demonstrates the panel value, not just rendering.** Current class detail links replace the page when opening a student (`ProjectHolly/apps/web/src/app/(teacher)/classes/[id]/page.tsx:99-128`). The student's related classes link back to class routes (`ProjectHolly/apps/web/src/app/(teacher)/students/[id]/page.tsx:75-104`). A panel chain preserves these related contexts side by side.
2. **It reuses established domain queries.** Class detail already loads class, students and courses in parallel under tenant scope (`ProjectHolly/apps/web/src/app/(teacher)/classes/[id]/page.tsx:17-28`); student detail already resolves its learner under the same tenant contract (`ProjectHolly/apps/web/src/app/(teacher)/students/[id]/page.tsx:17-24`).
3. **It is low risk.** No profile fields, memberships, consent state, course state, lesson jobs or learner data are mutated.
4. **It is representative.** The legacy implementation's most natural chain is exactly class → student (`ProjectHolly/.holly/admin/index.html:2155-2176`), while the modern app already has production-shaped class and student pages.
5. **It can prove installation and responsive behaviour.** The modern app matches the target React/Tailwind foundation and already has desktop/mobile shell conventions.

### Explicit non-goals for the first proof

Do not include:

- creating, editing, activating or deleting learners;
- adding/removing class memberships;
- unsaved-form guards;
- course creation or lesson generation;
- summary/feedback/profile-sensitive tabs;
- migration or removal of the legacy Learning Manager; or
- a final decision on package API, URL grammar or mobile composition.

These would obscure whether the package itself is installable and useful.

## 6. Integration constraints to carry forward

### Must preserve

- **React 19 / Next.js 16 compatibility.** Project Holly's consumer versions are exact and should be represented in the package compatibility/CI decision.
- **Tailwind 4 and existing shadcn-style primitives.** The consumer already owns design tokens and UI components; the package must not impose Holly-specific colours or duplicate the application theme.
- **App Router server/client boundaries.** Tenant resolution and database queries currently happen in async server components. Interactive panel state will be client-side, so data/content ownership must cross that boundary deliberately without moving tenant credentials or repositories into the package.
- **Tenant and privacy boundaries.** Every entity lookup must remain organisation-scoped. Serialized navigation should use opaque entity identifiers only and must never contain names, ages, interests, notes or feedback.
- **Consumer-owned routing.** Existing canonical routes (`/classes/:id`, `/students/:id`) and ordinary links already work. Any adapter should preserve direct navigation, refresh and no-JavaScript fallback rather than making the package state the only route to content.
- **Consumer-owned domain actions.** The package may orchestrate navigation/lifecycle, but Holly must retain forms, mutations, authorization and errors.
- **Responsive shell coexistence.** The package must fit inside the current teacher layout alongside the desktop sidebar or mobile Sheet, not replace global application navigation.
- **Synthetic browser fixtures.** Acceptance evidence must not read local learner databases or profiles.

### Legacy lessons to preserve as requirements, not code

- Ordered parent/child context and branch truncation.
- Reactivating an already-open entity rather than duplicating it.
- Scroll/focus movement toward a newly opened context.
- Deep-link reconstruction.
- Keyboard navigation.
- Guarded close semantics that are consistent for close, branch replacement, route changes and browser history.
- Consumer-controlled entity titles/content and on-demand detail loading.

### Legacy behaviours not safe to copy without a decision

- Whole-canvas `innerHTML` rerendering.
- Mouse-only resize.
- Fixed-width desktop overflow as the only small-screen model.
- Clickable non-semantic `div` cards.
- `replaceState` without browser-history handling.
- Silent dirty-state loss when changing branches.
- Per-profile N+1 membership loading.
- Embedding data fetching and mutations directly into panel framework state.

## 7. Suggested proof acceptance evidence

This is evidence the implementation ticket should eventually collect; it is not a final package design:

1. `@squaredlemons/canvas-panels` is declared as a normal dependency of `@holly/web` and resolves from the approved private distribution channel.
2. A clean install and Project Holly build/typecheck succeed with the consumer's pinned pnpm, React, Next.js, TypeScript and Tailwind versions.
3. Package tests pass independently.
4. A Project Holly Playwright test using synthetic data verifies Classes → Class → Student → back/close.
5. The same journey is verified at agreed desktop and narrow/mobile viewport(s), with no horizontal page overflow outside the chosen interaction model.
6. Keyboard-only operation verifies open, active-context movement and close/back; focus is observable after each transition.
7. Direct reload of the agreed class/student deep link reconstructs the expected context without exposing personal fields in the URL.
8. Existing tenant-scoped query tests and current teacher routes continue to pass.
9. The legacy `.holly/admin` app remains untouched until a separate migration decision.

## Conclusion

Project Holly is a credible first consumer only through its current React SaaS teacher application, not by extracting the legacy monolithic HTML implementation. The legacy Learning Manager supplies useful behavioural evidence and exposes gaps—especially mobile behaviour, browser history, focus/accessibility and consistent dirty-state handling. A read-only Classes → Class → Student drill-down is the smallest workflow that proves the package can install into the target stack and improve a real relationship-navigation task while preserving Holly's authentication, tenant scoping, data ownership and learner privacy.
