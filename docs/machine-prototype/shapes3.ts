// Type-only probe: can `to(target, data)` take its data type from the target's `enter`?

type Equal<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
		? true
		: false;
const assert = <T extends true>() => {};

/** Data a state takes: the second parameter of its enter, or nothing */
type DataOf<M, T extends keyof M> = M[T] extends {
	enter: (visit: never, data: infer D) => unknown;
}
	? [data: D]
	: [];

interface Visit<K extends string, M, S extends K> {
	readonly state: S;
	to<T extends K & keyof M>(target: T, ...data: DataOf<M, T>): void;
}

declare function machine<
	K extends string,
	M extends {
		// biome-ignore lint/suspicious/noExplicitAny: flexible signature
		[S in K]: Record<
			string,
			(visit: Visit<K, M, S>, ...args: any[]) => unknown
		>;
	},
>(initial: NoInfer<K>, states: M & Record<K, unknown>): M;

machine("idle", {
	idle: { start: (visit) => visit.to("sending") },
	sending: {
		fail: (visit) => visit.to("failed", new Error("x")),
	},
	failed: {
		enter: (_visit, error: Error) => {
			assert<Equal<typeof error, Error>>();
		},
	},
});
