# @muxmuxmux/core

## 0.2.1

### Patch Changes

- 59eed69: The skill's frontmatter now holds only `name` and `description`, so Agent Skills validators accept it. The README lists each way to load the skill, including the new Claude Code plugin.
- e79c77c: The skill now gives the quick test for choosing between core and `@muxmuxmux/machine`, and points to the machine's skill for the full guide. Its upload example no longer has a cancel that a late result could undo.

## 0.2.0

### Minor Changes

- 5be09e4: Method return types are now the union across states, plus `undefined` when a state lacks the method. Arguments must suit every state that defines the method. Exporting a controller no longer fails declaration emit with TS4023.
- 5be09e4: Methods named `get`, `set` or `subscribe` now fail to compile with "reserved by the store; rename this method". Before, TypeScript accepted them and the runtime silently ignored them.

### Patch Changes

- 5be09e4: The package now ships a full README and an agent skill at `skills/muxmuxmux/SKILL.md`, so coding agents can learn the API from `node_modules`.

## 0.1.1

### Patch Changes

- Explicitly set package type to module
