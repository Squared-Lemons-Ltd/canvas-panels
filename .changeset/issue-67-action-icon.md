---
"@squaredlemons/canvas-panels": minor
---

**A button Action can now carry an icon beside its label.** A header control's label is a `string`, so the ordinary admin verbs — Preview, Save, Publish, Unpublish, Delete — arrived on the package without the glyphs they had before. 0.3.0's `content` shape did not answer it: the two shapes are mutually exclusive, so adding an icon to a Save button meant giving up `disabled`, `destructive`, the accessible naming, the layout, and the pointer target, and re-implementing all of it for a glyph.

The button shape takes an optional `icon`:

```tsx
<Canvas.Action id="publish" label="Publish" icon={<PublishIcon />} onSelect={publish} />
```

It renders inside the button the package already owns, before the label, in a `span` marked `aria-hidden` and named `data-canvas-action-icon`. The button keeps everything it had: its layout, its place in the sorted row, its disabled and destructive treatment, and the pointer target the row protects.

**`label` stays a `string`, and it stays the whole accessible name.** The button is named by an `aria-label`, so an icon cannot join the name, be read as content of its own, or be relied on to say anything — which is what lets the package go on relying on `label`, and what stops an icon-only control being registered by accident. The package styles only the gap and the optical alignment; the glyph's size and colour are the application's, and `currentColor` carries the disabled and destructive treatment down to it.

An icon written inline at the call site is a new element on every render, so the registration holds a store rather than the node, exactly as a content Action does. Re-rendering an icon re-renders that one header slot and re-registers nothing.

**Additions to the Public Contract**: `icon` on the button shape of `Canvas.Action`, the guarantee that `label` remains the whole accessible name, and the `data-canvas-action-icon` attribute. `icon` is `?: never` on the content shape, which already renders whatever it likes inside its own wrapper. Nothing is removed, and an Action that registers no icon renders exactly as it did before.

Closes #67.
