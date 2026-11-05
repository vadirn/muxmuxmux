// Q1 rules and their mutants. Run: node lifecycle.test.ts
// Mutants: STOPPED_CALL=restart, START_FIRST=1, DEFER_STOP=1 (each must fail its case).
import assert from "node:assert/strict";
import {
	DEFER_STOP,
	machine,
	once,
	START_FIRST,
	STOPPED_CALL,
} from "./machine.ts";

const tick = () => new Promise((r) => setTimeout(r, 0));
const mode = `STOPPED_CALL=${STOPPED_CALL} START_FIRST=${START_FIRST ? 1 : 0} DEFER_STOP=${DEFER_STOP ? 1 : 0}`;
console.log(mode);

// 1b/1c. Fresh: a call starts (cases A and B). Stopped: the body runs with a dead visit.
{
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
			back: (visit) => void visit.to("idle"),
		},
	});
	assert.equal(m.read(), 0, "a getter on a fresh machine returns its data");
	assert.equal(enters, 1, "1c: a call on a fresh machine starts it (case A/B)");
	m.subscribe(() => {})(); // stop
	data = 7;
	assert.equal(
		m.read(),
		7,
		"1b: a getter on a stopped machine still returns its data (dead visit)",
	);
	assert.equal(enters, 1, "1b: the getter did not restart the machine");
	m.go();
	assert.equal(
		m.get(),
		"idle",
		"1b: visit.to on a dead visit is inert; the stopped machine stays put",
	);
	assert.equal(enters, 1, "1b: no enter from the inert move");
	const off = m.subscribe(() => {});
	assert.equal(enters, 2, "a subscriber re-enters the current state");
	m.go();
	assert.equal(m.get(), "busy", "running again: moves work");
	off();
}

// 1a. A pending once() waiter is not "in use": it neither keeps the machine running nor restarts it
{
	let enters = 0;
	const m = machine("a", {
		a: {
			enter: () => {
				enters++;
			},
			ping: () => {},
		},
	});
	const off = m.subscribe(() => {});
	const waiter = once(m, "ping");
	off();
	assert.equal(enters, 1);
	m.ping(); // a stray call on the stopped machine
	assert.deepEqual(
		await waiter,
		[],
		"1a: the external waiter still resolves on a dead-visit call",
	);
	assert.equal(enters, 1, "1a: the waiter did not restart the machine");
}

// (a) A call to a method the current state lacks starts nothing. Mutant: START_FIRST=1.
{
	let enters = 0;
	const m = machine("idle", {
		idle: {
			enter: () => {
				enters++;
			},
		},
		failed: { error: () => new Error("x") },
	});
	assert.equal(m.error(), undefined);
	assert.equal(
		enters,
		0,
		"(a): design §7's `upload.error()` outside `failed` is a no-op that starts nothing",
	);
}

// (a) edge: a fresh machine whose initial enter moves at once (design §4 "always"). The gate reads the
// initial state, so a method only the settled state defines is a no-op and starts nothing. Spike 2 started,
// settled on `ready`, then dispatched. Mutant START_FIRST=1 shows the spike 2 result.
{
	const router = machine("start", {
		start: { enter: (visit) => void visit.to("ready") },
		ready: { foo: () => "ran" },
	});
	const r = router.foo();
	if (START_FIRST) {
		assert.equal(r, "ran");
		assert.equal(router.get(), "ready");
	} else {
		assert.equal(
			r,
			undefined,
			"(a) edge: the call on a fresh always-router is a no-op",
		);
		assert.equal(router.get(), "start", "(a) edge: and it starts nothing");
		router.subscribe(() => {});
		assert.equal(router.get(), "ready", "a subscriber settles it");
		assert.equal(router.foo(), "ran");
	}
}

// 1d. The last unsubscribe stops synchronously. Mutant: DEFER_STOP=1.
{
	const signals: AbortSignal[] = [];
	const m = machine("live", {
		live: {
			enter: (visit) => {
				signals.push(visit.signal);
			},
		},
	});
	m.subscribe(() => {})();
	assert.equal(signals[0].aborted, true, "1d: stop is synchronous (case D)");
	// With a deferred stop, a synchronous unsubscribe→subscribe keeps the first visit
	m.subscribe(() => {})();
	await tick();
}

// (ii) start: "subscribe". A call never starts; it runs with a dead visit. Only a subscriber starts.
{
	let enters = 0;
	const m = machine(
		"idle",
		{
			idle: {
				enter: () => {
					enters++;
				},
				read: () => 42,
				go: (visit) => void visit.to("busy"),
			},
			busy: {},
		},
		undefined,
		{ start: "subscribe" },
	);
	assert.equal(m.read(), 42, "(ii): a getter works without starting");
	m.go();
	assert.equal(enters, 0, "(ii): no call starts a subscribe-only machine");
	assert.equal(
		m.get(),
		"idle",
		"(ii): a mover before the first subscriber is inert",
	);
	const off = m.subscribe(() => {});
	assert.equal(enters, 1);
	m.go();
	assert.equal(m.get(), "busy");
	off();
}

console.log("lifecycle checks pass under", mode);
