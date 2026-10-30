import { type Controller, controller, type Methods } from "@muxmuxmux/core";
import {
	useInsertionEffect,
	useMemo,
	useRef,
	useSyncExternalStore,
} from "react";

/**
 * Hook that creates a controller and subscribes to its state changes.
 *
 * The controller keeps its identity for the component's lifetime.
 * `defaultState` applies on the first render only.
 * Each method call runs the handler from the latest committed render.
 * So handlers can read props and state without `useCallback`.
 * Method names come from the first render: a name that first appears later gets no dispatcher.
 *
 * @param defaultState - The initial state, read on the first render only
 * @param methods - State-dependent methods, re-read on every render
 * @returns The controller; the component re-renders on each state change
 *
 * @example
 * ```tsx
 * function Button() {
 *   const handleClick = async () => {
 *     button.set("loading");
 *     await submitForm();
 *     button.set("idle");
 *   };
 *
 *   const button = useController("idle", {
 *     idle: { onClick: handleClick },
 *     loading: {},
 *   });
 *
 *   const state = button.get();
 *
 *   return (
 *     <button onClick={button.onClick} disabled={state === "loading"}>
 *       {state === "loading" ? "Loading..." : "Submit"}
 *     </button>
 *   );
 * }
 * ```
 */
export function useController<M extends Methods>(
	defaultState: keyof M,
	methods: M,
): Controller<M> {
	const latestMethods = useRef(methods);

	// Runs before layout effects, so their method calls see this render's handlers
	useInsertionEffect(() => {
		latestMethods.current = methods;
	});

	// biome-ignore lint/correctness/useExhaustiveDependencies: controller has to have stable identity
	const ctrl = useMemo(() => {
		// Each state looks up the latest handlers at call time
		const delegates = {} as M;
		for (const state of Object.keys(methods)) {
			Object.defineProperty(delegates, state, {
				enumerable: true,
				get: () => latestMethods.current[state],
			});
		}
		return controller(defaultState, delegates);
	}, []);

	useSyncExternalStore(ctrl.subscribe, ctrl.get, ctrl.get);

	return ctrl as Controller<M>;
}
