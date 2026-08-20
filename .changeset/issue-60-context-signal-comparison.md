---
"@squaredlemons/canvas-panels": patch
---

Publish a Context Signal by value, so an inline literal is cheap.

`useContextSignal` kept the signal in its effect's dependency array, where it was
compared by object identity. The natural call site builds the signal inline from
props — it *is* derived state — so a fresh object arrived on every render, the
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
