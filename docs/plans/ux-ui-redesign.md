# Nexa UX/UI Direction

> **Implementation guide:** Read [`docs/design.md`](../design.md) before making any UI changes. `design.md` is the shared design and implementation standard; this file defines the redesign goals and scope. Follow repository instructions and the active phase order in [`README.md`](README.md) first.

## Goal
Make Nexa feel like one coherent metadata-driven business platform. Reduce navigation complexity and make Builder tasks predictable without replacing existing API behavior or domain workflows.

## How to use this plan with design.md
- Use `docs/design.md` as the required reference for visual tokens, typography, spacing, page patterns, responsive behavior, accessibility, interaction states, coding conventions, and definition of done.
- Use this file to decide **what** to improve and in what order; use `docs/design.md` to decide **how** the UI should be designed and implemented.
- Before coding, inspect the current repository and read `AGENTS.md`, `CLAUDE.md`, `docs/plans/README.md`, and `docs/design.md`. The repository instructions and active plan take precedence over assumptions in historical notes.
- Preserve unrelated user changes and do not create missing workspaces/routes based on assumptions. If the current architecture conflicts with this plan, document the conflict and pause for direction.

## Current-state findings
- The web app previously used separate Builder and Runtime layouts with a simple top header and a constrained central content area; verify the current repository before acting on this historical observation.
- The Modules page previously used large cards; consider a scalable list/table when the current route and workspace exist.
- Module detail previously mixed lifecycle actions, metadata settings, and navigation to Entities/Relations; verify current routes and behavior before redesigning.
- The UI package has contained reusable primitives, field renderers, view renderers, localization, and semantic theme tokens. Reuse the current equivalents rather than creating a second component system.
- Preserve all existing uncommitted changes. Do not assume any specific dirty-file list remains current; run `git status --short` at the start of each task.

## Recommended information architecture

### Global shell
- Left navigation rail/sidebar: workspace identity, primary destinations, compact/collapsible behavior.
- Primary destinations: Overview, Modules, Runtime Apps, Activity, Settings (only show routes that exist).
- Bottom utility area: current account and sign out.
- Main canvas: consistent page title, optional breadcrumb, one primary action, then page content.
- Mobile: use the existing drawer/menu pattern; keep core destinations accessible without horizontal scrolling.

### Builder
- Modules index: page title + description, search/filter row, status filters, list/table view, primary New module action where supported.
- Module detail: module identity and lifecycle status in the header; secondary navigation for Overview, Entities, Relations, and Settings, only where routes are implemented.
- Entities: table/list layout with entity name, plural label, field count where available, and editability/status cues. Never invent counts not returned by the API.
- Definition forms: group fields into logical sections, keep labels/help text consistent, put validation errors next to the field, and keep save/cancel actions predictable.
- Lifecycle transitions: make the current state clear and show only backend-supported actions. Confirm destructive or irreversible transitions.

### Runtime
- App/module picker: compact cards or a table with clear module names and descriptions.
- Record views: use the existing metadata-driven table, form, and detail renderers where practical; do not fork field rendering.
- Keep record search, filters, sort, pagination, and create/edit actions in a consistent toolbar.
- Empty, loading, permission-denied, conflict, and error states should have clear recovery actions.

## Visual system
Follow [`docs/design.md`](../design.md) for all detailed visual and interaction rules. In summary:
- Keep the existing semantic theme tokens and Slate + Emerald direction where present.
- Use existing UI primitives; do not introduce a second component library.
- Maintain a compact, consistent type scale and spacing rhythm.
- Use cards only for grouped information, not as a default wrapper for every section.
- Preserve supported light/dark themes, keyboard navigation, contrast, localization, and responsive behavior.

## Implementation sequence
Follow the active plan sequence in `docs/plans/README.md`; do not begin a later phase without explicit approval. For an authorized UX/UI phase, the suggested order is:
1. Shell and navigation: align Builder and Runtime layout patterns while retaining distinct destinations and authentication behavior.
2. Modules index: scalable list/table, search and status filtering, empty/loading/error states.
3. Module detail: clear sub-navigation and separate lifecycle/settings from definition tasks.
4. Entities/Fields/Relations: consistent definition editor patterns and clearer hierarchy.
5. Runtime record views: adopt shared renderers and standardize toolbars and states.
6. Quality pass: responsive checks, keyboard/focus checks, Thai/English text lengths, and tests.

## Constraints
- Follow `AGENTS.md`, `CLAUDE.md`, `docs/plans/README.md`, and `docs/design.md` before implementation.
- Preserve existing user changes and avoid destructive Git operations.
- Keep API/business logic out of presentation components.
- Do not add placeholder navigation for routes that do not exist.
- Do not invent backend data or imply unsupported capabilities.
- If the UI workspace is absent in the current repository phase, do not recreate it unless explicitly asked.
- Validate each implementation slice with focused tests, typecheck, lint, and build where the active workspace supports it.
