# React Button Example

This example demonstrates using `@muxmuxmux/react` to create a button with state-dependent behavior.

## Features

- **Idle state**: Button is enabled and ready to submit
- **Loading state**: Button is disabled during async operation
- **Success state**: Shows success message, then automatically returns to idle
- **Error state**: Shows error message with retry capability

## Running the example

```bash
pnpm install
pnpm dev
```

Open http://localhost:5173 in your browser.

## Key concepts

The controller is created inside the component using `useController`:

```tsx
function App() {
  const button = useController("idle", {
    idle: {
      onClick: async () => {
        button.set("loading");
        await submitForm();
        button.set("idle");
      }
    },
    loading: {}, // No onClick - button disabled
    success: {}, // No onClick - button disabled
    error: {
      onClick: async () => { /* retry */ }
    },
  });

  const state = button.get();

  return (
    <button
      onClick={button.onClick}
      disabled={state === "loading" || state === "success"}
    >
      {/* ... */}
    </button>
  );
}
```

Methods can reference the controller via closure to call `set()` for state transitions.

## Learn more

- [@muxmuxmux/react documentation](../../packages/react/README.md)
- [@muxmuxmux/core documentation](../../packages/core/README.md)
