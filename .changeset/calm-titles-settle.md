---
"@squaredlemons/canvas-panels": patch
---

Stop an inline `useHeader({ visualTitle })` React element from causing an infinite Workspace re-registration loop, while continuing to update the visible title when its value changes ([#77](https://github.com/Squared-Lemons-Ltd/canvas-panels/issues/77)).
