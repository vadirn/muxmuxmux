/** Stores the methods object for each controller so we can retrieve it later */
// biome-ignore lint/suspicious/noExplicitAny: needed for generic controllers
const controllerMethods = new WeakMap<any, Methods>();

/**
 * Creates an observable
 * @internal
 */
function store<T>(initialValue: T): Store<T> {
	const listeners = new Set<(value: T) => void>();
	let currentValue = initialValue;

	return {
		get: () => currentValue,

		set: (newValue: T) => {
			if (Object.is(currentValue, newValue)) return;

			currentValue = newValue;
			for (const listener of listeners) listener(newValue);
		},

		subscribe: (listener: (value: T) => void) => {
			listener(currentValue);
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
}

/**
 * Adds a dispatcher for each method name, which calls the current state's version
 * @internal
 */
function attachDispatchers<M extends Methods>(
	store: Store<keyof M>,
	methods: M,
): Controller<M> {
	// biome-ignore lint/suspicious/noExplicitAny: avoids return type mismatch
	const dispatchers: any = {};

	for (const [_stateKey, stateMethods] of Object.entries(methods)) {
		for (const methodKey of Object.keys(stateMethods)) {
			if (methodKey in dispatchers || methodKey in store) {
				continue;
			}

			dispatchers[methodKey] = (...args: unknown[]) => {
				const currentState = store.get();
				return methods[currentState]?.[methodKey]?.(...args);
			};
		}
	}

	const controller = Object.assign(store, dispatchers);
	controllerMethods.set(controller, methods);
	return controller;
}

/**
 * Gets the methods object from a controller (useful for testing)
 *
 * @param controller - The controller instance
 * @returns The methods object
 *
 * @example
 * const ctrlMethods = inspectMethods(ctrl);
 * expect(ctrlMethods.idle.start).toHaveBeenCalled();
 */
export function inspectMethods<C>(
	controller: C,
): C extends Controller<infer M> ? M : never {
	// biome-ignore lint/suspicious/noExplicitAny: conditional type assertion
	return controllerMethods.get(controller) as any;
}

/**
 * Creates a controller - an observable that runs different methods based on the current state.
 *
 * When you call a method, it runs the version defined for the current state. If that state
 * doesn't have that method, it's a no-op that returns `undefined`.
 *
 * A method's return type is the union of its return types across states, plus `undefined`
 * when some state lacks the method. Its arguments must suit every state that defines it.
 *
 * @param defaultState - Starting state
 * @param methods - Object mapping states to their available methods
 * @returns Observable with all possible methods attached
 *
 * @example
 * const ctrl = controller("idle", {
 *   idle: { start: () => ctrl.set("running") },
 *   running: { stop: () => ctrl.set("idle") }
 * });
 *
 * ctrl.get();    // "idle"
 * ctrl.start();  // works - changes to "running"
 * ctrl.start();  // no-op - "running" doesn't have start
 * ctrl.stop();   // works - changes back to "idle"
 *
 * @example
 * const counter = controller("idle", {
 *   idle: { read: () => 0, reset: () => true },
 *   busy: { read: () => "busy" },
 * });
 *
 * counter.read();  // number | string
 * counter.reset(); // boolean | undefined - "busy" doesn't have reset
 */
export function controller<M extends Methods>(
	defaultState: keyof M,
	methods: M,
): FlattenIntersection<Controller<M>> {
	const s = store(defaultState);
	return attachDispatchers(s, methods);
}

/** Keys the store owns, so no dispatcher can take them */
type StoreKeys = keyof Store<unknown>;

export type Methods = Record<string, Record<string, AnyFn>>;

/** Store interface for observable state */
export type Store<T> = {
	get: () => T;
	set: (value: T) => void;
	subscribe: (listener: (value: T) => void) => () => void;
};

/** Method names that get a dispatcher: every name any state declares, except store keys */
type DispatcherKeys<M extends Methods> = Exclude<
	{ [S in keyof M]: keyof M[S] }[keyof M],
	StoreKeys
>;

/**
 * Union of each state's version of method K, `() => undefined` where a state lacks it.
 * Calling the union intersects the arguments and unions the return types.
 */
type Dispatcher<M extends Methods, K> = Unalias<
	{
		[S in keyof M]: K extends keyof M[S] ? M[S][K] : () => undefined;
	}[keyof M]
>;

/** Store plus one dispatcher per method name */
export type Controller<M extends Methods> = Store<keyof M> & {
	[K in DispatcherKeys<M>]: Dispatcher<M, K>;
} & {
	/** Type-only marker that lets `inspectMethods` infer `M`; always undefined at runtime */
	readonly __methods?: M;
};

// biome-ignore lint/suspicious/noExplicitAny: flexible function signature
type AnyFn = (...args: any[]) => void;

/**
 * Merges an intersection into one object type, so IntelliSense lists every key.
 * It drops call signatures, so apply it to object types only.
 */
type FlattenIntersection<T> = {
	[K in keyof T]: T[K];
} & {};

/**
 * Shows the computed type in IntelliSense instead of the alias name.
 * `infer` copies T into O, which makes TypeScript evaluate it.
 * Unlike FlattenIntersection, it keeps call signatures, so it works on function types.
 */
type Unalias<T> = T extends infer O ? O : never;
