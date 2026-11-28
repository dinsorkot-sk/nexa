# Company and starter pack

## 8. Company and starter pack

```text
+------------------------------------------------------+
|COMPANY / ACME THAILAND                               |
|Name [Acme Thailand__________] Currency [THB v]       |
|Tax ID [13 digits]  Branch [00000]                    |
|Address [Edit...]                                     |
|                                                      |
|THAI ACCOUNTING PACK v1.0                             |
|Status [Not applied]                                  |
|[Review pack] [Apply to this company]                 |
|                                                      |
|Each step commits separately; partial failure shown   |
|Confirm re-apply; result via UAlert                   |
+------------------------------------------------------+
```

### Component map

- Company settings: `UForm`, `UFormField`, `UInput`, and `USelect`.
- Pack status and apply progress: `UCard`, `UBadge`, and `UProgress`.
- Review/apply/re-apply: `UButton`; re-apply confirmation: `UModal`.
- Partial completion, success, and failed-step details: `UAlert`.

The starter pack applies in steps; errors must identify the failed step and whether
earlier steps committed. Confirm re-application before proceeding. No statutory
compliance claim is implied by this setup screen.
