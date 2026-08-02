# PodMule Canvas Panels capability and divergence audit

- **Research ticket:** [Audit PodMule’s Canvas Panels capabilities and divergences](https://github.com/Squared-Lemons-Ltd/canvas-panels/issues/3)
- **Source audited:** PodMule checkout `feat/unified-upload-router` at `5fddaa607645bf65a512b07a215bcaacf18c90e1` (2026-08-02)
- **Source root:** `/Users/jonathangill-moss/Developer/Squared Lemons/Apps/PodMule/podmule-app`
- **Package target:** `Squared-Lemons-Ltd/canvas-panels`

## Executive conclusion

PodMule has outgrown the portable implementation described in `docs/CANVAS_PANEL_SCOPE.md`. It is no longer only a list-to-detail horizontal panel pattern: it is an application-wide navigation substrate spanning more than twenty page canvases, a modal global overlay, event-driven agent/action openings and updates, deep-link/history restoration, responsive single-panel navigation, cross-domain rendering, ambient AI context, ephemeral editors, and rich in-memory action payloads.

The reusable package should extract a **headless panel-stack/navigation kernel** plus optional adapters (URL/history, responsive presentation, modal overlay, registry, dirty-state coordination, and focus/context reporting). It should **not** copy PodMule's `EntityType` union, domain payloads, API calls, agent semantics, or renderer imports.

The highest-priority gaps to resolve before extraction are:

1. dirty-state protection is local to `BasePanel` controls and is bypassed by Escape, browser Back/Forward, stack truncation, and programmatic close;
2. the current writing-draft stream auto-opens/updates panels despite `LEARNINGS.md` explicitly saying streamed chat data must not auto-mutate canvas layout;
3. URL deserialization casts untrusted strings to `EntityType` without validation and the comma-delimited codec has no escaping contract;
4. registry, event transport, focus semantics, and dedupe identity are useful but currently hard-coded to PodMule assumptions.

## Evidence base and documentation status

The audit covers the current implementation and focused tests under `apps/app/src/components/canvas/`, the portable Canvas Panel scope, Canvas-related ADRs, `LEARNINGS.md`, and the repository `DESIGN.md`.

**Citation convention:** paths are relative to the PodMule source root above. A bare Canvas core filename such as `canvas-context.tsx` means `apps/app/src/components/canvas/canvas-context.tsx`; all non-core files are cited with their full repository-relative path.

- `docs/CANVAS_PANEL_SCOPE.md:14-29` defines the original portable mental model: fixed root list, rightward drill-down, branch truncation, URL serialization, keyboard navigation, resizing, and an unsaved-change guard.
- The same document's embedded reference is now stale in material ways: it prescribes `replaceState` only (`docs/CANVAS_PANEL_SCOPE.md:196-202,381-396`), `scrollIntoView` (`docs/CANVAS_PANEL_SCOPE.md:153-156,402-407`), and no responsive single-panel or global-overlay architecture.
- `DESIGN.md` is a generic Uber-inspired token/design document. Its component inventory begins at `DESIGN.md:107-258` and does not define Canvas Panel behavior, responsive policy, accessibility, panel widths, navigation state, or overlay semantics. It should not be treated as the Canvas Panels specification.
- The strongest current behavior contract is therefore the implementation plus tests, with ADRs/LEARNINGS used to identify intent and contradictions.

## Capability inventory beyond Hospitality Finder

PodMule demonstrates that Canvas Panels can support substantially more than event/list management.

### Product and content workflows

| Use case | Evidence | Framework implication |
|---|---|---|
| Episodes and nested intelligence/RSS/create/plan flows | `apps/app/src/components/episodes/EpisodesCanvasView.tsx:60-84,120-203`; `apps/app/src/app/(app)/[workspace]/[show]/episodes/[id]/EpisodeCanvasView.tsx:61-127` | A section can have several local action/editor panel types, not only root + record detail. |
| Contacts, groups, interviews and cross-entity drill-down | `apps/app/src/components/contacts/ContactsCanvasView.tsx:21-119`; `apps/app/src/components/groups/GroupsCanvasView.tsx:17-95`; `apps/app/src/components/interviews/InterviewsCanvasView.tsx:20-88` | Cross-entity navigation and per-view renderer allowlists are first-class. |
| Shows and settings subsections | `apps/app/src/components/shows/ShowCanvasView.tsx:20-128`; `apps/app/src/app/(app)/[workspace]/[show]/settings/ShowSettingsCanvasView.tsx:126-358,603-616` | Root panels need not always be a literal list; settings sections and seeded initial stacks are valid. |
| Clips, articles and email campaigns/editors | `apps/app/src/components/clips/ClipsCanvasView.tsx:21-109`; `apps/app/src/components/articles/ArticlesCanvasView.tsx:24-139`; `apps/app/src/components/emails/EmailsCanvasView.tsx:467-533,1539-1541` | Canvas supports media preview/edit, persisted documents, and complex embedded editors. |
| Ephemeral assisted writing | `docs/adr/0003-ephemeral-writing-draft-panels.md:3-7`; `apps/app/src/components/canvas/writing-draft-panel.tsx:36-137,149-313` | Some panels are session-only working copies with streaming updates, revisions, copy baselines, and explicit destinations. |
| Persisted writing destination with live agent generation | `docs/adr/0008-articles-as-first-persisted-writing-destination.md:3-16`; `apps/app/src/components/canvas/entity-panel-article.tsx:78-153,189-213,305-420` | Saved-record editors and ephemeral drafts have different persistence/dirty contracts even when both use the same chrome. |
| Knowledge/intelligence relationship traversal | `apps/app/src/components/knowledge/EpisodeIntelligenceView.tsx:157-186,405-588`; `docs/adr/0013-wiki-augmented-rag-knowledge-layer.md:98-101` | Graph-like backlinks and related-record traversal benefit from arbitrarily deep stacks. |
| Unified upload as a contextual action panel | `apps/app/src/components/media/upload-router-launch.ts:9-16,34-67`; `apps/app/src/components/canvas/panel-registry.tsx:233-241,244-262` | Actions can open beside a caller when inside a canvas and fall back to a global overlay elsewhere. Payloads may be rich and callback-bearing, so URL persistence must be opt-out. |

### Operational, developer and administrative workflows

PodMule also mounts Canvas Providers for API documentation, integrations, media, prompt libraries, workflow authoring/review/admin, organization management, staff operations, and billing/admin consoles:

- `apps/app/src/components/agents/AgentApiCanvasView.tsx:36-61`
- `apps/app/src/components/automation/AutomationApiCanvasView.tsx:514-577,707`
- `apps/app/src/components/integrations/IntegrationsCanvasView.tsx:97-167`
- `apps/app/src/components/media/MediaCanvasView.tsx:26-47`
- `apps/app/src/components/prompt-library/WorkspacePromptLibraryView.tsx:46-48,397-400`
- `apps/app/src/components/workflows/WorkflowBuilderClient.tsx:36-38,114-152`
- `apps/app/src/components/workflows/WorkflowListClient.tsx:115-173,309-327,410-479,704-747`
- `apps/app/src/components/workflows/WorkflowReviewCanvasClient.tsx:27-90`
- `apps/app/src/app/(app)/admin/organizations/OrganizationManagementClient.tsx:253-281`
- `apps/app/src/app/(app)/admin/staff/StaffConsoleClient.tsx:3894-3907`
- `apps/app/src/app/(app)/admin/workflows/WorkflowAdminCanvasClient.tsx:120-122`

This breadth argues for package vocabulary such as **panel kind**, **panel key**, **stack**, **origin**, **renderer**, and **persistence policy**, not domain names such as contact, episode, or event.

## Reusable framework capabilities present in PodMule

### 1. Panel-stack state engine

The core state is an ordered `PanelState[]` with active panel, open, close, truncate, in-place data update, scroll registration, and panel-index helpers (`apps/app/src/components/canvas/canvas-context.tsx:97-196,609-621`).

Opening implements:

- dedupe by `(entityType, entityId)`, activation, scroll, and shallow title/data merge (`canvas-context.tsx:480-508`);
- branch origin selection, right-side truncation, append, activation, and scroll (`canvas-context.tsx:510-535`);
- an optional panel-scoped navigation hook (`canvas-context.tsx:644-653`).

Closing protects index zero, activates the previous panel, and supports explicit collapse-after (`canvas-context.tsx:538-578`). These mechanics remain reusable, but see the dirty-state and invalid-origin problems below.

### 2. URL deep links and real browser history

Serializable panels use `?panels=list,type:id,...`; `writing-draft` and `upload` are explicitly excluded because their state cannot be reconstructed (`canvas-context.tsx:214-240`). Initial state is deterministic, then restored from the URL after mount (`canvas-context.tsx:311-351`).

PodMule now diverges from the portable scope by:

- pushing history when the serializable stack grows and replacing on close/reorder (`canvas-context.tsx:353-401`);
- restoring on `popstate`, but only while the pathname remains the canvas route (`canvas-context.tsx:403-433`);
- preserving retained panel object identity for prefix Back navigation, including eligible in-memory panels (`canvas-context.tsx:243-273`).

Tests verify push-on-open, replace-on-close, Back/Forward restoration, no feedback-loop writes, retained identity, pathname protection, mount-from-deep-link, and `syncUrl={false}` (`apps/app/src/components/canvas/canvas-context.test.tsx:50-205`).

This is a stronger and more useful browser-navigation contract than the original `replaceState`-only scope.

### 3. Container-local scrolling and deep-stack navigation

`scrollToPanel` deliberately computes an offset and calls the container's `scrollTo`, avoiding `scrollIntoView` moving the document or ancestors under a fixed sidebar (`canvas-context.tsx:453-478`).

For stacks of three or more, desktop renders an accessible breadcrumb with jump-to-panel and “Close all” controls (`apps/app/src/components/canvas/canvas-container.tsx:16-61`). Keyboard navigation supports Left/Right/Home/End/Escape, scoped to focus inside the canvas and suppressed for editable descendants (`canvas-container.tsx:77-140,198-205`). Tests cover ordinary inputs/textareas and mobile suppression (`canvas-container.test.tsx:37-104`) plus breadcrumb behavior (`canvas-container.test.tsx:159-219`).

### 4. Responsive single-panel presentation

Below 768 px (`apps/app/src/hooks/use-mobile.ts:3-22`):

- keyboard panel navigation is disabled (`canvas-container.tsx:77-81`);
- only the deepest rendered child is visible, while earlier children remain mounted with `display:none` to preserve state (`canvas-container.tsx:142-163`);
- the row becomes full width and horizontal overflow is disabled (`canvas-container.tsx:165-192`);
- panels become `width:100%`, lose `minWidth`, and hide the resize handle (`apps/app/src/components/canvas/base-panel.tsx:192-195,342-346,438-449`).

Tests verify retained-but-hidden earlier panels, full-width root, desktop parity, and no mobile resize handle (`canvas-container.test.tsx:106-157`; `base-panel.test.tsx:172-204`).

This is materially beyond the original desktop-only portable scope. It is nevertheless a binary breakpoint policy; there is no tablet/intermediate mode, max-visible-panel policy, width persistence, touch resizing, or adaptive header/toolbar overflow contract.

### 5. Reusable panel chrome and extension slots

`BasePanel` exposes width/min/max/resizable, header actions, header title prefix, badge hiding, toolbar left/right, custom content scrolling, close callback, width callback, dirty flag, context identity, entity id, and preview URL (`base-panel.tsx:135-188`).

Additional useful extension seams are:

- `CanvasPanelHeaderActions`, a portal allowing deeply nested editor content to register controls in panel chrome (`base-panel.tsx:41-64,388-395,431-436`), tested at `base-panel.test.tsx:118-130`;
- `PanelToolbar`, a conditional named toolbar with two slots, toolbar semantics, and a 44 px minimum target band (`apps/app/src/components/canvas/panel-toolbar.tsx:6-35`; `panel-toolbar.test.tsx:5-74`);
- custom scroll ownership via `contentClassName` (`base-panel.tsx:143-146,431-436`);
- per-panel preview links and arbitrary header actions (`base-panel.tsx:397-425`).

### 6. Shared renderer registry with per-view capability allowlists

The registry centralizes reusable cross-entity renderers while leaving roots, create/edit actions, settings, and admin panels local to their views (`apps/app/src/components/canvas/panel-registry.tsx:20-36`). A `PanelRenderContext` supplies workspace/show context, an allowlist, and optional cross-link/update callbacks (`panel-registry.tsx:38-60`). Registered shared types and renderers are at `panel-registry.tsx:62-77,81-242`; the upload action is intentionally universal rather than allowlisted (`panel-registry.tsx:244-262`).

Tests verify dispatch, composite episode-id decoding, optional callbacks, data-gated panels, allowlists, missing IDs, and view-local fallback (`panel-registry.test.tsx:76-194`).

The reusable concept is sound, but the package should expose registration/configuration APIs instead of importing PodMule components or defining a central application-wide string union.

### 7. App-wide overlay and event-driven open/update

A second Canvas Provider is mounted once as an application-wide overlay with URL sync disabled (`apps/app/src/components/canvas/global-canvas-overlay.tsx:33-52`). Lightweight `CustomEvent` helpers open a panel or shallow-merge data into an already-open panel without reactivation/scroll (`apps/app/src/components/canvas/canvas-events.ts:3-48`). The overlay listens for both events and no-ops updates when the target is no longer open (`global-canvas-overlay.tsx:55-85`).

Page canvases can intercept an open event, mutate `_handled`, and keep the entity in the local stack rather than duplicating it in the overlay. Articles demonstrate this, intentionally appending beside unsaved panels (`apps/app/src/components/articles/ArticlesCanvasView.tsx:66-84`).

Agent output uses the same bridge:

- first writing-draft observation opens a panel; later throttled observations update it without scroll churn (`apps/app/src/components/chat/agent-chat-provider.tsx:468-501`);
- completed `create_*` tools open their returned entity (`apps/app/src/components/chat/agent-chat-provider.tsx:643-692`);
- job/write completion separately broadcasts view reloads instead of overwriting open editor state (`apps/app/src/components/chat/agent-chat-provider.tsx:535-579,643-664`).

The universal upload launcher adds `useOptionalCanvas`: open contextually inside a canvas, otherwise use the overlay (`apps/app/src/components/media/upload-router-launch.ts:34-67`; `canvas-context.tsx:637-642`).

Reusable concerns are an optional command bus and a local-vs-global routing policy. PodMule event names, `_handled` mutation, agent tool mapping, and data shapes are domain/application concerns.

### 8. Modal accessibility and focus restoration

The overlay is a labelled modal dialog and implements initial focus, Tab/Shift+Tab trapping, focus parking, and opener-focus restoration (`global-canvas-overlay.tsx:103-150,165-178,190-198`). It also closes on Escape (`global-canvas-overlay.tsx:93-101`).

Individual panels are labelled regions, become programmatically focused when active, and provide labelled Back/Close/Preview controls (`base-panel.tsx:320-350,351-425`). The canvas and breadcrumb are labelled regions/navigation (`canvas-container.tsx:23-59,165-193`), and streaming article activity uses status/live-region semantics (`entity-panel-article.tsx:357-377`).

These provisions should be retained and formalized as tested package contracts, not incidental markup.

### 9. Ambient context focus layers

Entity panels can report a generic Context Record Identity. The current implementation intentionally follows the **deepest/rightmost** panel rather than `activePanelId`, because bubbled list-row clicks could leave the list highlighted after opening a detail (`base-panel.tsx:203-210,253-288`; `LEARNINGS.md:119-126`).

The bridge has page and overlay layers, with overlay precedence handled by the consumer. Reports use process-unique per-mount owner tokens so stale unmount cleanup cannot clear a newer panel that reused `panel-1` (`apps/app/src/components/canvas/ambient-focus.tsx:6-20,23-75,91-109`). ADR-0018 establishes screen-mirroring ambient context and explains why route parsing is insufficient for panel-only records (`docs/adr/0018-navigation-aware-ambient-agent-context.md:3-20`).

The reusable kernel may expose a generic “visible/deepest panel changed” signal. Context Record types, AI conversation policy, layer names, and the meaning of focus belong in a PodMule adapter.

## Behavioural divergences and unresolved limits

### Dirty state is not a stack-level invariant

`BasePanel` prompts only when its own Back or Close control calls `handleClose` (`base-panel.tsx:220-251,452-469`). The state engine itself has no close veto, dirty registry, or async transition guard.

Consequences:

- Canvas Escape calls `closePanel` directly (`canvas-container.tsx:123-129`), bypassing `BasePanel`.
- Overlay Escape collapses to root (`global-canvas-overlay.tsx:93-101`), bypassing every panel guard.
- `openPanel` truncates downstream panels directly (`canvas-context.tsx:510-528`).
- breadcrumb “Close all” calls `closePanelsAfter` directly (`canvas-container.tsx:49-58`).
- browser Back/Forward replaces stack state directly (`canvas-context.tsx:403-428`).
- application code can call `closePanel` directly after delete or workflow actions.

Only a small subset of editors wire `hasUnsavedChanges` (for example Article at `entity-panel-article.tsx:189-192,305-315`, Clip at `apps/app/src/components/canvas/entity-panel-clip.tsx:555-561`, and prompt editor at `apps/app/src/components/prompt-library/WorkspacePromptLibraryView.tsx:397-400`). The writing-draft requirements explicitly require the guard (`docs/brainstorms/2026-05-26-writing-draft-panel-requirements.md:38-39,47-48`), but `WritingDraftPanel` passes no `hasUnsavedChanges` prop in its `BasePanel` configuration (`writing-draft-panel.tsx:149-206`), and its tests cover render/copy only (`writing-draft-panel.test.tsx:41-68`).

**Package requirement:** every stack transition that can remove a panel must go through one transition coordinator capable of collecting dirty panels, asking for confirmation once, and then committing/cancelling the transition. Panel chrome must not own the only guard.

### Stream auto-opening contradicts recorded learning

`LEARNINGS.md:224-229` says streamed chat data must remain render data and panels should open only after explicit user action because repeated effects caused update-depth failures and hijacked layouts. The current persistent agent instead auto-opens and auto-updates writing-draft panels from streamed message state (`apps/app/src/components/chat/agent-chat-provider.tsx:468-501`), with signature throttling as mitigation.

This may be a deliberate later product reversal, but no ADR in the audited source supersedes the learning. Extraction should not encode either behavior. Provide explicit `open`/`update` commands and require host policy to decide when streamed data may issue them; add idempotency keys/versioning if automatic streams are supported.

### URL codec and restoration are permissive

`deserializePanels` casts arbitrary URL strings to `EntityType` without checking a registry/allowlist (`canvas-context.tsx:275-297`). The codec splits panel segments on commas and has no escaping/versioning contract (`canvas-context.tsx:214-240,275-297`), so IDs containing commas cannot round-trip. Data and titles are intentionally not serialized; restored panels must refetch and may temporarily lack dependencies.

A concrete hard-won failure: an email-template editor restored before asynchronous template data loaded initialized to defaults and did not reinitialize (`LEARNINGS.md:168-173`).

**Package requirement:** versioned codec, registry validation, explicit invalid-entry behavior, per-kind persistence policy, and a documented loading contract for restored renderers. Consider structured/encoded state rather than delimiter parsing.

### Dedupe and origin policy are too implicit

Identity is fixed to `(entityType, entityId)` (`canvas-context.tsx:489-508`). This is useful for records but problematic for multiple instances, no-ID action panels, and views where the same entity can appear under different contexts. All `upload` panels use an undefined entity ID, so a second launch updates/activates the existing upload rather than creating another; writing drafts avoid this through unique IDs.

If a non-existent `fromPanelId` is supplied, `findIndex` returns `-1`, `slice(0, 0)` removes the root, and the new panel becomes the whole stack (`canvas-context.tsx:510-528`). `parentPanelId` is stored but not used to validate ancestry. Closing a non-last panel filters only that panel and can leave descendants with stale parent relationships (`canvas-context.tsx:538-558`).

**Package requirement:** injectable/explicit `panelKey`, dedupe policy (`reuse`, `replace`, `allow-many`), validated origin behavior, and defined close semantics (`close-one`, `close-branch`, `close-to-root`).

### Active, visible, deepest, and focused are different concepts

The UI still exposes `activePanelId`, click activation, keyboard activation, and active border (`base-panel.tsx:190-218,320-350`), but ambient context follows the deepest panel (`base-panel.tsx:203-210,272-288`). The ADR calls this the “focused canvas entity panel” (`docs/adr/0018-navigation-aware-ambient-agent-context.md:5`), while `LEARNINGS.md` records why active was abandoned (`LEARNINGS.md:119-126`).

The package should name these separately:

- **active**: keyboard/border target;
- **deepest**: last panel in stack;
- **visible**: presentation-dependent (all desktop, one mobile);
- **DOM-focused**: `document.activeElement` containment;
- **context target**: host-selected policy.

Do not expose one ambiguous “focused panel” callback.

### Accessibility limits remain

Strengths are listed above, but important gaps remain:

- resize is mouse-event-only and the handle is `aria-hidden`, with no keyboard or touch-resize alternative (`base-panel.tsx:290-318,438-449`);
- active panels receive focus on a `tabIndex=-1` region, which is programmatically valid but gives no screen-reader announcement contract beyond the region label (`base-panel.tsx:320-350`);
- Canvas Escape and overlay Escape are both registered at different global levels (`canvas-container.tsx:136-140`; `global-canvas-overlay.tsx:93-101`), so overlay key behavior and dirty-state bypass need an integrated policy;
- tests cover keyboard suppression, basic labels, toolbar semantics, mobile visibility, and overlay code exists, but there is no focused test file for overlay focus trapping or a generic dirty confirmation path in the audited canvas test set.

The package should include keyboard-resizable separators (or explicitly declare resizing pointer-only/nonessential), live announcements for stack changes, deterministic Escape precedence, and automated focus-trap/return tests.

### Responsive limits remain

The implementation only distinguishes `<768 px` from desktop (`apps/app/src/hooks/use-mobile.ts:3-22`). On mobile, earlier panels remain mounted, which preserves state but can retain expensive subscriptions/editors and memory (`canvas-container.tsx:142-163`). Toolbars can contain many fixed controls—Writing Draft demonstrates three actions plus status and source text (`writing-draft-panel.tsx:160-205`)—without a framework-level overflow/collapse policy.

The package should make responsive behavior injectable and support at least:

- single/deepest panel presentation;
- horizontal multi-panel presentation;
- optional max-visible/peek mode;
- toolbar/header overflow slots;
- a host choice between retain-mounted and unmount/cache for hidden panels.

## Implementation pitfalls worth carrying forward

1. **Hydration:** deterministic initial IDs/state and post-mount URL restore are essential (`docs/CANVAS_PANEL_SCOPE.md:115-124,196-202`; `canvas-context.tsx:311-351`). PodMule additionally disables SSR for page providers because Turbopack dev hydration mismatches caused infinite RSC fetch loops (`apps/app/src/components/canvas/canvas-client-provider.tsx:17-26`). Package guidance should distinguish framework-safe deterministic SSR from the optional Next client-only adapter.
2. **Scroll ownership:** `scrollIntoView` can scroll ancestors/document under fixed app chrome; compute offsets against the canvas scroller (`canvas-context.tsx:453-478`).
3. **Nested flex scrolling:** every shrinkable ancestor needs `min-h-0`, with one intentional content scroll owner (`docs/CANVAS_PANEL_SCOPE.md:206-230,832-842`).
4. **Async deep-link restoration:** do not mount stateful editors until the record used to initialize them is loaded; reset/remount on identity changes (`LEARNINGS.md:168-173`).
5. **Stale cleanup races:** stable index IDs are not globally unique across remounts; side-effect ownership needs a per-mount token (`LEARNINGS.md:119-126`; `ambient-focus.tsx:68-75`).
6. **Heavy editors in constrained/nested panels:** Puck/GrapesJS behavior, iframe sizing, global ProseMirror CSS, and stale dynamic chunks all caused panel-specific failures (`LEARNINGS.md:128-180`). Framework docs should require editor-local CSS/scroll ownership and browser verification.
7. **Explicit width constraints:** stable preview/form layouts required fixed fraction widths and non-shrinking preview media; native video was more reliable (`LEARNINGS.md:231-235`). Width is renderer content policy, not core stack policy.
8. **Reuse domain content components:** group detail/edit behavior was extracted for page and panel reuse (`LEARNINGS.md:237-238`). Renderers should compose domain components rather than fork them for Canvas.
9. **Keep event modules leaf-level:** PodMule separates event dispatch from the heavy overlay/registry to avoid importing all renderers and creating cycles (`apps/app/src/components/canvas/canvas-events.ts:3-8`). Preserve this dependency direction.
10. **Do not shallow-copy app state into persistence:** upload config contains callbacks and rich objects and is correctly memory-only (`canvas-context.tsx:155-163,224-233`; `apps/app/src/components/media/upload-router-launch.ts:9-16`). Persistence policy belongs to panel registration.

## Reusable framework boundary

### Extract into `canvas-panels`

1. **Headless stack store/provider**
   - generic `PanelDescriptor<Kind, Payload>`;
   - open/reuse/replace/allow-many, close-one/branch/all, active/deepest selectors;
   - validated origins and stable runtime IDs;
   - atomic transition coordinator with before-remove/dirty veto.
2. **Persistence/history adapter**
   - versioned, validated codec;
   - per-kind serializable/transient registration;
   - push-on-open/replace-on-collapse policy and Back/Forward restoration;
   - retained-prefix identity optimization;
   - `syncUrl=false` for nested/global canvases.
3. **Presentation primitives**
   - container-local scroll and registered panel elements;
   - desktop horizontal layout, mobile single/deepest policy, breadcrumb;
   - keyboard navigation with editable-target suppression;
   - panel region/chrome, Back/Close/Preview, header portal, toolbar slots, content-scroll override;
   - focus management and optional accessible resizing.
4. **Renderer registry**
   - host registration by kind;
   - per-view allowlists/capabilities;
   - typed render context and local fallback.
5. **Optional overlay/command adapter**
   - open/update/close commands with idempotency/version keys;
   - local interception/routing without mutating shared event payloads;
   - modal focus trap and focus return.
6. **Signals/extensions**
   - explicit active/deepest/visible/DOM-focus change signals;
   - host-defined context-target policy;
   - optional retain-mounted strategy.

### Keep in PodMule

- the 60-ish literal `EntityType` values (`apps/app/src/components/canvas/canvas-context.tsx:21-82`);
- Context Record Identity and ambient AI conversation behavior;
- writing-draft reducer/stream protocol, article live generation, create-tool routing, job reloads, and agent events;
- upload destination/config/callback types;
- episode composite ID codec, workspace/show/timezone context, API calls, permissions, toasts, forms, editors, and entity labels;
- PodMule renderer imports and view-specific `allowed` sets;
- `podmule:*` event names and tool-name-to-panel mappings.

## Recommended extraction acceptance criteria

1. Core navigation tests cover dedupe policies, invalid origins, branching, non-last close semantics, and stable root invariants.
2. Every transition that removes a dirty panel—button, Escape, breadcrumb collapse, open/truncate, programmatic close, overlay close, and popstate—uses one confirm/veto path.
3. URL tests cover validation, versioning, malformed/unknown kinds, reserved delimiters, transient interleaving, prefix identity retention, Back/Forward, and no-write restores.
4. Responsive tests cover desktop multi-panel, mobile deepest-only, retained-vs-unmounted policy, and resize/toolbar behavior.
5. Accessibility tests cover labels, focus-on-open, focus return, trap boundaries, Escape precedence, editable keyboard targets, stack-change announcements, and keyboard resizing or a documented non-resizable mode.
6. Registry tests use host-defined kinds and payloads; no PodMule imports exist in the package core.
7. Overlay command tests cover local interception without duplicate global opening, idempotent updates, stale/closed targets, and no forced scroll on updates.
8. An integration fixture proves a page canvas and `syncUrl=false` overlay can coexist without fighting over history.

## Bottom line

PodMule contributes the strongest evidence that Canvas Panels should be designed as a **composable navigation framework**, not a copied component trio. Its best reusable additions are real history restoration, responsive deepest-only presentation, a renderer registry, app-wide overlay commands, context-aware action launching, header/toolbar extension slots, modal focus handling, and explicit active/deepest distinctions. Its most important warnings are that dirty protection must move into the state transition layer, stream-driven layout mutation requires host policy and idempotency, and URL/dedupe semantics must become validated and configurable before they are published as a reusable contract.
