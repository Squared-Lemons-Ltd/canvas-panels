---
"@squaredlemons/canvas-panels": minor
---

Add the optional overlay composition path for global and modal Panels, at the `@squaredlemons/canvas-panels/overlay` subpath.

- `defineOverlayWorkspace` declares one overlay: its accessible label, its modality, and its persistence namespace. The namespace is required rather than defaulted and is minted under the reserved `canvas-overlay-` prefix, so an overlay can never take the Navigation Parameter a primary Canvas Workspace owns; a name that would collide is refused at definition time. It is an ordinary History Namespace otherwise — pass `overlay.definition.namespace` to a Navigation Adapter as its `parameterName` to persist the overlay, and the usual first-claimant rule applies.
- `createOverlayWorkspace` binds that definition to an application-supplied Panel Engine and Bound Canvas Module, and returns the only handle that can route into it — `open`, `dismiss`, `Host`, `usePresentation`, and `useInnerLayer`. There is deliberately no context, hook, or ambient global layer: a Panel's own `useNavigation()` keeps going to its own Workspace whether an overlay is presented or not.
- An overlay is presented exactly while something has been routed into it, and dismissing it is an ordinary close of the shallowest routed Panel. Guards run normally, so a dirty overlay Panel raises the usual Guarded Transition dialog before the layer goes.
- A modal overlay makes the main content inert, traps Tab inside the layer, and returns focus to whatever it was taken from. A non-modal one leaves Tab order and the page behind it exactly as they were.
- Escape resolves innermost first: the Guarded Transition dialog, then the application's own Overlay Inner Layers registered through `useInnerLayer`, then the overlay itself. An overlay with nothing routed into it renders no layer at all, so the key reaches the focused Canvas Panel and the application by the ordinary route.
- The overlay is absent from every bundle that does not import it. No base entry point reaches `overlay/`, and importing the overlay costs an application only the Panel Engine it already had — the Bound Canvas Module is accepted structurally rather than imported.

Presenting an overlay is one claim on focus and is honoured once. The Panel Focus Owner inside the overlay still decides where focus goes when a Panel body appears; the overlay only places focus on the layer itself when that owner placed it nowhere, and never takes focus back afterwards. A modal overlay relies on the platform's `inert` to keep pointers out of the content behind it rather than pulling focus back, because re-claiming focus is what stops a Canvas settling.
