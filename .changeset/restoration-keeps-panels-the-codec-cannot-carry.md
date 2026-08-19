---
"@squaredlemons/canvas-panels": patch
---

Keep a Panel across a restoration when its live input carries more than its
codec persists.

`restoreStack` decided which Panels the target stack shared with the current one
by deep-equality of the whole in-memory Panel input. A restoration target has
been through the Kind's codec and carries only what the codec encodes, and the
navigation rule requires a codec to encode the minimal identifier and view state
and nothing else — so a Panel titled from a fetched record was never equal to its
own decoded reference. Following the documented rule was what broke retention.

The cost was paid on every Back on a stack three or more deep: each Panel the
user was not leaving unmounted and rebuilt, losing its local state and re-reading
its data, and — because it was collected as a *removed* Panel — raised an
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
