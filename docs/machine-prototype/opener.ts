import { machine, once } from "./machine.ts";
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
export const r: Promise<[ok: boolean]> | undefined = confirm.ask();
