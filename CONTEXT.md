# Canvas Panels domain glossary

## Canvas Workspace

A navigation surface that presents an ordered Panel Stack and coordinates its interaction and lifecycle rules.

## Panel

A single contextual surface within a Canvas Workspace. A Panel contains host-owned content and participates in workspace navigation.

## Root Panel

The permanent first Panel in a Canvas Workspace. It is host-defined and cannot be removed; it need not be a list.

## Panel Stack

The ordered, linear sequence of Panels in one Canvas Workspace.

## Origin

The Panel from which another Panel is opened.

## Branch Replacement

Opening from an earlier Panel preserves that Panel and everything to its left, removes the Panels to its right through the guarded-transition process, and appends the newly opened Panel.

## Panel Kind

A host-defined category that determines how a Panel is rendered and which identity, persistence, sizing, and lifecycle policies apply.

## Panel Instance ID

The unique runtime identity of one open Panel instance.

## Panel Key

An optional stable semantic identity used by a Panel Kind’s deduplication policy.

## Active Panel

The Panel targeted by workspace keyboard navigation and active-state presentation.

## Deepest Panel

The final Panel in the logical Panel Stack.

## Visible Panel

A Panel currently presented by the active responsive policy.

## DOM-Focused Panel

The Panel containing the browser’s currently focused element.

## Context Target

An optional, host-selected Panel used as ambient context by an application concern such as assistance, analytics, or help.

## Persistent Panel

A Panel whose registered policy permits a validated, versioned descriptor to be reconstructed outside its current runtime.

## Transient Panel

A Panel that exists only in the current runtime and is not reconstructed from navigation state.

## Guarded Transition

A proposed Panel Stack change that may remove Panels and must resolve every affected lifecycle guard before it commits atomically.

## Transition Guard

A Panel-level interface that reports whether a proposed destructive transition may proceed, needs a human decision, or is temporarily blocked.

## Guard Outcome

One of `allow`, `confirm`, or `block`, returned by a Transition Guard without performing side effects.

## Navigation Document

A versioned, validated description of the persistent Panels needed to reconstruct a Canvas Workspace independently of runtime Panel Instance IDs.

## Panel Engine

The framework-neutral module that owns Canvas Workspace state, commands, transitions, guards, and Navigation Documents without depending on React or browser APIs.

## Declared Breakpoint

One of the package-owned responsive presentations—desktop, tablet, or mobile—that selects which retained Panels a Canvas Workspace currently presents. A Declared Breakpoint changes presentation only: it never alters Panel instances, logical order, the Active Panel, the Stack Version, or transition history.

## Navigation Parameter

The versioned, namespaced query-string encoding of a Navigation Document, written as `v<n>.<base64url-canonical-json>`. It is the transport form only; validating and restoring the document it carries remains the Panel Engine's responsibility.

## Navigation Adapter

An adapter that synchronizes a Navigation Document with an external navigation mechanism such as browser history or an application router.

## URL-Owning Canvas Workspace

The one primary Canvas Workspace explicitly authorised to synchronize its Navigation Document with an application URL namespace.

## Panel Region

One visible Panel considered as a landmark a keyboard user moves between. F6 and Shift+F6 cycle the Panel Regions a presentation is currently showing, wrapping at both ends; a retained but hidden Panel is not a Region, because it is not somewhere focus should be able to land. Region cycling is the only key the Canvas claims: normal DOM Tab order is untouched, and no arrow or letter shortcut is registered globally.

## Canvas Announcement

A sentence the Canvas puts into its single polite live region to describe a structural change—a Panel opening or closing, a Branch Replacement, or a change of presentation. Activation, focus, and sizing are deliberately not announced structurally: they are either already conveyed by focus moving or reported by the control that caused them. Every sentence comes from a replaceable template so a Canvas can be localized, and dialog errors bypass the region entirely, using an assertive status instead.

## Panel Separator

The control on a Panel's trailing edge that resizes it, by pointer or by keyboard. One sizing engine serves both, so the two cannot disagree about clamping or about what counts as a change, and a resize is announced only once it settles.

## Stack Restoration

Moving a Panel Stack to a named set of Panels in one operation, resolving every affected Transition Guard as a single Guarded Transition and committing atomically. Panels the target stack shares with the current one keep their identity and are never guarded, so restoration disturbs only what actually changes. It is how a Navigation Adapter applies a traversal the browser has already made, and is distinct from Branch Replacement, which is driven by opening from an Origin.

## History Namespace

The URL namespace a single URL-Owning Canvas Workspace claims, named by its Navigation Parameter. The first Workspace to claim a History Namespace owns it; any later Workspace claiming the same one—a secondary Workspace on the page, or one nested inside a Panel—is refused and navigates in memory instead. A refused claim is reported, never thrown.

## Canvas History Entry

The opaque key and index a Navigation Adapter stamps onto a browser history entry to mark it as belonging to a given History Namespace. The key identifies the entry; the index places it in the Workspace's own sequence, which is what makes the direction and distance of a Back or Forward traversal derivable. An entry the Workspace did not stamp is not its own and is left to the application's routing; an entry whose metadata is absent or malformed is treated as unrepairable rather than resolved by guessing a direction.

## Navigation Intent

How a Navigation Adapter should record the transition that produced a snapshot. Meaningful persistent navigation reports `push`; normalization reports `replace`; activation, presentation, and transient UI report `none`.

## Recovery Panel

A package-owned Transient Panel that explains why navigation state could only be partially restored and offers safe recovery actions.

## Panel Registry

The host-owned catalogue of Panel Kinds and the policies required to present and coordinate them.

## Bound Canvas Module

The application-specific React namespace produced by closing a Root Panel and a set of Panel definitions into one immutable Panel Registry. It exposes typed providers, components, hooks, commands, read models, and testing helpers without requiring callers to repeat registry generics.

## Panel Editor

The optional, package-owned coordinator that turns what an application reports about its own editing—whether the record is loading, whether the draft is dirty, and how to save, discard, or reload it—into the one lifecycle its Panel registers. It owns no form, schema, repository, server action, permission, or domain content: it decides only how application-owned operations meet a Guarded Transition. A write in flight blocks, because a transition must not commit over a half-written record, and it keeps the Panel guarded even once the draft is clean. Reading never blocks, because a read has nothing to lose. Otherwise unsaved work asks a human and a settled editor allows. It is imported from its own subpath, and no base entry point can reach it.

## Editor Operation

One run of a Panel Editor's save, discard, or reload, carrying the abort signal that cancels it and the Guarded Transition that asked for it—or `null` when the application asked directly. Only one runs at a time: an operation the coordinator wants and the application has already started is joined rather than run twice, and anything else waits for it to settle. An operation that was cancelled is not a failure.

## Context Signal

An optional, application-typed, in-memory value published by a mounted Panel for an application-selected Context Target. Canvas Panels stores and selects the value but does not interpret, serialize, log, announce, or infer it from rendered content.

## Public Contract

The documented package exports, behaviours, schemas, accessibility guarantees, compatibility ranges, semantic styling hooks, and integration attributes protected by the package’s versioning policy. Undocumented implementation details are not part of this contract.

## Proof Consumer

The first real application installation used to verify that the published package, documented integration boundary, and complete acceptance gates work outside package fixtures. Project Holly is the v1 Proof Consumer.

## Package Gate

The complete package-level verification checkpoint—public contracts, fixtures, accessibility, compatibility, packed installation, documentation, and release controls—that must pass before a version can be installed into the Proof Consumer.
