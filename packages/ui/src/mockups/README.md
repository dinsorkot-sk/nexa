# Nexa UI mockups

These Histoire stories are the review checkpoint before rebuilding `apps/web`. They use the real `@nexa/ui` components with fabricated sample data; they do not connect to the API or persist changes. The shell/navigation is intentionally a mockup composition, not a new shared component API.

## Screen families

| Story | Screens and states |
|---|---|
| `AppShell.story.vue` | Shared desktop shell and narrow-viewport layout |
| `WorkspaceHome.story.vue` | Workspace home and enabled/draft module launcher |
| `Auth.story.vue` | Sign in, organization selection, sign up |
| `ModulesIndex.story.vue` | Realistic module index, search/status filtering, empty, loading, error, no-results, pagination |
| `ModuleDetail.story.vue` | Module overview, entities, relations |
| `DefinitionEditor.story.vue` | Entity, field, and relation forms; lifecycle/archive confirmation |
| `RecordList.story.vue` | Record list, search/no results, empty collection, loading, error |
| `RecordForm.story.vue` | Create, edit, validation errors, stale-write conflict, viewer/read-only |
| `RecordDetail.story.vue` | Record details, relations, activity, empty activity, read-only relation links |

The adjacent component stories exercise individual UI primitives. Keep application-level composition here and reusable behavior in `packages/ui/src/components`. The modules index must use module fixtures, while record stories use entity records; do not mix these two domains to simulate data.

## Preview and review

From the repository root:

```bash
pnpm --filter @nexa/ui story:dev
```

Open the Histoire URL printed by the command and review the **Mockups** group. Use the light/dark switch and narrow the viewport to check responsive behavior. All data is illustrative. Any screen or interaction change requested during review should be made in these stories first; do not recreate `apps/web` until the mockups are approved.
