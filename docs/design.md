# Nexa Design System Guide

> **Purpose:** The single implementation guide for Nexa visual design, shared components, page patterns, and interaction behavior.
>
> - `docs/plans/ux-ui-redesign.md` defines UX goals, scope, and sequencing.
> - `docs/plans/README.md`, `AGENTS.md`, and `CLAUDE.md` define project constraints and the active phase.
> - `packages/ui/src/styles/tokens.css` is the canonical source for design-token values.
> - `packages/ui/src/styles/theme.css` maps semantic tokens to Tailwind utilities.
> - `packages/ui/src/theme/index.ts` applies the light, dark, and system theme.
>
> This guide describes the intended contract. Always verify implementation details against the current repository before relying on a component, route, API, or token.

## 1. Design direction and source of truth

### 1.1 Reference products

Use these products as references for specific design problems, not as templates to copy wholesale.

**Primary references**

1. **Directus — data model and architecture.** Primary reference for Module, Entity, Field, Relation, datatype configuration, validation, options, and the separation of structure from data. Favor clear grouping, explicit relationship endpoints (source, target, type), and visible lifecycle states.
   - Directus documents these relation types: Many-to-One, One-to-Many, One-to-One, Many-to-Many (requires a junction collection), and Many-to-Any. Show only the types Nexa's schema supports.
2. **Linear — everyday UX and interaction.** Reference for list-first pages, quiet navigation, grouped search and filters, sorting, bulk actions, keyboard-friendly interaction, and progressive disclosure.
   - Adopt: every mouse action that matters should also have a keyboard path; shortcuts appear in tooltips and menu rows; multi-select is visible; filter and sort state lives in the URL so views can be returned to and shared.
   - Do not copy: a keyboard-first model as a requirement. Nexa users are enterprise builders, not necessarily power users. Keyboard shortcuts accelerate frequent actions; they are never the only path.
3. **Nuxt UI — component and layout conventions.** Reference for dashboard composition, standard control patterns, responsive layouts, and consistent spacing.
   - Nexa does **not** use Nuxt UI. Its token system (`primary`, `neutral`, `--ui-*`, `appConfig.ui.colors`) and component APIs do not apply to `@nexa/ui`. Use Nuxt UI only as a visual and interaction reference; never assume its prop names or variants exist in Nexa.

**Secondary references (use only for the stated problem)**

- **Supabase** — dense data-tool layout (table editor, SQL, and auth in one dashboard) and emerald/dark-theme density. Use when designing data-dense control panels.
- **Notion** — property types and database views that switch between Table, Board, and Calendar. Use as an idea source for future view renderers, not as a visual reference.
- Stripe and Vercel are not primary references: their brand tone is far from an enterprise builder. Borrowing specific shadow or token techniques is acceptable.

### 1.2 Mapping references to Nexa

| Nexa area | Primary reference | Adopt |
|---|---|---|
| Module, Entity, Field, Relation | Directus | Clear metadata hierarchy, grouped settings, explicit source/target/type, structure separated from records |
| Record lists and navigation | Linear | List-first layout, restrained toolbar, search/filter/sort, predictable row actions |
| Shared tokens and components | Nexa tokens (this guide) + Nuxt UI as visual reference | Consistent composition, semantic tokens, reusable component contracts |
| Form, Workflow, Document builders | Directus + Linear | Focused editing, clear structure, domain-specific interactions only where justified |
| Dense data tools | Supabase (secondary) | Compact table and toolbar density without clutter |
| Future view types | Notion (secondary) | Table/Board/Calendar switching, only when the view renderer exists |
| Accessibility and localization | This guide | Keyboard access, contrast, Thai/English resilience, explicit states |

### 1.3 Priority when instructions conflict

1. Follow repository instructions and the active phase in `docs/plans/README.md`. Do not start a later phase without explicit approval.
2. Follow this guide for shared visual, component, interaction, and accessibility conventions.
3. Follow `docs/plans/ux-ui-redesign.md` for redesign scope and UX goals.
4. Reuse current routes, tokens, shared components, schemas, and metadata renderers.
5. If the plan, architecture, and guide conflict, stop and document the conflict instead of introducing a parallel framework or design system.

## 2. Product principles

- **Clear before clever:** prefer familiar labels and patterns over decorative complexity.
- **One primary action:** each page or focused task has one visually dominant action; alternatives stay quieter.
- **Progressive disclosure:** show essential information and frequent actions first; reveal advanced settings on demand without hiding critical state or consequences.
- **Metadata-driven:** generic platform UI derives from module, entity, and field metadata. Do not hard-code sample domains (Inventory, CRM, HR, or others) into reusable platform behavior.
- **Reuse before adding:** extend a suitable shared component before creating another one.
- **Honest state:** never invent counts, statuses, permissions, or success. Bind them to real API results when integrated.
- **Preserve user work:** inspect `git status --short` before editing and avoid overwriting unrelated changes.
- **Functional mockups:** mock data is acceptable during design review, but it must be identified as sample data and must not imply that a real server operation succeeded.

## 3. Visual system

### 3.1 Tokens and colors

The canonical implementation source is `packages/ui/src/styles/tokens.css`. `theme.css` exposes semantic Tailwind utilities. Keep this section synchronized with those files; do not create a second palette.

#### Palette tokens

| Family | Token | Value | Typical role |
|---|---|---|---|
| Slate | `--palette-slate-50` | `#f8fafc` | Light canvas |
| Slate | `--palette-slate-100` | `#f1f5f9` | Light muted surface |
| Slate | `--palette-slate-200` | `#e2e8f0` | Palette step / soft separator |
| Slate | `--palette-slate-300` | `#cbd5e1` | Dark-theme muted text |
| Slate | `--palette-slate-400` | `#94a3b8` | Light border; dark-theme border and subtle text |
| Slate | `--palette-slate-500` | `#64748b` | Light strong border; subtle text and placeholder |
| Slate | `--palette-slate-600` | `#475569` | Light muted text |
| Slate | `--palette-slate-700` | `#334155` | Dark border |
| Slate | `--palette-slate-800` | `#1e293b` | Dark muted surface |
| Slate | `--palette-slate-900` | `#0f172a` | Light foreground; dark surface |
| Slate | `--palette-slate-950` | `#020617` | Dark canvas |
| Emerald | `--palette-emerald-500` | `#10b981` | Dark focus ring |
| Emerald | `--palette-emerald-600` | `#059669` | Light focus ring |
| Emerald | `--palette-emerald-700` | `#047857` | Primary action |
| Emerald | `--palette-emerald-800` | `#065f46` | Primary hover |
| Rose | `--palette-rose-600` | `#e11d48` | Dark destructive action |
| Rose | `--palette-rose-700` | `#be123c` | Light destructive action |
| Amber | `--palette-amber-100` | `#fef3c7` | Warning surface |
| Amber | `--palette-amber-800` | `#92400e` | Warning text |

#### Semantic tokens

| Semantic token | Light theme | Dark theme | Role |
|---|---|---|---|
| `--nx-background` | Slate 50 | Slate 950 | App and page canvas |
| `--nx-surface` | White | Slate 900 | Content surfaces, menus, dialogs |
| `--nx-surface-muted` | Slate 100 | Slate 800 | Secondary surfaces |
| `--nx-border` | Slate 400 | Slate 700 | Borders and dividers |
| `--nx-border-strong` | Slate 500 | Slate 400 | Emphasized boundaries |
| `--nx-foreground` | Slate 900 | Slate 100 | Main text |
| `--nx-foreground-muted` | Slate 600 | Slate 300 | Supporting text |
| `--nx-foreground-subtle` | Slate 500 | Slate 400 | Secondary metadata; verify contrast |
| `--nx-placeholder` | Slate 500 | Slate 400 | Placeholder text |
| `--nx-primary` | Emerald 700 | Emerald 700 | Primary action and selected emphasis |
| `--nx-primary-hover` | Emerald 800 | Emerald 800 | Primary hover |
| `--nx-primary-foreground` | White | White | Text and icons on primary fill |
| `--nx-ring` | Emerald 600 | Emerald 500 | Keyboard focus |
| `--nx-danger` | Rose 700 | Rose 600 | Destructive action |
| `--nx-danger-hover`, `--nx-danger-foreground` | As defined in `tokens.css` | As defined in `tokens.css` | Destructive hover and text on danger fill |
| `--nx-success-soft` | Emerald 100 | Emerald 950 | Success surface |
| `--nx-warning-soft` | Amber 100 | Amber 950 | Warning surface |
| `--nx-danger-soft` | Rose 100 | Rose 950 | Error surface |
| `--nx-neutral-soft` | Slate 100 | Slate 800 | Neutral status surface |
| `--nx-overlay` | Dark overlay | Darker overlay | Modal and drawer backdrop |

Each status surface has a matching foreground token (`--nx-success-soft-foreground`, `--nx-warning-soft-foreground`, `--nx-danger-soft-foreground`, `--nx-neutral-soft-foreground`). Use these pairs for text on status surfaces. Pair color with a readable label and, where useful, an icon; never rely on color alone. Add semantic tokens only when a repeated product-wide need cannot be expressed by an existing role.

**Implementation rules**

- In product components, use semantic utilities such as `bg-background`, `bg-surface`, `text-foreground`, `text-foreground-muted`, `border-border`, `bg-primary`, `text-primary-foreground`, `ring-ring`, `bg-danger`, and the matching status-soft utilities.
- Do not use raw hex values or raw palette classes in page or component templates. Hex values belong in the canonical token definitions and this document.
- The Tailwind default color namespace is reset (`--color-*: initial`). Raw palette utilities such as `bg-emerald-700` are not available; use the semantic utilities from `theme.css`.
- Do not assume a color pair meets contrast requirements because its palette names look compatible. Verify the rendered foreground and background pair.
- Support `light`, `dark`, and `system`. `packages/ui/src/theme/index.ts` resolves `system` through `prefers-color-scheme` and sets `data-theme` on the root element. Light is the fallback. Do not create per-page theme implementations.
- Verify default, hover, focus, selected, disabled, invalid, and status states in both themes.

### 3.2 Typography

Use the font stack in `tokens.css`: Inter Variable for Latin and Noto Sans Thai Variable for Thai, with system fallbacks. Mono uses the system monospace stack. Do not add a separate font family for an individual screen.

| Role | Guidance | Rule |
|---|---|---|
| Page title | `text-xl`–`text-2xl font-semibold` | One clear page title |
| Section title | `text-base`–`text-lg font-semibold` | Group related content |
| Body and form labels | `text-sm`–`text-base` | Readable primary content |
| Dense table content | `text-sm` | Do not shrink below this by default |
| Supporting metadata | `text-sm text-foreground-muted` | Secondary context |
| Micro-label | `text-xs` | Compact metadata only, not long instructions |
| Numeric data | Existing font with tabular numerals when available | Align comparable values |

Use sentence case for headings and actions, except established acronyms. Keep line height readable, prevent Thai text clipping, and test long translated labels. These ranges do not override existing component APIs or justify arbitrary font sizes.

### 3.3 Spacing, radius, and elevation

Use the 4px spacing rhythm: 1 = 4px, 2 = 8px, 3 = 12px, 4 = 16px, 6 = 24px, 8 = 32px.

| Token | Light value | Usage |
|---|---:|---|
| `--radius-sm` | `0.25rem` / 4px | Compact controls where needed |
| `--radius-md` | `0.375rem` / 6px | Default buttons and inputs |
| `--radius-lg` | `0.5rem` / 8px | Grouped surfaces |
| `--radius-xl` | `0.75rem` / 12px | Larger cards and dialogs |
| `--radius-full` | `9999px` | Pills and circular controls |
| `--shadow-sm` | `0 1px 2px 0 rgb(15 23 42 / 0.06)` | Subtle elevation; dark mode uses a darker override |
| `--shadow-lg` | `0 10px 30px -8px rgb(15 23 42 / 0.25)` | Floating overlays when justified; dark mode uses a darker override |

- Establish hierarchy with spacing, alignment, and typography before adding borders, cards, or shadows.
- Do not wrap every form section in a card. Prefer section headings and dividers for settings and data-heavy configuration.
- Use cards only for distinct groups, summaries, or content that needs selection or preview.
- Align page title, toolbar, filters, table, and pagination to a shared content edge.
- Keep forms at a readable maximum width; let data tables use available width.
- Use shared radius and shadow tokens. Avoid one-off radii, shadows, and arbitrary spacing.

### 3.4 Icons and motion

- Use the existing `lucide-vue-next` package. Do not add another icon library without a documented need and approval.
- Prefer familiar icons with consistent size and stroke. Icon-only controls require an accessible name and a tooltip when their meaning is not obvious.
- Do not replace labels with icons for high-impact or unfamiliar actions.
- Motion must explain a state change, loading, or navigation. Keep it short and subtle, and respect `prefers-reduced-motion`.
- Motion duration target: 120–180 ms for state changes (hover, selection, popover open). Longer motion is reserved for large surfaces such as drawers, and must not delay the user's next action. These values are targets until a motion token exists in `tokens.css`; do not hard-code them per component.

## 4. Application shell and responsive layout

- Reuse the established application shell and navigation pattern; do not create a separate shell for each page.
- Keep primary product navigation distinct from object-level tabs and local page actions.
- Shell structure follows the Nuxt UI dashboard composition as a structural reference only: a sidebar region (workspace identity, primary destinations, account area) next to a main panel with a header (title, primary action) and a body. The sidebar should support collapse on desktop and a drawer on narrow widths. Persisting the collapsed state is allowed only when stored per viewer (for example in `localStorage` with a try/catch fallback), never as server state. Map the structure to Nexa's own components; do not copy Nuxt UI's prop names.
- A command palette (Cmd/Ctrl+K) is an accelerator, not a requirement. Any action reachable from the palette must also be reachable from visible navigation or a button. Show the shortcut in tooltips and menu rows so keyboard users can discover it. Add the palette only when a shared primitive exists; do not build a page-specific one.
- Keep the sidebar visually quiet; page content remains the focus. Show only destinations whose routes exist.
- Place the page title and primary action in a consistent header area. Use breadcrumbs only for nested objects.
- Use available viewport width without making forms and reading-heavy content excessively wide.
- At narrow widths, collapse navigation using the existing drawer or menu pattern without hiding the only route to a core feature.
- Stack toolbars and form actions when space is limited.
- Tables need a deliberate narrow-screen strategy: responsive columns, row summaries, or contained horizontal scrolling. Never cause whole-page horizontal overflow.
- Ensure dialogs, popovers, and drawers fit the viewport and keep their controls usable.

## 5. Standard page patterns

These patterns define the expected information hierarchy. Adapt them to the task and the existing route; do not add unsupported navigation or functionality.

### 5.1 Index and list pages

1. Page title and concise purpose.
2. One primary create action, only when supported by the route and current permissions.
3. Search and related filters grouped together with labels and a clear reset path.
4. Result count only when meaningful and based on real data.
5. Table or list with stable alignment, useful metadata, and discoverable row actions.
6. Loading, empty, no-results, error, and permission states where applicable.

Use tables for collections users repeatedly compare or manage. Use cards only when a visual preview or item-level selection adds value. Offer bulk actions only where the product supports the operation.

**Density and interaction targets (to verify on real pages, not assumed):**
- Table rows should be compact enough to scan 20 or more rows on a laptop viewport without scrolling. Measure the real row height before setting a standard.
- Default page size is one of the values `UiPagination` supports (25, 50, 100).
- Opening a record should take one click from the list. Row actions appear on hover or focus and are also reachable by keyboard.
- Count the clicks for the most frequent tasks (create record, find record, edit, change status). Reduce any task that needs more than three steps without a good reason.

### 5.2 Detail pages

- Show the object name, a useful identifier, and the actual lifecycle or status in the header.
- Keep frequent tasks near the title; move destructive or infrequent actions into a secondary menu or a clearly separated area.
- Separate overview, definition or design, relations, and settings when those are real domain concepts.
- Use tabs only for peer sections with meaningful content and existing routes.
- Do not create placeholder tabs or dead links.

### 5.3 Forms and editors

- Group fields by user task and domain meaning, not only by schema order when metadata allows better grouping.
- Order common or required fields before advanced or optional fields.
- Give every input a persistent label; helper text should explain a useful constraint or decision.
- Make required/optional status and validation rules explicit.
- Place field-specific errors beside the field and submission-level failures in a clear summary.
- Preserve valid user input when a save fails.
- Keep Save, Save and close, Cancel, and destructive actions distinct and predictable.
- Show unsaved changes and guard against accidental loss only when the existing architecture supports it.
- Disable duplicate submission while saving; restore controls when a request fails.

### 5.4 Tables and record lists

- Keep row height, alignment, sort indicators, pagination, and selection patterns consistent.
- Row density is a per-table choice on `MetaTable` (`density`), not a per-screen override:
  - `comfortable` (default, 36 px data rows measured) for record lists and any table where scanning is secondary.
  - `compact` (28 px data rows measured) for scan-heavy tables that users compare line by line.
  - Both use the same horizontal padding and typography so columns align across densities. Changing a density value must be done on the shared table, never by overriding cell padding in a screen.
  - Measured values and their verification status are recorded in §13.4.
- Focus, hover, selected, and disabled states must be visible on rows as well as on controls (see §8.3).
- Make row actions discoverable without showing every possible action at once.
- Format dates, numbers, empty values, and relation values consistently.
- Respect field visibility and authorization enforced by the platform. Never expose hidden fields in presentation code.
- Preserve filter, sort, and pagination state when users return from detail views (URL query or equivalent).

### 5.5 Dialog, drawer, and feedback patterns

- Use a dialog for a short, focused decision or confirmation.
- Use a drawer or slide-over for contextual editing when the user needs the underlying page as reference.
- Use a full page for complex workflows, large editors, or multi-step tasks.
- Do not put a complex workflow in a small modal merely to avoid navigation.
- Use inline alerts for persistent page-level issues, field messages for validation, and transient toasts for brief operation feedback.
- Confirm destructive or hard-to-reverse actions, stating the affected object and consequence in plain language.
- Report success only after the operation actually succeeds.

## 6. Metadata editor UX contract

Metadata configuration is a core Nexa workflow. Generic UI must be metadata-driven and must distinguish definitions from real records.

### 6.1 Module, Entity, and Field

- Present the hierarchy clearly: a Module contains Entities; Entities define Fields and may have Relations according to the supported schema.
- Make the current object and its parent context clear. Users should never have to infer which entity they are editing.
- Group field configuration by task: identity and basic information, datatype and options, validation, display behavior, and advanced settings, where those concepts exist in the schema.
- Show datatype and validation constraints before save where practical.
- Do not present configuration options the backend schema does not support.
- Reuse shared metadata renderers and schemas; do not duplicate field-kind logic inside individual pages.
- Make ordering, required status, and lifecycle state explicit when those features are supported.

### 6.2 Relations

- Label **Source Entity**, **Target Entity**, and **Relation Type** explicitly.
- Explain direction and cardinality in user-facing language where needed; do not rely on an unfamiliar icon alone.
- Show only relation types supported by the schema and backend.
- Validate missing endpoints and incompatible choices before save.
- If a change may affect existing data or other definitions, explain the impact and require confirmation before applying it. Do not invent impact estimates.

### 6.3 Definition lifecycle and unsaved changes

- Use only the lifecycle states and transitions the backend actually supports.
- Distinguish draft or unsaved edits from saved definitions.
- Warn before discarding edits when the app supports a dirty-state guard.
- For conflicts or stale data, preserve user input where possible and provide a safe recovery path.
- Never claim a schema change, save, publish, or delete succeeded based only on a mock interaction.

## 7. Interaction state contract

Every data-driven screen must consider the following states where applicable. A state must reflect the real source of truth in the integrated app; mockups must label sample data clearly.

| State | Expected behavior |
|---|---|
| Loading | Preserve page structure with skeleton or spinner and context; avoid layout jumps |
| Empty | Explain the feature and offer a relevant first action if the user has permission |
| No results | Explain that search or filter has no matches and provide a clear reset action |
| Error | Explain what failed and offer retry or recovery when possible |
| Permission denied | Explain that access is unavailable without leaking protected data |
| Saving | Communicate progress and prevent duplicate submission |
| Validation error | Identify the affected field and explain how to fix it |
| Conflict or stale data | Preserve user input where possible and describe the next safe step |
| Success | Give concise feedback only after confirmed completion |
| Disabled or unavailable | Make the control state clear; explain why when not obvious |

Never show an empty state while data is still loading, and never convert an API error into an empty collection. Every loading state must resolve to content, an empty state, or an actionable error.

## 8. Shared component contract

### 8.1 Source of truth

- Inspect the actual `packages/ui` exports, component props, stories, tests, and consuming app before implementation.
- Reuse `@nexa/ui` primitives and metadata renderers. The responsibilities below are conceptual; verify each component and prop exists before relying on it.
- Nuxt UI examples are visual and interaction references only. Do not assume their prop names or variants match Nexa.
- Prefer extending a shared component when behavior is broadly reusable. Do not build a page-specific duplicate of an existing primitive.
- Add a new shared component only when a repeated pattern or independent responsibility justifies it; add or update its story and tests where supported.

### 8.2 Component responsibility matrix

| Component responsibility | Expected contract | Must verify in source |
|---|---|---|
| Button | Primary, secondary, low-emphasis, and destructive intent; loading, disabled, focus states | Variant names, sizes, loading API, keyboard behavior |
| Input and Select | Persistent label, value, disabled/invalid state, helper/error association | Supported props, native/select behavior, validation presentation |
| Badge / Status | Semantic status with readable text; color is not the only signal | Available tones and foreground/background token mapping |
| Table / MetaTable | Stable columns, sorting/selection/pagination where implemented, loading/empty states | Column schema, sort contract, row action and keyboard behavior |
| Form / MetaForm | Schema-driven fields, validation, preserved values on errors | Supported field kinds, schema shape, submit lifecycle |
| Detail / MetaDetail | Consistent read-only metadata formatting and visibility | Supported field metadata and value formatting |
| Field input and value | Shared field-kind input and display formatting | Actual exports and field-kind coverage |
| Dialog / Drawer / Popover | Accessible focus management, dismissal, viewport behavior | Existing primitives, slots, keyboard interaction |
| Alert / Toast | Persistent issue vs transient operation feedback | Actual API and whether the outcome is server-confirmed |
| Pagination | Consistent page size, count, and navigation | Actual API and behavior for empty or small datasets |

**Component implementation rules**

- Use supported variants and sizes. Do not add page-specific variants or arbitrary class overrides to bypass the shared visual language.
- Use `UiButton` variants only after verifying the API (see §13.3). Intended semantic roles: primary, secondary, ghost/low-emphasis, danger/destructive.
- Use shared field wrappers and inputs so labels, descriptions, required state, validation, focus, and disabled states stay consistent.
- Use `UiCard` only for meaningful grouped content, not as the default wrapper for every section.
- Use existing dialog, popover, and tooltip primitives instead of custom overlays.
- Use shared `MetaTable`, `MetaForm`, `MetaDetail`, `MetaFieldInput`, and `MetaFieldValue` where they fit the use case. Verify their actual exports before importing.
- Keep presentation focused on rendering and interaction. API access, domain rules, and authorization enforcement belong in their established layers.
- Use typed API responses and shared schemas; do not duplicate metadata contracts in UI code.

### 8.3 Component states

Interactive components must visibly distinguish default, hover, focus-visible, active or selected, disabled, loading, and invalid states where applicable. Tables must make sorting, selection, pagination, and row actions discoverable and keyboard-accessible where implemented. Toasts and alerts must report real operation outcomes, not optimistic assumptions.

## 9. Accessibility and localization

- Use semantic HTML and native controls where appropriate.
- All interactive controls must be keyboard accessible and show a visible focus indicator.
- Meet WCAG 2.2 AA contrast: at least 4.5:1 for normal text, 3:1 for large text, and 3:1 for meaningful UI boundaries and graphics. Test rendered pairs.
- Associate labels, descriptions, and validation messages with their controls.
- Dialogs and menus must use existing accessible primitives with sensible focus entry, containment, and restoration.
- Do not communicate status or validation through color alone.
- Touch targets: at least 24 × 24 CSS px as a baseline; aim for about 40–44 px on frequent touch actions when layout allows.
- Test Thai and English labels, longer names, empty values, and narrow widths. Avoid fixed widths that clip translated text.
- Use the existing localization system when a page already uses translation keys. Do not introduce a parallel localization pattern.
- Respect `prefers-reduced-motion`.

## 10. Verification checklist

Use this checklist for mockup reviews and implementation PRs. Mark a check only when it has been inspected or tested; do not infer a pass from code intent.

### Visual consistency
- [ ] Uses canonical semantic tokens; no raw palette colors in product templates.
- [ ] Typography hierarchy and 4px spacing rhythm are consistent.
- [ ] Radius, elevation, borders, and surfaces follow shared tokens.
- [ ] Light, dark, and system themes are checked where supported.

### UX and behavior
- [ ] Page hierarchy and primary action are clear.
- [ ] Search, filter, sort, and reset behavior is understandable where applicable.
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
- [ ] Lint and build checks run when available.
- [ ] Diff and `git status --short` are reviewed.
- [ ] Any failed or unverified checks are reported explicitly.

For mockups, interactions may use fixtures, but sample data must be recognizable as illustrative and controls must not imply real persistence. Before implementation, confirm the required route, API behavior, and permissions exist.

## 11. Required UI workflow

Before each UI task:

1. Read `AGENTS.md`, `CLAUDE.md`, `docs/plans/README.md`, this guide, and the relevant redesign plan section.
2. Check `git status --short` and preserve existing user changes.
3. Inspect the current route and layout, component exports and props, tokens, API types, schemas, authorization behavior, stories, and nearby tests.
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
- Relevant tests, typecheck, and build have passed, or failures and limitations are explicitly reported.
- The diff contains no unrelated changes and pre-existing user work remains intact.

For a full redesign, the mockups must be reviewed and explicitly approved by the user before the Web App rebuild begins.

## 13. Repository verification notes

This section records details checked against the current implementation. If any summary above conflicts with these source files, the source files are authoritative.

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

Status tokens define explicit foreground pairs (see §3.1). Use these pairs; do not infer a foreground from the base palette.

Shape and elevation values are listed in §3.3. Dark mode overrides both shadows with darker values in `tokens.css`.

### 13.2 Theme and utility contract verified

- `theme.css` maps semantic names including `background`, `surface`, `surface-muted`, `border`, `border-strong`, `foreground`, `foreground-muted`, `foreground-subtle`, `placeholder`, `primary`, `primary-hover`, `primary-foreground`, `ring`, `danger`, `danger-hover`, `danger-foreground`, the four status-soft/foreground pairs, and `overlay`.
- The Tailwind default color namespace is reset with `--color-*: initial`. Use the semantic utilities exposed by `theme.css`.
- `tokens.css` defines light tokens at `:root` and dark overrides for `[data-theme='dark']`, `html.dark`, and `html.htw-dark`.
- `packages/ui/src/theme/index.ts` resolves `system` via `matchMedia('(prefers-color-scheme: dark)')`, sets `data-theme` on the root element, and listens for changes. Verify the stored preference key in that file before documenting persistence.
- Font stack: `'Inter Variable', 'Noto Sans Thai Variable', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif`.

### 13.3 Verified component API

Verified against each component's `defineProps`/`defineEmits` block in `packages/ui/src/components/` and the exports in `packages/ui/src/index.ts`. Enum values inside a cell use `/` instead of `|` so the table stays valid markdown.

**Barrel exports (`@nexa/ui`)**: `UiButton`, `UiBadge`, `UiCard`, `UiAlert`, `UiEmptyState`, `UiSpinner`, `UiSkeleton`, `UiPagination`, `UiDialog`, `UiPopover`, `UiTooltip`, `UiFieldWrapper`, `UiInput`, `UiTextarea`, `UiSelect`, `UiCombobox`, `UiCheckbox`, `UiSwitch`, `UiNumberInput`, `UiDatePicker`, `UiTimeInput`, `UiDateTimeInput`, `UiLinkField`, `UiLabel`, `MetaTable`, `MetaForm`, `MetaFieldInput`, `MetaFieldValue`, plus the `cn`, `theme`, `i18n`, `table`/`form`/`combobox`/`date`/`number` and `render/*` exports.

**Known export gap:** `MetaDetail.vue` exists in `packages/ui/src/components/` and is used by its story and the mockups, but it is **not** re-exported from `packages/ui/src/index.ts`. Import it from its file path until it is added to the barrel; do not claim `@nexa/ui` exports it. There is no `UiStatus.vue` component; `UiStatus.story.vue` composes UiAlert, UiSpinner, UiSkeleton, UiEmptyState, and UiFieldWrapper.

| Component | Key props (as declared) | Emits |
|---|---|---|
| `UiButton` | `variant` default `solid`: solid / outline / soft / subtle / ghost / link; `color` default `primary`: primary / neutral / error; `size` default `md`: xs / sm / md / lg / xl; `type` button / submit / reset; `disabled`; `loading`; `block`; `square`; `leadingIcon` Component; `trailingIcon` Component; `class` | `click` |
| `UiBadge` | `variant` default `soft`: solid / outline / soft / subtle; `size` default `md`: xs / sm / md / lg / xl; `color` primary / neutral / success / warning / danger / error; `tone` (alias of `color`) neutral / success / warning / danger; `class` | — |
| `UiAlert` | `variant` default `soft`: solid / outline / soft / subtle; `color` primary / neutral / success / warning / danger / error; `tone` (alias of `color`) neutral / success / warning / danger; `class`. Sets `role="alert"` when status resolves to danger, `role="status"` otherwise. | — |
| `UiCard` | `variant` default `card`: card / flat; `class`. Card = elevated surface with shadow-sm; flat = surface-muted without shadow. | — |
| `UiEmptyState`, `UiSkeleton` | `class` | — |
| `UiSpinner` | `label?`; `class` | — |
| `UiPagination` | `total`, `limit`, `offset` (numbers, required); `disabled?`; `class` | `update:offset`, `update:limit`; page sizes 25/50/100 |
| `UiDialog` | `modelValue?` (optional so the uncontrolled `trigger` slot works alone); `class` | `update:modelValue`; slots: `trigger`, `title`, `description`, `close`, default |
| `UiPopover` | `modelValue?` optional (uncontrolled works without it); `align` start / center / end, default center; `closable?` default false; `class` | `update:modelValue` |
| `UiTooltip` | `text` (required); `side` top / right / bottom / left, default top; `delay` default 300; `class` | — |
| `UiFieldWrapper` | `label` required; `helpText?`; `error?`; `required?`; `id?`; `class` | — ; default slot receives `{ id, describedBy, invalid }`; `describedBy` prefers the error id over the help id |
| `UiInput`, `UiTextarea`, `UiSelect` | `modelValue?`; `class`; `inheritAttrs: false`, so native attrs (`type`, `id`, `autocomplete`, `aria-describedby`, `placeholder`) pass through to the root element | `update:modelValue` |
| `UiCombobox` | `modelValue?` (single id or id array); `multiple?`; `loadOptions` (required, caller-owned fetch); `selected?` preloaded labels; `placeholder?`; `disabled?`; `debounceMs` default 250; `id?`; `describedBy?`; `invalid?`; `class` | `update:modelValue` |
| `UiCheckbox` | `modelValue?` boolean or `indeterminate`; `disabled?`; `class` | `update:modelValue` |
| `UiSwitch` | `modelValue?`; `disabled?`; `class` | `update:modelValue` |
| `UiNumberInput` | `modelValue?` number or null; `min?`; `max?`; `precision?`; `disabled?`; `invalid?`; `id?`; `describedBy?`; `class` | `update:modelValue` |
| `UiDatePicker` | `modelValue?` ISO `YYYY-MM-DD` Gregorian; `min?`; `max?`; `disabled?`; `invalid?`; `describedBy?`; `class` | `update:modelValue` |
| `UiTimeInput` | `modelValue?` `HH:mm` or `HH:mm:ss`; `withSeconds?`; `disabled?`; `invalid?`; `id?`; `describedBy?`; `class` | `update:modelValue` |
| `UiDateTimeInput` | `modelValue?` ISO instant (shown local, stored UTC); `disabled?`; `invalid?`; `id?`; `describedBy?`; `class` | `update:modelValue` |
| `UiLinkField` | `modelValue?`; `kind` file or image (required); `disabled?`; `invalid?`; `id?`; `describedBy?`; `placeholder?` | `update:modelValue` |
| `UiLabel` | `for?`; `class` | — |
| `MetaTable` | `columns` array of `{ field, width? }` (required); `page` `{ items, total, limit, offset }` (required); `density?` default `comfortable`: comfortable / compact; `loading?`; `error?`; `retry?`; `sort?`; `sortable?`; `sortableTypes?`; `referenceLabel?`; `currency?`; `emptyTitle?`; `emptyDescription?`; `clickable?`; `class` | `update:sort` (`MetaTableSort`), `rowClick` (`MetaTableRowClick`) |
| `MetaForm` | `form: FormDefinition`; `fields: FieldDefinition[]` (both required); `initialData?`; `version?`; `fieldErrors?` default `{}`; `formError?` default null; `readonly?` default false; `submitting?` default false; `submitLabel?`; `cancel?`; `loadReferenceOptions?`; `referenceSelected?`; `referenceLabel?`; `currency?`; `class` | `submit` `{ data, version? }` |
| `MetaDetail` (file-path import only) | `record` `{ id, version, data }`; `fields`; `activity` `{ items, total }`; `relations` array — all four required; `referenceLabel?`; `currency?`; `class` | — |
| `MetaFieldInput` | `field`; `modelValue` (both required); `loadReferenceOptions?`; `referenceSelected?`; `invalid?`; `describedBy?`; `id?` | `update:modelValue` |
| `MetaFieldValue` | `field`; `value` (both required); `referenceLabel?`; `currency?` | — |

Shared types exported for callers: `MetaTableSort`, `MetaTableFilter`, `MetaTableRow`, `MetaTablePage`, `MetaTableRowClick`, `MetaReferenceLabel` (from `table.ts`), and `MetaFormFieldErrors`, `MetaSectionView`, `formSections()`, `ReferenceSelectedResolver`, `RelationOpen` (from `form.ts`). `formSections()` returns `columns` from the FormDefinition's section (1–4), and `MetaForm` lays sections out with `min(section.columns ?? 1, section.fields.length)` columns.

Field inputs cover all values of `FieldTypeSchema` (23 types); the input-kind mapping lives in `render/field-kinds.ts` (`inputKindOf`, `inputKindByFieldType`).

### 13.4 Verification status

- [ ] Token values and mappings in §13.1–13.2 need re-checking against `tokens.css` and `theme.css` before this section is relied on.
- [ ] Component APIs in §13.3 need re-checking against `packages/ui/src/components/` and `index.ts`; the `MetaDetail` barrel gap and the absence of `UiStatus` are claims to confirm.
- [ ] Typecheck, tests, lint, and Histoire build have not been run for this document. Run them before treating any result as recorded.
- [ ] WCAG AA contrast of the token pairs has not been re-measured in this revision.
- [ ] Reference-driven targets in §5.1 (row density, page size, click counts) are not yet measured on real pages.
- [ ] Row density measured in headless Chromium on a standalone `MetaTable` (4 columns, 8 fixture rows, `text-sm`), not on a real page or at narrow widths:
  - `comfortable` (default): data rows 36 px, header 36.5 px
  - `compact`: data rows 28 px, header 28.5 px
  - Neither value is the 32 px / 40 px target originally written in §5.4; §5.4 now records the measured values.
- [ ] Manual user review of all mockup families in Histoire before the Web App rebuild (pending; this is the gate stated in §12).
