# @muxmuxmux/react

React bindings for muxmuxmux.

## Installation

```bash
npm install @muxmuxmux/react
```

## Usage

```tsx
import { useController } from "@muxmuxmux/react";

function Button() {
	const handleClick = async () => {
		button.set("loading");
		try {
			await submitForm();
			button.set("idle");
		} catch (error) {
			button.set("error");
		}
	};

	const button = useController("idle", {
		idle: { onClick: handleClick },
		loading: {},
		error: { onClick: handleClick }, // Retry on error
	});

	const state = button.get();

	return (
		<button
			onClick={button.onClick}
			disabled={state === "loading"}
		>
			{state === "loading" ? "Loading..." : "Submit"}
		</button>
	);
}
```

## API

### `useController(defaultState, methods)`

Hook that creates a controller and subscribes to its state changes.

**Parameters:**
- `defaultState` - The initial state, read on the first render only
- `methods` - State-dependent methods object, re-read on every render

**Returns:**
- The controller instance with reactive state. It keeps the same identity across renders.

Each method call runs the handler from the latest committed render. So handlers can read props and state without `useCallback`.

Method names come from the first render. A name that first appears on a later render gets no dispatcher.

## License

MIT
