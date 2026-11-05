// Q4: composition. Run: node compose.test.ts  (also under STOPPED_CALL=restart)
import assert from "node:assert/strict";
import { machine, STOPPED_CALL, when } from "./machine.ts";

const tick = () => new Promise((r) => setTimeout(r, 0));
const noop = () => {};

/** 4e candidate: keeps `child` running while `visit` is current. Guards an already-ended visit. */
function hold(
	child: { subscribe: (l: (s: never) => void) => () => void },
	visit: { signal: AbortSignal },
) {
	const off = child.subscribe(noop);
	if (visit.signal.aborted) off();
	else visit.signal.addEventListener("abort", off, { once: true });
}

// 4a. A child owned by a parent state: enters with the parent, stops when the parent leaves
{
	const childSignals: AbortSignal[] = [];
	const volume = machine("muted", {
		muted: {
			enter: (visit) => {
				childSignals.push(visit.signal);
			},
			up: (visit) => void visit.to("loud"),
		},
		loud: {
			enter: (visit) => {
				childSignals.push(visit.signal);
			},
			down: (visit) => void visit.to("muted"),
		},
	});
	const player = machine("stopped", {
		stopped: { play: (visit) => void visit.to("playing") },
		playing: {
			enter: (visit) => hold(volume, visit),
			stop: (visit) => void visit.to("stopped"),
		},
	});
	player.play();
	assert.equal(
		childSignals.length,
		1,
		"4a: entering the parent state starts the child",
	);
	volume.up();
	assert.equal(volume.get(), "loud");
	player.stop();
	assert.equal(
		childSignals.at(-1)!.aborted,
		true,
		"4a: leaving the parent state aborts the child's visit",
	);
	assert.equal(
		volume.get(),
		"loud",
		"4d: a child made outside the parent's visit keeps its state name",
	);
	player.play();
	assert.equal(
		childSignals.length,
		3,
		"4d: re-entering the parent re-enters the child's kept state",
	);
	assert.equal(childSignals.at(-1)!.aborted, false);
	player.stop();

	// Q1 cross-link: a stray child call after the parent left
	volume.down();
	if (STOPPED_CALL === "dead") {
		assert.equal(
			volume.get(),
			"loud",
			"Q1 dead: the orphan child's call is inert",
		);
		assert.equal(childSignals.length, 3, "no orphan restart");
	} else {
		assert.equal(
			volume.get(),
			"muted",
			"Q1 restart: the orphan child restarts and moves",
		);
		assert.equal(childSignals.length, 5, "restart entered loud, then muted");
	}
}

// 4a footgun. An async enter that holds the child after an await: the parent may have left already.
{
	let leaked = 0;
	const child = machine("on", {
		on: {
			enter: (visit) => {
				leaked++;
				visit.signal.addEventListener("abort", () => leaked--);
			},
		},
	});
	const gate = Promise.withResolvers<void>();
	for (const guarded of [false, true]) {
		const parent = machine("a", {
			a: {
				enter: async (visit) => {
					await gate.promise;
					if (guarded) hold(child, visit);
					else {
						const off = child.subscribe(noop);
						visit.signal.addEventListener("abort", off, { once: true }); // inline, unguarded
					}
				},
				go: (visit) => void visit.to("b"),
			},
			b: {},
		});
		parent.subscribe(noop);
		parent.go(); // leaves `a` before the await resolves
		gate.resolve();
		await tick();
		if (guarded)
			assert.equal(leaked, 0, "4e: hold() guards an already-ended visit");
		else
			assert.equal(
				leaked,
				1,
				"4a footgun: the inline form leaks the child when the visit ended during the await",
			);
		child.subscribe(noop)(); // reset the leaked subscription count for the next round
		leaked = 0;
	}
}

// 4b. Child-to-parent: the parent moves when the child reaches a state; abort on parent leave is quiet
{
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
			abandon: (visit) => void visit.to("abandoned"),
		},
		next: {},
		abandoned: {},
	});
	const uncaught: unknown[] = [];
	process.on("unhandledRejection", (e) => uncaught.push(e));
	flow.subscribe(noop);
	task.finish();
	await tick();
	assert.equal(flow.get(), "next", "4b: the child's state moved the parent");

	const task2 = machine("running", {
		running: { finish: (visit) => void visit.to("done") },
		done: {},
	});
	const flow2 = machine("working", {
		working: {
			enter: async (visit) => {
				await when(task2, "done", visit);
				visit.to("next");
			},
			abandon: (visit) => void visit.to("abandoned"),
		},
		next: {},
		abandoned: {},
	});
	flow2.subscribe(noop);
	flow2.abandon();
	await tick();
	await tick();
	assert.equal(flow2.get(), "abandoned");
	assert.equal(
		uncaught.length,
		0,
		"4b: leaving the parent rejects `when` with the visit's reason, swallowed by runEnter",
	);
}

// 4d. History depth follows creation site: module-level levels keep their names; one made inside enter resets
{
	const log: string[] = [];
	const leaf = machine("x", {
		x: { next: (visit) => void visit.to("y") },
		y: {},
	});
	let innerMade = 0;
	const mid = machine("p", {
		p: {
			enter: (visit) => {
				hold(leaf, visit);
				// a machine made inside the visit lives one visit: no history
				const inner = machine("i", {
					i: { bump: (v) => void v.to("j") },
					j: {},
				});
				innerMade++;
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
	assert.equal(leaf.get(), "y");
	top.off();
	top.on();
	assert.equal(mid.get(), "p", "deep history: mid kept its state");
	assert.equal(
		leaf.get(),
		"y",
		"deep history: leaf kept its state through two levels",
	);
	assert.deepEqual(
		log,
		["inner:i", "inner:i"],
		"no history: the inner machine restarted at its initial state",
	);
	assert.equal(innerMade, 2);
}

console.log("compose checks pass under STOPPED_CALL=" + STOPPED_CALL);
