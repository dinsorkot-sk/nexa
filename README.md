# Nexa

Monorepo for web, server, desktop, and mobile clients sharing core packages.

## Structure

```
nexa/
├── apps/
│   ├── web/        # Vite + React web client
│   ├── server/     # Express API server
│   ├── desktop/    # Electron desktop shell
│   └── mobile/     # Expo (React Native) app
├── packages/
│   ├── ui/         # Shared React UI components
│   ├── core/       # Shared domain logic
│   ├── types/      # Shared TypeScript types
│   ├── utils/      # Shared utilities
│   ├── api-client/ # Typed HTTP client
│   └── config/     # Shared eslint/tsconfig presets
├── patches/        # patch-package dependency patches
├── turbo.json      # Turborepo pipeline
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

## Development

```bash
pnpm install
pnpm dev          # runs all apps via turbo
pnpm dev --filter @nexa/web
pnpm build
pnpm typecheck
pnpm test
```

## Patching dependencies

See `patches/README.md`.
