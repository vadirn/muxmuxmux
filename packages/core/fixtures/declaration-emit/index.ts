// Exports a controller the way a consumer does, so declaration emit has to name its type.
// The import resolves to the built `dist`, like an installed package.
// TS4023 here means consumers cannot export controllers.
import { controller } from "@muxmuxmux/core";

export const counter = controller("idle", {
	idle: { read: () => 0, reset: () => true },
	busy: { read: () => "busy" },
});
