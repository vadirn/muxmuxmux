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
 * Adds all the methods to a store so they dispatch based on the current state
 * @internal
 */
function attachMethods<M extends Methods>(
	store: Store<keyof M>,
	methods: M,
): Controller<M> {
	// biome-ignore lint/suspicious/noExplicitAny: avoids return type mismatch
	const dispatchMethods: any = {};

	for (const [_stateKey, handlers] of Object.entries(methods)) {
		for (const methodKey of Object.keys(handlers)) {
			if (methodKey in dispatchMethods || methodKey in store) {
				continue;
			}

			dispatchMethods[methodKey] = (...args: unknown[]) => {
				const currentState = store.get();
				const availableMethods = methods[currentState];
				return availableMethods?.[methodKey]?.(...args);
			};
		}
	}

	const controller = merge(store, dispatchMethods);
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
 * Shallow merges objects using Object.assign
 * @internal
 */
function merge<Target extends object, Objects extends object[]>(
	target: Target,
	...objects: Objects
): MergeArrayOfObjects<Target, Objects> {
	return Object.assign(target, ...objects);
}

/**
 * Creates a controller - an observable that runs different methods based on the current state.
 *
 * When you call a method, it runs the version defined for the current state. If that state
 * doesn't have that method, it's a no-op.
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
 */
export function controller<M extends Methods>(
	defaultState: keyof M,
	methods: M,
): Prettify<Controller<M>> {
	const s = store(defaultState);
	return attachMethods(s, methods);
}

type ReservedKeys = "get" | "set" | "subscribe";

declare const __methods: unique symbol;

export type Methods = Record<string, Record<string, AnyFn>>;

/** Store interface for observable state */
export type Store<T> = {
	get: () => T;
	set: (value: T) => void;
	subscribe: (listener: (value: T) => void) => () => void;
};

/** Inferred methods from state methods object - dispatchers created from union intersection */
type DispatchMethods<M extends Methods> = UnionToIntersection<M[keyof M]>;

/** Controller with store methods and dynamic method dispatchers */
export type Controller<M extends Methods> = Store<keyof M> &
	Omit<DispatchMethods<M>, ReservedKeys> & {
		readonly [__methods]?: M;
	};

// biome-ignore lint/suspicious/noExplicitAny: flexible function signature
type AnyFn = (...args: any[]) => void;

/** Converts union of function types to intersection */
// biome-ignore lint/suspicious/noExplicitAny: distributive conditional type
type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (
	k: infer I extends U,
) => void
	? I
	: never;

/** Recursively merges array of objects */
type MergeArrayOfObjects<
	T1 extends object,
	Objects extends object[],
> = Objects extends [infer T2 extends object, ...infer Rest extends object[]]
	? MergeArrayOfObjects<Merge<T1, T2>, Rest>
	: T1;

/** Merges two object types with right taking precedence */
type Merge<T1, T2> = Omit<T1, keyof T2> & T2;

/** Pretty-prints a type for better IntelliSense display */
type Prettify<T> = {
	[K in keyof T]: T[K];
} & {};
