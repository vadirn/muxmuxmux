# AGENTS.md

Facts a coding agent needs in this repo. [CONTRIBUTING.md](CONTRIBUTING.md) covers the general workflow.

## Layout

- `packages/core`, `packages/react`: the published packages.
- `examples/react-button`, `examples/svelte-button`: private demo apps.

All four are pnpm workspace projects.

## Dev shell

`shell.nix` provides Node 24 and pnpm 10. direnv loads it through `.envrc`, so run `direnv allow` once per checkout. The shell keeps pnpm's store in `~/.cache/pnpm`, which agent sandboxes can write.

## Commands

Run these from the repo root:

- `pnpm lint`: biome lint.
- `pnpm format`: biome format, writes files.
- `pnpm build`: `tsc` builds `packages/*/dist`.
- `pnpm typecheck`: builds, then typechecks every package and example.
- `pnpm test run`: vitest, one pass. Plain `pnpm test` watches in a terminal.

Before you finish, run `pnpm format`, `pnpm lint`, `pnpm typecheck`, and `pnpm test run`. CI runs all but `format` on pull requests to `main`.

## What `pnpm typecheck` covers

- `packages/*`: `tsc --noEmit` over `src`, tests included.
- `packages/core/fixtures/declaration-emit`: exports a controller and emits its declarations. TS4023 there means consumers cannot export controllers.
- `examples/react-button`: `tsc --noEmit`.
- `examples/svelte-button`: `svelte-kit sync && svelte-check`.

The fixture, the React package, and the examples import workspace packages from `dist`. So `pnpm typecheck` runs `pnpm build` first.

## Type tests

Type tests use vitest's `expectTypeOf`. vitest does not run its typecheck mode, so `pnpm test` passes a wrong type test. Only `pnpm typecheck` checks them.

To prove a type test can fail:

1. Copy it to a new file, such as `packages/core/src/proof.test.ts`, with a wrong expectation. For a state of `"idle" | "running"`, write `expectTypeOf(ctrl.get()).toEqualTypeOf<"idle">()`.
2. Run `pnpm typecheck`. Expect `error TS2344` on that line.
3. Delete the copy.

## Formatting

Biome is the only formatter. Run `pnpm format`, and never point another formatter at `.ts`, `.tsx`, or `.json` files. `biome.json` excludes `.svelte` files, so keep their existing style by hand.

## Changesets

A change to what `packages/*` publish needs a changeset: source, types, exports, or dependencies. Run `pnpm changeset`, or write `.changeset/<name>.md` by hand:

```md
---
"@muxmuxmux/core": minor
---

One-paragraph summary for the changelog.
```

Changes to examples, fixtures, scripts, CI, or docs need none.
