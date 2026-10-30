# @muxmuxmux/react

## 0.2.0

### Minor Changes

- 5be09e4: Method return types are now the union across states, plus `undefined` when a state lacks the method. Arguments must suit every state that defines the method. Exporting a controller no longer fails declaration emit with TS4023.
- 1b0906d: `useController` now calls the handlers from the latest render, so handlers can read current props and state. The controller keeps a stable identity, and `defaultState` still applies on the first render only. Wrapping handlers in `useCallback` is no longer needed. Method names stay fixed at the first render: a name that first appears later gets no dispatcher.

### Patch Changes

- Updated dependencies [5be09e4]
- Updated dependencies [5be09e4]
- Updated dependencies [5be09e4]
  - @muxmuxmux/core@0.2.0

## 0.1.2

### Patch Changes

- Explicitly set package type to module
- Updated dependencies
  - @muxmuxmux/core@0.1.1

## 0.1.1

### Patch Changes

- Re-release to fix dependency pointing to workspace package
