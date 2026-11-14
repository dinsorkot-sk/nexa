# Nexa Product Brief

**Status:** Founder direction captured; product and architecture proposal for review  
**Product:** Nexa (working name)  
**License direction:** Apache-2.0

## Product intent

Nexa is an open-source, no-code/low-code ERP platform for small and midsize wholesale and distribution businesses. It should provide useful business workflows out of the box, while letting a company's power users and developers adapt the system and build additional modules.

The first release should deliver a usable ERP in increments. The long-term product includes a capable app and module builder; it should not require every advanced builder feature before the first users can run core operations.

## Initial customer

- Wholesale and distribution businesses
- Approximately 5–50 employees
- International audience; English-first product with localization designed in from the start
- Both self-hosted and hosted SaaS deployment are product goals
- Self-hosted is the first deployment target; SaaS follows after security and operational validation
- Primary configuration audience: power users and developers

## Initial user problems

1. Sales, purchasing, and stock information is split across spreadsheets and separate tools.
2. Teams cannot adapt their ERP workflows without paying for custom development.
3. Generic ERP products require too much setup before a small business can use them.

These are product hypotheses. Validate them with target users before treating them as established research findings.

## Product principles

- Useful business workflows should work before users configure anything.
- Keep core ERP data and accounting invariants explicit and auditable.
- Make custom modules discoverable, versioned, and exportable.
- Support self-hosting without making SaaS operations a separate product architecture.
- Localize labels, dates, numbers, currencies, and country-specific behavior through explicit modules.
- Prefer progressive configuration: simple changes for power users, deeper extension points for developers.

## MVP boundary

### Included in the first usable release

- Organization, user, and role basics
- Product catalog and units of measure
- Customer and supplier records
- Warehouses and stock locations at a simple level
- Sales flow: quote/order, fulfillment, and invoice record
- Purchasing flow: purchase order and receipt
- Inventory movement history and on-hand quantities
- Basic sales and stock reports
- Audit history for important record changes
- English UI and localization foundations
- Installation and backup guidance for self-hosting
- Versioned APIs and extension hooks for later modules

### Builder scope, delivered in stages

The product goal is a full no-code/low-code module builder for power users and developers. Build it in increments:

1. Configure forms, fields, and saved views for built-in modules.
2. Define custom records and simple relationships, then generate list and detail screens.
3. Add workflow states, approvals, and notifications.
4. Add developer extensions, automation hooks, and richer reporting.

Every stage should preserve data export and a clear upgrade path when a module definition changes.

### Out of scope for the first usable release

- General ledger, tax filing, payroll, and statutory accounting
- Manufacturing planning and costing
- POS and ecommerce channel management
- Advanced multi-country tax compliance
- Arbitrary code execution inside user-created workflows
- A promise that all custom applications can be built without developer support

These can be considered after validating the first customer segment and core workflows.

## Success measures to validate

- A new business can complete a basic setup and record its first order without developer help.
- A user can follow an order from entry through shipment and see its stock effect.
- A user can receive a purchase order and reconcile the resulting inventory movement.
- A power user can make a safe form or view change without downtime or data loss.
- A self-hosted operator can install, back up, and restore a test instance from documentation.

Numeric targets and onboarding time limits need founder input and user research; none are set yet.

## Business model questions

Not yet decided. Candidate sustainability paths include hosted SaaS, paid hosting/support, or a community-first project with optional commercial services. This choice should be made before defining hosted-only features or non-open-source modules.

## Founder-approved direction

- Open-source project; Apache-2.0 direction selected
- Global audience first
- Wholesale/distribution, 5–50 employees, as initial customer segment
- Sales, purchasing, and inventory as the first ERP workflow
- Full builder as the long-term product direction, delivered incrementally
- Both self-hosted and SaaS deployment are desired
- Builder serves both power users and developers
- Stack direction: TypeScript, Nuxt, Nuxt UI, and SQLite

## Founder decisions still open

- Confirm the working product name “Nexa”
- Choose the first country/localization pack after the English-first foundation
- Decide hosted SaaS business model and which services, if any, are paid
- Approve tenant-isolation and custom-module storage proposals in `architecture.md`
- Define numeric adoption and release criteria
