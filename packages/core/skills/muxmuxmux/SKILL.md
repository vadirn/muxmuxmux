---
name: muxmuxmux
description: >
  State-dependent methods on an observable store with @muxmuxmux/core.
  controller(defaultState, methods) returns a store whose value is the current
  state name, plus one method per name that any state declares. A call runs the
  current state's version, or does nothing and returns undefined. Use when
  writing, reviewing or testing code that imports @muxmuxmux/core or
  @muxmuxmux/react, or when modelling UI states such as idle, loading and error.
metadata:
  type: core
  library: muxmuxmux
sources:
  - "vadirn/muxmuxmux:packages/core/src/index.ts"
  - "vadirn/muxmuxmux:packages/core/README.md"
---

# muxmuxmux

`controller` from `@muxmuxmux/core` combines two things:

- **A store** whose value is the current state name: `get()`, `set(state)`, `subscribe(listener)`.
- **Dispatchers**: one method per name that any state declares. A call runs the current state's version. In a state without that method, the call does nothing and returns `undefined`.

In React, use `useController` from `@muxmuxmux/react`. In Svelte, use the controller directly as a store.

## Define states and transitions

Write each state's methods. A method changes state by calling `set` on the controller's variable.

```typescript
import { controller } from "@muxmuxmux/core";

const upload = controller("idle", {
	idle: { start: (file: File) => send(file) },
	uploading: { cancel: () => upload.set("idle") },
	failed: { start: (file: File) => send(file), dismiss: () => upload.set("idle") },
});

async function send(file: File) {
	upload.set("uploading");
	try {
		await post(file);
		upload.set("idle");
	} catch {
		upload.set("failed");
	}
}
```

Leave a state's object empty when nothing should happen in it, for example `loading: {}`.

## Read the state

```typescript
upload.get(); // "idle" | "uploading" | "failed"

const unsubscribe = upload.subscribe((state) => render(state));
```

`subscribe` calls the listener right away with the current state, then on every change. `set` with the current state notifies nobody.

In Svelte, `$upload` is the current state.

## Use method results

A method's return type is the union across states, plus `undefined` when some state lacks the method.

```typescript
const counter = controller("idle", {
	idle: { read: () => 0, reset: () => true },
	busy: { read: () => "busy" },
});

const value = counter.read(); // number | string
const done = counter.reset(); // boolean | undefined
if (done === undefined) {
	// the call ran in "busy", which has no reset
}
```

## Test

`inspectMethods` returns the methods object, so tests can assert on spies.

```typescript
import { controller, inspectMethods } from "@muxmuxmux/core";

const ctrl = controller("idle", { idle: { start: vi.fn() }, running: {} });
ctrl.start();
expect(inspectMethods(ctrl).idle.start).toHaveBeenCalled();
```

## Common mistakes

❌ Don't store data in the state. The store's value is a state name only, so `set({ status, data })` fails to compile. Keep data in your own variables or stores.

❌ Don't expect `if (ctrl.get() === "idle")` to narrow method types. TypeScript keeps the full union inside the branch. Check the call's result instead.

❌ Don't assume a call did something. In a state without the method, the call returns `undefined` and changes nothing.

❌ Don't give one method incompatible parameters across states. Arguments must suit every state that defines the method, so `(x: number)` in one state and `(x: string)` in another makes the method uncallable.

❌ Don't name a method `get`, `set` or `subscribe`. The store owns those names. TypeScript reports "reserved by the store; rename this method", and plain JavaScript silently ignores the method.

❌ Don't reach the controller through `this` inside a method. Refer to the controller's variable, as in `upload.set("idle")`.

❌ Don't create a controller inside a React component with `controller()`. It would be recreated on every render. Use `useController` from `@muxmuxmux/react`.
