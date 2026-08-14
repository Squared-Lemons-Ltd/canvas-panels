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

The runtime identity of one open Panel instance, unique within the Panel Engine that issued it and numbered from one. It is deliberately not unique beyond that Engine: a Canvas Workspace rendered on a server and hydrated in a browser is two Engines, and an identity that counted Engines could never agree across them. Telling one Workspace's Panels from another's is the Panel Instance Ref's job, not the ID's.

## Panel Instance Ref

The handle a Panel Engine issues for one open Panel instance, naming its Canvas Workspace as well as the instance. Commands take a Ref rather than a Panel Instance ID because only a Ref can be checked against the Engine that issued it, so a Ref addressed to another Workspace is refused and a fabricated one is never honoured.

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

## Panel Focus Owner

The single component that decides where focus goes when a Panel’s body appears: the Canvas Workspace. Nothing rendered inside a Panel claims that moment—the renderer failure boundary reports that it replaced a body and never moves focus itself—because two claimants for one moment never settle and re-render each other indefinitely.

Two different things count as a body appearing, and each is a claim on the Active Panel that the Workspace honours exactly once. Activating a Panel gives focus to whatever that Panel registered as its initial focus; a Panel that registered nothing is left as the application left it. A renderer failure replacing the body, or a retry restoring it, gives focus to the failure notice and then to the Panel’s own heading—both rendered by the package, so a swapped body never waits on an application registration and never strands the user on the document body. The two are counted separately, so a Panel that has recovered once is an ordinary Panel again the next time it is activated.

Only the Active Panel is claimed for. A Panel that fails while another is active keeps its notice and its claim until it is activated, rather than pulling focus out of the Panel someone is working in, and a Guarded Transition dialog owning focus settles the claim behind it instead of dragging focus out in front of the modal. A transition committing is a separate moment with its own rule, and belongs to the same owner.

Focus arriving inside a Panel is not a claim. It records the DOM-Focused Panel and publishes it for Context Targets, neither of which re-opens a claim, so a Canvas settles after a focus change instead of looping.

## Overlay Workspace

A Canvas Workspace presented above the application for global or modal Panels, imported from its own subpath and reached only through the handle that created it. It is an ordinary Panel Engine with an ordinary Bound Canvas Module rendered into it: Panels open, close, guard, and announce exactly as they do in the primary Canvas, and it is presented precisely while something has been routed into it. Routing is always explicit—no context, hook, or ambient "global layer" lets a Panel reach an Overlay Workspace without naming it, and a Panel's own navigation keeps going to its own Workspace whether an overlay is up or not. Its persistence namespace is minted under a reserved prefix rather than accepted verbatim, so it can never take the Navigation Parameter a primary Canvas owns. Dismissing it is an ordinary close of the shallowest routed Panel, which resolves every affected Transition Guard as one Guarded Transition.

A modal Overlay Workspace owns the page while it is up: the main content is inert, Tab cycles within the layer, and focus returns to whatever it was taken from. A non-modal one changes nothing about Tab order or the reachability of the page behind it. Presenting the overlay is itself a claim on focus, honoured exactly once and only when the Panel Focus Owner inside it placed focus nowhere—the overlay never competes with it, and never takes focus back once it has been moved.

## Overlay Inner Layer

An application-owned menu, popover, or listbox open inside an Overlay Workspace, registered with it for exactly as long as it is open so that Escape closes it first. The overlay neither renders nor closes it: registering says only that something nested is open and names what to call, which is what lets an application keep its own transient UI without the overlay having to know what that UI is.

## Overlay Escape Order

Which layer an Escape belongs to, resolved innermost first. A Guarded Transition dialog is innermost: it is raised by the overlay's own dismissal, it renders above everything with the rest inert, and its Escape means Stay, so letting the overlay act on the same keypress would cancel a dismissal and immediately request it again. Below it come the Overlay Inner Layers, and then the modal overlay itself. The order stops there: with nothing routed into it an overlay renders no layer at all, so no Escape can reach it and the key goes to the focused Canvas Panel and the application by the ordinary route—which is what keeps Escape usable once an overlay has gone.

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

## Resource

Anything an application's Panels show that more than one of them may be showing at once. It is entirely application-owned: Canvas Panels never learns what a Resource is, where it comes from, or who may see it—only that two Panels are looking at the same one.

## Resource Key

The opaque, application-defined name of one Resource, written as `/`-separated segments. Canvas Panels compares Resource Keys and nothing else: it never parses a segment, resolves what one names, fetches it, caches it, or decides who may see it. A subscription names either an exact Resource Key or a pattern in which `*` stands for exactly one segment in any position.

## Resource Invalidation

The announcement that the Resource one Resource Key names has changed or been deleted. It carries the publisher's own opaque token, so whoever made the change is not told to re-read it, and it says whether the Resource Keys nested beneath it are invalidated too. Propagation runs downward only: whether a parent's change means its children changed is the application's judgement, so the publisher makes it, and a child's change never implies anything about its parent.

## Resource Exchange

The optional, package-owned point where the Panels of one Canvas Workspace tell each other that a Resource they show has changed or gone. Recipients are fixed when an invalidation is published and delivered in publication order, so a Panel that publishes in response to being told never interleaves with the delivery that told it. It owns no fetching, cache, repository, permission, or domain schema, and a Workspace nested inside a Panel can be given its own so nothing it publishes leaves it.

## Panel Resource

The optional, package-owned coordinator that turns one Panel's Resource Keys, its own report of whether it has unsaved work, and the re-read it supplies into the decision of when what the Panel hears may replace what it is showing. It owns no fetching, cache, repository, permission, or domain schema, and it registers no lifecycle of its own: it defers to what the Panel's Panel Editor—or the Panel itself—already reports. It is imported from its own subpath, and no base entry point can reach it.

## Deferred Reload

A Resource Invalidation a Panel has heard and not yet applied. Only one case reads on a Panel's behalf: a change reaching a Panel with nothing to lose and a re-read to run. Unsaved work is held, because an invalidation must never be the reason a human loses what they typed—the Panel's ordinary lifecycle settles the edit, and the held read follows by itself. A deletion is held because it is a decision rather than a refresh, and is superseded only by news about the same Resource. A read that failed is held rather than retried.

## Context Signal

An optional, application-typed, in-memory value published by a mounted Panel for an application-selected Context Target. Canvas Panels stores and selects the value but does not interpret, serialize, log, announce, or infer it from rendered content.

## Public Contract

The documented package exports, behaviours, schemas, accessibility guarantees, compatibility ranges, semantic styling hooks, and integration attributes protected by the package’s versioning policy. Undocumented implementation details are not part of this contract.

## Supported Line

The newest published minor version, and the only one that receives fixes. There is no backport branch: a fix lands on the line and is released forward. That is affordable because the package holds no persistent state, so moving between versions is a dependency change and a rollback is a reinstall.

## Release Evidence

The record of what a published version is and what was verified about it: its immutable version, the integrity of the artifact, the provenance position, the source commit, the workflow run, and the gates that passed. A version whose record is incomplete is not a released version. Promotion moves a tag onto an artifact that already has a record; it never rebuilds one, because a rebuild is a different artifact with a different record.

## Proof Consumer

The first real application installation used to verify that the published package, documented integration boundary, and complete acceptance gates work outside package fixtures. The Meridian CRM sample (`apps/crm-sample`) is the v1 Proof Consumer: it is a whole application rather than a fixture — five Canvas Workspaces across five History Namespaces, built out of a utility CSS framework — and it replaced Project Holly, which needed a second codebase and a deploy before it could say anything.

A Proof Consumer earns the name by reporting rather than absorbing. A defect it works around in its own stylesheet is a defect the next consumer meets untouched, so a finding is written down, fixed in the package, and the workaround is then deleted from the application.

## Package Gate

The complete package-level verification checkpoint—public contracts, fixtures, accessibility, compatibility, packed installation, documentation, and release controls—that must pass before a version can be installed into the Proof Consumer.
