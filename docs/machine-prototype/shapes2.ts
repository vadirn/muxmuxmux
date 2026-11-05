// Type-only probe, round 2. `visit` no longer refers to the methods object.
// Waiting moves to the machine: `m.once("answer", { signal })`, as in Node's events.once.

type Equal<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
		? true
		: false;
const assert = <T extends true>() => {};

type Public<F> = F extends (visit: never, ...args: infer A) => infer R
	? (...args: A) => R
	: never;
type AllKeys<M> = { [S in keyof M]: keyof M[S] }[keyof M];
type MethodKeys<M> = Exclude<AllKeys<M>, "enter">;
type Dispatcher<M, N> = {
	[S in keyof M]: N extends keyof M[S] ? Public<M[S][N]> : () => undefined;
}[keyof M];
/** Arguments of method N, from the states that define it */
type CallArgs<M, N> = {
	[S in keyof M]: N extends keyof M[S] ? Parameters<Public<M[S][N]>> : never;
}[keyof M];
type Machine<K, M> = { get(): K } & {
	[N in MethodKeys<M>]: Dispatcher<M, N>;
} & {
	once<N extends MethodKeys<M>>(
		method: N,
		options?: { signal?: AbortSignal },
	): Promise<CallArgs<M, N>>;
};

interface Visit<S, T> {
	readonly state: S;
	readonly signal: AbortSignal;
	to(target: T): boolean;
}

// ---------- A: separate table ----------
type Edges = Record<string, readonly string[]>;
declare function machineA<
	const E extends Edges,
	M extends {
		[S in keyof E]: Record<
			string,
			(visit: Visit<S, E[S][number]>, ...args: never[]) => unknown
		>;
	},
>(
	initial: NoInfer<keyof E>,
	edges: E & { [S in keyof E]: readonly (keyof E)[] },
	states: M,
): Machine<keyof E, M>;

const a = machineA(
	"closed",
	{ closed: ["open"], open: ["closed"] },
	{
		closed: { show: (visit) => visit.to("open") },
		open: {
			enter: async (visit) => {
				const [ok] = await a.once("answer", { signal: visit.signal });
				assert<Equal<typeof ok, boolean>>();
				visit.to("closed");
				// @ts-expect-error - open does not declare a move to itself
				visit.to("open");
			},
			answer: (_visit, ok: boolean) => ok,
		},
	},
);
assert<
	Equal<typeof a.answer, ((ok: boolean) => boolean) | (() => undefined)>
>();
assert<Equal<typeof a.show, (() => boolean) | (() => undefined)>>();

// ---------- B: no table; state names come from the keys ----------
declare function machineB<
	K extends string,
	M extends {
		[S in K]: Record<string, (visit: Visit<S, K>, ...args: never[]) => unknown>;
	},
>(initial: NoInfer<K>, states: M & Record<K, unknown>): Machine<K, M>;

const b = machineB("closed", {
	closed: { show: (visit) => visit.to("open") },
	open: {
		enter: async (visit) => {
			const [ok] = await b.once("answer", { signal: visit.signal });
			assert<Equal<typeof ok, boolean>>();
			visit.to("closed");
			// @ts-expect-error - "nope" is not a state
			visit.to("nope");
		},
		answer: (_visit, ok: boolean) => ok,
	},
});
assert<
	Equal<typeof b.answer, ((ok: boolean) => boolean) | (() => undefined)>
>();
assert<Equal<ReturnType<typeof b.get>, "closed" | "open">>();

// ---------- C: targets inline, through a per-state helper ----------
type StateDef<T extends string, Methods> = {
	targets: readonly T[];
	methods: Methods;
};
declare function state<
	const T extends string,
	Methods extends Record<
		string,
		(visit: Visit<string, T>, ...args: never[]) => unknown
	>,
>(targets: readonly T[], methods: Methods): StateDef<T, Methods>;
declare function machineC<
	K extends string,
	D extends { [S in K]: StateDef<K, unknown> },
>(
	initial: NoInfer<K>,
	states: D & Record<K, unknown>,
): Machine<
	K,
	{ [S in keyof D]: D[S] extends StateDef<string, infer M> ? M : never }
>;

const c = machineC("closed", {
	closed: state(["open"], { show: (visit) => visit.to("open") }),
	open: state(["closed"], {
		enter: async (visit) => {
			const [ok] = await c.once("answer", { signal: visit.signal });
			assert<Equal<typeof ok, boolean>>();
			visit.to("closed");
			// @ts-expect-error - open does not declare a move to itself
			visit.to("open");
		},
		answer: (_visit, ok: boolean) => ok,
	}),
});
assert<
	Equal<typeof c.answer, ((ok: boolean) => boolean) | (() => undefined)>
>();

machineC("a", {
	// @ts-expect-error - "zz" is not a state
	a: state(["zz"], {}),
});
