---
"@squaredlemons/canvas-panels": minor
---

Give a Panel whose body remounts a single focus owner, and move focus onto a renderer failure notice.

- The Canvas Workspace is now the only component that decides where focus goes when a Panel body appears. `PanelRendererBoundary` reports that it replaced a body and never moves focus itself, so the two can no longer claim the same moment and re-render each other until the Canvas stops settling.
- Each appearance of a body is one claim, honoured exactly once: activating a Panel still hands focus to its registered `initialFocus` and a Panel that registered none is left alone; a renderer failure hands focus to the failure notice; a retry hands it to the Panel's own heading. Activation and body replacement are counted separately, so a Panel that has failed and recovered is an ordinary Panel again the next time it is activated.
- Only the Active Panel is claimed for. A Panel that fails while another is active keeps its notice and its claim until it is activated, and a Guarded Transition dialog owning focus settles the claim behind it rather than pulling focus out of the modal.
- The failure notice is now focusable and named by the sentence it already shows, and carries a `data-canvas-panel-notice` styling hook.
- Focusing inside a Panel records the DOM-Focused Panel and publishes it for Context Targets, and cannot re-open a focus claim.

A retry deliberately lands on the Panel heading rather than the Panel's registered `initialFocus`. The heading is rendered by the package, so a restored body never waits on a registration that arrives a render later and never leaves the user on the document body; register the control you want reached first immediately after the heading in DOM order.
