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
- `defaultState` - The initial state
- `methods` - State-dependent methods object

**Returns:**
- The controller instance with reactive state

## License

MIT
