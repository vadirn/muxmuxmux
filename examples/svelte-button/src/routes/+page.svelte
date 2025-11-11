<script lang="ts">
	import { controller } from "@muxmuxmux/core";
	import { cva } from "class-variance-authority";

	// Button style variants
	const buttonVariants = cva(
		"w-full px-6 py-3 rounded-md font-semibold text-base transition-all duration-200 border-none",
		{
			variants: {
				state: {
					idle: "bg-blue-600 hover:bg-blue-700 text-white hover:-translate-y-0.5 hover:shadow-lg",
					loading: "bg-gray-500 text-white opacity-60",
					success: "bg-green-600 text-white opacity-60",
					error: "bg-red-600 hover:bg-red-700 text-white hover:-translate-y-0.5 hover:shadow-lg",
				},
			},
		},
	);

	// Simulate form submission
	const submitForm = () =>
		new Promise<void>((resolve, reject) => {
			setTimeout(() => {
				// 70% success rate
				Math.random() > 0.3
					? resolve()
					: reject(new Error("Submission failed"));
			}, 1500);
		});

	const ignoreClick = () => {
		console.log("ignore click");
	};

	const handleSubmit = async () => {
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
	};

	const button = controller("idle", {
		idle: { onClick: handleSubmit },
		loading: { onClick: ignoreClick }, // No-op during loading
		success: { onClick: ignoreClick }, // No-op during success
		error: { onClick: handleSubmit }, // Retry uses same handler
	});
</script>

<svelte:head>
	<title>Svelte Button Example - muxmuxmux</title>
</svelte:head>

<div class="max-w-2xl mx-auto p-8 font-sans">
	<h1 class="text-4xl font-bold mb-2">Svelte Button Example</h1>
	<p class="text-gray-600">
		State-dependent button with async handling and error recovery
	</p>

	<div class="bg-gray-100 rounded-lg p-8 my-8">
		<button
			type="button"
			onclick={button.onClick}
			class={buttonVariants({ state: $button })}>
			{#if $button === "idle"}
				Submit Form
			{:else if $button === "loading"}
				Submitting...
			{:else if $button === "success"}
				✓ Success!
			{:else if $button === "error"}
				Retry
			{/if}
		</button>

		<div class="mt-4 text-center text-sm text-gray-600">
			Current state:
			<code class="bg-gray-200 px-2 py-1 rounded font-mono"
				>{$button}</code>
		</div>

		{#if $button === "error"}
			<div
				class="mt-4 p-3 rounded bg-red-50 text-red-900 border border-red-200 text-center">
				Submission failed. Click "Retry" to try again.
			</div>
		{/if}

		{#if $button === "success"}
			<div
				class="mt-4 p-3 rounded bg-green-50 text-green-900 border border-green-200 text-center">
				Form submitted successfully!
			</div>
		{/if}
	</div>

	<div class="mt-8 p-6 bg-blue-50 rounded-lg border-l-4 border-blue-600">
		<h3 class="mt-0 text-blue-900 text-lg font-semibold mb-3">
			How it works:
		</h3>
		<p class="mb-4 text-blue-900">
			This demo showcases
			<strong>state-dependent method dispatching</strong>
			- the core pattern of muxmuxmux. The same method name (<code
				class="bg-blue-100 px-1 rounded">onClick</code
			>) has different implementations based on the current state.
		</p>
		<ul class="m-0 pl-6 space-y-3">
			<li>
				<strong class="text-blue-900">Idle state:</strong>
				<code class="ml-2 bg-blue-100 px-1 rounded"
					>onClick → handleSubmit</code>
				<br />
				<span class="text-sm"
					>Clicking starts the async form submission</span>
			</li>
			<li>
				<strong class="text-blue-900">Loading state:</strong>
				<code class="ml-2 bg-blue-100 px-1 rounded"
					>onClick → ignoreClick</code>
				<br />
				<span class="text-sm"
					>Clicks are ignored (no-op) to prevent
					re-submission</span>
			</li>
			<li>
				<strong class="text-blue-900">Success state:</strong>
				<code class="ml-2 bg-blue-100 px-1 rounded"
					>onClick → ignoreClick</code>
				<br />
				<span class="text-sm"
					>Clicks ignored during success display,
					auto-resets to idle after 2s</span>
			</li>
			<li>
				<strong class="text-blue-900">Error state:</strong>
				<code class="ml-2 bg-blue-100 px-1 rounded"
					>onClick → handleSubmit</code>
				<br />
				<span class="text-sm"
					>Clicking retries submission - same handler as
					idle state</span>
			</li>
		</ul>
		<p class="mt-4 text-sm text-blue-800">
			<strong>Why this pattern?</strong> Instead of conditionals
			checking state (<code class="bg-blue-100 px-1 rounded"
				>if (state === "loading") return;</code
			>), behavior changes automatically when state changes. Cleaner
			code, type-safe methods.
		</p>
	</div>
</div>
