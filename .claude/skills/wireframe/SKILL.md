---
name: wireframe
description: Create aligned ASCII wireframes for Nuxt UI pages, validate borders and responsive columns, then run ESLint and typecheck.
---

# Wireframe skill

Use this skill before implementing or changing a user-facing page.

## Inputs

Collect only the blockers:

- Page or workflow name
- Desktop and mobile breakpoints
- Required sections
- Actions and confirmation behavior
- Nuxt UI components already available

Do not change application files while producing a wireframe.

## Output

Respond with:

1. A Mermaid-equivalent? No. The artifact must be ASCII.
2. An ASCII wireframe using fixed-width text columns.
3. A component map naming the Nuxt UI or Nexa component used for each section.
4. A responsive order for mobile.
5. States, including loading, empty, error, success and permission-denied.

## Alignment rules

- Use only one consistent border width per line.
- Outer borders must begin and end at the same character column.
- Grid columns must have identical inner widths.
- Every row in a desktop 2-column grid must be aligned to the same vertical border.
- On mobile, draw one full-width column in its natural section order.
- Never show overlapping borders or diagonal border fragments.
- Prefer a 2-column desktop grid and 1-column mobile layout unless requirements specify otherwise.
- Use these characters only: `+ - |`, box labels, and ASCII text.

Example dashboard wireframe, inspired by the page structure in the
[Nuxt UI Dashboard template](https://github.com/nuxt-ui-templates/dashboard):

```text
+--------------------+--------------------------------------------------------+
| NAVIGATION         | NAVBAR Home [Menu] [Notifications] [+ New] [User]      |
| [Team / workspace] |                                                        |
| [Search]           | DASHBOARD TOOLBAR                                      |
| > Home             | [Date range: last 14 days]  [Period: Daily v]          |
|   Invoices         |                                                        |
|   Payments         | KEY METRICS - 4 EQUAL CARDS                            |
|   Customers        | +------------+------------+------------+------------+  |
|   Reconciliation   | | Revenue    | Invoices   | Payments   | Outstanding|  |
|   Settings         | | THB 125,000| 24         | 18         | THB 12,400 |  |
|                    | +------------+------------+------------+------------+  |
|                    | REVENUE TREND - CARD + AREA CHART                      |
|                    | +---------------------------------------------------+  |
|                    | |              Area chart visualization             |  |
|                    | +---------------------------------------------------+  |
|                    | RECENT INVOICES - TABLE                                |
|                    | +----------+------------+------------+---------------+ |
|                    | | Invoice  | Customer   | Status     | Total (THB)   | |
|                    | +----------+------------+------------+---------------+ |
|                    | | INV/001  | Customer A | Paid       | 7,490.00      | |
|                    | | INV/002  | Customer B | Not paid   | 3,210.00      | |
|                    | +----------+------------+------------+---------------+ |
+--------------------+--------------------------------------------------------+
```

The drawing is an original layout sketch, not copied template code. Its desktop
shell uses one fixed sidebar column and one content column. Sidebar, navbar,
toolbar, KPI, chart, and table remain inside the same outer frame so the vertical
separator and both outer borders stay on fixed character columns.

On narrow screens, collapse the sidebar to a menu button and stack the content
sections in this order: navbar, toolbar, KPI cards, chart, recent invoices.

## Nuxt UI mapping

Map wireframe regions before implementation:

| Region | Preferred components |
|---|---|
| Dashboard shell | `UDashboardGroup`, `UDashboardSidebar`, `UDashboardPanel` |
| Sidebar navigation | `UDashboardSearchButton`, `UNavigationMenu`, `UDashboardSidebarCollapse` |
| Top navigation | `UDashboardNavbar`, `UButton`, `UTooltip`, `UChip`, `UDropdownMenu`, `UIcon` |
| Toolbar | `UDashboardToolbar`, `USelect`, `UButton` |
| KPI cards | `UPageGrid`, `UPageCard`, `UBadge` |
| Chart panel | `UCard`, `UChart` |
| Data table | `UTable` or the shared `NexaTable` wrapper |
| Page shell without dashboard chrome | `UContainer`, `UApp` |
| Form | `NexaForm`, `UFormField`, `UInput`, `USelect` |
| Error and success | `UAlert` |
| Confirmation | `NexaDialog`, `UModal`, `UButton` |
| Loading | `loading` props, text or skeleton state |
| Checkbox list | Native labeled checkboxes if no suitable shared control exists |

Component names above follow the structure of the linked template. Check that each
component exists in the project's installed Nuxt UI version before implementation.

Do not invent UI components when an existing shared or Nuxt UI component is available.

## Verification

Before implementation is complete, run the smallest relevant checks:

```bash
pnpm --filter @nexa/web eslint .
pnpm --filter @nexa/web typecheck
pnpm --filter @nexa/web build
```

If a script does not exist, use:

```bash
pnpm --dir apps/web exec eslint .
pnpm --filter @nexa/web typecheck
pnpm --filter @nexa/web build
```

Report:

```text
Wireframe:
  Desktop grid: ...
  Mobile order: ...
  Component map: ...
  Alignment check: pass/fail
ESLint:
  pass/fail
Typecheck:
  pass/fail
Build:
  pass/fail/not run
```

Do not report a UI implementation as complete until ESLint and typecheck pass. A build timeout or termination must be reported explicitly.
