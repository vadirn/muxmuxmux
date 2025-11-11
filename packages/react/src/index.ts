import { type Controller, controller, type Methods } from "@muxmuxmux/core";
import { useMemo, useSyncExternalStore } from "react";

/**
 * Hook that creates a controller and subscribes to its state changes.
 *
 * @param defaultState - The initial state
 * @param methods - State-dependent methods
 * @returns The controller instance with reactive state
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
	// biome-ignore lint/correctness/useExhaustiveDependencies: controller has to have stable identity
	const ctrl = useMemo(() => controller(defaultState, methods), []);

	useSyncExternalStore(ctrl.subscribe, ctrl.get, ctrl.get);

	return ctrl as Controller<M>;
}
