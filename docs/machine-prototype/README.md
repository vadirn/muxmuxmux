# @muxmuxmux/machine prototype, round three

This folder is a throwaway prototype. It is the evidence behind [../machine-design.md](../machine-design.md). The design doc wins wherever the two disagree.

The package at [packages/machine](../../packages/machine/README.md) now carries the implementation and its tests. This folder stays for what the package does not keep: the mutant switches, the rejected API shapes, and the React harness that loads React from the pnpm store. The package's `startOnSubscribe` replaces the fourth argument used here. The package also drops the claim that StrictMode builds two machines, because that is React's behavior, not the machine's.

A reboot cleared the scratchpad that held it. The files were rebuilt by replaying the session transcripts' file writes. Every replayed edit matched its target exactly once. Every recorded test and mutant result reproduces.

## Differences from the design doc

- `hold` has no export. `compose.test.ts` defines it inline.
- The package-private `createMachine` is a fourth argument here: `machine(initial, states, graph, { start: "subscribe" })`.
- `useMachine.ts` sits beside `machine.ts`, not in a `./react` subpath.
- `machine.ts` reads three mutant switches from environment variables. A package would drop them.

## Run

Run these from this folder. They use the repo's installed `tsc` and Node's type stripping.

```bash
../../node_modules/.bin/tsc -p tsconfig.json
```

```bash
node run.ts && node lifecycle.test.ts && node compose.test.ts && node react.test.ts && node smoke.ts && node example.ts
```

Expected output ends with `all runtime checks pass`, `lifecycle checks pass`, `compose checks pass`, `all react checks pass`, `smoke ok` and `example ok`.

TypeScript 7 refuses to check a single file inside a folder that has a `tsconfig.json`, so the shape probes need `--ignoreConfig`:

```bash
../../node_modules/.bin/tsc --ignoreConfig --strict --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --skipLibCheck --lib ES2022,DOM shapes.ts
```

## Mutants

Each switch reverts one decision. The listed files must fail.

| Switch                                          | Reverts                                    | Fails |
| ----------------------------------------------- | ------------------------------------------ | ----- |
| `STOPPED_CALL=restart`                          | a dead visit after stop                    | `lifecycle.test.ts`, `react.test.ts` |
| `START_FIRST=1`                                 | method lookup before start                 | `lifecycle.test.ts`, and `react.test.ts` on React 18 only |
| `DEFER_STOP=1`                                  | the synchronous stop                       | `run.ts`, `lifecycle.test.ts`, `compose.test.ts`, `react.test.ts` |
| Replace `HideVisit<R>` with `R` in `machine.ts` | the public `void` type for returned visits | `tsc`: `types.ts:53`, `types3.ts:20`, `types3.ts:50` |

## Files

- `machine.ts`: `machine`, `once`, `when`, and the types.
- `useMachine.ts`, `react-env.ts`: the React hook, and a harness that loads React and jsdom from the pnpm store.
- `run.ts`, `lifecycle.test.ts`, `compose.test.ts`, `react.test.ts`, `smoke.ts`: runtime checks as plain Node scripts, not vitest suites.
- `example.ts`: the submit button from `examples/react-button` as a machine. It prints a trace, checks it, and uses only the public API. `tsconfig.json` checks its types.
- `types.ts`, `types3.ts`: type assertions that `tsconfig.json` checks.
- `consumer.ts`, `opener.ts`: declaration-emit checks for `tsconfig.emit.json`.
- `shapes.ts`, `shapes2.ts`, `shapes3.ts`: standalone type probes for the rejected API shapes. `shapes.ts` fails with 20 errors and `shapes3.ts` with 2, because their targets collapse to `never`. `shapes2.ts` passes. The failures are the evidence.

## Environment

- Every check and mutant passes on React 19.3.1, jsdom 30.1.3, TypeScript 7.0.2 and Node 24.22.1, the repo's locked versions.
- The first run used React 18.3.1, jsdom 26.1.0 and TypeScript 5.9.3. React 18 runs the memo factory once per render pass, and React 19 twice in the first pass. So `smoke.ts` and the `2c none/initial` check in `react.test.ts` branch on `React.version`. Their React 18 branches have not run since React 18 left `node_modules`.
- `react-env.ts` finds the store two folders up, so the folder works in any checkout of this repo. It names the React 19 and jsdom 30 store folders.
- Changes from the recorded files: biome's formatting, the store path and versions in `react-env.ts`, and the two React-version branches. Two graph checks came after the rebuild: a state with no row in `types.ts`, and an unlisted move inside an async `enter` in `run.ts`.
- This folder falls inside `pnpm lint` and `pnpm format`, because `biome.json` includes `**` and `.gitignore` leaves `docs/` in. Biome has formatted it. Lint passes but reports 21 warnings and 1 info note here. Before a PR, either exclude the folder in `biome.json` or clear those warnings.
- `pnpm-workspace.yaml` covers only `packages/*` and `examples/*`, so `pnpm typecheck` and `pnpm test` skip this folder.
