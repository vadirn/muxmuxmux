import { describe, expect, it, vi } from "vitest";
import { controller, inspectMethods } from "./index";

describe("controller", () => {
	it("should manage controller lifecycle: state, subscriptions, and updates", () => {
		const ctrl = controller("idle", {
			idle: {},
			running: {},
		});

		// Initial state
		expect(ctrl.get()).toBe("idle");

		// Immediate subscriber notification
		const subscriber = vi.fn();
		ctrl.subscribe(subscriber);
		expect(subscriber).toHaveBeenCalledWith("idle");
		subscriber.mockClear();

		// State update triggers notification
		ctrl.set("running");
		expect(ctrl.get()).toBe("running");
		expect(subscriber).toHaveBeenCalledWith("running");

		// Unsubscribe stops notifications
		const unsubscribe = ctrl.subscribe(subscriber);
		subscriber.mockClear(); // Clear the immediate call
		unsubscribe();
		ctrl.set("idle");
		expect(subscriber).not.toHaveBeenCalled();
	});

	it("should not notify subscribers if state value does not change", () => {
		const ctrl = controller("idle", {
			idle: {},
			running: {},
		});

		const subscriber = vi.fn();
		ctrl.subscribe(subscriber);
		subscriber.mockClear();

		ctrl.set("idle");
		expect(subscriber).not.toHaveBeenCalled();
	});

	it("should dispatch methods based on state and handle transitions", () => {
		const idleStart = vi.fn();
		const runningStop = vi.fn();

		const ctrl = controller("idle", {
			idle: { start: idleStart },
			running: { stop: runningStop },
		});

		// Dispatch in idle state
		ctrl.start();
		expect(idleStart).toHaveBeenCalled();

		// Unavailable method returns undefined
		const result = ctrl.stop();
		expect(result).toBeUndefined();
		expect(runningStop).not.toHaveBeenCalled();

		// Transition and dispatch in new state
		ctrl.set("running");
		ctrl.stop();
		expect(runningStop).toHaveBeenCalled();
	});

	it("should allow accessing methods via inspectMethods", () => {
		const idleStart = vi.fn();
		const runningStop = vi.fn();

		const ctrl = controller("idle", {
			idle: { start: idleStart },
			running: { stop: runningStop },
		});

		const ctrlMethods = inspectMethods(ctrl);
		expect(ctrlMethods).toBeDefined();
		expect(ctrlMethods.idle).toBeDefined();
		expect(ctrlMethods.idle.start).toBe(idleStart);
		expect(ctrlMethods.running.stop).toBe(runningStop);
	});

	it("should handle multiple state transitions with arguments", () => {
		const handleAction = vi.fn();
		const nextFn = vi.fn(() => {
			const current = ctrl.get();
			if (current === "red") ctrl.set("yellow");
			else if (current === "yellow") ctrl.set("green");
			else ctrl.set("red");
		});

		const ctrl = controller("red", {
			red: { next: nextFn, action: handleAction },
			yellow: { next: nextFn },
			green: { next: nextFn },
		});

		expect(ctrl.get()).toBe("red");

		ctrl.next();
		expect(ctrl.get()).toBe("yellow");

		ctrl.next();
		expect(ctrl.get()).toBe("green");

		ctrl.next();
		expect(ctrl.get()).toBe("red");

		// Arguments passed correctly
		ctrl.action("arg1", "arg2", { key: "value" });
		expect(handleAction).toHaveBeenCalledWith("arg1", "arg2", { key: "value" });
	});
});

describe("Type inference", () => {
	it("should properly type controller state values", () => {
		const ctrl = controller("idle", {
			idle: { start: () => {} },
			running: { stop: () => {} },
		});

		const currentState = ctrl.get();
		// If this compiles, types are working correctly
		type StateType = typeof currentState;
		type Expected = "idle" | "running";
		// @ts-expect-error - this line is for type checking only
		const _test: StateType extends Expected ? true : false = true;

		// Valid operations should compile
		ctrl.set("running");
		ctrl.start();
		ctrl.stop();

		// Invalid operations should not compile (type-level only)
		// @ts-expect-error - invalid state should not be assignable
		ctrl.set("invalid");

		// @ts-expect-error - method doesn't exist in any state
		expect(() => ctrl.nonExistent()).toThrow();
	});
});
