# Studio builder

## 1. Studio Home

```text
+------------------------------------------------------+
|STUDIO / ADMIN                                        |
|Models 8  Views 6  Roles 5                            |
|[+ New model] [Install Thai pack]                     |
|                                                      |
|CUSTOM MODELS                                         |
|x_sales_order  8 fields  List/Form                    |
|x_customer     9 fields  List/Form                    |
|                                                      |
|RECENT CHANGES                                        |
|Added x_branch to x_company                           |
|Thai pack: ready to apply                             |
|UEmpty if none; UAlert on load failure                |
+------------------------------------------------------+
```

### Component map

- Page title and admin context: `UDashboardNavbar` in the shared shell.
- Model/view/role count tiles: `UPageGrid` + `UPageCard`.
- `New model` and `Install Thai pack`: `UButton`.
- Custom model rows: `UTable`.
- Recent changes: `UCard`; no models: `UEmpty`; load failure: `UAlert`.

## 2. Model and field designer

```text
+------------------------------------------------------+
|MODEL: x_sales_order                                  |
|Label [Sales order]   Technical [x_sales_order]       |
|Fields 8   Mixins [Add mixin v]   State [Draft]       |
|                                                      |
|FIELD          TYPE        LABEL         REQUIRED     |
|name           char        Order no.     Yes          |
|partner_id     many2one    Customer      Yes          |
|date_order     date        Order date    Yes          |
|state          selection   State         Yes          |
|                                                      |
|[+ Add field] [Preview] [Save model]                  |
|Schema edits unsupported by API stay disabled         |
+------------------------------------------------------+
```

### Component map

- Model label and metadata: `UForm`, `UFormField`, and `UInput`.
- Mixins and state selector: `USelectMenu` and `UBadge`.
- Field list: `UTable`; required/type indicators: text and `UBadge`.
- Add, preview, and save actions: `UButton`.
- Unsupported schema changes: disabled `UButton` with an explanation in `UAlert`.

## 3. Add field

```text
+------------------------------------------------------+
|ADD FIELD / x_sales_order                             |
|Name [x_contact_id] Label [Contact]                   |
|Type [many2one v] Related model [res.partner v]       |
|[ ] Required  [ ] Unique  [ ] Translated              |
|Visible to [Internal User v]                          |
|Write groups [Select groups...]                       |
|                                                      |
|[Cancel] [Add field]                                  |
|Inline validation; preserve values on failure         |
+------------------------------------------------------+
```

### Component map

- Dialog surface: `UModal`.
- Field configuration: `UForm`, `UFormField`, `UInput`, `USelect`,
  `USelectMenu`, and `UCheckbox`.
- Cancel/Add actions: `UButton`.
- Field validation: inline `UFormField` errors; API-level failure: `UAlert`.

## 4. View designer and preview

```text
+------------------------------------------------------+
|VIEW: x_sales_order                                   |
|Type [List v]    Preview [List | Form]                |
|                                                      |
|VISIBLE FIELDS / ORDER                                |
|1. name         [Up] [Down] [Remove]                  |
|2. partner_id   [Up] [Down] [Remove]                  |
|3. date_order   [Up] [Down] [Remove]                  |
|4. state        [Up] [Down] [Remove]                  |
|                                                      |
|[+ Add field] [Preview] [Save primary view]           |
|One primary view per type; confirm before save        |
+------------------------------------------------------+
```

### Component map

- View type and preview mode: `USelect` or `URadioGroup`.
- Ordered field rows: `UCard` per row with `UButton` controls for move/remove;
  no custom drag-and-drop component.
- Preview: `UCard` containing the generated list or form preview.
- Save primary view: `UButton` followed by `UModal` confirmation.

Studio supports creating models, fields and primary views. The API does not yet
confirm a post-save view edit/list workflow; keep unsupported edits disabled until
there is a backend operation and test for them.
