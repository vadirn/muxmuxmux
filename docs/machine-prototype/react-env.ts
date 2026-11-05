// jsdom + one React 19.3.1 instance, loaded from the repo's pnpm store. No installs.
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

process.env.NODE_ENV = "development"; // production skips StrictMode's double-invoke

// The repo's pnpm store, two folders up from docs/machine-prototype
const pnpm = fileURLToPath(
	new URL("../../node_modules/.pnpm", import.meta.url),
);
const requireDom = createRequire(
	`${pnpm}/react-dom@19.3.1_react@19.3.1/node_modules/react-dom/index.js`,
);
const requireJsdom = createRequire(
	`${pnpm}/jsdom@30.1.3/node_modules/jsdom/package.json`,
);

const { JSDOM } = requireJsdom("jsdom");
const dom = new JSDOM(
	"<!doctype html><html><body><div id=root></div></body></html>",
);
const g = globalThis as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", {
	value: dom.window.navigator,
	configurable: true,
});
g.IS_REACT_ACT_ENVIRONMENT = true;

// react-dom reads canUseDOM at load, so the globals come first
export const React = requireDom("react") as typeof import("react");
export const ReactDOMClient = requireDom("react-dom/client") as {
	createRoot: (el: Element) => {
		render: (node: unknown) => void;
		unmount: () => void;
	};
};
const testUtils = requireDom("react-dom/test-utils") as {
	act: (cb: () => void | Promise<void>) => Promise<void>;
};
export const act: (cb: () => void | Promise<void>) => Promise<void> =
	(React as unknown as { act?: typeof testUtils.act }).act ?? testUtils.act;

export function mount(node: unknown, strict = true) {
	const el = dom.window.document.createElement("div");
	dom.window.document.body.appendChild(el);
	const root = ReactDOMClient.createRoot(el);
	const tree = strict
		? React.createElement(React.StrictMode, null, node as never)
		: node;
	return {
		el,
		render: (next: unknown = node) =>
			act(() =>
				root.render(
					strict
						? React.createElement(React.StrictMode, null, next as never)
						: next,
				),
			),
		mount: () => act(() => root.render(tree)),
		unmount: () => act(() => root.unmount()),
	};
}

export const tick = () => new Promise((r) => setTimeout(r, 0));
