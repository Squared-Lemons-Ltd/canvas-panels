---
"@squaredlemons/canvas-panels": minor
---

Let a Panel Kind declare its own width: `definePanel({ width })`.

A Panel's width used to resolve only from `--canvas-panel-width` and
`--canvas-panel-active-width`, which meant it lived in a stylesheet, physically
separated from the `definePanel` call that names the Kind. A Kind no width rule
mentioned inherited the package default with nothing raised — no type error, no
warning, and nothing visibly broken. `definePanel` now takes an optional
`width`:

```ts
const classPanel = definePanel({
  kind: "class",
  title: (input: { name: string }) => input.name,
  width: { resting: "28rem", active: "min(48rem, 92vw)" },
});
```

`resting` is the Panel's width in the stack, `active` its width as the Active
Panel. They are two separate custom properties, so either half stands alone —
declare one and the other stays themed — but a `width` that declares neither is
a type error rather than a declaration that quietly does nothing. Values are CSS
lengths, percentages, `calc()`, `min()`, `max()`, `clamp()`, or `var()`
references; anything else throws a `TypeError` from `definePanel`, on the line
that wrote it rather than on the first surface that opens that Panel.

**A declared width wins over the stylesheet for that Kind.** It is resolved onto
those same two custom properties on the Panel element itself, and a value
declared on an element beats one inherited into it from `:root`, from an
ancestor, or from the Workspace. Declare a Kind's width, or theme it in CSS, not
both. Two things still outrank it, and both should: the narrow presentations,
which set `flex-basis` directly so a wide Kind never carries its desktop column
onto a phone, and a Panel Separator drag, because a person moved it.

Additive throughout. A Kind that declares nothing renders exactly the markup it
did before, with no style attribute at all, and the CSS seam is unchanged for
it. `defineRootPanel` takes no `width`; a Root Panel is still themed in CSS.
