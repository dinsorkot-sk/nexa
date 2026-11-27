# Customers and sales orders

These are configured tenant workflow screens. Their appearance here does not imply
that routes or engine modules already exist.

## 9. Customers

```text
+------------------------------------------------------+
|CUSTOMERS                                             |
|[Search...] [Active v] [Company v] [+ New]            |
|                                                      |
|CUSTOMER       TAX ID         BRANCH    ACCOUNT       |
|Bangkok Ltd    010...1234567  00000     1200          |
|Siam Works     010...7654321  00002     1200          |
|                                                      |
|Select row -> detail/edit panel                       |
|Create: name, address, tax ID, branch, account        |
|UEmpty first customer; UAlert on API error            |
+------------------------------------------------------+
```

### Component map

- Customer table: `UTable`; tax/branch values and status use text plus `UBadge`.
- Search/company/status filters: `UInput` and `USelectMenu`.
- Create/edit panel: `USlideover` with `UForm`, `UFormField`, and `UInput`.
- Branch/account selectors: `USelectMenu`; no customers: `UEmpty`; errors: `UAlert`.

## 10. Sales orders

```text
+------------------------------------------------------+
|SALES ORDERS                                          |
|[Search...] [Status v] [Date v] [+ New order]         |
|                                                      |
|ORDER       CUSTOMER       STATUS       TOTAL THB     |
|SO-031      Bangkok Ltd    Confirmed        21,400    |
|SO-030      Siam Works     Draft             7,490    |
|SO-029      D D Foods      Invoiced         15,000    |
|                                                      |
|Open row -> order detail and allowed actions          |
|[Confirm] [Create invoice] by state and permission    |
+------------------------------------------------------+
```

### Component map

- Orders table: `UTable`; workflow state: `UBadge`.
- Search/status/date filters: `UInput`, `USelectMenu`, and `UInputDate`.
- New order: `UButton`; pagination: `UPagination`.
- Confirm/create-invoice actions appear only when allowed by document state and
  backend authorization.

## 11. Sales order detail

```text
+------------------------------------------------------+
|ORDER SO-031  [Confirmed]                             |
|Customer [Bangkok Ltd v]   Date [27 Nov]              |
|                                                      |
|LINES  Item [Service A v] Qty [2] Price [10000]       |
|[+ Add line]                                          |
|Subtotal THB 20,000   VAT THB 1,400                   |
|TOTAL THB 21,400                                      |
|                                                      |
|[Save draft] [Confirm order] [Create invoice]         |
|Confirm/post actions need permission; errors inline   |
+------------------------------------------------------+
```

### Component map

- Order header and editable fields: `UForm`, `UFormField`, `USelectMenu`,
  `UInputDate`, and `UInput`.
- Order lines: `UTable` with `USelectMenu` and `UInputNumber` controls in cells.
- Totals and status: `UCard` and `UBadge`.
- Save/confirm/create-invoice actions: `UButton`; confirmation: `UModal`;
  validation/API failures: `UAlert`.
