import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useController } from "./index";

afterEach(() => {
	cleanup();
});

describe("useController", () => {
	it("should create controller and subscribe to state changes", async () => {
		function TestComponent() {
			const ctrl = useController("idle" as const, {
				idle: {},
				running: {},
			});

			return (
				<div>
					<div data-testid="state">{ctrl.get()}</div>
					<button type="button" onClick={() => ctrl.set("running")}>
						Start
					</button>
				</div>
			);
		}

		render(<TestComponent />);
		expect(screen.getByTestId("state").textContent).toBe("idle");

		// Change state
		screen.getByText("Start").click();

		// Wait for React to re-render with new state
		await vi.waitFor(() => {
			expect(screen.getByTestId("state").textContent).toBe("running");
		});
	});

	it("should allow calling state-dependent methods", () => {
		const startFn = vi.fn();
		const stopFn = vi.fn();

		function TestComponent() {
			const ctrl = useController("idle" as const, {
				idle: { start: startFn },
				running: { stop: stopFn },
			});

			return (
				<div>
					<div data-testid="state">{ctrl.get()}</div>
					<button type="button" onClick={ctrl.start}>
						Start
					</button>
					<button type="button" onClick={ctrl.stop}>
						Stop
					</button>
					<button type="button" onClick={() => ctrl.set("running")}>
						Set Running
					</button>
				</div>
			);
		}

		render(<TestComponent />);

		// Click start button (should call idle.start)
		screen.getByText("Start").click();
		expect(startFn).toHaveBeenCalled();

		// Click stop button (should be no-op in idle state)
		screen.getByText("Stop").click();
		expect(stopFn).not.toHaveBeenCalled();

		// Transition to running state
		screen.getByText("Set Running").click();

		// Click stop button (should call running.stop)
		screen.getByText("Stop").click();
		expect(stopFn).toHaveBeenCalled();
	});

	it("should handle async state transitions", async () => {
		const { resolve, promise } = Promise.withResolvers();

		function TestComponent() {
			const ctrl = useController("idle" as const, {
				idle: {
					onClick: async () => {
						ctrl.set('loading');
						await promise;
						ctrl.set("idle");
					},
				},
				loading: {},
			});

			const state = ctrl.get();

			return (
				<div>
					<div data-testid="state">{state}</div>
					<button type="button" onClick={ctrl.onClick} disabled={state === "loading"}>
						Submit
					</button>
				</div>
			);
		}

		render(<TestComponent />);

		const button = screen.getByText("Submit") as HTMLButtonElement;
		expect(button.disabled).toBe(false);
		expect(screen.getByTestId("state").textContent).toBe("idle");

		// Click button
		button.click();

		// Should be in loading state (button disabled)
		await vi.waitFor(() => {
			expect(screen.getByTestId("state").textContent).toBe("loading");
			expect(button.disabled).toBe(true);
		});

		resolve(undefined);

		// Should return to idle state
		await vi.waitFor(() => {
			expect(screen.getByTestId("state").textContent).toBe("idle");
			expect(button.disabled).toBe(false);
		});
	});
});
