# @muxmuxmux/machine

State machines whose states own their work. Leaving a state aborts that work. Zero dependencies.

## Install

```bash
pnpm add @muxmuxmux/machine
```

## Quick start

```typescript
import { machine } from "@muxmuxmux/machine";

const upload = machine("idle", {
	idle: { start: (visit) => visit.to("sending") },
	sending: {
		enter: async (visit) => {
			try {
				await post(file, { signal: visit.signal });
				visit.to("idle");
			} catch {
				visit.to("failed");
			}
		},
		cancel: (visit) => visit.to("idle"),
	},
	failed: { retry: (visit) => visit.to("sending") },
});

upload.start(); // idle → sending; enter starts the request
upload.cancel(); // sending → idle; the request aborts
upload.cancel(); // does nothing: "idle" has no cancel
```

## How it works

A machine is a store of the state name, plus one method per name that any state declares. A call runs the current state's version. If the current state lacks that method, the call does nothing and returns `undefined`.

- **Visits.** A visit is one stay in a state. Every method gets the current visit first. The public method drops it, so `upload.start(e)` takes the event first.
- **Moves.** `visit.to(target)` moves only while the visit is current. After the machine leaves, a late `visit.to` does nothing. So a request that fails after a cancel cannot move the machine to `failed`.
- **Entry.** `enter(visit)` runs on every entry into its state. `visit.signal` aborts when the visit ends.
- **Lifecycle.** Like a Svelte `readable` store, the machine works only while used. The first subscriber or call starts it. The last unsubscribe aborts the current visit. `get()` never starts it.

## Waiting

- `once(m, method, { signal })` resolves with the arguments of the next call to `method`. Pass a visit as the options, so leaving the state rejects the wait.
- `when(m, state, { signal })` resolves once the store is in `state`. It works on any `{ get, subscribe }`, including a core controller.

```typescript
const confirm = machine("closed", {
	closed: {
		// The return annotation breaks a type cycle
		ask: (visit): Promise<[ok: boolean]> =>
			once(confirm, "answer", visit.to("open")),
	},
	open: {
		answer: (visit, _ok: boolean) => visit.to("closed"),
		dismiss: (visit) => visit.to("closed"),
	},
});

const answer = await confirm.ask(); // [true] after answer(true); dismiss() rejects it
```

## Composition

`hold(child, visit)` keeps a child machine running for exactly as long as the visit lasts. It is safe after an `await`, when the visit may already be over.

```typescript
const player = machine("stopped", {
	stopped: { play: (visit) => visit.to("playing") },
	playing: {
		enter: (visit) => hold(volume, visit),
		stop: (visit) => visit.to("stopped"),
	},
});
```

## Graph

An optional third argument lists each state's allowed targets. Each state's `visit.to` then accepts only those targets. An unlisted move also throws at runtime, and a bad graph throws at creation.

```typescript
machine("idle", states, {
	idle: ["sending"],
	sending: ["idle", "failed"],
	failed: ["sending"],
});
```

## Svelte

The machine is a readable store, so `$upload` works in a component with no adapter. Mounting subscribes and starts it, and unmounting aborts the current visit.

- Read the state with `upload.get()`, not `get(upload)` from `svelte/store`. That helper subscribes and unsubscribes at once, so it runs `enter` and aborts it.
- Server render subscribes only while the component renders. So the initial state's `enter` runs on the server until its first `await`, and the end of the render aborts the visit. Moves made before that `await` show in the server HTML.
- So in a server-rendered component, keep the initial state inert: give it no `enter`, and start work from an event or `onMount`. Otherwise, keep browser-only code after an `await`, and tie every request and timer to `visit.signal`.

## React

```tsx
import { useMachine } from "@muxmuxmux/machine/react";

function Upload({ file }: { file: File }) {
	const upload = useMachine("idle", {
		idle: { start: (visit) => visit.to("sending") },
		sending: {
			enter: async (visit) => {
				await post(file, { signal: visit.signal });
				visit.to("idle");
			},
			cancel: (visit) => visit.to("idle"),
		},
	});

	return upload.get() === "idle" ? (
		<button onClick={upload.start}>Upload</button>
	) : (
		<button onClick={upload.cancel}>Cancel</button>
	);
}
```

- Methods read the latest render's props. A running async `enter` keeps the props from when it entered.
- The machine starts when the component subscribes, never on a call during render. Unmounting aborts the current visit.
- In development, StrictMode aborts the first `enter` and runs it again.

React is an optional peer dependency: install it only to use `@muxmuxmux/machine/react`.

## Core or machine

Core's `controller` is enough when each state only picks which handler runs, and every move happens at once. Use the machine when a state owns async work or a timer that must stop when the state ends.

Quick test: if every handler calls `set` before any `await` and starts no timer, stay on core.

## API

| Export                                | Kind     | What it is |
| ------------------------------------- | -------- | ---------- |
| `machine(initial, states, graph?)`    | function | Creates a machine |
| `once(m, method, { signal })`         | function | Resolves with the arguments of the next call to `method` |
| `when(m, state, { signal })`          | function | Resolves once the store is in `state` |
| `hold(child, visit)`                  | function | Keeps `child` running for as long as `visit` lasts |
| `useMachine(initial, states, graph?)` | function | React hook, from `@muxmuxmux/machine/react` |
| `Machine<K, M>`                       | type     | The store plus one dispatcher per method name |
| `Visit<G, S>`                         | type     | One stay in state `S` |
| `Graph<K>`                            | type     | State name → the states it may move to |

## For coding agents

This package ships an [Agent Skill](https://agentskills.io/) at `skills/muxmuxmux-machine/SKILL.md`. It holds the full core-or-machine guide, the patterns and the common mistakes.

To load the copy that matches your installed version, point your agent at `node_modules/@muxmuxmux/machine/skills/muxmuxmux-machine/SKILL.md`. Or run `npx skills experimental_sync` from the [`skills`](https://github.com/vercel-labs/skills) CLI. It links the skills your dependencies ship into `.agents/skills/`.

To install the skill without the package, use the same CLI:

```bash
npx skills add https://github.com/vadirn/muxmuxmux/tree/main/packages/machine/skills/muxmuxmux-machine
```

This copy comes from `main`, so it can describe changes that are not released yet. To match a release, replace `main` with that release's commit.

## License

MIT
