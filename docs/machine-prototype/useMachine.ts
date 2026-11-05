// design.md section 8, typed loosely. The delegate trick from useController, plus three guard variants.
import { React } from "./react-env.ts";
import { type Graph, machine } from "./machine.ts";

export const constructed: unknown[] = [];

/**
 * none: the sketch as written.
 * knob: the machine takes `{ start: "subscribe" }`, so no call ever starts it.
 * mounted: delegates return no methods until the hook's own subscription is live (knob-free 1e).
 */
export type Guard = "none" | "knob" | "mounted";

// biome-ignore lint/suspicious/noExplicitAny: spike
export function useMachine<K extends string>(
	initial: K,
	states: Record<K, any>,
	graph?: Graph<K>,
	guard: Guard = "none",
): any {
	const latest = React.useRef(states);
	React.useInsertionEffect(() => {
		latest.current = states;
	});
	const live = React.useRef(false);
	const m = React.useMemo(() => {
		const delegates = {} as Record<K, unknown>;
		for (const state of Object.keys(states) as K[]) {
			Object.defineProperty(delegates, state, {
				enumerable: true,
				get: () =>
					guard === "mounted" && !live.current
						? undefined
						: latest.current[state],
			});
		}
		live.current = true; // construction reads the method names
		const made = machine(
			initial,
			delegates as never,
			graph as never,
			guard === "knob" ? { start: "subscribe" } : {},
		);
		live.current = false;
		constructed.push(made);
		return made;
	}, []);
	const subscribe = React.useCallback(
		(l: () => void) => {
			live.current = true;
			const off = m.subscribe(l);
			return () => {
				live.current = false;
				off();
			};
		},
		[m],
	);
	React.useSyncExternalStore(subscribe, m.get, m.get);
	return m;
}
