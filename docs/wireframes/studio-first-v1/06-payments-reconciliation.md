# Payments and reconciliation

## 14. Payments

```text
+------------------------------------------------------+
|PAYMENTS                                              |
|[Search...] [State v] [Date v] [+ Record payment]     |
|                                                      |
|PAYMENT    CUSTOMER       STATE     AMOUNT THB        |
|PAY-120    Bangkok Ltd    Draft          21,400       |
|PAY-119    Siam Works     Posted          7,490       |
|                                                      |
|RECORD PAYMENT (UModal / UForm)                       |
|Invoice [SelectMenu] Date [InputDate]                 |
|Amount [InputNumber] Method [Select] WHT [Number]     |
|[Cancel] [Save draft] [Post payment]                  |
+------------------------------------------------------+
```

### Component map

- Payment list: `UTable`; payment state: `UBadge`.
- Search/status/date filters: `UInput`, `USelectMenu`, and `UInputDate`.
- Record-payment surface: `UModal` or `USlideover` containing `UForm`.
- Invoice/method selectors: `USelectMenu`; date/amount/WHT: `UInputDate`,
  `UInputNumber`, and `UFormField`.
- Save/post actions: `UButton`; post confirmation: `UModal`; result: `UAlert`.

## 15. Reconciliation

```text
+------------------------------------------------------+
|RECONCILIATION                                        |
|Company [Acme TH v]    Search [____________]          |
|                                                      |
|UNMATCHED PAYMENT       OPEN INVOICE                  |
|PAY-119 / THB 7,490     INV-1047 / THB 7,490          |
|Siam Works              Siam Works                    |
|[ ] Select payment     [ ] Select invoice             |
|                                                      |
|Match amount [7,490] THB                              |
|[Review pair] [Reconcile selected]                    |
|Confirm before undo; success/error via UAlert         |
+------------------------------------------------------+
```

### Component map

- Company/search controls: `USelectMenu` and `UInput`.
- Payment and invoice candidates: `UTable` with labeled `UCheckbox` selection.
- Match amount: `UInputNumber`; review/reconcile: `UButton`.
- Reconcile/unreconcile confirmation: `UModal`; success/failure: `UAlert`.

Confirm reconciliation changes and unreconciliation. Display clear success/error
feedback and the affected payment and invoice.
