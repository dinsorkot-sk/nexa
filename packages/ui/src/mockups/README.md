# Nexa UI mockups

These Histoire stories are the review checkpoint before rebuilding `apps/web`. They use the real `@nexa/ui` components with fabricated sample data; they do not connect to the API or persist changes. The shell/navigation is intentionally a mockup composition, not a new shared component API.

## Screen families

| Story | Screens and states |
|---|---|
| `WorkspaceHome.story.vue` | Workspace home and enabled/draft module launcher; first run with no modules |
| `Auth.story.vue` | Sign in, organization selection, sign up |
| `ModulesIndex.story.vue` | Module index: search/status filtering, empty workspace, loading, error |
| `ModuleDetail.story.vue` | Module overview, entities, relations; lifecycle transitions |
| `DefinitionEditor.story.vue` | Field and relation editors |
| `RecordList.story.vue` | Record list: search/filter, empty collection, loading, error |
| `Records.story.vue` | Record detail, create, edit, validation errors, stale-write conflict (409), viewer read-only |

`parts/MockShell.vue` is the shared application shell used by every story. `parts/data.ts` and `parts/ModuleStatus.vue` hold the module-builder fixtures. `_fixtures.ts` holds the vehicle entity fixtures for record stories. `AppShell`, `RecordForm`, and `RecordDetail` stories were folded into the shell and `Records` story and no longer exist as separate files.

The adjacent component stories exercise individual UI primitives. Keep application-level composition here and reusable behavior in `packages/ui/src/components`. The modules index must use module fixtures, while record stories use entity records; do not mix these two domains to simulate data.

## Preview and review

From the repository root:

```bash
pnpm --filter @nexa/ui story:dev
```

Open the Histoire URL printed by the command and review the **Mockups** group. Use the light/dark switch and narrow the viewport to check responsive behavior. All data is illustrative. Any screen or interaction change requested during review should be made in these stories first; do not recreate `apps/web` until the mockups are approved.
