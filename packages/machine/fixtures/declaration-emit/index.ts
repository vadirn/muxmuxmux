// Exports machines and a hook the way a consumer does, so declaration emit has to name their types.
// The imports resolve to the built `dist` through both `exports` entries, like an installed package.
// TS4023 here means consumers cannot export machines. An unresolved import means `exports` broke.
import { machine, once } from "@muxmuxmux/machine";
import { useMachine } from "@muxmuxmux/machine/react";

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

const confirm = machine("closed", {
	closed: {
		ask: (visit): Promise<[ok: boolean]> =>
			once(confirm, "answer", visit.to("open")),
	},
	open: {
		answer: (visit, ok: boolean) => {
			visit.to("closed");
			return ok;
		},
	},
});
export const ask = (): Promise<[ok: boolean]> | undefined => confirm.ask();

export function useUpload() {
	return useMachine("idle", {
		idle: { start: (visit) => visit.to("sending") },
		sending: { cancel: (visit) => visit.to("idle") },
	});
}
