import { useController } from "@muxmuxmux/react";
import { cva } from "class-variance-authority";
import { useCallback } from "react";

// Button style variants
const buttonVariants = cva(
	"w-full px-6 py-3 rounded-md font-semibold text-base transition-all duration-200 border-none",
	{
		variants: {
			state: {
				idle: "bg-blue-600 hover:bg-blue-700 text-white hover:-translate-y-0.5 hover:shadow-lg",
				loading: "bg-gray-500 text-white opacity-60",
				success: "bg-green-600 text-white opacity-60",
				error:
					"bg-red-600 hover:bg-red-700 text-white hover:-translate-y-0.5 hover:shadow-lg",
			},
		},
	},
);

// Simulate form submission
const submitForm = () =>
	new Promise<void>((resolve, reject) => {
		setTimeout(() => {
			// 70% success rate
			Math.random() > 0.3 ? resolve() : reject(new Error("Submission failed"));
		}, 1500);
	});

const ignoreClick = () => {
	console.log("ignore click");
};

function App() {
	// Memoized submit handler - reused in idle and error states
	// biome-ignore lint/correctness/useExhaustiveDependencies: expected stable identity
	const handleSubmit = useCallback(async () => {
		button.set("loading");
		console.log("state", button.get());
		try {
			await submitForm();
			button.set("success");
			console.log("state", button.get());
			// Reset to idle after showing success
			setTimeout(() => {
				button.set("idle");
				console.log("state", button.get());
			}, 2000);
		} catch (_error) {
			button.set("error");
			console.log("state", button.get());
		}
	}, []);

	// Controller created inside component with useController hook
	const button = useController("idle" as const, {
		idle: { onClick: handleSubmit },
		loading: { onClick: ignoreClick }, // Button disabled during loading
		success: { onClick: ignoreClick }, // Button disabled during success message
		error: { onClick: handleSubmit }, // Retry uses same handler
	});

	const state = button.get();

	return (
		<div className="max-w-2xl mx-auto p-8 font-sans">
			<h1 className="text-4xl font-bold mb-2">React Button Example</h1>
			<p className="text-gray-600">
				State-dependent button with async handling and error recovery
			</p>

			<div className="bg-gray-100 rounded-lg p-8 my-8">
				<button
					type="button"
					onClick={button.onClick}
					className={buttonVariants({ state })}
				>
					{state === "idle" && "Submit Form"}
					{state === "loading" && "Submitting..."}
					{state === "success" && "✓ Success!"}
					{state === "error" && "Retry"}
				</button>

				<div className="mt-4 text-center text-sm text-gray-600">
					Current state:{" "}
					<code className="bg-gray-200 px-2 py-1 rounded font-mono">
						{state}
					</code>
				</div>

				{state === "error" && (
					<div className="mt-4 p-3 rounded bg-red-50 text-red-900 border border-red-200 text-center">
						Submission failed. Click "Retry" to try again.
					</div>
				)}

				{state === "success" && (
					<div className="mt-4 p-3 rounded bg-green-50 text-green-900 border border-green-200 text-center">
						Form submitted successfully!
					</div>
				)}
			</div>

			<div className="mt-8 p-6 bg-blue-50 rounded-lg border-l-4 border-blue-600">
				<h3 className="mt-0 text-blue-900 text-lg font-semibold mb-3">
					How it works:
				</h3>
				<p className="mb-4 text-blue-900">
					This demo showcases <strong>state-dependent method dispatching</strong> -
					the core pattern of muxmuxmux. The same method name (<code className="bg-blue-100 px-1 rounded">onClick</code>)
					has different implementations based on the current state.
				</p>
				<ul className="m-0 pl-6 space-y-3">
					<li>
						<strong className="text-blue-900">Idle state:</strong>
						<code className="ml-2 bg-blue-100 px-1 rounded">onClick → handleSubmit</code>
						<br />
						<span className="text-sm">Clicking starts the async form submission</span>
					</li>
					<li>
						<strong className="text-blue-900">Loading state:</strong>
						<code className="ml-2 bg-blue-100 px-1 rounded">onClick → ignoreClick</code>
						<br />
						<span className="text-sm">Clicks are ignored (no-op) to prevent re-submission</span>
					</li>
					<li>
						<strong className="text-blue-900">Success state:</strong>
						<code className="ml-2 bg-blue-100 px-1 rounded">onClick → ignoreClick</code>
						<br />
						<span className="text-sm">Clicks ignored during success display, auto-resets to idle after 2s</span>
					</li>
					<li>
						<strong className="text-blue-900">Error state:</strong>
						<code className="ml-2 bg-blue-100 px-1 rounded">onClick → handleSubmit</code>
						<br />
						<span className="text-sm">Clicking retries submission - same handler as idle state</span>
					</li>
				</ul>
				<p className="mt-4 text-sm text-blue-800">
					<strong>Why this pattern?</strong> Instead of conditionals checking state
					(<code className="bg-blue-100 px-1 rounded">if (state === "loading") return;</code>),
					behavior changes automatically when state changes. Cleaner code, type-safe methods.
				</p>
			</div>
		</div>
	);
}

export default App;
