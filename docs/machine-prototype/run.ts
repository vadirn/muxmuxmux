// Runtime checks for spike 2. Run with: node run.ts
import assert from "node:assert/strict";
import { machine, once, STOPPED_CALL, when } from "./machine.ts";

const uncaught: unknown[] = [];
process.on("uncaughtException", (e) => uncaught.push(e));
let finished = false;
process.on("exit", () => {
	if (!finished) console.log("INCOMPLETE; caught:", uncaught.map(String));
});
const tick = () => new Promise((r) => setTimeout(r, 0));

// Requests the test settles by hand
const pending: {
	resolve: () => void;
	reject: () => void;
	signal: AbortSignal;
}[] = [];
const sendForm = ({ signal }: { signal: AbortSignal }) =>
	new Promise<void>((resolve, reject) => {
		pending.push({ resolve, reject, signal });
		signal.addEventListener("abort", () => reject(signal.reason));
	});

// 1. Upload: loading owns its work; idle and error only move to it
const button = machine("idle", {
	idle: {
		onClick: (visit, e: { type: string }) => (visit.to("loading"), e.type),
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
await tick();

assert.equal(
	button.onClick({ type: "click" }),
	"click",
	"public method gets the event first",
);
assert.equal(button.get(), "loading");
assert.equal(pending.length, 1, "entering loading started the request");
pending[0].resolve();
await tick();
assert.equal(button.get(), "idle");

button.onClick({ type: "click" });
button.cancel();
assert.equal(
	pending[1].signal.aborted,
	true,
	"leaving loading aborts its request",
);
await tick();
assert.equal(
	button.get(),
	"idle",
	"the aborted request's catch cannot move to error",
);

// ABA: leave loading and come back; the first visit's result is ignored
button.onClick({ type: "click" });
const a = pending[2];
button.cancel();
button.onClick({ type: "click" });
const b = pending[3];
a.reject();
await tick();
assert.equal(button.get(), "loading", "visit A's failure is ignored");
b.reject();
await tick();
assert.equal(button.get(), "error", "visit B's failure lands");
assert.equal(uncaught.length, 0, "cancelled flows log nothing");

// 2. Confirm dialog: enter waits for a call; the opener awaits the answer
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
assert.equal(dialog.get(), "open");
dialog.answer(true);
assert.deepEqual(
	await answer,
	[true],
	"a method that leaves the state still resolves its waiter",
);
assert.equal(dialog.get(), "closed");

const dismissed = dialog.ask();
dialog.dismiss();
await assert.rejects(
	dismissed!,
	{ name: "AbortError" },
	"leaving open rejects the opener",
);

// 3. A wizard as one async flow inside enter
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
		next: () => {},
	},
	done: {},
});
await tick(); // the initial enter runs in a microtask
wizard.next(); // ignored: the flow waits for setName first
wizard.setName("Ada");
await tick();
wizard.next();
await tick();
assert.deepEqual(steps, ["name:Ada"]);
assert.equal(wizard.get(), "done");

// 3b. Leaving mid-wait ends the flow quietly
let resumed = false;
const waiting = machine("wait", {
	wait: {
		enter: async (visit) => {
			await once(waiting, "go", visit);
			resumed = true;
		},
		go: () => {},
		leave: (visit) => visit.to("gone"),
	},
	gone: {},
});
await tick();
waiting.leave();
await tick();
await tick();
assert.equal(resumed, false);
assert.equal(uncaught.length, 0, "the visit's own abort is not reported");

// 4. Errors other than the visit's abort still surface
const broken = machine("a", {
	a: {
		enter: async () => {
			throw new Error("boom");
		},
	},
});
broken.subscribe(() => {}); // starts it
await tick();
await tick();
assert.equal(uncaught.length, 1);
assert.match(String(uncaught[0]), /boom/);
uncaught.length = 0;

// 5. A transition inside enter: subscribers see only where the machine settles
const router = machine("start", {
	start: { go: (visit) => visit.to("check") },
	check: { enter: (visit) => visit.to("ready") },
	ready: {},
});
const seen: string[] = [];
router.subscribe((s) => seen.push(s));
router.go();
assert.deepEqual(seen, ["start", "ready"]);

// 6. The graph is checked at runtime too
const strict = machine(
	"a",
	{
		a: { jump: (visit) => (visit.to as (t: string) => unknown)("c") },
		b: {},
		c: {},
	},
	{ a: ["b"], b: [], c: [] },
);
assert.throws(() => strict.jump(), /a → c is not in the graph/);

// 7. when() waits for a state from outside
const later = when(button, "idle");
button.onClick({ type: "click" }); // error → loading
pending.at(-1)!.resolve();
await later;
assert.equal(button.get(), "idle");

// 8. Lifecycle
const entries: string[] = [];
const makeWizard = (label: string) => {
	const w = machine("intro", {
		intro: {
			enter: async (visit) => {
				entries.push(label);
				const [name] = await once(w, "setName", visit);
				entries.push(`${label}:${name}`);
			},
			setName: (_visit, _name: string) => {},
		},
	});
	return w;
};

// A: a call in the same tick as creation starts the machine first, so the flow catches it
const sameTick = makeWizard("A");
sameTick.setName("Ada");
await tick();
assert.deepEqual(entries, ["A", "A:Ada"]);
entries.length = 0;

// B: no subscriber at all; method calls alone run the machine (covered by sections 1–3)

// C: React StrictMode builds two machines and keeps one; the unused one never enters
const discarded = makeWizard("C1");
const kept = makeWizard("C2");
assert.equal(discarded.get(), "intro", "get alone does not start a machine");
const unsubscribe = kept.subscribe(() => {});
await tick();
assert.deepEqual(entries, ["C2"]);
entries.length = 0;

// D: subscribe, unsubscribe, subscribe: the first visit aborts, the state re-enters
const firstSignal: AbortSignal[] = [];
const poller = machine("live", {
	live: {
		enter: async (visit) => {
			firstSignal.push(visit.signal);
			await once(poller, "stop", visit);
		},
		stop: () => {},
	},
});
const off = poller.subscribe(() => {});
off();
assert.equal(
	firstSignal[0].aborted,
	true,
	"the last unsubscribe aborts the visit",
);
poller.subscribe(() => {});
assert.equal(firstSignal.length, 2, "the next subscriber re-enters");
assert.equal(firstSignal[1].aborted, false);
await tick();
assert.equal(uncaught.length, 0, "the aborted flow ends quietly");

// E: when() watches without starting or keeping the machine running
const watched = makeWizard("E");
const ready = when(watched, "intro");
await ready;
assert.deepEqual(entries, [], "when does not start the machine");
unsubscribe();

// F: a method call after the last subscriber left. Spike 2: restarts. Spike 3: runs with a dead visit.
const restarted = makeWizard("F");
restarted.subscribe(() => {})();
restarted.setName("Bo");
await tick();
if (STOPPED_CALL === "restart") {
	assert.deepEqual(
		entries,
		["F", "F", "F:Bo"],
		"entered on subscribe, then again on the call",
	);
} else {
	assert.deepEqual(
		entries,
		["F"],
		"entered on subscribe only; the stray call does not re-enter",
	);
}
entries.length = 0;

// 9. A move to the current state re-enters it: the idle timer resets on each touch
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
const sessionSeen: string[] = [];
session.subscribe((s) => sessionSeen.push(s));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
await sleep(20);
session.touch();
await sleep(20);
session.touch();
await sleep(20);
assert.equal(session.get(), "active", "each touch restarted the 30 ms timer");
await sleep(30);
assert.equal(session.get(), "idle");
assert.deepEqual(sessionSeen, ["active", "idle"], "re-entry does not notify");

// 10. A bad graph fails at creation
assert.throws(
	() => machine("a", { a: {}, b: {} }, { a: ["b"], b: ["zz"] } as never),
	/graph target "zz" is not a state/,
);
assert.throws(
	() => machine("a", { a: {}, b: {} }, { a: ["b"] } as never),
	/state "b" has no graph row/,
);

// 11. An unlisted move inside an async enter surfaces as an uncaught error
const late = machine(
	"a",
	{
		a: {
			enter: async (visit) => {
				await tick();
				(visit.to as (t: string) => unknown)("c");
			},
		},
		b: {},
		c: {},
	},
	{ a: ["b"], b: [], c: [] },
);
late.subscribe(() => {}); // starts it
await tick();
await tick();
assert.equal(uncaught.length, 1);
assert.match(String(uncaught[0]), /a → c is not in the graph/);
assert.equal(late.get(), "a", "the machine stays put");
uncaught.length = 0;

finished = true;
console.log("all runtime checks pass");
