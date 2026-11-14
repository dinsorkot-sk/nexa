# Contributing to Nexa

Thanks for your interest in Nexa. The project is in an early planning and bootstrap stage; product behavior and public APIs are not stable yet.

## Before contributing

- Read the [product brief](./docs/product-brief.md), [architecture proposal](./docs/architecture.md), and [delivery plan](./docs/roadmap.md).
- Open an issue to discuss changes that affect product scope, tenant security, database contracts, or public APIs before submitting code.
- Do not use real customer data. Authentication and tenant isolation are not implemented or security-reviewed yet.

## Development setup

The project requires Node.js 22 or newer and pnpm 12.8 or compatible.

```sh
pnpm install
pnpm dev
```

Before opening a pull request, run:

```sh
pnpm typecheck
pnpm build
```

## Contribution terms

Contributions are made under the repository's Apache-2.0 license. Keep changes focused and include relevant documentation for behavior or configuration changes.
