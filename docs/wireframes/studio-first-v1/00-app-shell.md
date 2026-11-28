# Shared app shell

Desktop uses a fixed 20-character administration sidebar and a 56-character content
column. Admin links are separate from workspace menus. Workspace menu entries are
dynamic and come from tenant configuration.

```text
+--------------------+--------------------------------------------------------+
| NEXA ERP           | NAVBAR [Company v] [User v]                            |
| ADMIN CONSOLE      | STUDIO-FIRST WORKSPACE                                 |
|                    | Select a page from the navigation.                     |
| > Studio           |                                                        |
|   Models           |                                                        |
|   Views            |                                                        |
|   Roles            |                                                        |
|   Users            |                                                        |
|   Company          |                                                        |
|                    |                                                        |
| APP MENU (dynamic) |                                                        |
| [Configured item]  |                                                        |
| [Configured item]  |                                                        |
|                    |                                                        |
| User: Admin        |                                                        |
+--------------------+--------------------------------------------------------+
```

The configured-item labels above are placeholders, not named routes. Only display
entries returned by the tenant's installed app/menu configuration.

## Component map

- Sidebar frame: `UDashboardGroup` + `UDashboardSidebar`.
- Admin links and tenant-provided workspace links: `UNavigationMenu`; the latter is
  populated from tenant menu metadata, not hard-coded module names.
- Main content region: `UDashboardPanel`.
- Top bar with company selector and user menu: `UDashboardNavbar`, `USelectMenu`,
  `UDropdownMenu`, and `UButton`.
- Collapse/expand navigation on small screens: `UDashboardSidebarToggle` and
  `UDashboardSidebarCollapse`.
