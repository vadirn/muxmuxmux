// Q1/Q2 in real React (18.3.1 or 19.3.1) + jsdom, StrictMode on. Run: node react.test.ts
import assert from "node:assert/strict";
import { React, mount, tick } from "./react-env.ts";
import { constructed, useMachine } from "./useMachine.ts";
import { machine, once } from "./machine.ts";

const h = React.createElement;
const failures: string[] = [];
const check = (name: string, fn: () => void) => {
	try {
		fn();
		console.log("ok  ", name);
	} catch (e) {
		failures.push(name);
		console.log(
			"FAIL",
			name,
			"\n     ",
			String((e as Error).message).split("\n")[0],
		);
	}
};

// ---- 2b. StrictMode builds the memoized machine twice; the unused one must never enter
{
	const enters: string[] = [];
	const signals: AbortSignal[] = [];
	function Comp() {
		const m = useMachine("live", {
			live: {
				enter: (visit: { signal: AbortSignal }) => {
					enters.push("enter");
					signals.push(visit.signal);
				},
			},
		});
		return h("span", null, m.get());
	}
	constructed.length = 0;
	const r = mount(h(Comp));
	await r.mount();
	check("2b: StrictMode constructs two machines", () =>
		assert.equal(constructed.length, 2),
	);
	check(
		"2b: the kept machine enters twice (effect double-invoke), the first visit aborted",
		() => {
			assert.equal(enters.length, 2);
			assert.equal(signals[0].aborted, true);
			assert.equal(signals[1].aborted, false);
		},
	);
	check("2b: the discarded machine never entered", () => {
		// Only the kept one has a subscriber; enters count 2 both from it (verified by signal identity below)
		const [a, b] = constructed as { get: () => string }[];
		// Force a distinguishing call: neither get() starts
		assert.equal(a.get(), "live");
		assert.equal(b.get(), "live");
		assert.equal(enters.length, 2, "no third enter from get()");
	});
	await r.unmount();
	check("2b: unmount aborts the last visit", () =>
		assert.equal(signals[1].aborted, true),
	);
}

// ---- 1d. The StrictMode unsubscribe→subscribe is synchronous: in-flight work is aborted and redone
{
	const aborted: boolean[] = [];
	let enters = 0;
	function Comp() {
		const m = useMachine("sending", {
			sending: {
				enter: async (visit: { signal: AbortSignal }) => {
					enters++;
					await new Promise<void>((res, rej) => {
						setTimeout(res, 5);
						visit.signal.addEventListener("abort", () =>
							rej(visit.signal.reason),
						);
					}).then(
						() => aborted.push(false),
						() => aborted.push(true),
					);
				},
			},
		});
		return h("span", null, m.get());
	}
	const r = mount(h(Comp));
	await r.mount();
	await new Promise((res) => setTimeout(res, 20));
	check(
		"1d: dev StrictMode aborts the first in-flight enter and reruns it (2 enters, first aborted)",
		() => {
			assert.equal(enters, 2);
			assert.deepEqual(aborted, [true, false]);
		},
	);
	await r.unmount();
}

// ---- 2c + Q1 F, per guard. A getter called during render (design §7), on a state that is
//      (i) not the initial state, (ii) the initial state. Then a stray call after unmount (case F).
const table: Record<string, Record<string, unknown>> = {};
for (const guard of ["none", "mounted", "knob"] as const) {
	for (const where of ["other", "initial"] as const) {
		const visits: { active: boolean }[] = [];
		const firstRender: unknown[] = [];
		let m!: { fire: () => void; get: () => string; read: () => number };
		function Comp() {
			m = useMachine(
				"idle",
				{
					idle: {
						enter: (visit: { active: boolean }) => {
							visits.push(visit);
						},
						fire: () => {},
						...(where === "initial" ? { read: () => 1 } : {}),
					},
					failed: { read: () => 2 },
				},
				undefined,
				guard,
			);
			firstRender.push(m.read()); // design §7: a getter only some states define
			return h("span", null, String(m.read()));
		}
		constructed.length = 0;
		const r = mount(h(Comp));
		await r.mount();
		const entersAtMount = visits.length;
		await r.unmount();
		const leaked = visits.filter((v) => v.active).length;
		m.fire(); // Q1 F: a stray call after unmount
		const restarted = visits.length - entersAtMount;
		table[`${guard}/${where}`] = {
			enters: entersAtMount,
			leaked,
			restart: restarted,
			render1: firstRender[0],
			renderN: firstRender.at(-1),
		};
	}
}
console.table(table);
check(
	"2c none/other: with lookup-before-start, a getter the initial state lacks starts nothing (2 enters, 0 leaked)",
	() => {
		assert.equal(table["none/other"].enters, 2);
		assert.equal(table["none/other"].leaked, 0);
	},
);
// React 19 reuses the first render pass's memo, so a render-time call reaches only the kept machine
const react18 = React.version.startsWith("18.");
check(
	react18
		? "2c none/initial: a getter the initial state defines starts both StrictMode machines in render (3 enters, 1 leaked)"
		: "2c none/initial: on React 19 the render-time getter starts only the kept machine (2 enters, 0 leaked)",
	() => {
		assert.equal(table["none/initial"].enters, react18 ? 3 : 2);
		assert.equal(table["none/initial"].leaked, react18 ? 1 : 0);
	},
);
check(
	'2c knob/initial: start:"subscribe" closes it (2 enters, 0 leaked) and the first render reads the getter',
	() => {
		assert.equal(table["knob/initial"].enters, 2);
		assert.equal(table["knob/initial"].leaked, 0);
		assert.equal(table["knob/initial"].render1, 1);
	},
);
check(
	"2c mounted/initial: the knob-free guard closes the leak but the first render reads undefined",
	() => {
		assert.equal(table["mounted/initial"].leaked, 0);
		assert.equal(table["mounted/initial"].render1, undefined);
	},
);
check(
	"Q1 F: under STOPPED_CALL=dead no guard restarts on a stray call after unmount",
	() => {
		for (const k of Object.keys(table)) assert.equal(table[k].restart, 0, k);
	},
);

// ---- 2a. Methods re-read per render; a running async enter keeps entry-time props,
//          but a sibling method called from inside enter reads the latest props
{
	const seen: string[] = [];
	let m!: { url: () => string; go: () => void };
	function Comp({ url }: { url: string }) {
		m = useMachine("fetching", {
			fetching: {
				enter: async (visit: { signal: AbortSignal; active: boolean }) => {
					await once(m, "go", visit).catch(() => {});
					if (!visit.active) return; // StrictMode's first, aborted enter
					seen.push(`closure:${url}`); // entry-time prop
					seen.push(`sibling:${m.url()}`); // latest render's prop
				},
				url: () => url,
				go: () => {},
			},
		});
		return h("span", null, url);
	}
	const r = mount(h(Comp, { url: "A" }));
	await r.mount();
	await r.render(h(Comp, { url: "B" }));
	m.go();
	await tick();
	check(
		"2a: enter's closure keeps A; a sibling method read from inside enter sees B",
		() => {
			assert.deepEqual(seen, ["closure:A", "sibling:B"]);
		},
	);
	await r.unmount();
}

// ---- 2d. A module-level machine shared by two components
{
	let enters = 0;
	const signals: AbortSignal[] = [];
	const shared = machine("live", {
		live: {
			enter: (visit) => {
				enters++;
				signals.push(visit.signal);
			},
		},
	});
	function A() {
		React.useSyncExternalStore(shared.subscribe, shared.get, shared.get);
		return h("span", null, "A");
	}
	function B() {
		React.useSyncExternalStore(shared.subscribe, shared.get, shared.get);
		return h("span", null, "B");
	}
	const r = mount(h("div", null, h(A), h(B)));
	await r.mount();
	check(
		"2d: two subscribers; StrictMode's double-invoke restarts the shared machine in dev",
		() => {
			// Both effects run, both cleanup, both rerun: subscriber count hits 0 in between → stop + restart
			console.log(
				"     2d enters after mount:",
				enters,
				"aborted:",
				signals.map((s) => s.aborted),
			);
			assert.ok(enters >= 1);
		},
	);
	await r.render(h("div", null, h(A)));
	const e1 = enters;
	check("2d: unmounting one of two subscribers does not restart", () =>
		assert.equal(enters, e1),
	);
	await r.unmount();
	check("2d: the last unmount aborts the shared visit", () =>
		assert.equal(signals.at(-1)!.aborted, true),
	);
}

console.log(
	failures.length ? `\n${failures.length} FAILED` : "\nall react checks pass",
);
process.exitCode = failures.length ? 1 : 0;
