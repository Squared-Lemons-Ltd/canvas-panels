# Hospitality Finder Canvas Panels audit

**Research ticket:** [Audit Hospitality Finder’s Canvas Panels capabilities and lessons](https://github.com/Squared-Lemons-Ltd/canvas-panels/issues/2)

**Primary source:** Hospitality Finder Event Manager repository, clean working tree at commit `b77a6dd27822edbf064f1ad61c6f01d4edfdba52` (`feat/native-stock-panel-811`)

**Audit scope:** the current panel implementation, tests, UX documentation, ADRs, and recorded bug/solution documents. Paths and line numbers below are relative to the Hospitality Finder repository root.

## Decision summary

Hospitality Finder has proven the value of a horizontally stacked, context-preserving panel workspace. The reusable package should preserve its **ordered panel stack, source-scoped drill-down, URL-restorable identity, focus/scroll behaviour, responsive width clamp, dirty-state close guard, and cross-panel refresh bus**. It should also preserve the newer deep-module split in which a generic editor shell owns loading, saving, error feedback, refresh, and lifecycle while domain editors provide data and actions.

It should **not** copy Hospitality Finder’s global entity union, badge table, publish/delete/missing-data policy, page-local renderer switches, or unescaped `type:id,type:id` URL codec. Those are application concerns or known sources of drift.

Before the package promises browser-history support or complete deep links, it must close important gaps in the source implementation:

1. the current URL integration replaces one history entry and never listens for `popstate`, so Back/Forward does not traverse panel operations;
2. URL serialization drops titles, parent links, and `meta`, even though `meta` carries filters, tabs, prefill, and other drill-down context;
3. the provider has no dirty-state registry, so opening from an ancestor or closing a clean ancestor can silently remove dirty descendant panels;
4. the resize separator is mouse-only and lacks keyboard/value semantics;
5. extension rendering is distributed across page-level switches, which has already caused silent missing-panel failures.

These are package design inputs, not requests to modify Hospitality Finder.

## 1. Proven interaction model

### 1.1 Ordered stack with branch replacement

`PanelState` carries an opaque panel ID, entity type, optional entity ID, parent panel ID, title, and arbitrary metadata. `openPanel` inserts immediately after a supplied source panel and truncates panels to its right; opening an already-present `(entityType, entityId)` activates it instead of creating a duplicate. Closing a panel removes it and every descendant to its right, then activates the last survivor. This produces a linear visible stack while retaining the source relationship needed for drill-down navigation.

**Evidence:**

- State and navigation contracts: `apps/event-manager-app/components/canvas/canvas-context.tsx:9-20`, `:38-53`.
- New-panel branch replacement and duplicate activation: `apps/event-manager-app/components/canvas/canvas-context.tsx:165-222`.
- Cascade close and close-after semantics: `apps/event-manager-app/components/canvas/canvas-context.tsx:240-271`.
- Panel-scoped navigation adapter: `apps/event-manager-app/components/canvas/canvas-context.tsx:406-413`.
- The implementation guide describes the same invariants: `ai/specs/features/Canvas-Panel-Navigation-System.md:136-159`.

**Reusable contract:**

- A stack is ordered and has one active panel.
- A panel is identified separately from its application payload.
- `open(input, { from })` creates/replaces a branch.
- `activate`, `close`, and `closeAfter` are first-class commands.
- Duplicate policy must be configurable or precisely defined. Hospitality Finder deduplicates by entity type plus entity ID, not by generated panel ID.
- The root/list panel may be non-closable, but the package should express this as a panel capability (`closable: false`), not hard-code “index 0 is a list”.

### 1.2 Context-preserving drill-down

The visible stack is the user’s navigation trail. Child components call a panel-scoped callback instead of routing to a standalone page. This supports edits and read-only analytics drill-downs without losing the list, filters, or previously inspected record. The UX guide explicitly treats `PanelState.meta.filters` as an inherited analytics filter stack.

**Evidence:**

- UX model and analytics reuse: `docs/Areas/Platform/Event-Manager-Canvas-Panel-UX.md:1-17`.
- Generic navigation callback and arbitrary metadata: `apps/event-manager-app/components/canvas/canvas-context.tsx:19-20`, `:406-413`.
- Existing-panel metadata merge and explicit metadata updates: `apps/event-manager-app/components/canvas/canvas-context.tsx:189-197`, `:224-238`.

**Reusable contract:** panel payload and navigation metadata must be generic, serializable where persistence is promised, and owned by the host application’s panel definition—not by a library-wide domain union.

### 1.3 Horizontal workspace and active-panel behaviour

`CanvasContainer` renders a non-wrapping horizontal flex row in an `overflow-x-auto` region. Active changes focus and scroll the selected panel into view. A panel click activates it; new/opened panels are scrolled into view after render.

**Evidence:**

- Container layout: `apps/event-manager-app/components/canvas/canvas-container.tsx:83-100`.
- Provider scroll command: `apps/event-manager-app/components/canvas/canvas-context.tsx:151-163`.
- Active panel focus and latest-versus-earlier alignment: `apps/event-manager-app/components/canvas/base-panel.tsx:506-529`.

**Reusable contract:** the state machine should not directly query DOM IDs or schedule fixed 50 ms timers. Expose a registration/ref adapter so the React binding can perform post-commit focus and scrolling while a headless core remains deterministic.

## 2. Surface and composition contracts

### 2.1 Base panel chrome

`BasePanel` centralises the panel region, title/badge header, custom header actions, save/publish/delete/preview/close actions, scroll host, resize handle, and confirmation dialogs. It supports both static `headerActions` and dynamically registered child actions through context.

**Evidence:**

- Generic-looking props mixed with application actions: `apps/event-manager-app/components/canvas/base-panel.tsx:122-184`.
- Dynamic header-action registration: `apps/event-manager-app/components/canvas/base-panel.tsx:108-120`, `:225-231`, `:582-588`.
- Panel region and header: `apps/event-manager-app/components/canvas/base-panel.tsx:531-589`.
- Save, publish, delete, and close controls: `apps/event-manager-app/components/canvas/base-panel.tsx:622-722`.
- Child content slot and scroll convenience wrapper: `apps/event-manager-app/components/canvas/base-panel.tsx:730-764`, `:862-877`.

**Package boundary:** retain the region, title, leading/trailing action slots, active styling, close/back affordances, content slot, resize affordance, and lifecycle-guard integration. Move badge colours, preview, publish, delete, review/missing-data behaviour, and entity-specific confirmations to host-provided slots or adapters.

### 2.2 Deep editor shell

`EntityEditorShell` is the strongest reusable architecture in the implementation. It absorbs loading/error/not-found/ready states, save state and feedback, dirty propagation, configurable publish/delete strategies, and cross-panel mutation refresh. Entity wrappers become declarative descriptions of data loading and domain actions.

**Evidence:**

- Shell intent and responsibilities: `apps/event-manager-app/components/canvas/entity-editor-shell.tsx:19-33`.
- Generic loader, imperative save/reload handle, render context, and strategy types: `apps/event-manager-app/components/canvas/entity-editor-shell.tsx:35-118`.
- Load lifecycle and silent background reload: `apps/event-manager-app/components/canvas/entity-editor-shell.tsx:160-220`.
- Dirty-aware refresh reception: `apps/event-manager-app/components/canvas/entity-editor-shell.tsx:222-245`.
- Save/error/refresh flow: `apps/event-manager-app/components/canvas/entity-editor-shell.tsx:247-268`.
- Ready-state composition into `BasePanel`: `apps/event-manager-app/components/canvas/entity-editor-shell.tsx:399-421`.
- Tests cover loading, error, not-found, save feedback, publish/delete strategies, refresh emission/reception, dirty refresh protection, delete-close, and dirty propagation: `apps/event-manager-app/components/canvas/__tests__/entity-editor-shell.test.tsx:129-647`.

**Reusable contract:** provide an optional editor lifecycle controller with host-injected loader/mutations/feedback. Do not bake HTTP URL construction, “published”, cascade-delete flags, or toast wording into the core package.

### 2.3 Optional and nested contexts

Components that normally render in a panel can use an optional canvas context and degrade gracefully when standalone. A canvas can also be nested inside a fixed-width host panel with a distinct URL parameter. Refresh events bubble from the nested provider to the parent provider.

**Evidence:**

- Optional context: `apps/event-manager-app/components/canvas/canvas-context.tsx:397-404`.
- Parent-provider detection and namespaced `panelParamName`: `apps/event-manager-app/components/canvas/canvas-context.tsx:88-103`.
- Refresh bubbling: `apps/event-manager-app/components/canvas/canvas-context.tsx:320-363`.
- Nested-provider tests: `apps/event-manager-app/components/canvas/__tests__/canvas-refresh-bridge.test.tsx:46-109`.
- Fixed-width nested-canvas rule and refresh/close integration: `docs/Areas/Platform/Event-Manager-Canvas-Panel-UX.md:19-26`.

**Reusable contract:** nested workspaces need explicit persistence namespaces and an event propagation policy. Scope refresh channels by provider/workspace and let the host decide whether events bubble.

## 3. Responsive and layout behaviour

### 3.1 Width constraints

Panels have configurable initial/min/max widths (defaults 960/320/1600 px). Dragging the right edge clamps to min/max. More importantly, `BasePanel` observes the canvas viewport and clamps rendered width to the available viewport minus a gutter, preventing the panel’s far edge from becoming unreachable on smaller screens.

**Evidence:**

- Width props and defaults: `apps/event-manager-app/components/canvas/base-panel.tsx:104-106`, `:122-133`, `:186-220`.
- Mouse resize lifecycle: `apps/event-manager-app/components/canvas/base-panel.tsx:266-306`.
- `ResizeObserver` viewport measurement and clamp: `apps/event-manager-app/components/canvas/base-panel.tsx:308-330`.

**Reusable contract:** separate requested/preferred width from rendered width, clamp against both panel constraints and viewport availability, and expose measured width changes. Use Pointer Events rather than mouse-only listeners.

### 3.2 Flex/scroll invariants

The implementation repeatedly uses `min-h-0`, fixed/shrink-zero panel widths, and explicit overflow ownership. The implementation guide records the otherwise easy-to-miss rule that every flex ancestor of a tab scroll area must permit shrinking. The nested-canvas UX doc records a second hard-won invariant: a nested host panel must have a fixed width; `flex-1` collapses in the shrink-wrapped row, while `min-w-full` creates a horizontal scroll trap.

**Evidence:**

- Container and panel flex chains: `apps/event-manager-app/components/canvas/canvas-container.tsx:83-100`; `apps/event-manager-app/components/canvas/base-panel.tsx:540-548`, `:730-734`.
- Tabbed-editor `min-h-0`/overflow contract: `ai/specs/features/Canvas-Panel-Navigation-System.md:625-662`.
- Nested fixed-width and overflow exception: `docs/Areas/Platform/Event-Manager-Canvas-Panel-UX.md:19-26`.

**Package requirement:** document and test layout ownership explicitly. Supply layout primitives/classes so consumers do not have to rediscover the flex chain. Nested canvases need an acceptance test for independent inner and outer horizontal scrolling.

### 3.3 Responsive limitations to fix

- Width responsiveness is implemented; panel controls are not visibly adapted for narrow headers, so many host actions may overflow.
- Resizing is mouse-only (`onMouseDown`, document `mousemove`/`mouseup`), with no touch or pen path.
- Smooth scrolling is unconditional; the implementation does not consult reduced-motion preferences.
- Width preference is local component state and is not persisted.

These are not reasons to discard the model. They define the reusable package’s responsive acceptance criteria.

## 4. Accessibility inventory

### Proven provisions

- Canvas and every panel are labelled `role="region"` landmarks: `apps/event-manager-app/components/canvas/canvas-container.tsx:83-95`; `apps/event-manager-app/components/canvas/base-panel.tsx:531-539`.
- Panels are keyboard focusable with visible focus styling and do not steal focus from input, textarea, or select controls: `apps/event-manager-app/components/canvas/base-panel.tsx:521-529`, `:540-545`.
- Arrow Left/Right and Home/End navigate panels, but editable controls—including contenteditable and ProseMirror—are excluded so text cursor/navigation keys keep working: `apps/event-manager-app/components/canvas/canvas-container.tsx:12-22`, `:34-81`.
- The editable-control exclusion is regression-tested: `apps/event-manager-app/components/canvas/__tests__/canvas-container.test.tsx:91-129`.
- Back, preview, save, publish, delete, close, and resize affordances have accessible labels; tooltips explain disabled preview/publish states: `apps/event-manager-app/components/canvas/base-panel.tsx:554-564`, `:590-620`, `:622-690`, `:693-722`, `:766-779`.
- Unsaved and unpublish confirmations use modal alert-dialog primitives with titled/described content: `apps/event-manager-app/components/canvas/base-panel.tsx:782-857`.
- Breadcrumbs are exposed as a labelled `nav`: `apps/event-manager-app/components/canvas/canvas-container.tsx:104-139`.

### Package gaps

1. The resize handle has `role="separator"` and orientation but is not keyboard focusable and supplies no current/min/max value. The package must support keyboard increments and `aria-valuenow`, `aria-valuemin`, and `aria-valuemax` (or use a tested accessible splitter primitive).
2. Panel keyboard navigation is attached to a bubbling container listener. The editable-target guard is essential and must remain extensible for rich editors and embedded widgets.
3. Activation focuses a generic region. The package should let hosts choose focus policy (panel region, heading, first field, or preserve current focus) and restore focus to the originating trigger on close.
4. The implementation uses smooth motion without a reduced-motion fallback.
5. The source tests cover key interception but do not demonstrate resize keyboard operation, close focus restoration, dialog focus behaviour, or automated accessibility checks.

## 5. Dirty state and lifecycle

### Proven behaviour

`BasePanel` guards its own close/back/Escape operations. A dirty panel offers Cancel, Discard, and Save & Close. Delete and publish are disabled while dirty, and a failed save prevents close. The editor shell refuses background refresh while dirty, avoiding clobbering in-progress edits.

**Evidence:**

- Dirty close/back/Escape handling: `apps/event-manager-app/components/canvas/base-panel.tsx:371-410`.
- Dirty delete/publish constraints: `apps/event-manager-app/components/canvas/base-panel.tsx:412-436`, `:644-708`.
- Discard/save-and-close semantics: `apps/event-manager-app/components/canvas/base-panel.tsx:469-504`.
- Confirmation UI: `apps/event-manager-app/components/canvas/base-panel.tsx:782-816`.
- Dirty-aware cross-panel refresh: `apps/event-manager-app/components/canvas/entity-editor-shell.tsx:222-240`, tested at `apps/event-manager-app/components/canvas/__tests__/entity-editor-shell.test.tsx:544-568`.

### Hard-won dirty-state lesson

A recorded production bug showed that propagating dirty state through child state → `useEffect` → parent callback can silently fail across memoised callback boundaries. The robust pattern is to signal dirty synchronously from the event handler through a stable callback/ref, while updating local state separately. Never call the parent dirty callback from inside a state updater because that updates a parent during another component’s render.

**Evidence:** `docs/solutions/logic-errors/useeffect-memo-boundary-dirty-state-signaling.md:31-40`, `:69-83`, `:113-137`, `:147-176`.

### Critical lifecycle gap

Dirty state is local to `BasePanel`; `CanvasProvider` has no dirty registry or asynchronous close guard. Consequently:

- opening from an ancestor truncates every panel to its right without consulting them (`apps/event-manager-app/components/canvas/canvas-context.tsx:173-220`);
- closing a clean ancestor removes all descendants without consulting dirty descendants (`apps/event-manager-app/components/canvas/canvas-context.tsx:240-258`);
- page navigation, reload, and browser close have no canvas-level dirty integration in the audited core.

**Package requirement:** all destructive stack transitions must run through an asynchronous guard pipeline. A panel registers `dirty`, optional `save`, and optional `discard` capabilities with the workspace. `open-from`, `close`, `close-after`, history restoration, route changes, and workspace unmount must compute the affected panels and resolve their guards before mutating the stack. Define ordering (rightmost/deepest first is least surprising) and atomicity if one save fails or the user cancels.

## 6. URL state, deep links, and browser history

### What exists

The provider reads a configurable query parameter during initialisation, serialises the stack as comma-separated `entityType[:entityId]` segments, and writes panel changes using `window.history.replaceState(window.history.state, ...)`. The use of the existing `history.state` and direct History API is a hard-won Next.js 16 fix: `router.replace()` in an effect caused an infinite RSC refetch loop.

**Evidence:**

- Codec and configurable parameter: `apps/event-manager-app/components/canvas/canvas-context.tsx:66-94`.
- URL-or-props initialisation: `apps/event-manager-app/components/canvas/canvas-context.tsx:105-126`.
- URL update preserving framework state: `apps/event-manager-app/components/canvas/canvas-context.tsx:128-149`.
- Root-cause write-up and safe URL-only update rule: `docs/solutions/integration-issues/nextjs-16-infinite-rsc-refetch-loop.md:18-36`, `:51-74`, `:85-110`.

This is enough for basic bookmark/reload restoration of panel **types and IDs**.

### What does not exist (despite older documentation)

The implementation guide says URL state supports browser Back/Forward and lists browser navigation as a test target (`ai/specs/features/Canvas-Panel-Navigation-System.md:160-178`, `:1174-1182`). The current code does not fulfil that claim:

- every stack change uses `replaceState`, so it creates no panel-navigation history entries;
- the provider reads search parameters only for initial state and has no `popstate` listener;
- titles, parent IDs, and `meta` are omitted by `serializePanels`, and deserialisation explicitly sets `parentPanelId: undefined`;
- the delimiter codec does not escape type/ID segments itself;
- URL state wins over `initialPanels`, so once a URL stack exists, richer initial panel metadata is discarded.

This matters because current uses put tabs, filters, prefill, records, and analytics slices in `panel.meta`, while the UX contract says analytics child panels inherit parent filters (`docs/Areas/Platform/Event-Manager-Canvas-Panel-UX.md:17`). A copied codec would generate links that look shareable but restore incomplete state.

**Package requirement:** define a versioned host-provided codec over a serializable panel descriptor. Separate policies for:

- `replace` (cosmetic state, no history step),
- `push` (a panel operation should be traversable with Back/Forward), and
- external `popstate` restoration.

Preserve the router/framework’s existing history state. Validate decoded input, handle unknown panel types, define maximum URL size, and let hosts decide which metadata is safe and necessary to expose. Dirty guards must participate in history restoration.

## 7. Cross-panel consistency and refresh

The provider implements typed-and-ID-keyed pub/sub plus wildcard list subscriptions. Events carry `deleted` and `source`; source panels ignore their own events, deleted records close matching panels, and normal remote changes reload in place unless dirty. Nested providers bubble refresh events upward.

**Evidence:**

- Refresh event contract: `apps/event-manager-app/components/canvas/canvas-context.tsx:22-36`, `:51-52`.
- Subscriber registry, wildcard listeners, debug evidence, and parent bubbling: `apps/event-manager-app/components/canvas/canvas-context.tsx:293-363`.
- Entity/list hooks: `apps/event-manager-app/components/canvas/canvas-context.tsx:415-506`.
- Shell emission and reception: `apps/event-manager-app/components/canvas/entity-editor-shell.tsx:222-268`, `:270-348`.
- Refresh tests: `apps/event-manager-app/components/canvas/__tests__/canvas-refresh-bridge.test.tsx:46-109`; `apps/event-manager-app/components/canvas/__tests__/entity-editor-shell.test.tsx:413-621`.

**Reusable contract:** keep a workspace-scoped mutation/event channel with exact and wildcard topics, source suppression, delete semantics, nested propagation policy, and stable subscription callbacks. Generalise “entity type + entity ID” into a host-supplied resource key. The core should not prescribe fetching; it should emit invalidation/mutation events that adapters consume.

## 8. Extensibility: what worked and what failed

### Useful extension points to retain

- Opaque `meta` attached to panel descriptors and mergeable after opening.
- Host-defined panel content, title, header actions, and lifecycle callbacks.
- Optional canvas context for components that also render standalone.
- Namespaced nested providers.
- Declarative editor lifecycle strategies.
- Resource refresh exact/wildcard subscriptions.
- Configurable preferred/min/max width.

### Known extension failure: distributed render switches

Hospitality Finder’s `EntityType` is a large closed union and the badge config is a parallel exhaustive table. More seriously, each route historically maintained its own `switch (panel.entityType)` renderer. A recorded high-severity bug created valid panels in context that silently rendered `null` because some host pages lacked a switch case. Copy-paste drift left different pages supporting different child navigation targets.

**Evidence:**

- Current domain-heavy union: `apps/event-manager-app/components/canvas/canvas-context.tsx:6-7`.
- Parallel domain badge config: `apps/event-manager-app/components/canvas/base-panel.tsx:30-102`.
- Failure, root cause, and shared-renderer recommendation: `docs/solutions/ui-bugs/canvas-panel-entity-type-inconsistency.md:27-58`, `:72-113`.
- The long-lived learning explicitly warns that navigation can add a panel which no page renders: `docs/Resources/LEARNINGS.md:2068-2098`.

**Package requirement:** use a registry or generic render function supplied once per workspace. Unknown panel kinds must produce a visible development error/fallback, never `null`. Type the registry from the host’s descriptor map so adding a kind creates one compile-time obligation rather than edits across unrelated pages.

### Interaction-boundary lesson

A tree bug coupled expand/collapse and select/open-panel intents on one accordion trigger. The fix split interaction zones and stopped propagation from selection to expansion. Reusable panels should not assume an entire row means “open”; hosts need explicit trigger components and composable event boundaries.

**Evidence:** `docs/solutions/ui-bugs/tree-node-expand-select-conflict.md:24-55`, `:102-136`.

### Reopen/state-synchronisation lesson

Organization settings settled on a menu panel plus section detail panels. Its section↔panel synchronisation was extracted as a pure tested seam. The important invariant is that closing a panel must not be fought by lifted selection state that immediately reopens it; an explicit menu re-click should always issue `openPanel`.

**Evidence:**

- ADR decision and reopen analysis: `docs/adr/0002-org-settings-canvas-panels.md:1-36`.
- Pure resolver: `apps/event-manager-app/app/(admin)/organizations/[id]/components/organization-section-sync.ts:21-52`.
- Regression test for close→reopen: `apps/event-manager-app/app/(admin)/organizations/[id]/components/organization-section-sync.test.ts:50-85`.

**Package requirement:** keep selection/route synchronisation outside the panel reducer, provide idempotent explicit commands, and expose pure transition helpers that hosts can unit-test.

## 9. Framework concerns versus Hospitality Finder domain code

| Reusable framework concern | Keep/adapt | Hospitality Finder concern | Do not bake into the package |
| --- | --- | --- | --- |
| Ordered stack, active panel, parent/source relation, branch replacement | Headless reducer + React provider | `EntityType` values such as event, package, supplier order, insights | Host descriptor types/registry |
| Panel identity and duplicate policy | Generic key/equality hook | Entity identity as `(entityType, entityId)` | Host resource key function |
| Region, title, back/close, action slots, focus, scroll, resize | Accessible primitives | Badge labels and Tailwind colours per entity | Host decoration slot/theme |
| Dirty registration and transition guards | Workspace-level lifecycle system | Specific editor form comparisons | Host/editor adapter |
| Loading/error/not-found/save controller | Optional generic editor shell | REST URL construction, publish/unpublish, cascade delete, missing-data banner, Sonner wording | Inject strategies and feedback |
| URL/history adapter and versioned codec | Framework adapter with host codec | Fixed `panels` parameter and raw type/ID delimiter | Configurable namespace/schema |
| Exact/wildcard refresh bus and nested propagation | Generic resource invalidation bus | Entity-specific loaders and list refresh functions | Host subscribers |
| Header action registration | Slot/context API | Preview, reviews, publish, delete buttons | Composed action components |
| Layout constraints and nested-canvas contract | Tested primitives | Stock-entry-specific 1500 px choice and resource topics | Host width/content configuration |
| Unknown-kind handling | Registry validation and visible fallback | Per-page switches returning `null` | One workspace registry |

## 10. Recommended package acceptance criteria

### Must ship in the foundation

1. A headless, fully tested stack transition model: initialise, open-from, activate, close, close-after, duplicate handling, unknown IDs, and nested branches.
2. A typed host registry mapping panel descriptors to renderer and decoration; no library-owned business-entity union.
3. Accessible canvas/panel primitives with labelled regions, focus policy, editable-target-safe keyboard navigation, close/back actions, and an accessible keyboard/pointer resize separator.
4. Responsive preferred/min/max width clamping and explicit flex/overflow primitives, including nested-canvas tests.
5. Workspace-level asynchronous dirty guards covering every transition that removes panels, not just a panel’s own close button.
6. A versioned, validated host codec and history adapter supporting initial restoration, `replace`, optional `push`, and `popstate`, while preserving framework history state.
7. A generic scoped resource invalidation bus with exact/wildcard subscriptions, source suppression, deletion, and configurable parent bubbling.
8. Visible unknown-panel and decode-error fallbacks in development and safe recovery in production.

### Should ship as adapters/examples

1. A generic editor lifecycle shell for load/error/not-found/save/reload, with injected mutation and feedback strategies.
2. Breadcrumbs and action-slot registration.
3. Next.js App Router URL integration demonstrating direct History API updates without RSC loops.
4. Hospitality Finder migration examples showing list/detail CRUD, analytics filter drill-down, and a nested workspace.

### Explicitly defer to applications

Publishing policy, delete/cascade semantics, review workflows, missing-data/readiness checks, badge taxonomy, API endpoints, toasts, organization scope, and all Hospitality Finder entity components.

## 11. Verification and test lessons

The source has good focused tests around keyboard editable-target exclusions, editor lifecycle, refresh, dirty refresh protection, nested bubbling, and organization-section synchronisation. It lacks direct core tests for panel reducer semantics, URL codec/history restoration, `BasePanel` dirty-dialog transitions, responsive clamp, resize accessibility, descendant dirty guards, and unknown render types.

The package test matrix should therefore include:

- pure reducer/property tests for stack invariants;
- codec round trips, malformed/unknown/versioned inputs, and metadata policy;
- real `pushState`/`replaceState`/`popstate` integration;
- cancel/fail/save/discard paths when one or several affected panels are dirty;
- Back/Forward while dirty;
- keyboard navigation from canvas versus inputs, rich editors, and embedded widgets;
- pointer and keyboard resizing at min/max/viewport bounds;
- focus entry and restoration on open/close;
- independent nested inner/outer scrolling and refresh propagation;
- registry completeness and a visible unknown-kind fallback;
- automated accessibility checks plus keyboard-only acceptance tests.

### Audit verification run

The focused source tests were executed against the audited commit:

```text
pnpm test components/canvas/__tests__/canvas-container.test.tsx \
  components/canvas/__tests__/canvas-refresh-bridge.test.tsx \
  components/canvas/__tests__/entity-editor-shell.test.tsx \
  'app/(admin)/organizations/[id]/components/organization-section-sync.test.ts'
```

Result: **4 test files passed; 29 tests passed**.

## Conclusion

Hospitality Finder validates Canvas Panels as a reusable interaction framework, not merely a collection of sidebars. Its strongest transferable ideas are the linear context stack, source-scoped drill-down, responsive horizontal workspace, panel-scoped navigation, deep editor lifecycle shell, and cross-panel refresh bus. Its bug record also supplies the package’s most important design constraints: centralise rendering, make dirty state a workspace concern, keep URL updates framework-safe, preserve all deep-link context intentionally, separate interaction zones, and test state synchronisation as pure transitions.

The package should treat Hospitality Finder as a mature reference implementation to **extract and harden**, not code to copy verbatim.
