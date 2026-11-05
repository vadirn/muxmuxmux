// Q3: a method that returns visit.to(...) has a public return type of void, not Visit.
// Mutant: replace HideVisit<R> with R in machine.ts; the first assert fails with TS2344.
import { machine, once, type Visit } from "./machine.ts";

type Equal<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
		? true
		: false;
const assert = <T extends true>() => {};

const graphed = machine(
	"idle",
	{
		idle: { start: (visit) => visit.to("running") },
		running: { stop: (visit) => visit.to("idle") },
	},
	{ idle: ["running"], running: ["idle"] },
);
// 3c: no `void visit.to(...)` needed; the union with the absent-state `() => undefined` stays
assert<Equal<ReturnType<typeof graphed.start>, undefined | void>>();

// 3a: inside a method, the return value is still the target's visit
machine("a", {
	a: {
		go: (visit) => {
			const next = visit.to("b");
			assert<
				Equal<
					typeof next,
					Visit<{ a: readonly string[]; b: readonly string[] }, "b">
				>
			>();
			assert<Equal<typeof next.state, "b">>();
		},
	},
	b: {},
});

// 3b: the opener still typechecks with an annotation, and its public type is the promise
const confirm = machine("closed", {
	closed: {
		ask: (visit): Promise<[ok: boolean]> =>
			once(confirm, "answer", visit.to("open")),
	},
	open: { answer: (visit, _ok: boolean) => visit.to("closed") },
});
assert<
	Equal<ReturnType<typeof confirm.ask>, Promise<[ok: boolean]> | undefined>
>();
assert<Equal<ReturnType<typeof confirm.answer>, void | undefined>>();

// Not mapped: an async method that returns the visit keeps Promise<Visit>
const asyncMover = machine("a", {
	a: {
		go: async (visit) => {
			await Promise.resolve();
			return visit.to("b");
		},
	},
	b: {},
});
type Inner =
	Exclude<ReturnType<typeof asyncMover.go>, undefined> extends Promise<infer X>
		? X
		: never;
assert<
	Equal<Inner extends { state: "b"; signal: AbortSignal } ? true : false, true>
>();
