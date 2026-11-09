# @muxmuxmux/machine

## 0.1.1

### Patch Changes

- 0a91a99: The package now ships an agent skill at `skills/muxmuxmux-machine/SKILL.md`, so coding agents can learn the API from `node_modules`. The skill holds the full guide to choosing between `@muxmuxmux/core` and the machine.
- 59eed69: The package now carries the `tanstack-intent` keyword, so the TanStack Intent registry lists its skill. The README lists each way to load the skill, including the new Claude Code plugin.

## 0.1.0

### Minor Changes

- eaef3d6: Add `@muxmuxmux/machine`, state machines whose states own their work. Every method gets the current visit first, and `visit.to` moves only while that visit is current, so late results move nothing. `enter(visit)` runs on each entry, and `visit.signal` aborts when the state ends. `once`, `when` and `hold` cover waiting and composition, an optional graph limits moves, and `useMachine` from `@muxmuxmux/machine/react` binds a machine to a component.
