// Type assertions for spike 2. `tsc --noEmit` must pass.
import { machine, once, type Visit, when } from "./machine.ts";

type Equal<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
		? true
		: false;
const assert = <T extends true>() => {};

declare function sendForm(init: { signal: AbortSignal }): Promise<void>;

// 1. No graph: any state is a target; typos fail
const button = machine("idle", {
	idle: { onClick: (visit, _e: MouseEvent) => visit.to("loading") },
	loading: {
		enter: async (visit) => {
			try {
				await sendForm({ signal: visit.signal });
				visit.to("idle");
			} catch {
				visit.to("error");
			}
		},
		cancel: (visit) => visit.to("idle"),
	},
	error: {
		onClick: (visit, _e: MouseEvent) => visit.to("loading"),
		// @ts-expect-error - "idel" is not a state
		typo: (visit) => visit.to("idel"),
	},
});

assert<Equal<ReturnType<typeof button.get>, "idle" | "loading" | "error">>();
declare const click: MouseEvent;
button.onClick(click); // the visit is not part of the public signature
// @ts-expect-error - enter is not a public method
button.enter;

// 2. Graph: targets narrow per state
const graphed = machine(
	"idle",
	{
		idle: { start: (visit) => visit.to("running") },
		running: {
			stop: (visit) => visit.to("idle"),
			// @ts-expect-error - running may not move to running
			restart: (visit) => visit.to("running"),
		},
	},
	{ idle: ["running"], running: ["idle"] },
);
// Spike 3 (Q3): the Visit is hidden from the public return type
assert<Equal<ReturnType<typeof graphed.start>, void | undefined>>();
void (null as unknown as Visit<never, never>);

machine(
	"a",
	{ a: {}, b: {} },
	// @ts-expect-error - "zz" is not a state
	{ a: ["zz"], b: [] },
);

machine(
	"a",
	{ a: {}, b: {} },
	// @ts-expect-error - "b" has no graph row
	{ a: ["b"] },
);

// 3. Waiting for a call inside enter
const dialog = machine("closed", {
	closed: { show: (visit) => visit.to("open") },
	open: {
		enter: async (visit) => {
			const [ok, note] = await once(dialog, "answer", visit);
			assert<Equal<typeof ok, boolean>>();
			assert<Equal<typeof note, string | undefined>>();
			visit.to("closed");
		},
		answer: (_visit, _ok: boolean, _note?: string) => {},
		dismiss: (visit) => visit.to("closed"),
	},
});
// @ts-expect-error - no state has a method "nope"
once(dialog, "nope");
// @ts-expect-error - enter cannot be awaited as a call
once(dialog, "enter");

// 4. Waiting for a state from outside
await when(dialog, "closed");
// @ts-expect-error - "gone" is not a state
await when(dialog, "gone");

// 6. Data into a state: an outer variable, read by a method only that state defines
let failure: Error | undefined;
const upload = machine("idle", {
	idle: { start: (visit) => void visit.to("sending") },
	sending: {
		enter: async (visit) => {
			try {
				await sendForm({ signal: visit.signal });
				visit.to("idle");
			} catch (error) {
				failure = error as Error;
				visit.to("failed");
			}
		},
	},
	failed: {
		error: () => failure as Error,
		retry: (visit) => void visit.to("sending"),
	},
});
assert<Equal<ReturnType<typeof upload.error>, Error | undefined>>();
assert<Equal<ReturnType<typeof upload.start>, undefined>>();

// 5. Reserved names fail
machine("a", {
	// @ts-expect-error - the store owns get
	a: { get: () => 1 },
});
