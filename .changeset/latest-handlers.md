---
"@muxmuxmux/react": minor
---

`useController` now calls the handlers from the latest render, so handlers can read current props and state. The controller keeps a stable identity, and `defaultState` still applies on the first render only. Wrapping handlers in `useCallback` is no longer needed. Method names stay fixed at the first render: a name that first appears later gets no dispatcher.
