---
"@muxmuxmux/machine": minor
---

Add `@muxmuxmux/machine`, state machines whose states own their work. Every method gets the current visit first, and `visit.to` moves only while that visit is current, so late results move nothing. `enter(visit)` runs on each entry, and `visit.signal` aborts when the state ends. `once`, `when` and `hold` cover waiting and composition, an optional graph limits moves, and `useMachine` from `@muxmuxmux/machine/react` binds a machine to a component.
