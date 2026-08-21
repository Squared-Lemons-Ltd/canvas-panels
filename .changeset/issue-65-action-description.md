---
"@squaredlemons/canvas-panels": minor
---

**A button Action can now say why it is the way it is.** `Canvas.Action` has always taken `disabled`, and there has never been anywhere to put the reason. "Publish" greyed out with no explanation is a dead end: a user cannot tell whether they lack a permission, whether a required field is empty, or whether the thing is already published. The package renders the button itself, so an application could not add one either without selecting a package element, which the README forbids.

The button shape takes an optional `description`:

```tsx
<Canvas.Action
  id="publish"
  label="Publish"
  disabled={!canPublish}
  description={canPublish ? undefined : "Add a summary before publishing."}
  onSelect={publish}
/>
```

The package renders it as the button's **accessible description**: a visually-hidden element inside the button, named `data-canvas-action-description`, which the button points `aria-describedby` at. It is announced as a description rather than as part of the name, and it is reachable by keyboard and by touch — deliberately not a `title` tooltip, which is neither.

**It is rendered whenever it is supplied, not only while the Action is `disabled`.** The disabled case is what the reporter needed and what motivated it, but the description of a control is not a state of it, and one that vanished the moment the control became available would be a change the application never asked for. An application that wants the description only while the Action is unavailable passes `undefined` when it is not, as above.

The description is rendered *inside* the button rather than beside it. That is not incidental: the header row is laid out by direct-child adjacency — `> button + button` is what takes back the automatic margin that pushes the row to the trailing edge — so a sibling element between two buttons would throw the control after it to the far side of the header. Inside, and taken out of flow, it costs the row nothing and costs the button nothing, so an Action carrying one is still the same pointer target the `flex: 0 0 auto` rule protects for WCAG 2.5.8.

**Additions to the Public Contract**: `description` on the button shape of `Canvas.Action`, the rule that it renders whenever it is supplied, and the `data-canvas-action-description` attribute. `description` is `?: never` on the content shape, which already owns everything inside its own wrapper. Nothing is removed, and an Action that registers no description renders exactly as it did before.

Closes #65.
