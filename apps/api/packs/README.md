# Starter packs

A starter pack is a JSON file that sets up a tenant for a business process using only no-code
surfaces: Studio models and fields, and ordinary records (access rights, record rules, `ir.*`
policies, sequences, server actions, buttons, master data). Decision: [ADR 0005](../../../docs/adr/0005-starter-packs.md).

| Pack | File | What it sets up |
|---|---|---|
| `th_accounting` | `th-accounting.json` | Thailand: sales order → tax invoice (VAT 7%) → ledger → payment with WHT → reconciliation; credit and debit notes. Not a statutory-compliance claim. |

## Apply

A Settings administrator calls:

```http
GET  /api/packs                              # list packs and their parameters
POST /api/packs/th_accounting/apply          # body: { "params": { "company": <res.company id> } }
```

The target company must be one of the administrator's allowed companies. The pack runs with the
administrator's own rights in that company, so access rights, record rules, constraints and policy
guards all apply.

The response counts what changed, for example
`{ "created": { "models": 11, "fields": 90, "records": 80 }, "updated": 2, "unchanged": 0 }`.

Applying again is safe:
- existing models and fields are kept;
- records are found again by their external id and rewritten, except records marked `noupdate`
  (such as the starter chart of accounts), which keep administrator edits.

Each step commits on its own. If a step fails, fix the cause and apply again.

After applying `th_accounting`, an administrator still enters the company's tax ID (`x_vat`, 13 digits)
and branch (`x_branch`, `00000` for head office), and each customer's tax ID, branch and receivable
account.

## Format

```jsonc
{
  "name": "th_accounting", "version": "1.0.0", "title": "...", "description": "...",
  "modules": ["base", "uom", "product", "account_core"],          // must be installed
  "requires": { "currency": "THB" },                               // optional company prerequisite
  "params": { "company": { "model": "res.company", "label": "..." } },
  "steps": [                                                       // applied in order
    { "model":  { "name": "x_invoice", "description": "..." } },    // POST /api/studio/model rules
    { "field":  { "model": "x_invoice", "name": "x_state", "type": "selection", ... } },  // POST /api/studio/field rules
    { "record": { "id": "tax_vat7", "model": "account.tax", "values": { ... }, "noupdate": true, "perCompany": false } },
    { "update": { "model": "res.company", "target": { "$param": "company" }, "values": { ... } } }
  ]
}
```

Special values, usable anywhere inside `values` and `target`:

| Form | Meaning |
|---|---|
| `{ "$ref": "acc_2201" }` | Id of a record created by this pack. The per-company record is used first, then the global one. |
| `{ "$ref": "module.name" }` | Id behind any external id. |
| `{ "$param": "company" }` | A parameter given when the pack is applied. |
| `{ "$search": { "model": "...", "domain": [...] } }` | Id of the one matching record. Archived records are included; zero or several matches are an error. |
| `{ "$jsonText": <value> }` | The value serialized as a JSON string, for text fields such as `values_json` or `domain_force`. |

External ids are stored as `pack_<name>.<id>`, and per-company records as `pack_<name>_c<company>.<id>`.
