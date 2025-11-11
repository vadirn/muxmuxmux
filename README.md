![muxmuxmux](./assets/muxmuxmux.svg)

Typesafe state-dependent behavior for modern apps.

[![Bundle Size](https://img.shields.io/bundlephobia/minzip/@muxmuxmux/core)](https://bundlephobia.com/package/@muxmuxmux/core)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE.md)

## Why muxmuxmux?

State machines are powerful but often verbose. muxmuxmux gives you the benefits of state-dependent behavior with minimal boilerplate:

- **Type-safe** - Full TypeScript inference for states and methods
- **Observable** - Standard `get()`/`set()`/`subscribe()` interface
- **Intuitive API** - Call methods directly on the controller, they only run in the right state
- **Lightweight** - Zero dependencies, tiny bundle size

## Usage

```typescript
import { controller } from "@muxmuxmux/core";

const handleClick = async () => {
	button.set("loading");
	try {
		await submitForm();
		button.set("idle");
	} catch (error) {
		button.set("error");
	}
};

const button = controller("idle", {
	idle: { onClick: handleClick },
	loading: {}, // Button disabled during loading
	error: { onClick: handleClick }, // Retry on error
});

// Read state
button.get(); // 'idle'
button.subscribe((state) => updateButtonUI(state));

// User clicks button
button.onClick(); // idle → loading → idle/error
```

## How it works

**`controller(defaultState, methods)`** creates an observable state controller.

The controller is both:

- **Observable store**: `get()`, `set()`, `subscribe()` for state management
- **Method dispatcher**: All methods from all states are available on the controller, but only the current state's implementation runs

```typescript
const ctrl = controller("idle", {
	idle: { start: () => {} },
	running: { stop: () => {} },
});

// Observable store interface
ctrl.get(); // Current state
ctrl.set("running"); // Change state
ctrl.subscribe(fn); // Listen to changes

// Method dispatcher
ctrl.start(); // Calls idle.start() when state is 'idle'
ctrl.stop(); // Calls running.stop() when state is 'running'
// No-op if method doesn't exist in current state
```

## Packages

- **[@muxmuxmux/core](./packages/core)** - Core library

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and guidelines.

Issues and feature requests are welcome at [github.com/vadirn/muxmuxmux/issues](https://github.com/vadirn/muxmuxmux/issues).

## License

MIT
