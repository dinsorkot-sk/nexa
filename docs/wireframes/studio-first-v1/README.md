# Studio-first v1 wireframes

Status: design proposal. No frontend pages are implemented by this document set.

This README is the central index connecting the shared shell, Studio administration,
permissions, company setup, and tenant workflow wireframes.

Each screen document now includes a component map directly below its wireframe,
explaining which Nuxt UI or Nexa component renders each visible region/control. The
consolidated component inventory is in [07-components-and-states.md](./07-components-and-states.md).

## Scope

The v1 design starts with no-code Studio administration, then exposes the Thailand
Sales-to-reconciliation workflow configured for a tenant. It contains the shared shell
and 15 screens: Studio Home; model, field and view design; roles and permissions; user
assignment; company and starter-pack setup; customers; sales orders; invoices; payments;
and reconciliation.

Sales, Invoices, Payments and Reconciliation are proposed tenant workflow surfaces,
not hard-coded business modules in the engine. Their menus must be loaded from
tenant-installed app/menu metadata or configuration. Verify the menu-list API before
implementation; do not render unavailable items.

Studio Home is the initial landing page, not an analytics dashboard. KPI/reporting
screens are deferred until an aggregate-data API and requirements are confirmed.
Login invitations, email delivery, and PDF generation are outside this UI scope until
their backend workflows exist. All data and counts in the drawings are illustrative.

## Wireframe index

| File | Contents |
|---|---|
| [00-app-shell.md](./00-app-shell.md) | Shared navigation shell and dynamic tenant menu boundary |
| [01-studio-builder.md](./01-studio-builder.md) | Studio Home, model/field designer, add-field dialog, view designer |
| [02-roles-and-access.md](./02-roles-and-access.md) | Roles, permission matrix, and user/group assignment |
| [03-company-starter-pack.md](./03-company-starter-pack.md) | Company configuration and Thai starter-pack application |
| [04-customers-sales-orders.md](./04-customers-sales-orders.md) | Customer list and Sales order list/detail |
| [05-invoices.md](./05-invoices.md) | Invoice list and invoice detail |
| [06-payments-reconciliation.md](./06-payments-reconciliation.md) | Payments and reconciliation |
| [07-components-and-states.md](./07-components-and-states.md) | Nuxt UI map, responsive behavior, UX states, API constraints |

## Decisions and implementation gate

- Business roles are tenant-configurable groups, not a fixed role count. Keep the
  bootstrap Settings Admin protected; admin-created permission matrices must be
  enforced by backend ACLs, record rules, field groups and workflow transition groups.
- The sidebar's workflow section is metadata/config-driven. Do not add business-domain
  modules such as Sales, Invoices, Payments or Reconciliation to engine code.
- The permission matrix is a design target. Verify its backend mapping and tests before
  implementing its UI.
- The user approved this complete wireframe set on 2026-11-27; feature implementation may proceed.
## Shared design system

Nuxt UI version is `4.12.0` in
[`apps/web/package.json`](../../../apps/web/package.json). The component map and
responsive/state requirements are in [07-components-and-states.md](./07-components-and-states.md).
