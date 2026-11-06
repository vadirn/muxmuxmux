---
name: muxmuxmux-machine
description: >
  State machines whose states own their work, with @muxmuxmux/machine.
  machine(initial, states, graph?) returns a store of the state name, plus one
  method per name that any state declares. Each method gets the current visit
  first. enter(visit) runs on entry, and visit.signal aborts when the state
  ends. Use when writing, reviewing or testing code that imports
  @muxmuxmux/machine or @muxmuxmux/machine/react, or when choosing between
  @muxmuxmux/core and the machine.
---

# muxmuxmux machine

`machine` from `@muxmuxmux/machine` combines two things:

- **A store** whose value is the current state name: `get()` and `subscribe(listener)`. It has no `set`, because moves go through visits.
- **Dispatchers**: one method per name that any state declares. A call runs the current state's version, with the current visit first. In a state without that method, the call does nothing and returns `undefined`.

A **visit** is one stay in a state. It ends when the machine leaves, even if the machine comes back later.

In React, use `useMachine` from `@muxmuxmux/machine/react`. In Svelte, use the machine directly as a readable store.

## Core or machine

Core is enough when each state only picks which handler runs, and every move happens at once. Use the machine when a state owns async work or a timer that must stop when the state ends.

|                             | Core `controller`                      | Machine `machine` |
| --------------------------- | -------------------------------------- | ----------------- |
| How moves happen            | `ctrl.set(state)`, from anywhere       | `visit.to(state)`, from inside a method or `enter` |
| Work owned by a state       | none                                   | `enter(visit)` runs on every entry |
| Cancelling                  | up to you                              | `visit.signal` aborts when the state ends |
| A late result               | still moves the state                  | does nothing, because its visit has ended |
| Lifecycle                   | none; always live                      | starts on first use, stops on the last unsubscribe |
| A move to the current state | does nothing (`Object.is`)             | re-enters: aborts the visit and runs `enter` again |
| Waiting                     | none                                   | `once(m, method)`, `when(m, state)` |
| Allowed moves               | any                                    | an optional graph, checked by types and at runtime |
| Svelte                      | a writable store, so `$ctrl = …` works | a readable store; `get(m)` and server render run `enter` |

Stay on core when:

- handlers only switch state: tabs, a menu, view or edit mode, wizard steps;
- outside code sets the state, for example from the URL or a server push;
- nothing should depend on subscribers.

Use the machine when:

- a handler would `await` and then call `set`;
- a handler would start a timer;
- a cancel must win over a late result;
- a flow waits on the user, as with `once` or `when`;
- a child flow lives exactly as long as a parent state, as with `hold`.

Quick test: if every handler calls `set` before any `await` and starts no timer, stay on core.

`when` accepts any `{ get, subscribe }`, so a machine can wait on a core controller.

For the cases core covers, install `@muxmuxmux/core` and follow its skill at `node_modules/@muxmuxmux/core/skills/muxmuxmux/SKILL.md`.

## Define states, moves and entry work

```typescript
import { machine } from "@muxmuxmux/machine";

let file: File;

const upload = machine("idle", {
	idle: {
		start: (visit, picked: File) => {
			file = picked;
			visit.to("sending");
		},
	},
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

upload.start(picked); // idle → sending; enter starts the request
upload.cancel(); // sending → idle; the request aborts, and its catch moves nothing
```

- The public method drops the visit, so `upload.start(picked)` takes the file first.
- `visit.to(target)` moves only while the visit is current. Otherwise it does nothing and returns a dead visit.
- `enter(visit)` runs on every entry into its state, whichever method moved there.
- `visit.signal` aborts when the visit ends. `visit.active` says whether the visit is current.
- A method that returns a visit reads as `void` in its public type.
- Leave a state's object empty when nothing should happen in it, for example `done: {}`.

## Tie timers and requests to the signal

A late `visit.to` moves nothing, but the request still runs and the timer still fires. So pass `visit.signal` to every request, and clear every timer on abort.

```typescript
const session = machine("active", {
	active: {
		enter: (visit) => {
			const id = setTimeout(() => visit.to("idle"), 60_000);
			visit.signal.addEventListener("abort", () => clearTimeout(id));
		},
		// A move to the current state re-enters it, so the timer restarts
		touch: (visit) => visit.to("active"),
	},
	idle: { touch: (visit) => visit.to("active") },
});
```

An async `enter` that rejects with its own visit's abort reason ends quietly. Any other error surfaces as an uncaught error, so catch failures inside `enter`.

## Read the state

```typescript
upload.get(); // "idle" | "sending" | "failed"

const unsubscribe = upload.subscribe((state) => render(state));
```

`subscribe` calls the listener right away with the current state, then on every change. A move inside `enter` notifies only the state the machine settles on.

## Lifecycle

The machine follows Svelte's `readable` store: it works only while someone uses it.

- The first subscriber or method call starts it, and the current state's `enter` runs.
- The last unsubscribe stops it. The current visit aborts, and the state name stays.
- A method call on a stopped machine runs with a dead visit, so nothing moves.
- The next subscriber re-enters the current state. Work does not survive a stop, so an interrupted upload starts again.
- `get()`, `once` and `when` never start the machine.
- Keep a module-level machine running with `m.subscribe(() => {})`.

## Wait for calls and states

Inside a state, `once` waits for the next call to a method. Leaving the state rejects the wait, and `enter` ends quietly.

```typescript
const wizard = machine("intro", {
	intro: {
		enter: async (visit) => {
			const [name] = await once(wizard, "setName", visit);
			greet(name);
			await once(wizard, "next", visit);
			visit.to("done");
		},
		setName: (_visit, _name: string) => {},
		next: (_visit) => {},
	},
	done: {},
});
```

A method can hand a later answer to its caller by returning a wait:

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

const answer = await confirm.ask(); // [true] after answer(true); dismiss() rejects the wait
if (answer === undefined) {
	// confirm was already open, and "open" has no ask
}
```

From outside, `await when(upload, "idle")` waits for a state.

- Pass a visit, or any `{ signal }`, as the last argument. Its abort rejects the wait.
- Waiters resolve before the method body runs, so a method that leaves the state still resolves its waiter.
- A call that arrives before anything waits for it is lost. Nothing is buffered.

## Compose machines

`hold(child, visit)` keeps a child machine running for exactly as long as the visit lasts.

```typescript
const player = machine("stopped", {
	stopped: { play: (visit) => visit.to("playing") },
	playing: {
		enter: (visit) => hold(volume, visit),
		stop: (visit) => visit.to("stopped"),
	},
});
```

- To let a child move its parent, write `await when(child, "done", visit); visit.to("next")` inside the parent's `enter`.
- A child created outside the parent's visit keeps its state across exits. One created inside `enter` restarts at its initial state.
- For parallel states, run two machines side by side and combine them at render.

## Restrict moves with a graph

An optional third argument lists each state's allowed targets.

```typescript
machine("idle", states, {
	idle: ["sending"],
	sending: ["idle", "failed"],
	failed: ["sending"],
});
```

- Each state's `visit.to` then accepts only that state's targets.
- The typecheck rejects an unlisted move, a target that is not a state, and a state with no row.
- At runtime, an unlisted move throws from `visit.to`, and a bad graph throws at creation.
- Without a graph, a typo such as `visit.to("idel")` still fails to compile.
- Write a graph when someone reads it apart from the code: in review, docs or path tests.

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

- The machine keeps its identity for the component's lifetime. `initial` and `graph` apply on the first render only.
- Methods read the latest render's props. A running async `enter` keeps the props from when it entered. To read fresh props there, call a sibling method.
- The machine starts when the component subscribes, never on a call during render. Unmounting aborts the current visit.
- In development, StrictMode aborts the first `enter` and runs it again.
- React is an optional peer dependency, `^18.0.0 || ^19.0.0`.

## Svelte

- `$upload` subscribes on mount and unsubscribes on unmount. Mounting runs the initial `enter`, and unmounting aborts the visit.
- The machine has no `set`, so `$upload = …` fails. Moves go through visits.
- Server render subscribes only while the component renders. So the initial state's `enter` runs on the server until its first `await`.
- In a server-rendered component, keep the initial state inert: give it no `enter`. Otherwise, keep browser-only code after an `await`, and tie every request and timer to `visit.signal`.

## Test

Inject the request, so the test can watch its signal and settle it by hand.

```typescript
function createUpload(post: (init: { signal: AbortSignal }) => Promise<void>) {
	return machine("idle", {
		idle: { start: (visit) => visit.to("sending") },
		sending: {
			enter: async (visit) => {
				try {
					await post({ signal: visit.signal });
					visit.to("idle");
				} catch {
					visit.to("failed");
				}
			},
			cancel: (visit) => visit.to("idle"),
		},
		failed: {},
	});
}

it("lets a cancel win over a late failure", async () => {
	let signal: AbortSignal | undefined;
	const upload = createUpload((init) => {
		signal = init.signal;
		return new Promise((_, reject) =>
			init.signal.addEventListener("abort", () => reject(init.signal.reason)),
		);
	});

	upload.start();
	upload.cancel();
	expect(signal?.aborted).toBe(true);

	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(upload.get()).toBe("idle");
});
```

- Wait a macrotask before you assert on a move that follows an `await` in `enter`.
- Call `m.subscribe(() => {})` first when `enter` must run before any method call.

## Common mistakes

❌ Don't look for `set`. A machine has none. Move with `visit.to(target)` inside a method or `enter`.

❌ Don't pass data as `visit.to(target, data)`. `visit.to` takes only a target. Keep data in your own variable, and expose it through a method that only the data-bearing state defines. That method reads as `T | undefined`.

❌ Don't start a request or a timer without `visit.signal`. A late result moves nothing, but the work still runs.

❌ Don't let an async `enter` throw anything but its visit's abort reason. Any other error surfaces as an uncaught error, so catch it inside `enter`.

❌ Don't expect a move to the current state to do nothing, as in core. It re-enters: the old visit aborts, and `enter` runs again.

❌ Don't add an abort listener after an `await` to stop a child. The visit may already be over, so the listener never fires and the child leaks. Use `hold(child, visit)`.

❌ Don't call a method before the flow waits for it. Nothing is buffered, so the call is lost.

❌ Don't assume a call did something. In a state without the method, the call returns `undefined` and starts nothing. So `confirm.ask()` reads as `Promise<[ok: boolean]> | undefined`.

❌ Don't drop the return annotation from a method that returns `once(...)` on its own machine. Without it, the machine refers to itself, and TypeScript reports TS7022 and TS7023.

❌ Don't pass a core controller to `once`. It throws `TypeError: once needs a machine`. `when` accepts both.

❌ Don't call `get(m)` from `svelte/store`. It subscribes and unsubscribes at once, so it runs `enter` and aborts it. Call `m.get()` instead. `fromStore(m).current` does the same on every read outside an effect.

❌ Don't expect a module-level machine to keep working after its last subscriber leaves. The last unsubscribe aborts the current visit. Keep it running with `m.subscribe(() => {})`.

❌ Don't name a method `get`, `set`, `subscribe` or `enter`. TypeScript reports "reserved by the store; rename this method" for the first three. `enter` runs on entry and gets no public method.

❌ Don't create a machine inside a React component with `machine()`. It would be recreated on every render. Use `useMachine` from `@muxmuxmux/machine/react`.
