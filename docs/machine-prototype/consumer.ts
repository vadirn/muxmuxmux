// Exports machines the way a consumer does. TS4023 here means consumers cannot export them.
import { machine } from "./machine.ts";

export const open = machine("idle", {
	idle: { start: (visit, _e: MouseEvent) => visit.to("busy") },
	busy: {
		enter: (visit) => void visit.signal,
		stop: (visit) => visit.to("idle"),
		progress: () => 0.5,
	},
});

export const strict = machine(
	"idle",
	{
		idle: { start: (visit) => visit.to("busy") },
		busy: { stop: (visit) => visit.to("idle") },
	},
	{ idle: ["busy"], busy: ["idle"] },
);
