// Type-only probe: which declaration shapes let TypeScript type `visit`?
// Each method takes the visit first; the public method drops it.

type Equal<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
		? true
		: false;
const assert = <T extends true>() => {};

// biome-ignore lint/suspicious/noExplicitAny: flexible signature
type Fn = (visit: any, ...args: any[]) => unknown;
type Args<F> = F extends (visit: never, ...args: infer A) => unknown
	? A
	: never;
type Public<F> = F extends (visit: never, ...args: infer A) => infer R
	? (...args: A) => R
	: never;
type MethodKeys<T> = Exclude<keyof T, "enter" | "to">;

// ---------- Shape A: separate table ----------
type Edges = Record<string, readonly string[]>;
interface VisitA<E extends Edges, M, S extends keyof E & keyof M> {
	readonly state: S;
	to(target: E[S][number]): boolean;
	once<K extends MethodKeys<M[S]>>(method: K): Promise<Args<M[S][K]>>;
}
type StatesA<E extends Edges, M> = {
	[S in keyof E]: Record<
		string,
		(visit: VisitA<E, M, S & keyof M>, ...args: never[]) => unknown
	>;
};
declare function machineA<const E extends Edges, M extends StatesA<E, M>>(
	initial: NoInfer<keyof E>,
	edges: E & { [S in keyof E]: readonly (keyof E)[] },
	states: M,
): { [K in MethodKeys<M[keyof M]>]: Public<M[keyof M][K]> } & {
	get(): keyof E;
};

const a = machineA(
	"closed",
	{ closed: ["open"], open: ["closed"] },
	{
		closed: { show: (visit) => visit.to("open") },
		open: {
			enter: async (visit) => {
				const [ok] = await visit.once("answer");
				assert<Equal<typeof ok, boolean>>();
				visit.to("closed");
			},
			answer: (_visit, ok: boolean) => ok,
		},
	},
);
assert<Equal<typeof a.answer, (ok: boolean) => boolean>>();

// ---------- Shape B: no table, targets are any state ----------
interface VisitB<M, S extends keyof M> {
	readonly state: S;
	to(target: keyof M): boolean;
	once<K extends MethodKeys<M[S]>>(method: K): Promise<Args<M[S][K]>>;
}
type StatesB<M> = {
	[S in keyof M]: Record<
		string,
		(visit: VisitB<M, S>, ...args: never[]) => unknown
	>;
};
declare function machineB<M extends StatesB<M>>(
	initial: NoInfer<keyof M>,
	states: M,
): { [K in MethodKeys<M[keyof M]>]: Public<M[keyof M][K]> } & {
	get(): keyof M;
};

const b = machineB("closed", {
	closed: { show: (visit) => visit.to("open") },
	open: {
		enter: async (visit) => {
			const [ok] = await visit.once("answer");
			assert<Equal<typeof ok, boolean>>();
			visit.to("closed");
		},
		answer: (_visit, ok: boolean) => ok,
	},
});
assert<Equal<typeof b.answer, (ok: boolean) => boolean>>();

// ---------- Shape C: targets inline in each state ----------
interface VisitC<M, S extends keyof M> {
	readonly state: S;
	to(target: M[S] extends { to: readonly (infer T)[] } ? T : never): boolean;
	once<K extends MethodKeys<M[S]>>(method: K): Promise<Args<M[S][K]>>;
}
type StatesC<M> = {
	[S in keyof M]: { to: readonly (keyof M)[] } & {
		[K in Exclude<keyof M[S], "to">]: (
			visit: VisitC<M, S>,
			...args: never[]
		) => unknown;
	};
};
declare function machineC<const M extends StatesC<M>>(
	initial: NoInfer<keyof M>,
	states: M,
): { [K in MethodKeys<M[keyof M]>]: Public<M[keyof M][K]> } & {
	get(): keyof M;
};

const c = machineC("closed", {
	closed: { to: ["open"], show: (visit) => visit.to("open") },
	open: {
		to: ["closed"],
		enter: async (visit) => {
			const [ok] = await visit.once("answer");
			assert<Equal<typeof ok, boolean>>();
			visit.to("closed");
		},
		answer: (_visit, ok: boolean) => ok,
	},
});
assert<Equal<typeof c.answer, (ok: boolean) => boolean>>();
