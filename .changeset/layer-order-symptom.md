---
"@squaredlemons/canvas-panels": patch
---

Say in the README what a wrong cascade-layer order looks like, so it is
diagnosable from the symptom.

The README already gives the layer statement and says that importing the
stylesheet first sorts `canvas-panels` below an application's reset. What it did
not say is what that produces on screen, and the failure is silent: the package's
rules are still there and still valid, merely outranked, so nothing errors and
nothing logs. What a consumer sees is package-rendered controls arriving as bare
text with no hit target — the Guarded Transition dialog's Save, Discard, and Stay
most visibly, those being the controls an application is least likely to have
styled itself.

That reads as "the package ships no styling for these", which is the wrong
conclusion: all three take the `--canvas-action-*` treatment, and Save carries an
emphasis on top of it. It has now been reported as a missing default. The
"Theming" section names the symptom and says to check the layer statement first.

No behaviour changes, and no rule moved.
