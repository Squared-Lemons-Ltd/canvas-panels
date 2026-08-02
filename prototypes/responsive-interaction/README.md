# Responsive interaction prototype

> **Throwaway prototype:** three responsive Canvas Panels interaction variants, switchable with `?variant=A`, `B`, or `C`.

## Question

How should one Canvas Panels interaction model behave across desktop, tablet, and mobile while preserving context, navigation clarity, focus, and unsaved work?

## Run

From the repository root:

```bash
python3 -m http.server 4173 --directory prototypes/responsive-interaction
```

Then open <http://localhost:4173/?variant=A>.

## Exercise

1. Switch among Desktop, Tablet, and Mobile.
2. Open **Year 8 Mathematics**.
3. Open **Learner A**.
4. Edit the progress note.
5. Use Back, Close, a breadcrumb/rail, or Escape.
6. Try Cancel, Discard, and Save & continue in the guarded transition.
7. Compare variants using the floating bottom switcher:
   - **A — Continuous canvas:** spatially visible contexts.
   - **B — Focus + history rail:** one dominant panel and compact trail.
   - **C — Context deck:** focused card with a previous-context peek.

The **Inspect state** control exposes the complete relevant prototype state after each interaction.

## Design posture and audit

This is primarily an **Operate** surface with a secondary **Command / Inspect** posture: relationship navigation and state-changing actions take priority over decoration.

Pre-handoff slop diagnostic: **0/10**. The artifact uses no tech gradient, default indigo, feature-tile grid, accent rail, blur, monument stat, icon topper, centre-stack composition, default Inter typography, or mismatched surface composition.
