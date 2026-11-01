# Patches

Dependency patches managed by `patch-package`.

## Usage

1. Edit a file inside `node_modules/<pkg>/...`
2. Run `pnpm patch` (or `npx patch-package <pkg>`) to generate a patch file here.
3. Commit the generated `.patch` file.
4. `postinstall` applies patches automatically on install.

Keep patches small and document the reason in the patch commit message.
