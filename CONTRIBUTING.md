# Contributing to muxmuxmux

Thanks for contributing! Here's how to get started.

## Development Setup

1. **Install dependencies**

   ```bash
   pnpm install
   ```

2. **Run tests**

   ```bash
   pnpm test
   ```

3. **Build packages**

   ```bash
   pnpm build
   ```

4. **Lint and format**

   ```bash
   pnpm lint
   pnpm format
   ```

5. **Type checking**
   ```bash
   pnpm typecheck
   ```

## Making Changes

1. Fork the repo and create a branch
2. Make your changes
3. Add tests for new functionality
4. Ensure all tests pass: `pnpm test`
5. Ensure build succeeds: `pnpm build`
6. Run linting: `pnpm lint`

## Creating a Changeset

Before submitting a PR, create a changeset to document your changes:

```bash
pnpm changeset
```

Follow the prompts to:

- Select which packages are affected
- Choose the version bump type:
  - **patch**: Bug fixes (0.1.0 → 0.1.1)
  - **minor**: New features, backwards compatible (0.1.0 → 0.2.0)
  - **major**: Breaking changes (0.1.0 → 1.0.0)
- Write a summary of your changes

This creates a `.changeset/*.md` file. Commit it with your PR.

When your PR is merged, a "Version Packages" PR will be automatically created with version bumps and changelog updates.

## Code Style

We use [Biome](https://biomejs.dev/) for linting and formatting. Configuration is in `biome.json`.

Run `pnpm format` before committing to ensure consistent code style.

## Questions?

Open an issue at https://github.com/vadirn/muxmuxmux/issues
