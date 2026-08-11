---
"@squaredlemons/canvas-panels": minor
---

Add the optional official editor extension, so an application can coordinate dirty, save, discard, reload, and loading state through the normal Canvas contracts without handing over its form or its data.

- `usePanelEditor` turns an application's own dirty state and operations into the one lifecycle a Panel registers, so an editor and a hand-written guard can never compete for the same Panel.
- A write in flight blocks a destructive transition rather than racing it, and keeps the Panel guarded even once the draft itself is clean. Reading never blocks — a read has nothing to lose, so a reloading Panel decides on its unsaved work exactly as it would have done standing still.
- `reload()` refuses to replace unsaved work unless it is explicitly told to (`{ discardChanges: true }`), and reports `unsupported` when no reload is supplied.
- One flag does two jobs in the Panel Engine: it decides whether a Panel's guard is consulted at all, and it is what puts a `dirtyLabel` in the Panel header and arms unload protection. Keeping a write guarded therefore shows that label for the length of the write — read `editor.dirty` if your label should say something different while saving.
- A coordinated save joins an application save already in flight instead of writing the record twice; a failure is recorded on the editor and rethrown so the Guarded Transition dialog can report it with the Panel still open.
- `createPanelEditor` is the same coordinator without React, and `resolveEditorGuard` with the replaceable `editorGuardMessages` is the ordering itself, for an application that renders its own editor chrome.

New subpath: `@squaredlemons/canvas-panels/extensions/editor`, exporting `usePanelEditor`, `createPanelEditor`, `resolveEditorGuard`, and `editorGuardMessages`. It is imported only from that subpath, is never re-exported by core, React, or UI, and no base entry point can reach it — a consumer that does not import it neither initializes nor bundles it.
