import {
	useInsertionEffect,
	useMemo,
	useRef,
	useSyncExternalStore,
} from "react";
// The same module the root entry uses, so `once` finds this hook's machines
import {
	type Graph,
	type Machine,
	machine,
	type States,
	startOnSubscribe,
} from "./machine.js";

/**
 * Hook that creates a machine and subscribes to its state.
 *
 * The machine keeps its identity for the component's lifetime.
 * `initial` and `graph` apply on the first render only.
 * Each method call runs the version from the latest committed render.
 * So methods can read props and state without `useCallback`.
 * A running async `enter` keeps the props from when it entered; call a sibling method to read fresh ones.
 * Method names come from the first render: a name that first appears later gets no dispatcher.
 *
 * The machine starts when the component subscribes, never on a call during render.
 * Unmounting aborts the current visit.
 *
 * @param initial - The starting state, read on the first render only
 * @param states - State name → method name → `(visit, ...args) => result`, re-read on every render
 * @param graph - State name → the states it may move to, read on the first render only
 * @returns The machine; the component re-renders on each state change
 *
 * @example
 * ```tsx
 * function Upload({ file }: { file: File }) {
 *   const upload = useMachine("idle", {
 *     idle: { start: (visit) => visit.to("sending") },
 *     sending: {
 *       enter: async (visit) => {
 *         await post(file, { signal: visit.signal });
 *         visit.to("idle");
 *       },
 *       cancel: (visit) => visit.to("idle"),
 *     },
 *   });
 *
 *   return upload.get() === "idle"
 *     ? <button onClick={upload.start}>Upload</button>
 *     : <button onClick={upload.cancel}>Cancel</button>;
 * }
 * ```
 */
export function useMachine<
	K extends string,
	M extends States<K, G>,
	const G extends Graph<K> = Graph<K>,
>(
	initial: NoInfer<K>,
	states: M & Record<K, unknown>,
	graph?: G,
): Machine<K, M> {
	const latest = useRef(states);

	// Runs before layout effects, so their method calls see this render's methods
	useInsertionEffect(() => {
		latest.current = states;
	});

	// biome-ignore lint/correctness/useExhaustiveDependencies: the machine has to have stable identity
	const m = useMemo(() => {
		// Each state looks up the latest methods at call time
		const delegates = {} as Record<string, unknown>;
		for (const state of Object.keys(states)) {
			Object.defineProperty(delegates, state, {
				enumerable: true,
				get: () => (latest.current as Record<string, unknown>)[state],
			});
		}
		const made = machine<K, M, G>(
			initial,
			delegates as M & Record<K, unknown>,
			graph,
		);
		// StrictMode may call a method during render on a machine it then discards
		startOnSubscribe(made);
		return made;
	}, []);

	useSyncExternalStore(m.subscribe, m.get, m.get);

	return m as Machine<K, M>;
}
