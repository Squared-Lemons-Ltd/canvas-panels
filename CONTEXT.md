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

## Navigation Adapter

An adapter that synchronizes a Navigation Document with an external navigation mechanism such as browser history or an application router.

## URL-Owning Canvas Workspace

The one primary Canvas Workspace explicitly authorised to synchronize its Navigation Document with an application URL namespace.

## Recovery Panel

A package-owned Transient Panel that explains why navigation state could only be partially restored and offers safe recovery actions.

## Panel Registry

The host-owned catalogue of Panel Kinds and the policies required to present and coordinate them.

## Bound Canvas Module

The application-specific React namespace produced by closing a Root Panel and a set of Panel definitions into one immutable Panel Registry. It exposes typed providers, components, hooks, commands, read models, and testing helpers without requiring callers to repeat registry generics.

## Context Signal

An optional, application-typed, in-memory value published by a mounted Panel for an application-selected Context Target. Canvas Panels stores and selects the value but does not interpret, serialize, log, announce, or infer it from rendered content.
