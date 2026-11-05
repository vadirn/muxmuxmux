// Confirms the harness: StrictMode double-invokes render, useMemo factory, and effects.
import assert from "node:assert/strict";
import { React, mount } from "./react-env.ts";

const log: string[] = [];
function Comp() {
	log.push("render");
	React.useMemo(() => log.push("memo"), []);
	React.useEffect(() => {
		log.push("effect");
		return () => log.push("cleanup");
	}, []);
	return React.createElement("span", null, "x");
}

const r = mount(React.createElement(Comp));
await r.mount();
console.log(log.join(","));
// React 18 runs the memo factory once per render pass.
// React 19 runs it twice in the first pass, and the second pass reuses that result.
const react18 = React.version.startsWith("18.");
assert.deepEqual(
	log,
	react18
		? ["render", "memo", "render", "memo", "effect", "cleanup", "effect"]
		: ["render", "memo", "memo", "render", "effect", "cleanup", "effect"],
);
await r.unmount();
assert.deepEqual(log.at(-1), "cleanup");
console.log(
	"smoke ok; act:",
	typeof React.act === "function" ? "React.act" : "test-utils.act",
);
