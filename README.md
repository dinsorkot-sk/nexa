# Nexa

Monorepo for web, server, desktop, and mobile clients sharing core packages.

## Structure

```
nexa/
├── apps/
│   ├── web/        # Nuxt 4 SPA (ssr: false) + Nuxt UI v4, themed from figcraft tokens
│   ├── server/     # Hono API server (also serves the generated SPA)
│   ├── desktop/    # Electron desktop shell
│   └── mobile/     # Expo (React Native) app
├── packages/
│   ├── ui/         # Nuxt layer: design tokens, theme, radius plugin (@nexa/ui)
│   ├── schema/     # Zod schema generator from meta_field (23 field types)
│   ├── core/       # Shared domain logic
│   ├── types/      # Shared TypeScript types
│   ├── utils/      # Shared utilities
│   ├── api-client/ # Typed HTTP client
│   └── config/     # Shared eslint/tsconfig presets
├── design/         # Design token source (tokens.json, extracted from Nexa.figcraft)
├── scripts/        # figcraft-tokens.ts — generates tokens.css + theme from design
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
pnpm tokens       # regenerate design tokens from design/tokens.json
pnpm tokens:check # CI: fail if generated tokens drift from design
pnpm build
pnpm typecheck
pnpm test
```

## Patching dependencies

See `patches/README.md`.
