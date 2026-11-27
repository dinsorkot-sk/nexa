# Components, responsive behavior, and states

## Nuxt UI component map

Nuxt UI version is `4.12.0` in
[`apps/web/package.json`](../../../apps/web/package.json). Component names below were
checked against generated Nuxt component declarations. Use Nuxt UI components directly;
the project does not add a shared wrapper layer around tables, forms, or modals.

| Page/region | Components |
|---|---|
| Shared shell | `UDashboardGroup`, `UDashboardSidebar`, `UDashboardPanel`, `UDashboardNavbar`, `UDashboardSidebarToggle`, `UNavigationMenu` |
| Studio Home | `UPageGrid`, `UPageCard`, `UTable`, `UEmpty`, `UAlert` |
| Model / field designer | `UTable`, `UForm`, `UFormField`, `UInput`, `USelect`, `UCheckbox`, `UModal` |
| View designer | `UCard`, `USelect`, `UButton`, `UCheckbox`; use move buttons, not drag-and-drop |
| Roles / permission matrix | `UTable`, `UBadge`, `UCheckbox`, `USelectMenu`, `UModal`, `UAlert` |
| User access | `UTable`, `USelectMenu`, `UCheckboxGroup`, `UModal` |
| Company / starter pack | `UForm`, `UFormField`, `UInput`, `USelect`, `UProgress`, `UModal`, `UAlert` |
| Customers / orders / invoices | `UTable`, `UInput`, `UInputDate`, `USelectMenu`, `UBadge`, `UEmpty` |
| Order / invoice detail | `UForm`, `UFormField`, `UInputMenu`, `UInputNumber`, `UInputDate`, `UModal` |
| Payments | `UTable`, `UModal` or `USlideover`, `UForm`, `UInputNumber`, `UInputDate` |
| Reconciliation | `UTable`, `UCheckbox`, `UInputNumber`, `UModal`, `UAlert` |

## Responsive behavior

- On narrow screens, collapse the sidebar using `UDashboardSidebarToggle` and use one
  content column.
- Render dense table rows as `UCard` items on mobile to avoid horizontal scrolling.
- Stack forms vertically. Place the view preview below its editor on mobile.
- Render permission rows as per-model cards on mobile, with labeled CRUD controls and
  record scope; do not require a wide matrix scroll.
- On mobile reconciliation, select payment, then invoice, then amount.

## Interaction states and accessibility

- Loading: use `UTable` loading and `UButton` loading states.
- Empty: use `UEmpty` with a relevant next action.
- Error and success: use `UAlert`; preserve form input when submission fails.
- Permission denied: show a clear `UAlert`; backend authorization remains authoritative.
- Confirm elevated permission changes, posting/reversal, reconciliation changes, and
  starter-pack apply/re-apply with `UModal`.
- Use visible labels and focus states; show status as text plus `UBadge`, not color alone.

## Backend dependencies and implementation gate

- Verify the API for listing tenant menu metadata before rendering the dynamic workspace
  navigation. Do not hard-code workflow menu names or business modules in engine code.
- Studio supports creating models, fields and primary views, but the post-save view
  edit/list workflow is not confirmed. Disable unsupported edits until a backend
  operation and test exist.
- The permission matrix is a design target. Verify its mapping to `ir.model.access`,
  `ir.rule`, field groups and workflow transition groups, including backend tests for the
  resulting authorization.
- Existing-user group assignment is in scope. User invitations remain deferred until
  an invite/provisioning API exists.
- Email and PDF actions are not available because their backend endpoints are not
  implemented.
- The user approved this complete wireframe set on 2026-11-27. Feature implementation may
  proceed, but keep controls disabled when the backend operation is not available.
