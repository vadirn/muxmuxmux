# @muxmuxmux/core

## 0.2.0

### Minor Changes

- 5be09e4: Method return types are now the union across states, plus `undefined` when a state lacks the method. Arguments must suit every state that defines the method. Exporting a controller no longer fails declaration emit with TS4023.
- 5be09e4: Methods named `get`, `set` or `subscribe` now fail to compile with "reserved by the store; rename this method". Before, TypeScript accepted them and the runtime silently ignored them.

### Patch Changes

- 5be09e4: The package now ships a full README and an agent skill at `skills/muxmuxmux/SKILL.md`, so coding agents can learn the API from `node_modules`.

## 0.1.1

### Patch Changes

- Explicitly set package type to module
