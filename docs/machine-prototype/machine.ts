// Spike 2: @muxmuxmux/machine. Throwaway.
// Methods get the current visit first; the public method drops it.
// Targets are any state, unless an optional graph narrows them.

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

// biome-ignore lint/suspicious/noExplicitAny: flexible signature
type Method<V> = (visit: V, ...args: any[]) => unknown;

type States<K extends string, G extends Graph<K>> = {
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

// Q3 mutant: replace `HideVisit<R>` below with `R` and types3.ts fails with TS2344
// biome-ignore lint/suspicious/noExplicitAny: structural check
type HideVisit<R> = R extends Visit<any, any> ? void : R;
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

export type Machine<K extends string, M> = {
	get: () => K;
	subscribe: (listener: (state: K) => void) => () => void;
} & { [N in MethodKeys<M>]: Dispatcher<M, N> } & {
	/** Type-only marker for `once` and `when`; always undefined at runtime */
	readonly __methods?: M;
};

type Unalias<T> = T extends infer O ? O : never;
type FlattenIntersection<T> = { [K in keyof T]: T[K] } & {};

type Internals = {
	waiters: Map<string, Set<(args: unknown[]) => void>>;
	/** Like subscribe, but neither starts nor keeps the machine running */
	watch: (watcher: (state: string) => void) => () => void;
};
// biome-ignore lint/suspicious/noExplicitAny: keyed by any machine
const internals = new WeakMap<any, Internals>();

// Spike 3 switches. Each test names the switch it proves can fail.
const env: Record<string, string | undefined> =
	(globalThis as { process?: { env: Record<string, string | undefined> } })
		.process?.env ?? {};
/** "dead" (proposed): a call on a stopped machine runs with a dead visit. "restart" (spike 2): it restarts. */
export const STOPPED_CALL = (env.STOPPED_CALL ?? "dead") as "dead" | "restart";
/** "1": the last unsubscribe stops in a microtask, not synchronously */
export const DEFER_STOP = env.DEFER_STOP === "1";
/** "1": the dispatcher starts the machine before looking the method up (spike 2 order) */
export const START_FIRST = env.START_FIRST === "1";

export type Options = {
	/** "call" (default): the first call or subscribe starts. "subscribe": only a subscriber starts. */
	start?: "call" | "subscribe";
};

/**
 * Creates a machine. With `graph`, each state may move only to its listed targets.
 *
 * Lifecycle follows Svelte's `readable` store. The first subscriber or method call
 * starts the machine: the current state's `enter` runs. When the last subscriber leaves,
 * the current visit aborts. The next subscriber or method call re-enters the current state.
 */
export function machine<
	K extends string,
	M extends States<K, G>,
	const G extends Graph<K> = Graph<K>,
>(
	initial: NoInfer<K>,
	states: M & Record<K, unknown>,
	graph?: G,
	options: Options = {},
): FlattenIntersection<Machine<K, M>> {
	const startOnCall = (options.start ?? "call") === "call";
	type AnyVisit = {
		state: string;
		abort: AbortController;
		signal: AbortSignal;
		readonly active: boolean;
		to: (target: string) => AnyVisit;
	};
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

	if (edges) {
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
		// A transition made inside enter has already notified
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

	/** A call starts a fresh machine. Whether it restarts a stopped one is the Q1 switch. */
	function startOnCallIfAllowed() {
		if (!startOnCall) return;
		if (phase === "fresh" || STOPPED_CALL === "restart") start();
	}

	function stop() {
		const halt = () => {
			if (listeners.size > 0) return; // a subscriber came back before the deferred stop
			phase = "stopped";
			current.abort.abort();
			// A dead stand-in, so the aborted visit stops being current
			current = createVisit(current.state, false);
		};
		if (DEFER_STOP) queueMicrotask(halt);
		else halt();
	}

	let current = createVisit(initial, false);

	// biome-ignore lint/suspicious/noExplicitAny: filled key by key
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
				if (START_FIRST) startOnCallIfAllowed();
				if (!table[current.state]?.[key]) return undefined;
				startOnCallIfAllowed();
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
	});
	return result;
}

type MethodsOf<X> = X extends { readonly __methods?: infer M } ? M : never;

/**
 * Resolves with the arguments of the next call to `method` that runs.
 * Rejects with the signal's reason when the signal aborts. Pass a visit to scope the wait to it.
 */
export function once<X, N extends MethodKeys<MethodsOf<X>> & string>(
	m: X,
	method: N,
	options: { signal?: AbortSignal } = {},
): Promise<CallArgs<MethodsOf<X>, N>> {
	const { waiters } = internals.get(m) as Internals;
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

/** Resolves once the machine is in `state`; right away if it already is */
export function when<K extends string>(
	m: { get: () => K; subscribe: (l: (s: K) => void) => () => void },
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
		// A machine is watched, so waiting neither starts nor keeps it running.
		// Any other store, such as a controller, is subscribed.
		const watch: (l: (s: K) => void) => () => void =
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
