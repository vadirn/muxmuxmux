// The submit button from examples/react-button, rebuilt as a machine.
// Run: node example.ts
import { machine, when } from "./machine.ts";

const log: string[] = [];
const say = (line: string) => {
	log.push(line);
	console.log(line);
};

// Resolves after ms, or rejects with the signal's reason once it aborts
const sleep = (ms: number, signal?: AbortSignal) =>
	new Promise<void>((resolve, reject) => {
		const timer = setTimeout(resolve, ms);
		signal?.addEventListener(
			"abort",
			() => {
				clearTimeout(timer);
				reject(signal.reason);
			},
			{ once: true },
		);
	});

// The UI waits 1500 ms and fails 30% of the time.
// Here the first request fails and the rest succeed.
let requests = 0;
const submitForm = async (signal: AbortSignal) => {
	const n = ++requests;
	say(`  request ${n} sent`);
	try {
		await sleep(20, signal);
	} catch (error) {
		say(`  request ${n} aborted`);
		throw error;
	}
	if (n === 1) throw new Error("Submission failed");
};

const button = machine(
	"idle",
	{
		idle: { onClick: (visit) => visit.to("loading") },
		loading: {
			enter: async (visit) => {
				try {
					await submitForm(visit.signal);
					visit.to("success");
				} catch {
					// After cancel the visit is dead, so this moves nothing
					visit.to("error");
				}
			},
			cancel: (visit) => visit.to("idle"),
		},
		success: {
			// The UI shows success for 2000 ms
			enter: async (visit) => {
				await sleep(40, visit.signal);
				visit.to("idle");
			},
		},
		error: { onClick: (visit) => visit.to("loading") },
	},
	{
		idle: ["loading"],
		loading: ["success", "error", "idle"],
		success: ["idle"],
		error: ["loading"],
	},
);

// Mount: `$button` or `useMachine` subscribes, and the machine starts in idle
const unmount = button.subscribe((state) => say(state));

button.onClick(); // request 1 fails
button.onClick(); // loading has no onClick, so this click does nothing
await when(button, "error");

button.onClick(); // the retry succeeds, and success returns to idle on its own
await when(button, "success");
await when(button, "idle");

button.onClick();
button.cancel(); // aborts request 3; its rejection moves nothing
await sleep(30);

button.onClick();
unmount(); // the machine stops and aborts request 4
await sleep(30);

const expected = [
	"idle",
	"  request 1 sent",
	"loading",
	"error",
	"  request 2 sent",
	"loading",
	"success",
	"idle",
	"  request 3 sent",
	"loading",
	"idle",
	"  request 3 aborted",
	"  request 4 sent",
	"loading",
	"  request 4 aborted",
];
if (JSON.stringify(log) !== JSON.stringify(expected)) {
	throw new Error("the trace differs from the expected one");
}
// A stopped machine keeps its state name
if (button.get() !== "loading") throw new Error(`stopped in ${button.get()}`);
console.log("example ok");
