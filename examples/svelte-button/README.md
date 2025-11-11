# Svelte Button Example

This example demonstrates using `@muxmuxmux/core` directly with Svelte's reactive `$` syntax in a SvelteKit app.

## Features

- **State-dependent method dispatching**: Same method name (`onClick`) has different implementations per state
- **Idle state**: Clicking starts async form submission
- **Loading state**: Clicks ignored (no-op) to prevent re-submission
- **Success state**: Shows success message, clicks ignored, auto-resets after 2s
- **Error state**: Clicking retries submission
- **Tailwind CSS v4**: Modern styling with Vite plugin
- **CVA**: Type-safe style variants

## Running the example

```bash
pnpm install
pnpm dev
```

Open http://localhost:5173 in your browser.

## Key concepts

The muxmuxmux controller works directly as a Svelte store! No adapter needed.

```svelte
<script>
  import { controller } from "@muxmuxmux/core";
  import { cva } from "class-variance-authority";

  const ignoreClick = () => {
    console.log("ignore click");
  };

  const handleSubmit = async () => {
    button.set("loading");
    try {
      await submitForm();
      button.set("success");
      setTimeout(() => button.set("idle"), 2000);
    } catch (_error) {
      button.set("error");
    }
  };

  const button = controller("idle", {
    idle: { onClick: handleSubmit },
    loading: { onClick: ignoreClick }, // No-op during loading
    success: { onClick: ignoreClick }, // No-op during success
    error: { onClick: handleSubmit }, // Retry uses same handler
  });

  const buttonVariants = cva("base-styles", {
    variants: {
      state: {
        idle: "idle-styles",
        loading: "loading-styles",
        success: "success-styles",
        error: "error-styles",
      },
    },
  });
</script>

<!-- Use Svelte's reactive $ syntax -->
<button
  type="button"
  on:click={button.onClick}
  class={buttonVariants({ state: $button })}
>
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
```

The `$button` syntax automatically subscribes to state changes and triggers re-renders.

**Why this pattern?** Instead of conditionals checking state (`if (state === "loading") return;`), behavior changes automatically when state changes. Cleaner code, type-safe methods.

## Learn more

- [@muxmuxmux/core documentation](../../packages/core/README.md)
