# Contributing to Nexa

Thanks for your interest. Nexa is licensed under AGPL-3.0.

## Getting started

```bash
pnpm install
pnpm dev          # runs all apps via turbo
pnpm typecheck
pnpm test
```

## Branching

- `main` is always releasable; changes land via PR only.
- Feature branches: `feat/short-name`. Chore/fix/docs: `chore/*`, `fix/*`, `docs/*`.
- Small PRs preferred; one concern per PR.

## Code style

- TypeScript strict mode. Run `pnpm typecheck` and `pnpm lint` before submitting.
- Follow existing patterns in `packages/` and `apps/`.
- No comments unless logic is non-obvious.

## Tests

- Unit/integration tests in Vitest.
- DB tests run against Postgres (Testcontainers) and SQLite (temp file).
- New features need tests; bug fixes need a regression test.

## Pull requests

- Fill the PR template. Link the relevant phase/milestone if applicable.
- CI must pass (typecheck, lint, test, build).