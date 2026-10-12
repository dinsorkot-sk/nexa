# Nexa Design System Guide

> **Purpose:** The single implementation guide for Nexa visual design, shared components, page patterns, and interaction behavior.
>
> - `docs/plans/ux-ui-redesign.md` defines UX goals, scope, and sequencing.
> - `docs/plans/README.md`, `AGENTS.md`, and `CLAUDE.md` define project constraints and active phase.
> - `packages/ui/src/styles/tokens.css` is the canonical source for design-token values.
> - `packages/ui/src/styles/theme.css` maps semantic tokens to Tailwind utilities.
>
> This guide describes the intended contract. Always verify implementation details against the current repository before relying on a component, route, API, or token.

## 1. Design direction and source of truth

### Reference products

Use these products as references for specific design problems, not as templates to copy wholesale.

1. **Directus — data model and architecture (priority 1).** Use as the primary reference for Module, Entity, Field, Relation, datatype configuration, validation, options, and structure-versus-data separation. Favor clear grouping, explicit relationship endpoints, and visible lifecycle states.
2. **Linear — everyday UX and interaction (priority 2).** Use for readable list-first pages, quiet navigation, grouped search and filters, sorting, bulk actions where supported, keyboard-friendly interaction, and progressive disclosure.
3. **Nuxt UI — component and layout conventions (priority 3).** Use for dashboard composition, standard control patterns, responsive layouts, theme-aware components, and consistent spacing. Nuxt UI is a reference, not proof that a similarly named API exists in `@nexa/ui`.

### Mapping references to Nexa

| Nexa area | Primary reference | Adopt |
|---|---|---|
| Module, Entity, Field, Relation | Directus | Clear metadata hierarchy, grouped settings, explicit source/target/type, structure separated from records |
| Record lists and navigation | Linear | List-first layout, restrained toolbar, search/filter/sort, predictable row actions |
| Shared tokens and components | Nuxt UI + this guide | Consistent composition, semantic tokens, reusable component contracts |
| Form, Workflow, Document builders | Directus + Linear | Focused editing, clear structure, domain-specific interactions only where justified |
| Accessibility and localization | This guide | Keyboard access, contrast, Thai/English resilience, explicit states |

### Priority when instructions conflict

1. Follow repository instructions and the active phase in `docs/plans/README.md`. Do not start a later phase without explicit approval.
2. Follow this guide for shared visual, component, interaction, and accessibility conventions.
3. Follow `docs/plans/ux-ui-redesign.md` for redesign scope and UX goals.
4. Reuse current routes, tokens, shared components, schemas, and metadata renderers.
5. If the plan, architecture, and guide conflict, stop and document the conflict instead of introducing a parallel framework or design system.

## 2. Product principles

- **Clear before clever:** prefer familiar labels and patterns over decorative complexity.
- **One primary action:** each page or focused task should have one visually dominant action; keep alternatives quieter.
- **Progressive disclosure:** show essential information and frequent actions first; reveal advanced settings when needed without hiding critical state or consequences.
- **Metadata-driven:** generic platform UI must derive from module/entity/field metadata. Do not hard-code Inventory, CRM, HR, or other sample domains into reusable platform behavior.
- **Reuse before adding:** extend a suitable shared component before creating another one.
- **Honest state:** never invent counts, status, permissions, or success. Bind them to real API results when integrated.
- **Preserve user work:** inspect `git status --short` before editing and avoid overwriting unrelated changes.
- **Functional mockups:** mock data is acceptable during design review, but it must be identified as sample data and must not imply a real server operation succeeded.

## 3. Visual system

### 3.1 Tokens and colors

The canonical implementation source is `packages/ui/src/styles/tokens.css`. `theme.css` exposes semantic Tailwind utilities. Keep this section synchronized with those files; do not create a second palette.

#### Current palette tokens

| Family | Token | Value | Typical role |
|---|---|---|---|
| Slate | `--palette-slate-50` | `#f8fafc` | Light canvas |
| Slate | `--palette-slate-100` | `#f1f5f9` | Muted surface |
| Slate | `--palette-slate-200` | `#e2e8f0` | Palette step / soft separator |
| Slate | `--palette-slate-300` | `#cbd5e1` | Dark-theme text step |
| Slate | `--palette-slate-400` | `#94a3b8` | Subtle text / dark-theme border |
| Slate | `--palette-slate-500` | `#64748b` | Subtle text / placeholder |
| Slate | `--palette-slate-600` | `#475569` | Muted text |
| Slate | `--palette-slate-700` | `#334155` | Dark-theme border / neutral text |
| Slate | `--palette-slate-800` | `#1e293b` | Dark muted surface |
| Slate | `--palette-slate-900` | `#0f172a` | Primary text / dark surface |
| Slate | `--palette-slate-950` | `#020617` | Dark canvas |
| Emerald | `--palette-emerald-500` | `#10b981` | Brand shade / dark focus ring |
| Emerald | `--palette-emerald-600` | `#059669` | Focus ring |
| Emerald | `--palette-emerald-700` | `#047857` | Primary action |
| Emerald | `--palette-emerald-800` | `#065f46` | Primary hover |
| Rose | `--palette-rose-700` | `#be123c` | Light destructive action |
| Rose | `--palette-rose-600` | `#e11d48` | Dark destructive action |
| Amber | `--palette-amber-100` | `#fef3c7` | Warning surface |
| Amber | `--palette-amber-800` | `#92400e` | Warning text |

#### Semantic tokens

| Semantic token | Light theme | Dark theme | Role |
|---|---|---|---|
| `--nx-background` | Slate 50 | Slate 950 | App/page canvas |
| `--nx-surface` | White | Slate 900 | Content surfaces, menus, dialogs |
| `--nx-surface-muted` | Slate 100 | Slate 800 | Secondary surfaces |
| `--nx-border` | Slate 400 | Slate 700 | Borders and dividers |
| `--nx-border-strong` | Slate 500 | Slate 400 | Emphasized boundaries |
| `--nx-foreground` | Slate 900 | Slate 100 | Main text |
| `--nx-foreground-muted` | Slate 600 | Slate 300 | Supporting text |
| `--nx-foreground-subtle` | Slate 500 | Slate 400 | Secondary metadata; check contrast |
| `--nx-placeholder` | Slate 500 | Slate 400 | Placeholder text |
| `--nx-primary` | Emerald 700 | Emerald 700 | Primary action / selected emphasis |
| `--nx-primary-hover` | Emerald 800 | Emerald 800 | Primary hover |
| `--nx-primary-foreground` | White | White | Text/icons on primary fill |
| `--nx-ring` | Emerald 600 | Emerald 500 | Keyboard focus |
| `--nx-danger` | Rose 700 | Rose 600 | Destructive action |
| `--nx-success-soft` | Emerald 100 | Emerald 950 | Success surface |
| `--nx-warning-soft` | Amber 100 | Amber 950 | Warning surface |
| `--nx-danger-soft` | Rose 100 | Rose 950 | Error surface |
| `--nx-neutral-soft` | Slate 100 | Slate 800 | Neutral status surface |
| `--nx-overlay` | Dark overlay | Darker overlay | Modal/drawer backdrop |

Status surfaces must use their matching `*-soft-foreground` token for text. Pair color with a readable label and, where useful, an icon; never rely on color alone. Add semantic tokens only when a repeated product-wide need cannot be expressed by an existing role.

**Implementation rules**

- In product components, use semantic utilities such as `bg-background`, `bg-surface`, `text-foreground`, `text-foreground-muted`, `border-border`, `bg-primary`, `text-primary-foreground`, `ring-ring`, `bg-danger`, and the matching status-soft utilities.
- Do not use raw hex values or raw palette classes in page/component templates. Hex values belong in the canonical token definitions and documentation.
- Do not assume a color pair meets contrast requirements because its palette names appear compatible. Verify the actual rendered foreground/background pair.
- Support the existing `light`, `dark`, and `system` behavior. Light is the fallback. Do not create per-page theme implementations.
- Verify default, hover, focus, selected, disabled, invalid, and status states in both themes.

### 3.2 Typography

Use the existing font stack in `tokens.css`: Inter Variable for Latin, Noto Sans Thai Variable for Thai, with system fallbacks. Do not add a separate font family for an individual screen.

| Role | Guidance | Rule |
|---|---|---|
| Page title | `text-xl`–`text-2xl font-semibold` | One clear page title |
| Section title | `text-base`–`text-lg font-semibold` | Group related content |
| Body and form labels | `text-sm`–`text-base` | Readable primary content |
| Dense table content | `text-sm` | Do not shrink below this by default |
| Supporting metadata | `text-sm text-foreground-muted` | Secondary context |
| Micro-label | `text-xs` | Compact metadata only, not long instructions |
| Numeric data | Existing font with tabular numerals when available | Align comparable values |

Use sentence case for headings and actions, except established acronyms. Maintain readable line height, prevent Thai text clipping, and test long translated labels. These role ranges do not override existing component APIs or justify arbitrary font sizes.

### 3.3 Spacing, radius, and elevation

Use the established 4px spacing rhythm: 1 = 4px, 2 = 8px, 3 = 12px, 4 = 16px, 6 = 24px, 8 = 32px.

| Token | Current value | Usage |
|---|---:|---|
| `--radius-sm` | `0.25rem` / 4px | Compact controls where needed |
| `--radius-md` | `0.375rem` / 6px | Default buttons and inputs |
| `--radius-lg` | `0.5rem` / 8px | Grouped surfaces |
| `--radius-xl` | `0.75rem` / 12px | Larger cards and dialogs |
| `--radius-full` | `9999px` | Pills and circular controls |
| `--shadow-sm` | `0 1px 2px 0 rgb(15 23 42 / 0.06)` | Subtle elevation |
| `--shadow-lg` | `0 10px 30px -8px rgb(15 23 42 / 0.25)` | Floating overlays when justified |

- Establish hierarchy with spacing, alignment, and typography before adding borders, cards, or shadows.
- Do not wrap every form section in a card. Prefer section headings and dividers for settings and data-heavy configuration.
- Use cards for distinct groups, summaries, or content requiring selection/preview.
- Align page title, toolbar, filters, table, and pagination to a shared content edge.
- Keep forms at a readable maximum width; allow data tables to use available width.
- Use shared radius and shadow tokens. Avoid one-off radii, shadows, and arbitrary spacing.

### 3.4 Icons and motion

- Use the existing `lucide-vue-next` package. Do not add another icon library without a documented need and approval.
- Prefer familiar icons with consistent size and stroke. Icon-only controls require an accessible name and a tooltip when their meaning is not obvious.
- Do not replace labels with icons for high-impact or unfamiliar actions.
- Motion must explain a state change, loading, or navigation. Keep it short and subtle, and respect `prefers-reduced-motion`.

## 4. Application shell and responsive layout

- Reuse the established application shell and navigation pattern; do not create a separate shell for each page.
- Keep primary product navigation distinct from object-level tabs and local page actions.
- Keep the sidebar visually quiet; page content should remain the main focus.
- Place the page title and primary action in a consistent header area.
- Use available viewport width without making forms and reading-heavy content excessively wide.
- At narrow widths, collapse navigation using the existing drawer/menu pattern without hiding the only route to a core feature.
- Stack toolbars and form actions when space is limited.
- Tables must have a deliberate narrow-screen strategy: responsive columns, row summaries, or contained horizontal scrolling. Never cause whole-page horizontal overflow.
- Ensure dialogs, popovers, and drawers fit the viewport and retain usable controls.

## 5. Standard page patterns

These patterns define the expected information hierarchy. Adapt them to the task and existing route; do not add unsupported navigation or functionality.

### 5.1 Index and list pages

1. Page title and concise purpose.
2. One primary create action, only when supported by the route and current permissions.
3. Search and related filters grouped together with labels and a clear reset path.
4. Result count only when meaningful and based on real data.
5. Table/list with stable alignment, useful metadata, and discoverable row actions.
6. Relevant loading, empty, no-results, error, and permission states.

Use tables for collections users repeatedly compare or manage. Use cards only when a visual preview or item-level selection adds value. Keep bulk actions available only when the product supports the corresponding operation.

### 5.2 Detail pages

- Show the object name, useful identifier, and actual lifecycle/status in the header.
- Keep frequent tasks near the title; move destructive or infrequent actions to a secondary menu or clearly separated area.
- Separate overview, definition/design, relations, and settings when those are real domain concepts.
- Use tabs only for peer sections with meaningful content and existing routes.
- Do not create placeholder tabs or dead links.

### 5.3 Forms and editors

- Group fields by user task and domain meaning, not only by schema order when metadata permits a better grouping.
- Order common/required fields before advanced/optional fields.
- Give every input a persistent label; helper text should explain a useful constraint or decision.
- Make required/optional status and validation rules explicit.
- Place field-specific errors beside the field and submission-level failures in a clear summary.
- Preserve valid user input when a save fails.
- Keep Save, Save and close, Cancel, and destructive actions distinct and predictable.
- Show unsaved changes and guard against accidental loss only when supported by the existing application architecture.
- Disable duplicate submission while saving; restore controls when a request fails.

### 5.4 Tables and record lists

- Keep row height, alignment, sorting indicators, pagination, and selection patterns consistent.
- Make row actions discoverable without showing every possible action at once.
- Format dates, numbers, empty values, and relation values consistently.
- Respect field visibility and authorization enforced by the platform. Never expose hidden fields in presentation code.
- Preserve filter and pagination state when appropriate as users return from detail views.

### 5.5 Dialog, drawer, and feedback patterns

- Use a dialog for a short focused decision or confirmation.
- Use a drawer/slide-over for contextual editing when the user needs the underlying page as reference.
- Use a full page for complex workflows, large editors, or multi-step tasks.
- Do not put a complex workflow in a small modal merely to avoid navigation.
- Use inline alerts for persistent page-level issues, field messages for validation, and transient toasts for brief operation feedback.
- Confirm destructive or hard-to-reverse actions and state the affected object and consequence in plain language.
- Report success only after the operation actually succeeds.

## 6. Metadata editor UX contract

Metadata configuration is a core Nexa workflow. Generic UI must be metadata-driven and must distinguish definitions from real records.

### 6.1 Module, Entity, and Field

- Present the hierarchy clearly: Module contains Entities; Entities define Fields and may have Relations according to the supported schema.
- Make the current object and its parent context clear. Do not force users to infer which entity they are editing.
- Group field configuration by task: identity/basic information, datatype/options, validation, display behavior, and advanced settings when those concepts exist in the schema.
- Show datatype and validation constraints before save where practical.
- Do not present configuration options unsupported by the backend schema.
- Reuse shared metadata renderers and schemas; do not duplicate field-kind logic inside individual pages.
- Make ordering, required status, and lifecycle state explicit when those features are supported.

### 6.2 Relations

- Explicitly label **Source Entity**, **Target Entity**, and **Relation Type**.
- Explain direction and cardinality in user-facing language where needed; do not rely on an unfamiliar icon alone.
- Show only relation types supported by the schema/backend.
- Validate missing endpoints and incompatible choices before save.
- If a change may affect existing data or other definitions, explain the impact and required confirmation before applying it. Do not invent impact estimates.

### 6.3 Definition lifecycle and unsaved changes

- Use only lifecycle states and transitions supported by the actual backend.
- Distinguish draft/unsaved edits from saved definitions.
- Warn before discarding edits when the current app supports a dirty-state guard.
- For conflicts or stale data, preserve user input where possible and provide a safe recovery path.
- Never claim a schema change, save, publish, or delete succeeded based only on a mock interaction.

## 7. Interaction state contract

Every data-driven screen must consider the following states where applicable. A state must reflect the real source of truth in the integrated app; mockups must label sample data clearly.

| State | Expected behavior |
|---|---|
| Loading | Preserve page structure with skeleton/spinner and context; avoid layout jumps |
| Empty | Explain the feature and offer a relevant first action if the user has permission |
| No results | Explain that search/filter has no matches and provide a clear reset action |
| Error | Explain what failed and offer retry/recovery when possible |
| Permission denied | Explain that access is unavailable without leaking protected data |
| Saving | Communicate progress and prevent duplicate submission |
| Validation error | Identify the affected field and explain how to fix it |
| Conflict/stale data | Preserve user input where possible and describe the next safe step |
| Success | Give concise feedback only after confirmed completion |
| Disabled/unavailable | Make the control state clear; explain why when not obvious |

Never show an empty state while data is still loading, and never convert an API error into an empty collection. Every loading state must resolve to content, empty state, or an actionable error.

## 8. Shared component contract

### 8.1 Source of truth

- Inspect the actual `packages/ui` exports, component props, stories, tests, and consuming app before implementation.
- Reuse `@nexa/ui` primitives and metadata renderers. The names and APIs below are conceptual responsibilities, not a guarantee that every component or prop exists.
- Nuxt UI examples are visual/interaction references only. Do not assume their prop names or variants match Nexa.
- Prefer extending a shared component when behavior is broadly reusable. Do not implement a page-specific duplicate of an existing primitive.
- Add a new shared component only when a repeated pattern or independent responsibility justifies it; add/update its story and tests where supported.

### 8.2 Component responsibility matrix

| Component responsibility | Expected contract | Must verify in source |
|---|---|---|
| Button | Primary, secondary, low-emphasis, and destructive intent; loading/disabled/focus states | Actual variant names, sizes, loading API, keyboard behavior |
| Input and Select | Persistent label, value, disabled/invalid state, helper/error association | Supported props, native/select behavior, validation presentation |
| Badge / Status | Semantic status with readable text; color is not the only signal | Available variants and foreground/background token mapping |
| Table / MetaTable | Stable columns, sorting/selection/pagination where implemented, loading/empty states | Column schema, sort contract, row action and keyboard behavior |
| Form / MetaForm | Schema-driven fields, validation, preserved values on errors | Supported field kinds, schema shape, submit lifecycle |
| Detail / MetaDetail | Consistent read-only metadata formatting and visibility | Supported field metadata and value formatting |
| Field input/value | Shared field-kind input and display formatting | Actual exports and field-kind coverage |
| Dialog / Drawer / Popover | Accessible focus management, dismissal, viewport behavior | Existing primitives, slots, keyboard interaction |
| Alert / Toast | Persistent issue vs transient operation feedback | Actual API and whether operation status is server-confirmed |
| Pagination | Consistent page size, count, and navigation | Actual API and behavior for empty/small datasets |

**Component implementation rules**

- Use supported variants and sizes. Do not add page-specific variants or arbitrary class overrides to bypass the shared visual language.
- Use `UiButton` variants only after verifying the actual API. The intended semantic roles are primary, secondary, ghost/low-emphasis, and danger/destructive.
- Use shared field wrappers and inputs to keep labels, descriptions, required state, validation, focus, and disabled states consistent.
- Use `UiCard` only for meaningful grouped content, not as the default wrapper for every section.
- Use existing dialog/popover/tooltip primitives instead of custom overlays.
- Use shared `MetaTable`, `MetaForm`, `MetaDetail`, `MetaFieldInput`, and `MetaFieldValue` where they exist and fit the use case. Verify their actual exports before importing.
- Keep presentation focused on rendering and interaction. API access, domain rules, and authorization enforcement belong in their established layers.
- Use typed API responses and shared schemas; do not duplicate metadata contracts in UI code.

### 8.3 Component states

Where applicable, interactive components must visibly distinguish default, hover, focus-visible, active/selected, disabled, loading, and invalid states. Tables must make sorting, selection, pagination, and row actions discoverable and keyboard-accessible where implemented. Toasts and alerts must report real operation outcomes, not optimistic assumptions.

## 9. Accessibility and localization

- Use semantic HTML and native controls where appropriate.
- All interactive controls must be keyboard accessible and show a visible focus indicator.
- Meet WCAG 2.2 AA contrast targets: at least 4.5:1 for normal text, 3:1 for large text, and 3:1 for meaningful UI boundaries/graphics. Test actual rendered pairs.
- Associate labels, descriptions, and validation messages with their controls.
- Dialogs and menus must use existing accessible primitives with sensible focus entry, containment, and restoration.
- Do not communicate status or validation through color alone.
- Aim for touch targets of at least 24 × 24 CSS pixels as a baseline; prefer around 40–44px for frequent touch actions when layout allows.
- Test Thai and English labels, longer names, empty values, and narrow widths. Avoid fixed widths that clip translated text.
- Use the existing localization system when the page already uses translation keys. Do not introduce a parallel localization pattern.
- Respect `prefers-reduced-motion`.

## 10. Verification checklist

Use this checklist for mockup reviews and implementation PRs. Mark a check only when it has been inspected or tested; do not infer a pass from code intent.

### Visual consistency
- [ ] Uses canonical semantic tokens; no raw palette colors in product templates.
- [ ] Typography hierarchy and 4px spacing rhythm are consistent.
- [ ] Radius, elevation, borders, and surfaces follow shared tokens.
- [ ] Light and dark themes are checked where supported.

### UX and behavior
- [ ] Page hierarchy and primary action are clear.
- [ ] Search/filter/sort/reset behavior is understandable where applicable.
- [ ] Loading, empty, no-results, error, permission, validation, saving, and conflict states are covered where applicable.
- [ ] Destructive actions explain consequences and require confirmation when appropriate.
- [ ] No dead links, fake success messages, invented counts, or unsupported controls.
- [ ] User input is preserved safely when validation or save fails.

### Component and architecture
- [ ] Existing `packages/ui` components and APIs were inspected before creating or importing components.
- [ ] Metadata-driven rendering and shared schemas are reused where applicable.
- [ ] No duplicate component library, one-off tokens, or unrelated changes.
- [ ] Routes, permissions, and lifecycle transitions match the real application contract.

### Accessibility and responsive layout
- [ ] Keyboard navigation and visible focus are checked.
- [ ] Labels and error messages are programmatically associated.
- [ ] Contrast is checked against WCAG 2.2 AA targets.
- [ ] Narrow and wide viewports are checked; no page-level horizontal overflow.
- [ ] Thai/English, long labels, and long values are checked.

### Engineering checks
- [ ] Relevant tests and typecheck run.
- [ ] Lint/build checks run when available.
- [ ] Diff and `git status --short` are reviewed.
- [ ] Any failed or unverified checks are reported explicitly.

For mockups, interactions may use fixtures, but sample data must be recognizable as illustrative and controls must not imply real persistence. Before implementation, confirm the required route, API behavior, and permissions exist.

## 11. Required UI workflow

Before each UI task:

1. Read `AGENTS.md`, `CLAUDE.md`, `docs/plans/README.md`, this guide, and the relevant redesign plan section.
2. Check `git status --short` and preserve existing user changes.
3. Inspect the current route/layout, component exports and props, tokens, API types, schemas, authorization behavior, stories, and nearby tests.
4. State the user problem and expected behavior before making changes.
5. Implement the smallest coherent slice; avoid broad rewrites unless explicitly approved.
6. Review relevant visual, interaction, accessibility, localization, responsive, and theme states.
7. Run relevant tests, typecheck, lint, and build gates available in the active workspace.
8. Review the diff and report what changed, what passed, and what remains unverified.

If a required workspace, route, component, or backend capability is absent, do not recreate it from assumptions. Record the blocker and ask for direction when needed.

## 12. Definition of done

A UI change is complete only when:

- It solves the stated user task without dead navigation or unsupported functionality.
- It follows canonical tokens and shared components.
- Relevant loading, empty, no-results, error, permission, validation, and conflict states are handled.
- It is usable at narrow and wide viewports and by keyboard.
- It respects metadata visibility and authorization boundaries.
- Relevant tests/typecheck/build have passed, or failures and limitations are explicitly reported.
- The diff contains no unrelated changes and pre-existing user work remains intact.

For a full redesign, the mockups must be reviewed and explicitly approved by the user before the Web App rebuild begins.


## 13. Repository verification notes

This section records details checked against the current implementation. If any earlier summary table conflicts with these source files, the source files are authoritative.

### 13.1 Canonical token mappings verified

Checked against `packages/ui/src/styles/tokens.css` and `packages/ui/src/styles/theme.css`:

| Semantic role | Light mapping | Dark mapping |
|---|---|---|
| Background | `--palette-slate-50` (`#f8fafc`) | `--palette-slate-950` (`#020617`) |
| Surface | `--palette-white` (`#ffffff`) | `--palette-slate-900` (`#0f172a`) |
| Muted surface | `--palette-slate-100` (`#f1f5f9`) | `--palette-slate-800` (`#1e293b`) |
| Border | `--palette-slate-400` (`#94a3b8`) | `--palette-slate-700` (`#334155`) |
| Strong border | `--palette-slate-500` (`#64748b`) | `--palette-slate-400` (`#94a3b8`) |
| Foreground | `--palette-slate-900` (`#0f172a`) | `--palette-slate-100` (`#f1f5f9`) |
| Muted foreground | `--palette-slate-600` (`#475569`) | `--palette-slate-300` (`#cbd5e1`) |
| Subtle foreground | `--palette-slate-500` (`#64748b`) | `--palette-slate-400` (`#94a3b8`) |
| Placeholder | `--palette-slate-500` (`#64748b`) | `--palette-slate-400` (`#94a3b8`) |
| Primary | `--palette-emerald-700` (`#047857`) | `--palette-emerald-700` (`#047857`) |
| Primary hover | `--palette-emerald-800` (`#065f46`) | `--palette-emerald-800` (`#065f46`) |
| Focus ring | `--palette-emerald-600` (`#059669`) | `--palette-emerald-500` (`#10b981`) |
| Danger | `--palette-rose-700` (`#be123c`) | `--palette-rose-600` (`#e11d48`) |

Status tokens also define explicit foreground pairs: `--nx-success-soft-foreground`, `--nx-warning-soft-foreground`, `--nx-danger-soft-foreground`, and `--nx-neutral-soft-foreground`. Use these matching pairs rather than assuming a foreground from the base palette.

The currently defined shape tokens are `--radius-sm: 0.25rem`, `--radius-md: 0.375rem`, `--radius-lg: 0.5rem`, `--radius-xl: 0.75rem`, and `--radius-full: 9999px`. Light shadows are `--shadow-sm: 0 1px 2px 0 rgb(15 23 42 / 0.06)` and `--shadow-lg: 0 10px 30px -8px rgb(15 23 42 / 0.25)`; dark mode overrides both shadows with darker values in `tokens.css`.

### 13.2 Theme and utility contract verified

- `theme.css` maps semantic names including `background`, `surface`, `surface-muted`, `border`, `border-strong`, `foreground`, `foreground-muted`, `foreground-subtle`, `placeholder`, `primary`, `primary-hover`, `primary-foreground`, `ring`, `danger`, `danger-hover`, `danger-foreground`, the four status-soft/foreground pairs, and `overlay`.
- The Tailwind default color namespace is reset with `--color-*: initial`. Do not assume raw palette utility classes are available; use the semantic utilities exposed by `theme.css`.
- `tokens.css` defines light tokens at `:root` and dark overrides for `[data-theme='dark']`, `html.dark`, and `html.htw-dark`. Do not claim that automatic `system` preference handling exists solely from these files; verify the actual theme controller before documenting that behavior.
- The font stack is `'Inter Variable', 'Noto Sans Thai Variable', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif`; mono uses the system monospace stack.

### 13.3 Verified component API

Verified against each component's `defineProps`/`defineEmits` block in `packages/ui/src/components/` and the exports in `packages/ui/src/index.ts`. Enum values inside a cell are written with `/` instead of `|` so the table stays valid markdown.

**Barrel exports (`@nexa/ui`)**: `UiButton`, `UiBadge`, `UiCard`, `UiAlert`, `UiEmptyState`, `UiSpinner`, `UiSkeleton`, `UiPagination`, `UiDialog`, `UiPopover`, `UiTooltip`, `UiFieldWrapper`, `UiInput`, `UiTextarea`, `UiSelect`, `UiCombobox`, `UiCheckbox`, `UiSwitch`, `UiNumberInput`, `UiDatePicker`, `UiTimeInput`, `UiDateTimeInput`, `UiLinkField`, `UiLabel`, `MetaTable`, `MetaForm`, `MetaFieldInput`, `MetaFieldValue`, plus the `cn`, `theme`, `i18n`, `table`/`form`/`combobox`/`date`/`number` and `render/*` exports.

**Known export gap:** `MetaDetail.vue` exists in `packages/ui/src/components/` and is used by its story and the mockups, but it is **not** re-exported from `packages/ui/src/index.ts`. Import it from its file path until it is added to the barrel; do not claim `@nexa/ui` exports it. There is no `UiStatus.vue` component — the `UiStatus.story.vue` file is a story composing UiAlert/UiSpinner/UiSkeleton/UiEmptyState/UiFieldWrapper.

| Component | Key props (as declared) | Emits |
|---|---|---|
| `UiButton` | `variant` default `primary`, one of primary / secondary / ghost / danger; `size` sm / md / lg; `type` button / submit / reset; `disabled`; `loading`; `class` | `click` |
| `UiBadge` | `tone` neutral / success / warning / danger; `class` | — |
| `UiAlert` | `tone` neutral / success / warning / danger; `class` | — |
| `UiCard` | `class` | — |
| `UiEmptyState`, `UiSkeleton` | `class` | — |
| `UiSpinner` | `label?`; `class` | — |
| `UiPagination` | `total`, `limit`, `offset` (numbers, required); `disabled?`; `class` | `update:offset`, `update:limit`; page sizes 25/50/100 |
| `UiDialog` | `modelValue?` (optional so the uncontrolled `trigger` slot works alone); `class` | `update:modelValue`; slots: `trigger`, `title`, `description`, `close`, default |
| `UiPopover` | `modelValue?` optional (uncontrolled works without it); `align` start / center / end, default center; `closable?` default false; `class` | `update:modelValue` |
| `UiTooltip` | `text` (required); `side` top / right / bottom / left, default top; `delay` default 300; `class` | — |
| `UiFieldWrapper` | `label` required; `helpText?`; `error?`; `required?`; `id?`; `class` | — ; default slot receives `{ id, describedBy, invalid }`; `describedBy` prefers the error id over the help id |
| `UiInput`, `UiTextarea`, `UiSelect` | `modelValue?`; `class`; `inheritAttrs: false`, so native attrs (`type`, `id`, `autocomplete`, `aria-describedby`, `placeholder`) pass through the root element | `update:modelValue` |
| `UiCombobox` | `modelValue?` (single id or id array); `multiple?`; `loadOptions` (required, caller-owned fetch); `selected?` preloaded labels; `placeholder?`; `disabled?`; `debounceMs` default 250; `id?`; `describedBy?`; `invalid?`; `class` | `update:modelValue` |
| `UiCheckbox` | `modelValue?` boolean or `indeterminate`; `disabled?`; `class` | `update:modelValue` |
| `UiSwitch` | `modelValue?`; `disabled?`; `class` | `update:modelValue` |
| `UiNumberInput` | `modelValue?` number or null; `min?`; `max?`; `precision?`; `disabled?`; `invalid?`; `id?`; `describedBy?`; `class` | `update:modelValue` |
| `UiDatePicker` | `modelValue?` ISO `YYYY-MM-DD` Gregorian; `min?`; `max?`; `disabled?`; `invalid?`; `describedBy?`; `class` | `update:modelValue` |
| `UiTimeInput` | `modelValue?` `HH:mm` or `HH:mm:ss`; `withSeconds?`; `disabled?`; `invalid?`; `id?`; `describedBy?`; `class` | `update:modelValue` |
| `UiDateTimeInput` | `modelValue?` ISO instant (shown local, stored UTC); `disabled?`; `invalid?`; `id?`; `describedBy?`; `class` | `update:modelValue` |
| `UiLinkField` | `modelValue?`; `kind` file or image (required); `disabled?`; `invalid?`; `id?`; `describedBy?`; `placeholder?` | `update:modelValue` |
| `UiLabel` | `for?`; `class` | — |
| `MetaTable` | `columns` array of `{ field, width? }` (required); `page` `{ items, total, limit, offset }` (required); `loading?`; `error?`; `retry?`; `sort?`; `sortable?`; `sortableTypes?`; `referenceLabel?`; `currency?`; `emptyTitle?`; `emptyDescription?`; `clickable?`; `class` | `update:sort` (`MetaTableSort`), `rowClick` (`MetaTableRowClick`) |
| `MetaForm` | `form: FormDefinition`; `fields: FieldDefinition[]` (both required); `initialData?`; `version?`; `fieldErrors?` default `{}`; `formError?` default null; `readonly?` default false; `submitting?` default false; `submitLabel?`; `cancel?`; `loadReferenceOptions?`; `referenceSelected?`; `referenceLabel?`; `currency?`; `class` | `submit` `{ data, version? }` |
| `MetaDetail` (file-path import only) | `record` `{ id, version, data }`; `fields`; `activity` `{ items, total }`; `relations` array — all four required; `referenceLabel?`; `currency?`; `class` | — |
| `MetaFieldInput` | `field`; `modelValue` (both required); `loadReferenceOptions?`; `referenceSelected?`; `invalid?`; `describedBy?`; `id?` | `update:modelValue` |
| `MetaFieldValue` | `field`; `value` (both required); `referenceLabel?`; `currency?` | — |

Shared types exported for callers: `MetaTableSort`, `MetaTableFilter`, `MetaTableRow`, `MetaTablePage`, `MetaTableRowClick`, `MetaReferenceLabel` (from `table.ts`), and `MetaFormFieldErrors`, `MetaSectionView`, `formSections()`, `ReferenceSelectedResolver`, `RelationOpen` (from `form.ts`). `formSections()` now returns `columns` from the FormDefinition's section (1–4), and `MetaForm` lays sections out with `min(section.columns ?? 1, section.fields.length)` columns.

Field inputs cover all values of `FieldTypeSchema` (23 types); the input-kind mapping lives in `render/field-kinds.ts` (`inputKindOf`, `inputKindByFieldType`).

### 13.4 Verification status

- [x] Read `tokens.css` and `theme.css` and checked the token values/mappings recorded in §13.1–13.2.
- [x] Confirmed component APIs against current exports, source, stories, and tests (§13.3 table; including the `MetaDetail` barrel-export gap and the non-existent `UiStatus` component).
- [x] Run typecheck, tests, lint, and Histoire build after the UI fixes: `vue-tsc --noEmit` clean; workspace test suite 728/728 passing; eslint on `packages/ui` clean; `histoire build` succeeds. (recorded from the 2026-10-12 verification run)
- [x] Contrast: 18 token pairs checked WCAG AA in both themes by the token contrast script (Phase 19/20 record).
- [ ] Manual user review of all mockup families in Histoire before the Web App rebuild (pending — this is the gate stated in §12).

For mockups, interactions may use fixtures, but sample data must be recognizable as illustrative and controls must not imply real persistence. Before implementation, confirm the required route, API behavior, and permissions exist.
