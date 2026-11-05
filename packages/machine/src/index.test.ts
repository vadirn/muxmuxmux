import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { hold, machine, once, type Visit, when } from "./index";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const noop = () => {};

/** Runs `fn` and collects errors that queued microtasks throw: the machine rethrows through them */
async function catchRethrown(fn: () => Promise<void>): Promise<unknown[]> {
	const caught: unknown[] = [];
	const original = globalThis.queueMicrotask.bind(globalThis);
	const spy = vi
		.spyOn(globalThis, "queueMicrotask")
		.mockImplementation((callback) =>
			original(() => {
				try {
					callback();
				} catch (error) {
					caught.push(error);
				}
			}),
		);
	try {
		await fn();
	} finally {
		spy.mockRestore();
	}
	return caught;
}

/** A request the test settles by hand */
type Pending = { resolve: () => void; reject: () => void; signal: AbortSignal };

function createSendForm() {
	const pending: Pending[] = [];
	const sendForm = ({ signal }: { signal: AbortSignal }) =>
		new Promise<void>((resolve, reject) => {
			pending.push({
				resolve,
				reject: () => reject(new Error("failed")),
				signal,
			});
			signal.addEventListener("abort", () => reject(signal.reason));
		});
	return { pending, sendForm };
}

function createButton(
	sendForm: (init: { signal: AbortSignal }) => Promise<void>,
) {
	return machine("idle", {
		idle: {
			onClick: (visit, e: { type: string }) => {
				visit.to("loading");
				return e.type;
			},
		},
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
		error: { onClick: (visit) => visit.to("loading") },
	});
}

afterEach(() => {
	vi.useRealTimers();
});

describe("machine", () => {
	it("passes the event first and runs the state's work on entry", async () => {
		const { pending, sendForm } = createSendForm();
		const button = createButton(sendForm);

		expect(button.onClick({ type: "click" })).toBe("click");
		expect(button.get()).toBe("loading");
		expect(pending).toHaveLength(1);

		pending[0]?.resolve();
		await tick();
		expect(button.get()).toBe("idle");
	});

	it("aborts a state's work when the machine leaves it", async () => {
		const { pending, sendForm } = createSendForm();
		const button = createButton(sendForm);

		button.onClick({ type: "click" });
		button.cancel();
		expect(pending[0]?.signal.aborted).toBe(true);
		await tick();
		expect(button.get()).toBe("idle"); // the aborted request's catch cannot move to error
	});

	it("ignores a result from an earlier visit to the same state", async () => {
		const { pending, sendForm } = createSendForm();
		const button = createButton(sendForm);

		button.onClick({ type: "click" });
		const first = pending[0];
		button.cancel();
		button.onClick({ type: "click" });
		const second = pending[1];

		first?.reject();
		await tick();
		expect(button.get()).toBe("loading");

		second?.reject();
		await tick();
		expect(button.get()).toBe("error");
	});

	it("does nothing on a call the current state lacks", () => {
		const { sendForm } = createSendForm();
		const button = createButton(sendForm);
		expect(button.cancel()).toBeUndefined();
		expect(button.get()).toBe("idle");
	});

	it("notifies subscribers only of the state a move inside enter settles on", () => {
		const router = machine("start", {
			start: { go: (visit) => visit.to("check") },
			check: { enter: (visit) => visit.to("ready") },
			ready: {},
		});
		const seen: string[] = [];
		router.subscribe((state) => seen.push(state));
		router.go();
		expect(seen).toEqual(["start", "ready"]);
	});

	it("re-enters on a move to the current state, without notifying", () => {
		vi.useFakeTimers();
		const session = machine("active", {
			active: {
				enter: (visit) => {
					const id = setTimeout(() => visit.to("idle"), 30);
					visit.signal.addEventListener("abort", () => clearTimeout(id));
				},
				touch: (visit) => visit.to("active"),
			},
			idle: { touch: (visit) => visit.to("active") },
		});
		const seen: string[] = [];
		session.subscribe((state) => seen.push(state));

		vi.advanceTimersByTime(20);
		session.touch();
		vi.advanceTimersByTime(20);
		session.touch();
		vi.advanceTimersByTime(20);
		expect(session.get()).toBe("active"); // each touch restarted the 30 ms timer

		vi.advanceTimersByTime(30);
		expect(session.get()).toBe("idle");
		expect(seen).toEqual(["active", "idle"]);
	});

	it("rethrows an enter error other than the visit's abort", async () => {
		const caught = await catchRethrown(async () => {
			const broken = machine("a", {
				a: {
					enter: async () => {
						throw new Error("boom");
					},
				},
			});
			broken.subscribe(noop);
			await tick();
			await tick();
		});
		expect(caught).toHaveLength(1);
		expect(String(caught[0])).toMatch(/boom/);
	});
});

describe("graph", () => {
	it("throws on an unlisted move", () => {
		const strict = machine(
			"a",
			{
				a: { jump: (visit) => (visit.to as (target: string) => unknown)("c") },
				b: {},
				c: {},
			},
			{ a: ["b"], b: [], c: [] },
		);
		expect(() => strict.jump()).toThrow(/a → c is not in the graph/);
	});

	it("rethrows an unlisted move inside an async enter, and stays put", async () => {
		const late = machine(
			"a",
			{
				a: {
					enter: async (visit) => {
						await tick();
						(visit.to as (target: string) => unknown)("c");
					},
				},
				b: {},
				c: {},
			},
			{ a: ["b"], b: [], c: [] },
		);
		const caught = await catchRethrown(async () => {
			late.subscribe(noop);
			await tick();
			await tick();
		});
		expect(caught).toHaveLength(1);
		expect(String(caught[0])).toMatch(/a → c is not in the graph/);
		expect(late.get()).toBe("a");
	});

	it("throws at creation on a bad graph", () => {
		expect(() =>
			machine("a", { a: {}, b: {} }, { a: ["b"], b: ["zz"] } as never),
		).toThrow(/graph target "zz" is not a state/);
		expect(() => machine("a", { a: {}, b: {} }, { a: ["b"] } as never)).toThrow(
			/state "b" has no graph row/,
		);
	});
});

describe("once and when", () => {
	it("hands a later answer to the caller, even when the answering method leaves", async () => {
		const dialog = machine("closed", {
			closed: {
				ask: (visit): Promise<[ok: boolean]> =>
					once(dialog, "answer", visit.to("open")),
			},
			open: {
				answer: (visit, _ok: boolean) => visit.to("closed"),
				dismiss: (visit) => visit.to("closed"),
			},
		});

		const answer = dialog.ask();
		expect(dialog.get()).toBe("open");
		dialog.answer(true);
		await expect(answer).resolves.toEqual([true]);
		expect(dialog.get()).toBe("closed");

		const dismissed = dialog.ask();
		dialog.dismiss();
		await expect(dismissed).rejects.toMatchObject({ name: "AbortError" });
	});

	it("runs a multi-step flow inside enter and drops calls nobody waits for", async () => {
		const steps: string[] = [];
		const wizard = machine("intro", {
			intro: {
				enter: async (visit) => {
					const [name] = await once(wizard, "setName", visit);
					steps.push(`name:${name}`);
					await once(wizard, "next", visit);
					visit.to("done");
				},
				setName: (_visit, _name: string) => {},
				next: noop,
			},
			done: {},
		});
		wizard.subscribe(noop);
		wizard.next(); // nothing waits for next yet
		wizard.setName("Ada");
		await tick();
		wizard.next();
		await tick();
		expect(steps).toEqual(["name:Ada"]);
		expect(wizard.get()).toBe("done");
	});

	it("ends a waiting flow quietly when the machine leaves the state", async () => {
		let resumed = false;
		const waiting = machine("wait", {
			wait: {
				enter: async (visit) => {
					await once(waiting, "go", visit);
					resumed = true;
				},
				go: noop,
				leave: (visit) => visit.to("gone"),
			},
			gone: {},
		});
		waiting.subscribe(noop);
		waiting.leave();
		await tick();
		expect(resumed).toBe(false);
	});

	it("waits for a state from outside", async () => {
		const { pending, sendForm } = createSendForm();
		const button = createButton(sendForm);
		button.onClick({ type: "click" });
		const idle = when(button, "idle");
		pending[0]?.resolve();
		await idle;
		expect(button.get()).toBe("idle");
	});

	it("throws when once gets something other than a machine", () => {
		expect(() => once({}, "ping" as never)).toThrow(/once needs a machine/);
	});

	it("rejects once with the signal's reason", async () => {
		const m = machine("a", { a: { ping: noop } });
		const controller = new AbortController();
		const wait = once(m, "ping", controller);
		controller.abort();
		await expect(wait).rejects.toMatchObject({ name: "AbortError" });
	});
});

describe("lifecycle", () => {
	it("starts on the first call, and a stopped machine's call runs with a dead visit", () => {
		let enters = 0;
		let data = 0;
		const m = machine("idle", {
			idle: {
				enter: () => {
					enters++;
				},
				read: () => data,
				go: (visit) => void visit.to("busy"),
			},
			busy: {
				enter: () => {
					enters++;
				},
			},
		});

		expect(m.read()).toBe(0);
		expect(enters).toBe(1);

		m.subscribe(noop)(); // stop
		data = 7;
		expect(m.read()).toBe(7);
		m.go();
		expect(m.get()).toBe("idle");
		expect(enters).toBe(1);

		const off = m.subscribe(noop);
		expect(enters).toBe(2);
		m.go();
		expect(m.get()).toBe("busy");
		off();
	});

	it("starts nothing on a call the current state lacks", () => {
		let enters = 0;
		const m = machine("idle", {
			idle: {
				enter: () => {
					enters++;
				},
			},
			failed: { error: () => new Error("x") },
		});
		expect(m.error()).toBeUndefined();
		expect(enters).toBe(0);
	});

	it("checks the method against the state before starting, even when enter would move", () => {
		const router = machine("start", {
			start: { enter: (visit) => void visit.to("ready") },
			ready: { foo: () => "ran" },
		});
		expect(router.foo()).toBeUndefined();
		expect(router.get()).toBe("start");
		router.subscribe(noop);
		expect(router.get()).toBe("ready");
		expect(router.foo()).toBe("ran");
	});

	it("never starts on get", () => {
		let enters = 0;
		const m = machine("a", {
			a: {
				enter: () => {
					enters++;
				},
			},
		});
		expect(m.get()).toBe("a");
		expect(enters).toBe(0);
	});

	it("stops synchronously on the last unsubscribe, and the next subscriber re-enters", () => {
		const signals: AbortSignal[] = [];
		const m = machine("live", {
			live: {
				enter: (visit) => {
					signals.push(visit.signal);
				},
			},
		});
		m.subscribe(noop)();
		expect(signals[0]?.aborted).toBe(true);
		const off = m.subscribe(noop);
		expect(signals).toHaveLength(2);
		expect(signals[1]?.aborted).toBe(false);
		off();
	});

	it("lets a pending once waiter neither keep the machine running nor restart it", async () => {
		let enters = 0;
		const m = machine("a", {
			a: {
				enter: () => {
					enters++;
				},
				ping: noop,
			},
		});
		m.subscribe(noop)();
		const waiter = once(m, "ping");
		m.ping(); // a call on the stopped machine
		await expect(waiter).resolves.toEqual([]);
		expect(enters).toBe(1);
	});

	it("lets when watch without starting the machine", async () => {
		let enters = 0;
		const m = machine("a", {
			a: {
				enter: () => {
					enters++;
				},
			},
		});
		await when(m, "a");
		expect(enters).toBe(0);
	});
});

describe("composition", () => {
	function createVolume(signals: AbortSignal[]) {
		return machine("muted", {
			muted: {
				enter: (visit) => {
					signals.push(visit.signal);
				},
				up: (visit) => void visit.to("loud"),
			},
			loud: {
				enter: (visit) => {
					signals.push(visit.signal);
				},
				down: (visit) => void visit.to("muted"),
			},
		});
	}

	it("holds a child for as long as the parent state lasts, and the child keeps its state", () => {
		const signals: AbortSignal[] = [];
		const volume = createVolume(signals);
		const player = machine("stopped", {
			stopped: { play: (visit) => void visit.to("playing") },
			playing: {
				enter: (visit) => hold(volume, visit),
				stop: (visit) => void visit.to("stopped"),
			},
		});

		player.play();
		expect(signals).toHaveLength(1);
		volume.up();
		player.stop();
		expect(signals.at(-1)?.aborted).toBe(true);
		expect(volume.get()).toBe("loud");

		player.play();
		expect(signals).toHaveLength(3);
		expect(signals.at(-1)?.aborted).toBe(false);
		player.stop();

		volume.down(); // a call on the stopped child moves nothing
		expect(volume.get()).toBe("loud");
		expect(signals).toHaveLength(3);
	});

	it("releases the child at once when the visit ended during an await", async () => {
		let running = 0;
		const child = machine("on", {
			on: {
				enter: (visit) => {
					running++;
					visit.signal.addEventListener("abort", () => running--);
				},
			},
		});
		const gate = Promise.withResolvers<void>();
		const parent = machine("a", {
			a: {
				enter: async (visit) => {
					await gate.promise;
					hold(child, visit);
				},
				go: (visit) => void visit.to("b"),
			},
			b: {},
		});
		parent.subscribe(noop);
		parent.go(); // leaves `a` before the await resolves
		gate.resolve();
		await tick();
		expect(running).toBe(0);
	});

	it("moves the parent when the child reaches a state", async () => {
		const task = machine("running", {
			running: { finish: (visit) => void visit.to("done") },
			done: {},
		});
		const flow = machine("working", {
			working: {
				enter: async (visit) => {
					hold(task, visit);
					await when(task, "done", visit);
					visit.to("next");
				},
			},
			next: {},
		});
		flow.subscribe(noop);
		task.finish();
		await tick();
		expect(flow.get()).toBe("next");
	});

	it("ends the parent's wait quietly when the parent leaves first", async () => {
		const task = machine("running", { running: {}, done: {} });
		const flow = machine("working", {
			working: {
				enter: async (visit) => {
					await when(task, "done", visit);
					visit.to("next");
				},
				abandon: (visit) => void visit.to("abandoned"),
			},
			next: {},
			abandoned: {},
		});
		flow.subscribe(noop);
		flow.abandon();
		await tick();
		expect(flow.get()).toBe("abandoned");
	});

	it("keeps history for children made outside the visit, and resets ones made inside", () => {
		const log: string[] = [];
		const leaf = machine("x", {
			x: { next: (visit) => void visit.to("y") },
			y: {},
		});
		const mid = machine("p", {
			p: {
				enter: (visit) => {
					hold(leaf, visit);
					const inner = machine("i", {
						i: { bump: (v) => void v.to("j") },
						j: {},
					});
					hold(inner, visit);
					log.push(`inner:${inner.get()}`);
					inner.bump();
				},
				next: (visit) => void visit.to("q"),
			},
			q: {},
		});
		const top = machine("on", {
			on: {
				enter: (visit) => hold(mid, visit),
				off: (visit) => void visit.to("off"),
			},
			off: { on: (visit) => void visit.to("on") },
		});

		top.subscribe(noop);
		leaf.next();
		top.off();
		top.on();
		expect(mid.get()).toBe("p");
		expect(leaf.get()).toBe("y");
		expect(log).toEqual(["inner:i", "inner:i"]);
	});
});

describe("Type inference", () => {
	const sendForm = (_init: { signal: AbortSignal }) => Promise.resolve();

	it("accepts any state name as a target without a graph, and rejects typos", () => {
		const button = machine("idle", {
			idle: { onClick: (visit, _e: MouseEvent) => visit.to("loading") },
			loading: {
				enter: async (visit) => {
					await sendForm({ signal: visit.signal });
					visit.to("idle");
				},
				cancel: (visit) => visit.to("idle"),
			},
			error: {
				onClick: (visit, _e: MouseEvent) => visit.to("loading"),
				// @ts-expect-error - "idel" is not a state
				typo: (visit) => visit.to("idel"),
			},
		});

		expectTypeOf(button.get()).toEqualTypeOf<"idle" | "loading" | "error">();
		// The visit is not part of the public signature
		expectTypeOf(button.onClick).toEqualTypeOf<
			((e: MouseEvent) => void) | (() => undefined)
		>();
		// @ts-expect-error - enter is not a public method
		expectTypeOf(button.enter).toBeUnknown();
	});

	it("narrows targets per state with a graph, and rejects a bad graph", () => {
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
		// A returned visit reads as void, so callers never hold one
		expectTypeOf<ReturnType<typeof graphed.start>>().toEqualTypeOf<
			// biome-ignore lint/suspicious/noConfusingVoidType: the public type under test
			void | undefined
		>();

		expect(() =>
			machine(
				"a",
				{ a: {}, b: {} },
				// @ts-expect-error - "zz" is not a state
				{ a: ["zz"], b: [] },
			),
		).toThrow();
		expect(() =>
			machine(
				"a",
				{ a: {}, b: {} },
				// @ts-expect-error - "b" has no graph row
				{ a: ["b"] },
			),
		).toThrow();
	});

	it("returns the target's visit inside a method", () => {
		machine("a", {
			a: {
				go: (visit) => {
					const next = visit.to("b");
					expectTypeOf(next).toEqualTypeOf<
						Visit<{ a: readonly string[]; b: readonly string[] }, "b">
					>();
					expectTypeOf(next.state).toEqualTypeOf<"b">();
				},
			},
			b: {},
		});
	});

	it("types a method that returns a wait, and keeps async visits", () => {
		const confirm = machine("closed", {
			closed: {
				ask: (visit): Promise<[ok: boolean]> =>
					once(confirm, "answer", visit.to("open")),
			},
			open: { answer: (visit, _ok: boolean) => visit.to("closed") },
		});
		expectTypeOf<ReturnType<typeof confirm.ask>>().toEqualTypeOf<
			Promise<[ok: boolean]> | undefined
		>();
		expectTypeOf<ReturnType<typeof confirm.answer>>().toEqualTypeOf<
			// biome-ignore lint/suspicious/noConfusingVoidType: the public type under test
			void | undefined
		>();

		// An async method that returns the visit keeps Promise<Visit>
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
			Exclude<ReturnType<typeof asyncMover.go>, undefined> extends Promise<
				infer X
			>
				? X
				: never;
		expectTypeOf<Inner>().toMatchTypeOf<{
			state: "b";
			signal: AbortSignal;
		}>();
	});

	it("types once by the method's arguments, and when by state names", () => {
		const dialog = machine("closed", {
			closed: { show: (visit) => visit.to("open") },
			open: {
				enter: async (visit) => {
					const [ok, note] = await once(dialog, "answer", visit);
					expectTypeOf(ok).toEqualTypeOf<boolean>();
					expectTypeOf(note).toEqualTypeOf<string | undefined>();
					visit.to("closed");
				},
				answer: (_visit, _ok: boolean, _note?: string) => {},
				dismiss: (visit) => visit.to("closed"),
			},
		});
		// @ts-expect-error - no state has a method "nope"
		expectTypeOf(() => once(dialog, "nope")).toBeFunction();
		// @ts-expect-error - enter cannot be awaited as a call
		expectTypeOf(() => once(dialog, "enter")).toBeFunction();
		expectTypeOf(() => when(dialog, "closed")).toBeFunction();
		// @ts-expect-error - "gone" is not a state
		expectTypeOf(() => when(dialog, "gone")).toBeFunction();
	});

	it("reads data from a method only one state defines as T | undefined", () => {
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
		expectTypeOf<ReturnType<typeof upload.error>>().toEqualTypeOf<
			Error | undefined
		>();
		expectTypeOf<ReturnType<typeof upload.start>>().toEqualTypeOf<undefined>();
	});

	it("rejects methods named after the store's keys", () => {
		machine("a", {
			// @ts-expect-error - the store owns get
			a: { get: () => 1 },
		});
	});
});
