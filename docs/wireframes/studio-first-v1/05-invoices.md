# Invoices

## 12. Invoice list

```text
+------------------------------------------------------+
|INVOICES                                              |
|[Search...] [Type v] [Status v] [Date v]              |
|                                                      |
|NUMBER     CUSTOMER      DUE      STATE    TOTAL      |
|INV-1048   Bangkok Ltd   30 Nov   Due      21,400     |
|INV-1047   Siam Works    25 Nov   Paid      7,490     |
|CN-0003    Bangkok Ltd   20 Nov   Posted    2,000     |
|                                                      |
|Open invoice; credit/debit note links original        |
|Email/PDF deferred; no backend endpoints              |
+------------------------------------------------------+
```

### Component map

- Invoice list: `UTable`; document type/state: `UBadge`.
- Search and filters: `UInput`, `USelectMenu`, and `UInputDate`.
- Row navigation and available actions: `UButton` or a row link; show only actions
  allowed by the invoice state and backend authorization.
- Empty and load-error states: `UEmpty` and `UAlert`.

## 13. Invoice detail

```text
+------------------------------------------------------+
|TAX INVOICE INV-1048  [Draft]                         |
|Customer [Bangkok Ltd]   Tax ID [010...1234567]       |
|Branch [00000]   Date [27 Nov]   Due [27 Dec]         |
|                                                      |
|ITEM             QTY   UNIT      VAT     TOTAL        |
|Service A          2   10,000     7%     20,000       |
|                                                      |
|Subtotal 20,000  VAT 1,400  TOTAL 21,400              |
|[Save] [Post invoice] [More v]                        |
|Posted: locked fields + linked ledger entry           |
|Credit/debit note links original document             |
+------------------------------------------------------+
```

### Component map

- Invoice header and customer/tax details: `UForm`, `UFormField`, `UInput`,
  `UInputDate`, and `UBadge`.
- Invoice lines and totals: `UTable`/`UCard` with `UInputNumber` fields while draft.
- Save/post/more actions: `UButton`; posting and reversal confirmation: `UModal`.
- API/validation feedback: inline `UFormField` errors and `UAlert`.

Email and PDF actions are not shown as available because their backend endpoints are
not implemented. Credit/debit notes must retain their reference to the original
invoice.
