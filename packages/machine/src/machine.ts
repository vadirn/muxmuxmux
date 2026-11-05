// Internal module. `index.ts` and `react.ts` both import it, so the two entries share one
// `internals` map. Its `exports` entry is absent on purpose: `startOnSubscribe` stays private.

/** State name → the states it may move to */
export type Graph<K extends string = string> = { [S in K]: readonly K[] };

/** One stay in state S. It ends when the machine leaves, even if it comes back later. */
export interface Visit<G extends Graph, S extends keyof G> {
	readonly state: S;
	/** True while this visit is current */
	readonly active: boolean;
	/** Aborts when this visit ends */
	readonly signal: AbortSignal;
	/** Moves to target if this visit is current; returns the target's visit, dead if not */
	to<T extends G[S][number] & keyof G>(target: T): Visit<G, T>;
}

/** `enter` runs on entry; the store owns the rest */
type ReservedKeys = "get" | "set" | "subscribe" | "enter";

// biome-ignore lint/suspicious/noExplicitAny: a method takes any arguments after the visit
type Method<V> = (visit: V, ...args: any[]) => unknown;

/** Each state's methods: state name → method name → function taking the visit first */
export type States<K extends string, G extends Graph<K>> = {
	[S in K]: { enter?: (visit: Visit<G, S>) => unknown } & Record<
		string,
		Method<Visit<G, S>>
	> & {
			[R in Exclude<
				ReservedKeys,
				"enter"
			>]?: "reserved by the store; rename this method";
		};
};

// biome-ignore lint/suspicious/noExplicitAny: matches a visit of any machine
type SomeVisit = Visit<any, any>;
// A method that returns a visit reads as `void` publicly, so callers never hold a visit
// biome-ignore lint/suspicious/noConfusingVoidType: `void` tells callers to ignore the result
type HideVisit<R> = R extends SomeVisit ? void : R;
type Public<F> = F extends (visit: never, ...args: infer A) => infer R
	? (...args: A) => HideVisit<R>
	: never;
type MethodKeys<M> = Exclude<
	{ [S in keyof M]: keyof M[S] }[keyof M],
	ReservedKeys
>;
type Dispatcher<M, N> = Unalias<
	{
		[S in keyof M]: N extends keyof M[S] ? Public<M[S][N]> : () => undefined;
	}[keyof M]
>;
type CallArgs<M, N> = {
	[S in keyof M]: N extends keyof M[S] ? Parameters<Public<M[S][N]>> : never;
}[keyof M];

/** A store of the state name, plus one method per name that any state declares */
export type Machine<K extends string, M> = {
	get: () => K;
	subscribe: (listener: (state: K) => void) => () => void;
} & { [N in MethodKeys<M>]: Dispatcher<M, N> } & {
	/** Type-only marker for `once`; always undefined at runtime */
	readonly __methods?: M;
};

type Unalias<T> = T extends infer O ? O : never;
type FlattenIntersection<T> = { [K in keyof T]: T[K] } & {};

type Internals = {
	waiters: Map<string, Set<(args: unknown[]) => void>>;
	/** Like subscribe, but neither starts nor keeps the machine running */
	watch: (watcher: (state: string) => void) => () => void;
	startOnSubscribe: () => void;
};
const internals = new WeakMap<object, Internals>();

type AnyVisit = {
	state: string;
	abort: AbortController;
	signal: AbortSignal;
	readonly active: boolean;
	to: (target: string) => AnyVisit;
};

/**
 * Creates a machine: a store of the state name, plus one method per name that any state declares.
 *
 * A method call runs the current state's version with the current visit first.
 * In a state without that method, the call does nothing and returns `undefined`.
 * With `graph`, each state may move only to its listed targets.
 *
 * The lifecycle follows Svelte's `readable` store. The first subscriber or method call starts the
 * machine, and the current state's `enter` runs. When the last subscriber leaves, the current visit
 * aborts. A later subscriber re-enters the current state. A call on a stopped machine runs with a
 * dead visit, so it moves nothing.
 *
 * @param initial - The starting state
 * @param states - State name → method name → `(visit, ...args) => result`, plus an optional `enter`
 * @param graph - State name → the states it may move to
 *
 * @example
 * const upload = machine("idle", {
 *   idle: { start: (visit) => visit.to("sending") },
 *   sending: {
 *     enter: async (visit) => {
 *       try {
 *         await post(file, { signal: visit.signal });
 *         visit.to("idle");
 *       } catch {
 *         visit.to("failed");
 *       }
 *     },
 *     cancel: (visit) => visit.to("idle"),
 *   },
 *   failed: { retry: (visit) => visit.to("sending") },
 * });
 */
export function machine<
	K extends string,
	M extends States<K, G>,
	const G extends Graph<K> = Graph<K>,
>(
	initial: NoInfer<K>,
	states: M & Record<K, unknown>,
	graph?: G,
): FlattenIntersection<Machine<K, M>> {
	const edges = graph as Record<string, readonly string[]> | undefined;
	const table = states as unknown as Record<
		string,
		Record<string, Method<AnyVisit>>
	>;
	// One entry per subscription, so the same function subscribed twice counts twice
	const listeners = new Set<{ listener: (state: string) => void }>();
	// `when` watches without keeping the machine running
	const watchers = new Set<(state: string) => void>();
	const waiters = new Map<string, Set<(args: unknown[]) => void>>();
	let notified: string = initial;
	/** fresh: never started. running: a live visit. stopped: the last subscriber left. */
	let phase: "fresh" | "running" | "stopped" = "fresh";
	let startOnCall = true;

	if (edges) checkGraph(edges, table);

	function notify(state: string) {
		for (const { listener } of [...listeners]) listener(state);
		for (const watcher of [...watchers]) watcher(state);
	}

	function createVisit(state: string, live: boolean): AnyVisit {
		const abort = new AbortController();
		if (!live) abort.abort();
		const visit: AnyVisit = {
			state,
			abort,
			signal: abort.signal,
			get active() {
				return current === visit;
			},
			to(target: string) {
				if (!(target in table)) throw new Error(`"${target}" is not a state`);
				if (edges && !edges[state]?.includes(target)) {
					throw new Error(`${state} → ${target} is not in the graph`);
				}
				// A dead visit never moves, even while it is the stopped machine's stand-in
				if (abort.signal.aborted || current !== visit)
					return createVisit(target, false);
				return enter(target);
			},
		};
		return visit;
	}

	function runEnter(visit: AnyVisit) {
		const result = table[visit.state]?.enter?.(visit);
		if (result instanceof Promise) {
			result.catch((error) => {
				// A flow cut short by leaving its state is a normal end
				if (visit.signal.aborted && error === visit.signal.reason) return;
				queueMicrotask(() => {
					throw error;
				});
			});
		}
	}

	function enter(target: string): AnyVisit {
		current.abort.abort();
		const visit = createVisit(target, true);
		current = visit;
		runEnter(visit);
		// A move made inside enter has already notified
		if (current === visit && notified !== target) {
			notified = target;
			notify(target);
		}
		return visit;
	}

	function start() {
		if (phase === "running") return;
		phase = "running";
		enter(current.state);
	}

	function stop() {
		phase = "stopped";
		current.abort.abort();
		// A dead stand-in, so the aborted visit stops being current
		current = createVisit(current.state, false);
	}

	let current = createVisit(initial, false);

	// biome-ignore lint/suspicious/noExplicitAny: filled key by key, so only the return type can describe it
	const result: any = {
		// Reading never starts the machine, so render-time reads stay pure
		get: () => current.state,
		subscribe: (listener: (state: string) => void) => {
			start();
			const entry = { listener };
			listener(current.state);
			listeners.add(entry);
			return () => {
				if (listeners.delete(entry) && listeners.size === 0) stop();
			};
		},
	};
	for (const methods of Object.values(table)) {
		for (const key of Object.keys(methods)) {
			if (key in result || key === "set" || key === "enter") continue;
			result[key] = (...args: unknown[]) => {
				// A state without the method is a no-op that starts nothing
				if (!table[current.state]?.[key]) return undefined;
				if (startOnCall && phase === "fresh") start();
				const visit = current;
				const method = table[visit.state]?.[key];
				if (!method) return undefined;
				// Waiters resolve first, so a method that leaves the state still counts
				for (const resolve of [...(waiters.get(key) ?? [])]) resolve(args);
				return method(visit, ...args);
			};
		}
	}
	internals.set(result, {
		waiters,
		watch: (watcher) => {
			watcher(current.state);
			watchers.add(watcher);
			return () => watchers.delete(watcher);
		},
		startOnSubscribe: () => {
			startOnCall = false;
		},
	});
	return result;
}

/** Throws when a graph names a state that does not exist, or leaves a state out */
function checkGraph(
	edges: Record<string, readonly string[]>,
	table: Record<string, unknown>,
) {
	for (const [state, targets] of Object.entries(edges)) {
		if (!(state in table))
			throw new Error(`graph row "${state}" is not a state`);
		for (const target of targets) {
			if (!(target in table))
				throw new Error(`graph target "${target}" is not a state`);
		}
	}
	for (const state of Object.keys(table)) {
		if (!edges[state]) throw new Error(`state "${state}" has no graph row`);
	}
}

/**
 * Makes `m` start only when it gets a subscriber, never on a method call.
 * Call it before anything uses `m`. `useMachine` needs it, because React may call a method
 * during render on a machine it then discards.
 * @internal
 */
export function startOnSubscribe(m: object): void {
	internals.get(m)?.startOnSubscribe();
}

type MethodsOf<X> = X extends { readonly __methods?: infer M } ? M : never;

/**
 * Resolves with the arguments of the next call to `method` that runs.
 * Rejects with the signal's reason when the signal aborts. Pass a visit to scope the wait to it.
 * Waiting neither starts the machine nor keeps it running.
 *
 * @example
 * const [name] = await once(wizard, "setName", visit);
 */
export function once<
	X extends object,
	N extends MethodKeys<MethodsOf<X>> & string,
>(
	m: X,
	method: N,
	options: { signal?: AbortSignal } = {},
): Promise<CallArgs<MethodsOf<X>, N>> {
	const machineInternals = internals.get(m);
	if (!machineInternals) throw new TypeError("once needs a machine");
	const { waiters } = machineInternals;
	const { signal } = options;
	return new Promise((resolve, reject) => {
		if (signal?.aborted) return reject(signal.reason);
		const set = waiters.get(method) ?? new Set();
		waiters.set(method, set);
		const done = (args: unknown[]) => {
			cleanup();
			resolve(args as CallArgs<MethodsOf<X>, N>);
		};
		const onAbort = () => {
			cleanup();
			reject(signal?.reason);
		};
		function cleanup() {
			set.delete(done);
			signal?.removeEventListener("abort", onAbort);
		}
		set.add(done);
		signal?.addEventListener("abort", onAbort, { once: true });
	});
}

/**
 * Resolves once the store is in `state`, right away if it already is.
 * Rejects with the signal's reason when the signal aborts.
 * Works on any `{ get, subscribe }`. A machine is watched, so waiting neither starts it nor keeps it running.
 *
 * @example
 * await when(upload, "idle");
 */
export function when<K extends string>(
	m: { get: () => K; subscribe: (listener: (state: K) => void) => () => void },
	state: NoInfer<K>,
	options: { signal?: AbortSignal } = {},
): Promise<void> {
	const { signal } = options;
	return new Promise((resolve, reject) => {
		if (signal?.aborted) return reject(signal.reason);
		let unsubscribe = () => {};
		const onAbort = () => {
			unsubscribe();
			reject(signal?.reason);
		};
		let settled = false;
		// Any other store, such as a controller, is subscribed
		const watch: (listener: (state: K) => void) => () => void =
			(internals.get(m)?.watch as typeof m.subscribe | undefined) ??
			m.subscribe;
		unsubscribe = watch((s) => {
			if (s !== state || settled) return;
			settled = true;
			queueMicrotask(() => unsubscribe());
			signal?.removeEventListener("abort", onAbort);
			resolve();
		});
		if (settled) unsubscribe();
		else signal?.addEventListener("abort", onAbort, { once: true });
	});
}

/**
 * Keeps `child` running for exactly as long as `visit` lasts.
 * Safe after an `await`: a visit that has already ended releases the child at once.
 *
 * @example
 * playing: { enter: (visit) => hold(volume, visit) }
 */
export function hold<S>(
	child: { subscribe: (listener: (state: S) => void) => () => void },
	visit: { readonly signal: AbortSignal },
): void {
	const off = child.subscribe(() => {});
	if (visit.signal.aborted) off();
	else visit.signal.addEventListener("abort", off, { once: true });
}
