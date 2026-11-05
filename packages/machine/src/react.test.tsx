import { act, cleanup, render, screen } from "@testing-library/react";
import { StrictMode, useSyncExternalStore } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { machine, once } from "./index";
import { useMachine } from "./react";

const sleep = (ms: number) =>
	new Promise<void>((resolve) => setTimeout(resolve, ms));

afterEach(() => {
	cleanup();
});

describe("useMachine", () => {
	it("renders the state and re-renders on a move", async () => {
		function Button() {
			const button = useMachine("idle", {
				idle: { start: (visit) => visit.to("busy") },
				busy: { stop: (visit) => visit.to("idle") },
			});
			return (
				<button type="button" onClick={button.start}>
					{button.get()}
				</button>
			);
		}

		render(<Button />);
		expect(screen.getByRole("button").textContent).toBe("idle");
		await act(async () => screen.getByRole("button").click());
		expect(screen.getByRole("button").textContent).toBe("busy");
	});

	it("enters on mount and aborts the visit on unmount, under StrictMode", () => {
		const signals: AbortSignal[] = [];
		function Live() {
			const m = useMachine("live", {
				live: {
					enter: (visit) => {
						signals.push(visit.signal);
					},
				},
			});
			return <span>{m.get()}</span>;
		}

		const { unmount } = render(
			<StrictMode>
				<Live />
			</StrictMode>,
		);
		// StrictMode's effect double-invoke stops and restarts the kept machine
		expect(signals).toHaveLength(2);
		expect(signals[0]?.aborted).toBe(true);
		expect(signals[1]?.aborted).toBe(false);

		unmount();
		expect(signals[1]?.aborted).toBe(true);
	});

	it("aborts StrictMode's first async enter and reruns it", async () => {
		const outcomes: string[] = [];
		function Sending() {
			const m = useMachine("sending", {
				sending: {
					enter: async (visit) => {
						await sleep(5);
						outcomes.push(visit.signal.aborted ? "aborted" : "done");
					},
				},
			});
			return <span>{m.get()}</span>;
		}

		render(
			<StrictMode>
				<Sending />
			</StrictMode>,
		);
		await act(() => sleep(20));
		expect(outcomes).toEqual(["aborted", "done"]);
	});

	it("reads a getter during render without starting the machine", () => {
		const visits: { readonly active: boolean }[] = [];
		const reads: unknown[] = [];
		const entersAtRender: number[] = [];
		let m!: { fire: () => void };
		function Reader() {
			const reader = useMachine("idle", {
				idle: {
					enter: (visit) => {
						visits.push(visit);
					},
					fire: () => {},
					read: () => 1,
				},
				failed: { read: () => 2 },
			});
			m = reader;
			reads.push(reader.read());
			entersAtRender.push(visits.length);
			return <span>{String(reader.read())}</span>;
		}

		const { unmount } = render(
			<StrictMode>
				<Reader />
			</StrictMode>,
		);
		expect(reads[0]).toBe(1);
		// The render-time call ran without entering: only the subscription starts the machine
		expect(entersAtRender[0]).toBe(0);
		expect(visits).toHaveLength(2);

		unmount();
		expect(visits.filter((visit) => visit.active)).toHaveLength(0);

		m.fire(); // a stray call after unmount runs with a dead visit
		expect(visits).toHaveLength(2);
	});

	it("runs the latest render's methods; a running enter keeps its own props", async () => {
		const seen: string[] = [];
		const gate = Promise.withResolvers<void>();
		let m!: { url: () => string };
		function Fetcher({ url }: { url: string }) {
			const fetcher = useMachine("fetching", {
				fetching: {
					enter: async (visit) => {
						await gate.promise;
						if (!visit.active) return; // StrictMode's first, aborted enter
						seen.push(`closure:${url}`);
						seen.push(`sibling:${m.url()}`);
					},
					url: () => url,
				},
			});
			m = fetcher;
			return <span>{url}</span>;
		}

		const { rerender } = render(
			<StrictMode>
				<Fetcher url="A" />
			</StrictMode>,
		);
		rerender(
			<StrictMode>
				<Fetcher url="B" />
			</StrictMode>,
		);
		gate.resolve();
		await act(() => sleep(0));
		expect(seen).toEqual(["closure:A", "sibling:B"]);
	});

	it("shares internals with the root entry, so once works on a hook's machine", async () => {
		const usePinger = () =>
			useMachine("idle", { idle: { ping: (_visit, n: number) => n } });
		let pinger!: ReturnType<typeof usePinger>;
		function Pinger() {
			pinger = usePinger();
			return null;
		}

		render(
			<StrictMode>
				<Pinger />
			</StrictMode>,
		);
		const wait = once(pinger, "ping");
		pinger.ping(7);
		await expect(wait).resolves.toEqual([7]);
	});
});

describe("a module-level machine in React", () => {
	it("keeps running while any component subscribes, and stops with the last one", () => {
		const signals: AbortSignal[] = [];
		const shared = machine("live", {
			live: {
				enter: (visit) => {
					signals.push(visit.signal);
				},
			},
		});
		function A() {
			useSyncExternalStore(shared.subscribe, shared.get, shared.get);
			return <span>A</span>;
		}
		function B() {
			useSyncExternalStore(shared.subscribe, shared.get, shared.get);
			return <span>B</span>;
		}

		const { rerender, unmount } = render(
			<StrictMode>
				<A />
				<B />
			</StrictMode>,
		);
		const entersAfterMount = signals.length;
		rerender(
			<StrictMode>
				<A />
			</StrictMode>,
		);
		expect(signals).toHaveLength(entersAfterMount);

		unmount();
		expect(signals.at(-1)?.aborted).toBe(true);
	});
});
