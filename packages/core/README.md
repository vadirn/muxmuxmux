# @muxmuxmux/core

Typesafe state-dependent methods on an observable store. Zero dependencies.

## Install

```bash
pnpm add @muxmuxmux/core
```

## Quick start

```typescript
import { controller } from "@muxmuxmux/core";

const button = controller("idle", {
	idle: { onClick: submit },
	loading: {}, // clicks do nothing while loading
	error: { onClick: submit }, // retry
});

async function submit() {
	button.set("loading");
	try {
		await sendForm();
		button.set("idle");
	} catch {
		button.set("error");
	}
}

button.onClick(); // runs idle.onClick
button.get(); // "loading"
button.onClick(); // does nothing: "loading" has no onClick
```

## How it works

A controller is two things at once:

- **An observable store.** Its value is the current state name. `get()` reads it, `set()` changes it, and `subscribe()` watches it.
- **A dispatcher for each method name.** Every name that any state declares becomes a method on the controller. Calling it runs the current state's version. If the current state lacks that method, the call does nothing and returns `undefined`.

Methods change state by calling `set` on the controller's variable. The controller exists before any method runs, so referring to it from inside a method is safe.

## Types

- State names come from the keys of the methods object, so `set("typo")` fails to compile.
- A method's return type is the union of its return types across states. A state without the method adds `undefined`.
- Arguments must suit every state that defines the method, because the state can change before the call.

```typescript
const counter = controller("idle", {
	idle: { read: () => 0, reset: () => true },
	busy: { read: () => "busy" },
});

counter.read(); // number | string
counter.reset(); // boolean | undefined
```

Checking `get()` does not narrow method types. Narrow the call's result instead.

## Store behavior

- `set` ignores a state equal to the current one (`Object.is`), so subscribers don't fire.
- `subscribe(listener)` calls the listener right away with the current state, then on every change. It returns an unsubscribe function.
- Methods named `get`, `set` or `subscribe` fail to compile, because the store owns those names. In plain JavaScript they are ignored.

## Svelte

The controller follows Svelte's store contract, so `$button` reads the current state.

```svelte
<script lang="ts">
	import { controller } from "@muxmuxmux/core";

	const button = controller("idle", {
		idle: { onClick: submit },
		loading: {},
	});

	async function submit() {
		button.set("loading");
		await sendForm();
		button.set("idle");
	}
</script>

<button onclick={button.onClick} disabled={$button === "loading"}>
	{$button === "loading" ? "Sending..." : "Send"}
</button>
```

## React

Use `useController` from [`@muxmuxmux/react`](https://www.npmjs.com/package/@muxmuxmux/react).

## Testing

`inspectMethods(controller)` returns the methods object you passed in, so tests can assert on spies:

```typescript
import { controller, inspectMethods } from "@muxmuxmux/core";

const ctrl = controller("idle", {
	idle: { start: vi.fn() },
	running: {},
});

ctrl.start();
expect(inspectMethods(ctrl).idle.start).toHaveBeenCalled();
```

## API

| Export | Kind | What it is |
| --- | --- | --- |
| `controller(defaultState, methods)` | function | Creates a controller |
| `inspectMethods(controller)` | function | Returns the methods object a controller was created with |
| `Controller<M>` | type | The store plus one dispatcher per method name |
| `Methods` | type | Each state's methods: state name → method name → function |
| `Store<T>` | type | The `get`/`set`/`subscribe` contract |

## For coding agents

This package ships an [Agent Skill](https://agentskills.io/) at `skills/muxmuxmux/SKILL.md`. It lists the patterns and the common mistakes. Point your agent at `node_modules/@muxmuxmux/core/skills/muxmuxmux/SKILL.md`, or load it with `npx @tanstack/intent install`.

## License

MIT
