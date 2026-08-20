# @squaredlemons/canvas-panels

## 0.3.0

### Minor Changes

- cd26998: Let a Panel Kind declare its own width: `definePanel({ width })`.

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

- fd7e2d7: **A Canvas Action can now render application content in the Panel header.** Until now `Canvas.Action` took a label and a handler and the package rendered a button, which covered every header control but one: the composite that no label string describes — a live status readout with a state icon, a ticking duration, truncated error text and its own embedded Cancel button, which hides itself when there is nothing to report. Across a forty-control migration exactly one control could not convert, and the package's own reference application hit the same wall. It had to go in a toolbar at the top of the Panel body, visually separated from every other Panel-level control.

  `Canvas.Action` now takes one of two shapes:

  ```tsx
  <Canvas.Action id="rename" label="Rename" onSelect={rename} />
  <Canvas.Action id="job-status" priority={10} content={job ? <JobStatus job={job} /> : null} />
  ```

  The compiler holds the two apart: a registration carrying both a `label`/`onSelect` pair and `content`, or neither, does not compile. Both shapes come out of one sorted row — `priority` descending, ties broken by `id` — so a readout takes its place among the buttons instead of being parked at one end, and `id` stays unique per Panel across both.

  Content is **registered, not portalled**. It reaches the header through the same registration path a button uses, so the package renders it as part of its own tree and no application DOM races the package's re-renders. What that buys, and what it costs:

  - Re-rendering content re-registers nothing. The current render is held in a store the registration owns, so a readout ticking once a second costs one small re-render of its own slot; registration identity moves only when `id` or `priority` does.
  - React context resolves at the header. Providers above the Workspace reach content; a provider rendered _inside_ a Panel renderer does not — pass what the content needs into the element, or lift the provider.
  - Content runs in its own Panel's scope, so `useNavigation`, `usePanel`, and `usePresentation` inside it default to the Panel that registered it rather than to the Active Panel. It may register nothing further: a nested `Action`, `useHeader`, or `useLifecycle` inside content throws.
  - Content that throws is dropped from the row and reported through `onRendererError`, exactly as a body failure is. The header shows no notice, the rest of the Canvas is untouched, and the next content the application renders is attempted again.

  The wrapper the package puts around content is a plain `div` with no ARIA role and no `tabIndex`, so the header's semantics, the single Panel Focus Owner, and normal Tab order are unchanged, and interactive content inside it is reachable at the position the row gives it. Naming that content is the application's job — the package cannot name what it did not render.

  This is a constrained escape hatch and not a header slot: there is still no ref, no portal target, and no way to reach the rest of the header. Anything that reduces to a label and a handler should stay a button Action, which the package can lay out, disable, mark destructive, name, and keep as a pointer target. The boundary is now written down in the README rather than found mid-migration.

  **Additions to the Public Contract**: the `content` shape of `Canvas.Action`, its ordering and scoping rules, and the `data-canvas-action-content` attribute. Nothing is removed: every existing button Action registration compiles and renders exactly as before, and a `readonly CanvasActionProps[]` still holds them. One stylesheet rule is narrowed to match: the automatic margin that pushes the action row to the trailing edge is now a direct-child selector, so a button an application renders _inside_ header content is no longer given the margin that lays out the row. An application styling the package's own header buttons is unaffected.

  **One published type narrowed, and reading it needs an edit.** `CanvasActionProps` is now the union `CanvasActionButtonProps | CanvasActionContentProps`, so `label` and `onSelect` are no longer unconditionally present on it. Building an action is unaffected — that is the overwhelmingly common use, and it was checked — but reading one of those members straight off the type stops compiling with `error TS18048: 'action.label' is possibly 'undefined'`:

  ```diff
   function labelOf(action: CanvasActionProps) {
  -  return action.label.toUpperCase();
  +  return "content" in action ? "" : action.label.toUpperCase();
   }
  ```

  Narrow with `"content" in action`, or name the half you mean: `CanvasActionButtonProps` is exported for it. This is written down because a published type that changes shape is a change to the Public Contract, whether or not anyone is reading that member.

  Closes #59.

### Patch Changes

- 0d8222f: Clamp the narrow presentation's breadcrumb trail to one scrolling line.

  `[data-canvas-breadcrumbs]` was a wrapping flex row carrying each retained
  Panel's full title, which made the trail's height unbounded in the length of
  those titles. A fixture never shows it — "Class A" fits three-abreast on one row
  — and a real application always does: the first consumer to render the mobile
  presentation against its own data measured a **three-deep stack at 284px tall on
  a 390×844 viewport**, roughly a third of the screen spent on breadcrumbs before
  any Panel content.

  The trail is now one line that scrolls within itself. Each crumb is clamped to a
  line, ellipsised, and capped at `12rem`; the trail is the only flex item in the
  navigation bar that may take or lose the leftover width, so the bar no longer
  wraps either. Height is now the same at every depth and for any title — measured
  in Chromium at 390px with a three-deep stack of application-length titles, the
  navigation bar went from **236px to 54px**, and the document gained no
  horizontal scrollbar at 320, 390, 480, or 767px.

  Two details of how it rests, both deliberate:

  - **The trail rests at the crumb for the Active Panel**, which is the last one it
    renders. A scrolling trail parked at its inline start would hide the crumb that
    says where you are, which is a worse defect than the one being fixed. The
    offset is written directly, so there is no motion to reduce, and a right-to-left
    Canvas is scrolled to its own inline end.
  - **Every crumb stays an ordinary button in Tab order.** A crumb scrolled out of
    view is reached by Tab, and the browser scrolls it back in on focus; the trail
    itself claims no tab stop, so nothing is added in front of the crumbs.

  **If you have already styled the trail yourself**, your override now sits on top
  of a different default. Check it before upgrading: rules that undid the wrap —
  `flex-wrap: nowrap`, `overflow-x: auto`, `white-space: nowrap` on a crumb — are
  now what the package does, and are harmless to keep or delete. A rule that
  _depended_ on the wrap, or that set a height on `[data-canvas-breadcrumbs]`, is
  the one to look at. To show more of each title, raise the cap on the same
  documented attribute:

  ```css
  [data-canvas-breadcrumbs] li button {
    max-inline-size: 20rem;
  }
  ```

  No attribute, custom property, or export changed, and nothing narrow moved
  outside the trail.

  This also corrects a row in the README's known limitations. "The narrow
  presentations are verified by test, not by eye" said that nothing narrow had been
  seen rendering in a real application — no longer true, and it produced this
  defect the moment it stopped being true. The row now says what a consumer has
  actually rendered, what held, and what is still unseen: the tablet presentation,
  a dialog or Overlay Workspace at either narrow width, and any of it on a real
  phone rather than a resized browser.

- de8e998: Publish a Context Signal by value, so an inline literal is cheap.

  `useContextSignal` kept the signal in its effect's dependency array, where it was
  compared by object identity. The natural call site builds the signal inline from
  props — it _is_ derived state — so a fresh object arrived on every render, the
  effect tore down and republished, and every `useContextTarget` reader in the
  application re-rendered. A keystroke in an unrelated Panel was enough. The
  published value was correct throughout; what it cost was renders.

  The signal is now held and compared **one level deep**: two signals are the same
  when `Object.is` says so, or when both are plain objects — or both arrays — with
  the same own entries, each compared by `Object.is`. Nothing recurses, so the
  comparison costs the signal's own entry count however large the value behind it
  is, a cyclic signal is safe rather than a hang, and a `Date`, `Map`, class
  instance, function, or nested object is compared by identity. A signal that
  genuinely changed still publishes immediately, targeting is untouched, and
  unmounting still unpublishes.

  **What changes for a consumer.** Nothing to edit. If you wrapped
  `useContextSignal` in a `useMemo` or a memo helper to stop it churning, that
  wrapper is no longer necessary and can be deleted — a plain inline literal of
  primitives now republishes only when one of its fields actually changes. Keeping
  the wrapper is harmless, and is still the right thing where the signal carries a
  freshly built nested object, array of arrays, or `Date`, since those compare by
  identity and republish on every render without it.

- deb3f66: Put focus back inside the Workspace when a Guarded Transition resolves, instead
  of on the document body.

  In an Overlay Workspace the sequence was: make a Panel dirty, press Escape, and
  answer the Save / Discard / Stay dialog with **Discard**. The transition
  committed, focus landed on `<body>` — outside the layer — and because the
  overlay's Escape is a handler on the layer, the very next Escape reached
  nothing and the overlay would not dismiss. Clicking inside the overlay first, or
  using the Panel's own ✕, worked; the keyboard alone did not.

  The Workspace returns focus to the control that initiated the transition, and it
  was deciding whether that control was still usable by asking whether it was
  connected to the document. `document.body` is connected, and it is what
  `document.activeElement` is whenever the control that started the navigation
  never took DOM focus — a row that is not focusable, a browser that does not focus
  a button when it is clicked, a keyboard shortcut. So the Workspace "returned"
  focus to the body and never reached the retained Active Panel's heading behind
  it. The same held for a control that survived into a Panel the presentation had
  just hidden, where `focus()` is refused and reports nothing.

  A resolved transition now leaves focus inside the Workspace whichever way it
  resolved: on the initiating control while that control is still somewhere focus
  can go, and on the retained Active Panel's own heading otherwise. Save, Discard,
  and Stay all keep returning focus where they already did when the control they
  came from survives. The primary Canvas Workspace had the same defect — it is the
  same focus-return path — and is fixed by the same change.

## 0.2.1

### Patch Changes

- 59d2bb4: Say what the package is on its own npm listing.

  The description read "Reusable Canvas Panels interaction framework for Squared
  Lemons applications" — written while the package was private, and still the line
  under the name in npm search results after it went public under MIT. It now
  describes the thing rather than its former owner, and the first line of the
  shipped README matches it.

  The package also carried no `keywords`, which is npm's only search signal beyond
  the name: nobody could find it without already knowing what it was called.

  No code changed. Both are metadata, and both only reach the registry on a
  release, which is why they are worth one.

- 4e64572: Keep a Panel across a restoration when its live input carries more than its
  codec persists.

  `restoreStack` decided which Panels the target stack shared with the current one
  by deep-equality of the whole in-memory Panel input. A restoration target has
  been through the Kind's codec and carries only what the codec encodes, and the
  navigation rule requires a codec to encode the minimal identifier and view state
  and nothing else — so a Panel titled from a fetched record was never equal to its
  own decoded reference. Following the documented rule was what broke retention.

  The cost was paid on every Back on a stack three or more deep: each Panel the
  user was not leaving unmounted and rebuilt, losing its local state and re-reading
  its data, and — because it was collected as a _removed_ Panel — raised an
  unsaved-changes dialog for work nobody was walking away from. A property whose
  value was merely `undefined` was enough to trigger it, so a consumer could not
  reliably dodge it by leaving a field out.

  Sharing is now decided on persisted identity: the leading run of Panels whose
  Kind, semantic Panel Key, and encoded descriptor match the targets. A transient
  Kind has no descriptor, and for one of those the whole input is still the
  identity, unchanged.

  **What changes for a consumer.** Nothing to edit. If you adopted the workaround
  of keeping each Panel input exactly equal to what its codec persists, you can
  drop it and put the title back where it belongs. One behaviour is genuinely
  different: `restoreStack` no longer rebuilds a Panel to pick up a change the
  codec does not encode. Panel input that the codec omits is presentational by
  definition, and `engine.update` is how it changes.

- 32380ed: Make the README useful to someone who has just landed on the npm page.

  The README is the package page, and it was written for a reader who already had
  the repository open. Three things changed for the one who does not.

  **There is somewhere to look before installing.** A sample CRM built on the
  package is linked from the top, with the two minutes' worth of it that show what
  the package is for: open an account, follow a contact out of it, try to close a
  Panel with unsaved work in it, then copy the URL into a new tab and watch the
  whole stack come back.

  **The install instruction no longer assumes pnpm.** All four package managers are
  given. `pnpm add` as the only line asked a reader on npm or yarn to translate it
  before they could start, which is a strange thing to do to someone deciding
  whether to bother.

  **The peers are stated as ranges rather than as a command.** `react@^19` in an
  install command reads like an instruction to run it, and running it rewrites the
  React range of an application that already had one. The requirement is
  `>=19 <20` for React and React DOM and `>=15 <17` for Next.js — which an existing
  React application already satisfies, so there is usually nothing to run at all.

  No code changed, and the ranges themselves are exactly what the manifest has
  always declared. This is the listing catching up with the package.

## 0.2.0

### Minor Changes

- 46d82ce: Publish as MIT-licensed open source on the public npm registry, renamed to `@squaredlemons/canvas-panels`.

  **The package has been renamed.** Update the dependency and every import:

  ```diff
  -"@squared-lemons-ltd/canvas-panels": "0.1.0"
  +"@squaredlemons/canvas-panels": "0.2.0"
  ```

  ```diff
  -import { definePanel } from "@squared-lemons-ltd/canvas-panels/core";
  +import { definePanel } from "@squaredlemons/canvas-panels/core";
  ```

  The nine subpaths, every export, the result discriminants, the Navigation Parameter, the custom properties, and the `canvas-panels` cascade layer are all unchanged — this release moves the package, it does not alter the Public Contract.

  **Delete the registry configuration.** The `.npmrc` that pointed the scope at GitHub Packages and supplied a `read:packages` token is no longer needed anywhere — not in a consuming repository, and not in its CI:

  ```diff
  -@squared-lemons-ltd:registry=https://npm.pkg.github.com
  -//npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}
  ```

  `pnpm add @squaredlemons/canvas-panels` is now the whole instruction.

  Why the move, given that the previous one was recent and deliberate: the package went to GitHub Packages because npm charges for _private_ packages and the first publish was refused with `402 Payment Required`. Opening the repository removed that premise entirely — a public package on npm is free, while GitHub Packages requires an access token to install a package whether it is public or private. Staying would have kept every cost of the private arrangement and returned none of its benefit. Two things came back with the move: the scope is a free choice again rather than the repository owner's name, which is the only reason it ever carried a legal suffix; and releases now carry an npm provenance attestation, generated automatically by trusted publishing, which `docs/delivery/release-evidence.md` previously had to stand in for.

  `0.1.0` was not republished under the new name. It was private, had no consumer outside this repository, and its record is kept in `docs/delivery/release-evidence.md`; the public history starts here.

## 0.1.0

### Minor Changes

- aaf07f3: Complete the package-owned interaction grammar for keyboard movement, announcements, motion, and Panel resizing.

  - F6 and Shift+F6 cycle the visible Panel regions. It is the only key the Canvas claims: Tab order is left as the DOM defines it, and no arrow or letter shortcut is registered globally.
  - One polite live region announces meaningful structural changes — opening, closing, Branch Replacement, and presentation changes — and stays silent for activation, focus, and sizing. Sentences come from replaceable templates (`canvasAnnouncementTemplates`) so they can be localized. Dialog errors keep their assertive `role="alert"`.
  - Panel separators are real ARIA separators, resizable by pointer and by Arrow, Shift+Arrow, Home, End, and Enter through one sizing engine (`resizePanel`), announcing only once a resize settles.
  - A reduced-motion preference can no longer be overridden by application CSS, and forced-colours modes get explicit Panel borders now that shadows are dropped.

  New exports from `@squaredlemons/canvas-panels/ui`: `canvasAnnouncementTemplates`, `canvasPanelSizingBounds`, `cyclePanelRegion`, `describeStructuralChange`, `resizePanel`, `sizingCommandForKey`. `Canvas.Workspace` accepts `announcements` and `sizing`.

- Bring the Guarded Transition dialog and the Overlay Workspace inside the token seam, and keep every Canvas action a real pointer target.

  Three findings from the Meridian CRM sample, all against surfaces an application cannot reach without going past the documented seam.

  **The two raised surfaces now answer to a token.** The Guarded Transition dialog and an Overlay Workspace were painted in the CSS system colours `Canvas` and `CanvasText` with no `--canvas-*` property to redirect them. They followed `color-scheme`, so they stayed readable in both themes — they were simply never the product's colours, which is obvious the moment a dialog opens over an application that has themed everything else. Both now paint `var(--canvas-surface-raised)`, a new token defaulting to `Canvas`, and the dialog takes its text from `--canvas-text` like the rest of the Canvas. The contract suite now asserts that _every_ surface the stylesheet paints resolves through a `--canvas-*` token or paints nothing at all, so a fourth surface cannot arrive outside the seam unnoticed.

  **The dialog's three decisions are styled and named.** Save, Discard, and Stay are the most consequential controls the package renders and shipped no styling whatsoever, so under an application preflight they arrived as bare text with no hit target. They now take the same action treatment as a Panel's own controls, Save leads, and each carries `data-canvas-transition-action="save" | "discard" | "stay"` so an application can restyle the three without matching the English in a label.

  **A Canvas action keeps its target.** Every header action is a flex item beside a Panel title that ellipsises, and the initial `flex-shrink: 1` let the title take the space: a Close button asking for 28px was **measured at 16px**, under the 24px WCAG 2.5.8 wants of a pointer target. Actions are now `flex: 0 0 auto` with a floor of `--canvas-action-min-size` (1.75rem) on both axes — the title is what should give way, and it already knows how.

  **Additions to the Public Contract**: the `--canvas-surface-raised` and `--canvas-action-min-size` tokens, and the `data-canvas-transition-action` attribute. Nothing is removed and no existing override changes meaning. An application that had reached past the seam onto `[data-canvas-transition-dialog]` or `[data-canvas-overlay] > [data-canvas-workspace]` to brand them can move those rules onto the token; one that left them alone gets the same system colours it had.

  Note where the raised surfaces read their tokens from. Both render outside the Panel Stack but inside their own Workspace element, so a token declared on `[data-canvas-workspace]` — or on any ancestor, or on `:root` — reaches them. The dialog is rendered inside the Workspace that raised it, not portalled to the document.

- 76c6dfe: Make Panel Instance IDs survive a server render, so a hydrated Canvas works.

  `data-canvas-panel-id` was minted from a module-level counter that restarted in
  each process. A server increments it once per request while a browser always
  starts from the same place, so the two never agreed after the first request.
  React reported the mismatch and left the server's value in the DOM, and every
  package lookup by that attribute then missed: F6 stopped cycling between Panels,
  scroll offsets were not restored, and a resize separator reported
  `aria-valuenow="240"` for a Panel that was 542px wide — so a screen reader
  announced the wrong size. Every SSR consumer was affected, which is the
  package's flagship integration.

  A Panel Instance ID is now numbered from one within its own Panel Engine and
  depends on nothing outside it, so an Engine seeded the same way issues the same
  identities in any process. The presentation confines every lookup by one to the
  Panels its own Workspace renders, which is what per-Engine numbering needs and
  which also stops a Workspace nested inside a Panel being mistaken for its host.

  **The Public Contract now states the scope of the identity, not its spelling.**
  A Panel Instance ID is unique within its Panel Engine; the `canvas-panel-<n>`
  format is not contractual and may change. Two consequences worth knowing:

  - The value is no longer document-unique. Two Workspaces on one page each number
    their own Panels, so scope any lookup to the Workspace you mean.
  - A bare Panel Instance ID handed to a _different_ Panel Engine now names that
    Engine's Panel at the same position instead of being rejected as an invalid
    origin. Panel Instance Refs are unchanged and still cannot cross a Workspace —
    every command that can take a Ref takes one, and a foreign Ref is still
    refused as `foreign-workspace`.

  The packed-package contract gains a server-render-then-hydrate check, so an
  identity that disagrees across that boundary fails a gate instead of reaching a
  consumer.

- bf86dfe: Make the documented theming seam real, and document the cascade layer a consumer has to sort.

  Both are changes to the Public Contract, found by building the first real third-party-style consumer against the published stylesheet.

  **The `--canvas-*` defaults now inherit.** The README and the stylesheet both said an application themes the Canvas by redeclaring the tokens "on any ancestor of the Workspace". It could not: the package declared every default on `[data-canvas-workspace]` itself, and a value declared on an element always beats a value inherited into it — whatever layer or specificity the ancestor's declaration had. Measured against the built CSS, `--canvas-radius: 99rem` on the Workspace's parent had _no_ effect. The defaults now live on `:root`, inside the `canvas-panels` layer and nowhere else, so the Workspace inherits them. Verified in Chromium against real computed styles, for `--canvas-body-padding` on the react fixture: no override resolves to the package default (`0`, panel body padding `0px`); an override on the Workspace's parent element now wins (`37px`, and the panel body is painted with `37px`); an override on the Workspace element still beats the ancestor (`11px`). Re-declaring the token on the Workspace the old way, in the same layer, returns the ancestor override to `0px` — which is the defect, reproduced.

  **This is not a breaking change.** Nothing a consumer could already do stops working, and nothing that already won starts losing:

  - A consumer who sets `--canvas-*` **on the Workspace element** — the only override that used to work, and what the react fixture does in its own stylesheet — is unaffected. Their declaration is on the element; the package's is now inherited into it; the declared value still wins. Confirmed in the browser: with the fixture's `--canvas-radius: 7px` and `--canvas-surface: #f8f8f3` on `[data-canvas-workspace]`, an ancestor set to `99rem`/red changes neither, and the rendered Canvas is unchanged (active Panel 580px, header 62px/22px, Panel border from `--canvas-border`).
  - A consumer who sets them **on an ancestor** was, before this, getting nothing. They now get what the README promised.
  - The only visible difference is that the tokens are defined on `:root` and therefore inherit document-wide rather than only inside the Canvas. They stay package-namespaced and are read only by package rules, so this affects an application solely if it reads a `--canvas-*` token outside the Canvas and depended on it being undefined there.

  **`--canvas-action-text`, `--canvas-action-text-hover`, and `--canvas-action-border` no longer have a default of their own.** Each derived from a more general token — `--canvas-action-text: var(--canvas-text-muted)` — and a `var()` inside a custom property is substituted where that property is _declared_, with descendants inheriting the answer. Declared on the Workspace those three tracked a Workspace-level override; moved to `:root` they would have resolved against the package's own colours and stopped tracking anything, so an application that recoloured `--canvas-text-muted` would have found its header actions unchanged. That would have been a real break, and it is the one this change had to avoid. The derivation is written at the point of use instead — `color: var(--canvas-action-text, var(--canvas-text-muted))` — where it resolves on the action itself. Verified in Chromium: with `--canvas-text-muted: rgb(1, 2, 3)` and `--canvas-border: rgb(4, 5, 6)` on the Workspace element, the action paints `rgb(1, 2, 3)` on `rgb(4, 5, 6)`; the same override on an ancestor reaches it too (`rgb(7, 8, 9)`); `--canvas-action-text` still wins over both; and re-resolving the derivation on `:root` returns the action to the package default, which is the regression, reproduced.

  Two follow-on tidies come with it, both of which had become places an application override silently lost: `[data-canvas-overlay]` no longer redeclares `--canvas-surface-overlay` (it renders outside the Workspace and now inherits the default like everything else), and the duplicate defaults written as `var()` fallbacks on the dialog, backdrop, and overlay radius are gone. Each fallback was byte-identical to the `:root` default it duplicated, so no computed value changes; verified in the browser, a dialog outside the Canvas still resolves to `12px` / `24px` / `512px` and the backdrop to `rgba(0, 0, 0, 0.45)`, and one inside a Canvas themed with `--canvas-radius: 7px` on the Workspace element still rounds to `7px`.

  **The cascade layer is now documented.** The package has always emitted everything into `@layer canvas-panels`, and nothing said so — not the README, not the types. With no `@layer` statement of its own an application gets an order nobody chose, taken from import order, and it is wrong in both directions: import the stylesheet last and every package rule outranks the application's own layers; import it first and the application's reset lands on top of the Canvas. Under Tailwind v4 that is the difference between `class="text-primary"` on the Workspace doing nothing and the preflight breaking the Canvas.

  The README's Theming section now names the layer, states that the name is part of the Public Contract, gives the Tailwind v4 recipe — `@layer theme, base, canvas-panels, components, utilities;`, declared above every `@import` — and states the general rule for an application that does not use Tailwind: `canvas-panels` above any reset or preflight layer, below the application's own component and utility layers, and no statement at all needed by an application with no layers, since unlayered CSS already beats every layer. It also records the one exception, the `!important` reduced-motion block, which inverts layer order by design, and the one override position that layer order still decides: a `--canvas-*` override written on `:root` itself meets the package default on the same element, so an override in a layer sorted before `canvas-panels` — Tailwind's `@theme`, for instance — loses.

  The packaged contract suite gains all of these invariants: every token the stylesheet reads resolves without an override; each has exactly one default, declared on `:root`, inside the layer, and copied nowhere; no default derives from another token where it is declared; and the stylesheet is one named layer with nothing outside it, whose name and Tailwind ordering the README states. Each is checked against the built stylesheet by a scanner that reports which selector and which at-rules a declaration sits under, with a positive control asserting the scanner still reads ordinary rules — three of the four assertions are absences, and a blind scanner would satisfy every one of them.

- 1875b98: Name the controls in a Panel's chrome: `data-canvas-panel-close` and
  `data-canvas-action`.

  A Panel's header carries the two controls an application is most likely to want
  as icons, and neither had anything to select it by. Reaching the close button
  meant matching its position in the header or the English word inside it;
  telling one Canvas Action from another meant matching its label, even though the
  application had already given each Action a stable `id` that the Canvas spent
  only as a React key. Both break the moment the package rearranges anything or
  the product is translated.

  Both attributes join the documented table alongside `data-canvas-panel-header`
  and `data-canvas-panel-separator`. `data-canvas-action` carries the Action's own
  `id`; `data-canvas-panel-close` is present on a closable Panel's close button.

  Nothing else changes. Each control is still a `<button>` whose visible text is
  its label, and its accessible name is still the `aria-label` — which is what
  makes replacing the visible word with an icon safe, because a screen reader
  hears exactly what it heard before.

- c0392cb: Add the optional official editor extension, so an application can coordinate dirty, save, discard, reload, and loading state through the normal Canvas contracts without handing over its form or its data.

  - `usePanelEditor` turns an application's own dirty state and operations into the one lifecycle a Panel registers, so an editor and a hand-written guard can never compete for the same Panel.
  - A write in flight blocks a destructive transition rather than racing it, and keeps the Panel guarded even once the draft itself is clean. Reading never blocks — a read has nothing to lose, so a reloading Panel decides on its unsaved work exactly as it would have done standing still.
  - `reload()` refuses to replace unsaved work unless it is explicitly told to (`{ discardChanges: true }`), and reports `unsupported` when no reload is supplied.
  - One flag does two jobs in the Panel Engine: it decides whether a Panel's guard is consulted at all, and it is what puts a `dirtyLabel` in the Panel header and arms unload protection. Keeping a write guarded therefore shows that label for the length of the write — read `editor.dirty` if your label should say something different while saving.
  - A coordinated save joins an application save already in flight instead of writing the record twice; a failure is recorded on the editor and rethrown so the Guarded Transition dialog can report it with the Panel still open.
  - `createPanelEditor` is the same coordinator without React, and `resolveEditorGuard` with the replaceable `editorGuardMessages` is the ordering itself, for an application that renders its own editor chrome.

  New subpath: `@squaredlemons/canvas-panels/extensions/editor`, exporting `usePanelEditor`, `createPanelEditor`, `resolveEditorGuard`, and `editorGuardMessages`. It is imported only from that subpath, is never re-exported by core, React, or UI, and no base entry point can reach it — a consumer that does not import it neither initializes nor bundles it.

- 9b7d64b: Add the optional official resource extension, so related Panels can tell each other that something they show has changed or gone without the package learning anything about what it is.

  - Resource Keys are opaque and application-defined. A subscription names either an exact key or a pattern in which `*` stands for exactly one segment in any position (`projects/*`), and `resourceKeyMatches` is exported so the reach of a subscription is checkable rather than guessed at.
  - A `changed` or `deleted` invalidation carries the publisher's own opaque token, so whoever made the change is not told to re-read it, and says whether the keys nested beneath it are invalidated too. Propagation runs downward only: whether a parent's change means its children changed is the application's judgement, so the publisher makes it, and no flag makes a child's change reach its parent.
  - Delivery is deterministic. Recipients are fixed when an invalidation is published and delivered in publication order, so a Panel that publishes in response to being told never interleaves with the delivery that told it, a Panel that subscribes in response hears only what follows, and a subscriber that throws is reported without silencing the rest.
  - `usePanelResource` holds an invalidation rather than applying it whenever applying it would cost something: unsaved work, an operation part-way through, a deletion, or a read that just failed. A held change is read the moment the Panel reports itself clean again, so an edit settled through the ordinary Guarded Transition — Save or Discard — carries the deferred reload with it. `apply()` and `dismiss()` put the decision in front of a human when one is needed, and a held deletion is superseded only by news about the same Resource, so a Panel showing several of them cannot have that decision quietly erased.
  - It composes with the editor extension rather than repeating it: pass `dirty: editor.dirty || editor.busy` and let `editor.reload({ discardChanges: true })` be the re-read. `usePanelEditor` already refuses to overwrite unsaved work, and an operation in flight is as much in the way as a half-written draft.
  - The extension owns no fetching, cache, repository, permission, or domain schema. It carries keys and decides when what a Panel hears may replace what it is showing; the application keeps its reads and its records.
  - `createResourceExchange` and `createPanelResource` are the same coordination without React, and `resolveResourceDeferral` is the ordering itself, for an application deciding its own re-reads. A coordinator does not listen until `start()` is called, so one React created and threw away leaves nothing subscribed behind it.
  - The same Panel Engine coupling the editor extension documented applies here: a Panel holding an invalidation is not registered as dirty by this extension, so it does not on its own arm the header `dirtyLabel` or unload protection. Register a lifecycle if a held invalidation should also guard a transition.

  New subpath: `@squaredlemons/canvas-panels/extensions/resources`, exporting `createResourceExchange`, `createPanelResource`, `resolveResourceDeferral`, `resourceKeyMatches`, `resourceInvalidationMatches`, `ResourceExchangeProvider`, `useResourceExchange`, `useResourceSubscription`, and `usePanelResource`. It is imported only from that subpath, is never re-exported by core, React, or UI, reaches no other extension, and no base entry point can reach it — a consumer that does not import it neither initializes nor bundles it.

- f76d0b4: Add the optional overlay composition path for global and modal Panels, at the `@squaredlemons/canvas-panels/overlay` subpath.

  - `defineOverlayWorkspace` declares one overlay: its accessible label, its modality, and its persistence namespace. The namespace is required rather than defaulted and is minted under the reserved `canvas-overlay-` prefix, so an overlay can never take the Navigation Parameter a primary Canvas Workspace owns; a name that would collide is refused at definition time. It is an ordinary History Namespace otherwise — pass `overlay.definition.namespace` to a Navigation Adapter as its `parameterName` to persist the overlay, and the usual first-claimant rule applies.
  - `createOverlayWorkspace` binds that definition to an application-supplied Panel Engine and Bound Canvas Module, and returns the only handle that can route into it — `open`, `dismiss`, `Host`, `usePresentation`, and `useInnerLayer`. There is deliberately no context, hook, or ambient global layer: a Panel's own `useNavigation()` keeps going to its own Workspace whether an overlay is presented or not.
  - An overlay is presented exactly while something has been routed into it, and dismissing it is an ordinary close of the shallowest routed Panel. Guards run normally, so a dirty overlay Panel raises the usual Guarded Transition dialog before the layer goes.
  - A modal overlay makes the main content inert, traps Tab inside the layer, and returns focus to whatever it was taken from. A non-modal one leaves Tab order and the page behind it exactly as they were.
  - Escape resolves innermost first: the Guarded Transition dialog, then the application's own Overlay Inner Layers registered through `useInnerLayer`, then the overlay itself. An overlay with nothing routed into it renders no layer at all, so the key reaches the focused Canvas Panel and the application by the ordinary route.
  - The overlay is absent from every bundle that does not import it. No base entry point reaches `overlay/`, and importing the overlay costs an application only the Panel Engine it already had — the Bound Canvas Module is accepted structurally rather than imported.

  Presenting an overlay is one claim on focus and is honoured once. The Panel Focus Owner inside the overlay still decides where focus goes when a Panel body appears; the overlay only places focus on the layer itself when that owner placed it nowhere, and never takes focus back afterwards. A modal overlay relies on the platform's `inert` to keep pointers out of the content behind it rather than pulling focus back, because re-claiming focus is what stops a Canvas settling.

- 6563c46: Complete the packed-package contract: public testing tools, artifact inspection, and documentation executable from the package output alone.

  - Add the runner-neutral testing tools at the `@squaredlemons/canvas-panels/testing` subpath. `createTestIdentities` mints deterministic Workspace and Panel identities — the Panel Engine numbers its own from a process-wide counter, so what a Panel gets depends on how many engines a run built first — and `createTestClock` gives the application code around a Canvas a clock whose `advance()` runs each timer at its own due point, including timers those callbacks schedule.
  - Add a fake or builder for every seam an application has to stand in for: `allowTransition`/`confirmTransition`/`blockTransition` and `createTestLifecycle` for guards, `createTestRestore` and `buildNavigationDocument` for restoration, `createTestHistory` for browser navigation, `createTestFocusTarget` for focus, `createTestViewport` for the Declared Breakpoints, and `buildPanelReadModel`/`buildPanelStack`/`buildTransitionStatus`/`buildPresentation` for the public read models.
  - `createTestLifecycle` and `createTestRestore` both accept `mode: "manual"`, which leaves each write or availability check in flight until the test settles or fails it. That is the only way to observe a Canvas while a write is outstanding, which is exactly when it must not commit.
  - `buildNavigationDocument` writes a canonical document at a _historical_ descriptor version. The engine can only ever encode the current one, so before this there was no way to exercise a migration from outside the package.
  - The testing subpath is server-safe and imports no test runner, no React, and no Canvas module. It reaches only the Declared Breakpoint queries in `core`, so it costs a consumer nothing and works unchanged under `node:test`, Vitest, or Jest.
  - `canvasBreakpointQueries` now lives in `@squaredlemons/canvas-panels/core` alongside the breakpoints it describes, and is still re-exported unchanged from `@squaredlemons/canvas-panels/ui`. Both entry points expose the same frozen value, so the testing viewport cannot answer for a different breakpoint set than the Canvas presents by.
  - Artifact inspection now rejects, against the package a clean consumer actually installed: secret material, a second React or React DOM, private deep imports past the exports map, a missing or stray `"use client"` directive, and an entry point that re-exports another wholesale. Against the built distribution it additionally rejects a root barrel or wildcard subpath, CommonJS or a down-levelling shim in any module, a global assignment, and any runtime dependency or install script. The packed probe drives the testing tools and a historical Navigation Document migration through the real engine.
  - The package README is restructured to cover installation, architecture, API, accessibility, navigation, theming, Next.js, extensions, testing, compatibility, migration, and rollback. The tarball ships `dist` and that one README, so the gate asserts every required area is present and that every declared subpath is documented and every documented subpath is declared.

  The react fixture's project Panel gains an `update` policy, and its Resource re-read now calls it. Without one, a rename heard through the Resource Exchange refreshed the Panel body while the Panel header kept the name captured when it was opened — the showcase demonstrated half the seam.

  Known limitations, recorded rather than satisfied:

  - A full WCAG 2.2 AA sign-off still requires a manual VoiceOver and Safari pass, which no automated gate can produce.
  - Browser evidence is Chromium-only. Firefox and WebKit are not in an automated matrix, and true narrow-viewport reflow is not verifiable with the current tooling.
  - The packed Next consumer builds against Next 16 only. The declared `>=15 <17` range is therefore verified at its upper end; Next 15 is supported by declaration, not by an automated build.
  - The security and bundle lines are covered by structural checks — zero runtime dependencies, no install scripts, and the module-graph isolation that keeps each optional subpath out of every bundle that does not name it — rather than by a vulnerability scanner or a size budget.

- Contain what a Panel holds, and stop the Canvas scrolling on the axis it does not own.

  Two defects found by the Meridian CRM sample, the first consumer to build the Canvas against a utility CSS framework. Both were worked around in that application's own stylesheet; both belong here, because any consumer using a utility framework hits the first the moment a Panel body contains a visually hidden label.

  **A Panel body now contains what it holds.** The package makes each Panel `position: relative` and gives its body `overflow-y: auto`. An absolutely positioned descendant of that body was therefore laid out against the **Panel**, not the body — so the body's own overflow never clipped it, while its height still counted toward the body's scroll box. Which sounds theoretical until you notice that Tailwind's `sr-only` is `position: absolute`: fourteen rows of visually hidden "Select _account_" and "Open the record" labels in one table were measured at **323px of vertical overflow** in a single Canvas. `[data-canvas-panel-body]` is now a containing block, so the scroll a body already has is the scroll that clips it. `[data-canvas-panel-header]` is too, for the same reason.

  **A Canvas scrolls horizontally and nothing else.** `[data-canvas-application]` declared `overflow-x: auto` and left the other axis alone, which is not what CSS does with it: an axis computed as `visible` becomes `auto` whenever the other one is not `visible`. The Canvas was therefore vertically scrollable, and combined with the overflow above, scrolling it carried the **Panel headers off the top of the frame** and left a band of bare bed under the Panels. A Canvas is a horizontal surface; vertical scrolling belongs to each Panel body, which keeps its own header in place while it happens, and one axis cannot say that. Both axes are now stated.

  **For a consumer already carrying the workaround.** Nothing breaks and nothing needs doing on upgrade. These two declarations, in whichever stylesheet they were written, are now the package's own and can be deleted:

  ```css
  [data-canvas-panel-body] {
    position: relative;
  }
  [data-canvas-application] {
    overflow-y: hidden;
  }
  ```

  An application that deliberately positioned something against the _Panel_ from inside the body — the one arrangement this changes — should position it against the Panel explicitly, or against the body and accept the clip.

  The contract suite now asserts both against the built stylesheet, alongside the Panel body's own `overflow-y: auto`, so neither can be lost to a later edit without a test saying so.

- 2365988: Give the deepest visible Panel a Panel Separator of its own.

  A Separator sizes the Panel it belongs to — its label is `Resize <title>` and
  its `aria-valuenow` is that Panel's width — not the gap after it. The deepest
  visible Panel was nevertheless refused one, on the reasoning that it had
  "nothing to its right to resize against". It has a width worth setting like any
  other Panel; the Canvas simply reaches further, or less far, to its right.

  The effect was that the Panel a reader spends most of their time in was the only
  one they could not size, by pointer or by keyboard.

  A presentation showing a single Panel still offers nothing to resize. That Panel
  is the Canvas, and dragging its edge would size the surface rather than divide
  anything on it.

  **Two consequences worth knowing.** Every visible Panel now carries a Separator
  when two or more are shown, so a Workspace has one more tab stop than before and
  it sits after the deepest Panel's content — a focus trap or a tab-order
  assertion that assumed the last Panel ended the Workspace will need to look
  again. And an application that gives a Panel `flex-grow` will find a dragged
  width swallowed: the package writes the drag as an inline `flex-basis`, which a
  Panel still told to grow immediately absorbs, so the Separator moves and the
  Panel does not. Stand the grow down for a Panel the reader has sized.

- 5757b4f: Give a Panel whose body remounts a single focus owner, and move focus onto a renderer failure notice.

  - The Canvas Workspace is now the only component that decides where focus goes when a Panel body appears. `PanelRendererBoundary` reports that it replaced a body and never moves focus itself, so the two can no longer claim the same moment and re-render each other until the Canvas stops settling.
  - Each appearance of a body is one claim, honoured exactly once: activating a Panel still hands focus to its registered `initialFocus` and a Panel that registered none is left alone; a renderer failure hands focus to the failure notice; a retry hands it to the Panel's own heading. Activation and body replacement are counted separately, so a Panel that has failed and recovered is an ordinary Panel again the next time it is activated.
  - Only the Active Panel is claimed for. A Panel that fails while another is active keeps its notice and its claim until it is activated, and a Guarded Transition dialog owning focus settles the claim behind it rather than pulling focus out of the modal.
  - The failure notice is now focusable and named by the sentence it already shows, and carries a `data-canvas-panel-notice` styling hook.
  - Focusing inside a Panel records the DOM-Focused Panel and publishes it for Context Targets, and cannot re-open a focus claim.

  A retry deliberately lands on the Panel heading rather than the Panel's registered `initialFocus`. The heading is rendered by the package, so a restored body never waits on a registration that arrives a render later and never leaves the user on the document body; register the control you want reached first immediately after the heading in DOM order.

- Make a registered visual title replace the Panel heading instead of printing beside it.

  `useHeader({ visualTitle })` rendered _both_ the `h2` carrying the Panel's title and an `aria-hidden` span carrying the registered one. An application whose visual title carries the record's name — which is the obvious thing to register, and what the Meridian sample did — therefore printed that name **twice**, which is not what the API reads like.

  The heading is now the one element either way:

  - With no visual title registered, nothing changes: the `h2` holds the Panel title as it always did.
  - With one registered, the `h2` holds the registered title, visible, and the Panel title moves _inside_ the heading as `[data-canvas-panel-title]`, removed from view without being removed from the accessibility tree.

  That keeps the three jobs the heading already had. It is the Panel's accessible name, so a screen reader still hears the Panel title and the region's `aria-labelledby` still resolves to it. It is where the Panel Focus Owner puts focus on activation and after a renderer failure retry — the obvious alternative, visually hiding the `h2` and leaving focus on it, would land a keyboard reader on a 1px target that has been told nothing, and moving focus to the ornament instead would strand them somewhere unnamed.

  **Two additions to the Public Contract**, both now in the README's attribute table:

  | Attribute                  | On                 | Meaning                                                                        |
  | -------------------------- | ------------------ | ------------------------------------------------------------------------------ |
  | `data-canvas-panel-title`  | inside the heading | the Panel title, present only while a visual title has taken its visible place |
  | `data-canvas-visual-title` | inside the heading | the registered visual title                                                    |

  **For a consumer already styling around this.** `[data-canvas-visual-title]` is now a child of the `h2` rather than its sibling, so a rule that ordered it against the heading as a flex item of the header — `order: -1`, which is what the Meridian skin needed to put an ornament ahead of the name it preceded — no longer applies and can be deleted. A rule that only paints the span is unaffected. An application that was compensating for the duplicate by hiding one of the two should stop: hiding `[data-canvas-panel-title]` now removes the Panel's accessible name.
