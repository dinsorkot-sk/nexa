# Roles and access

Role names below are editable starting templates, not a fixed role count. Users may
belong to multiple groups. Keep the bootstrap Settings Admin protected.

## 5. Roles and groups

```text
+------------------------------------------------------+
|ROLES / PERMISSION GROUPS                             |
|[+ Create role]   Search [____________]               |
|                                                      |
|ROLE                  MEMBERS   SCOPE                 |
|Sales User            4         Own/team              |
|Sales Manager         1         Team/company          |
|Accountant            2         Company               |
|Accounting Manager    1         Company               |
|Settings Admin        1         System (protected)    |
|                                                      |
|Select role -> permission matrix                      |
|Roles configurable; users may have many groups        |
+------------------------------------------------------+
```

### Component map

- Role list: `UTable`, with membership/scope indicators as
  text or `UBadge`.
- Search: `UInput`; create/open actions: `UButton`.
- Create role form: `UModal` + `UForm` with `UFormField` and `UInput`.

## 6. Permission matrix

```text
+------------------------------------------------------+
|ROLE: Accountant  [Default deny]                      |
|Tabs [Models] [Fields] [Records] [Actions]            |
|                                                      |
|MODEL          R  C  W  D    RECORD SCOPE             |
|Customer       x  x  x  -    Company                  |
|Sales order    x  -  -  -    Company                  |
|Invoice        x  x  x  -    Company                  |
|Payment        x  x  x  -    Company                  |
|                                                      |
|Actions: [ ] Post invoice  [x] Reconcile              |
|[Review changes] [Save permission matrix]             |
|Confirm privilege increases; backend enforces         |
+------------------------------------------------------+
```

### Component map

- Matrix tabs: `UNavigationMenu`.
- Model rows: `UTable`; per-operation permission controls: labeled `UCheckbox`.
- Record scope and action group selectors: `USelectMenu`.
- Review/save actions: `UButton`; privilege increase confirmation: `UModal`.
- Save/authorization errors: `UAlert`.

The matrix is a design target. Before implementation, verify its mapping to
`ir.model.access`, `ir.rule`, field groups and workflow transition groups, including
backend tests for the resulting authorization. UI visibility is not authorization.

## 7. User and role assignment

```text
+------------------------------------------------------+
|USERS / ROLE ASSIGNMENT                               |
|[Search users...] [Status v] [+ Add existing]         |
|                                                      |
|USER       ROLES                 COMPANIES            |
|user_a     Sales User            Acme TH              |
|user_b     Accountant            Acme TH              |
|admin      Settings Admin        Allowed              |
|                                                      |
|Select user -> assign/remove groups                   |
|Invitations deferred until API exists                 |
|Last active Settings Admin cannot be removed          |
+------------------------------------------------------+
```

### Component map

- User list and company memberships: `UTable`.
- Search/status filter: `UInput` and `USelect`.
- Group assignment: `USelectMenu` or `UCheckboxGroup`.
- Add/remove assignment: `UButton`; removing the last admin: blocked with `UAlert`
  and confirmed with `UModal` when permitted.

Only existing-user group assignment is in scope. User invitations remain deferred
until an invite/provisioning API exists. Protect the last active Settings Admin.
