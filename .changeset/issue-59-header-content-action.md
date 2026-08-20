---
"@squaredlemons/canvas-panels": minor
---

**A Canvas Action can now render application content in the Panel header.** Until now `Canvas.Action` took a label and a handler and the package rendered a button, which covered every header control but one: the composite that no label string describes — a live status readout with a state icon, a ticking duration, truncated error text and its own embedded Cancel button, which hides itself when there is nothing to report. Across a forty-control migration exactly one control could not convert, and the package's own reference application hit the same wall. It had to go in a toolbar at the top of the Panel body, visually separated from every other Panel-level control.

`Canvas.Action` now takes one of two shapes:

```tsx
<Canvas.Action id="rename" label="Rename" onSelect={rename} />
<Canvas.Action id="job-status" priority={10} content={job ? <JobStatus job={job} /> : null} />
```

The compiler holds the two apart: a registration carrying both a `label`/`onSelect` pair and `content`, or neither, does not compile. Both shapes come out of one sorted row — `priority` descending, ties broken by `id` — so a readout takes its place among the buttons instead of being parked at one end, and `id` stays unique per Panel across both.

Content is **registered, not portalled**. It reaches the header through the same registration path a button uses, so the package renders it as part of its own tree and no application DOM races the package's re-renders. What that buys, and what it costs:

- Re-rendering content re-registers nothing. The current render is held in a store the registration owns, so a readout ticking once a second costs one small re-render of its own slot; registration identity moves only when `id` or `priority` does.
- React context resolves at the header. Providers above the Workspace reach content; a provider rendered *inside* a Panel renderer does not — pass what the content needs into the element, or lift the provider.
- Content runs in its own Panel's scope, so `useNavigation`, `usePanel`, and `usePresentation` inside it default to the Panel that registered it rather than to the Active Panel. It may register nothing further: a nested `Action`, `useHeader`, or `useLifecycle` inside content throws.
- Content that throws is dropped from the row and reported through `onRendererError`, exactly as a body failure is. The header shows no notice, the rest of the Canvas is untouched, and the next content the application renders is attempted again.

The wrapper the package puts around content is a plain `div` with no ARIA role and no `tabIndex`, so the header's semantics, the single Panel Focus Owner, and normal Tab order are unchanged, and interactive content inside it is reachable at the position the row gives it. Naming that content is the application's job — the package cannot name what it did not render.

This is a constrained escape hatch and not a header slot: there is still no ref, no portal target, and no way to reach the rest of the header. Anything that reduces to a label and a handler should stay a button Action, which the package can lay out, disable, mark destructive, name, and keep as a pointer target. The boundary is now written down in the README rather than found mid-migration.

**Additions to the Public Contract**: the `content` shape of `Canvas.Action`, its ordering and scoping rules, and the `data-canvas-action-content` attribute. Nothing is removed: every existing button Action registration compiles and renders exactly as before, and a `readonly CanvasActionProps[]` still holds them. One stylesheet rule is narrowed to match: the automatic margin that pushes the action row to the trailing edge is now a direct-child selector, so a button an application renders *inside* header content is no longer given the margin that lays out the row. An application styling the package's own header buttons is unaffected.

**One published type narrowed, and reading it needs an edit.** `CanvasActionProps` is now the union `CanvasActionButtonProps | CanvasActionContentProps`, so `label` and `onSelect` are no longer unconditionally present on it. Building an action is unaffected — that is the overwhelmingly common use, and it was checked — but reading one of those members straight off the type stops compiling with `error TS18048: 'action.label' is possibly 'undefined'`:

```diff
 function labelOf(action: CanvasActionProps) {
-  return action.label.toUpperCase();
+  return "content" in action ? "" : action.label.toUpperCase();
 }
```

Narrow with `"content" in action`, or name the half you mean: `CanvasActionButtonProps` is exported for it. This is written down because a published type that changes shape is a change to the Public Contract, whether or not anyone is reading that member.

Closes #59.
