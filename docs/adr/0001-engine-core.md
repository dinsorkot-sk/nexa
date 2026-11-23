# ADR 0001 — Nexa ERP engine core

Status: Accepted (2026-11-23)

## Context

Nexa จะเป็นแพลตฟอร์ม ERP แบบ No-Code/Low-Code เราศึกษาสถาปัตยกรรมของ Odoo 18 (`ref/odoo`)
ซึ่งพิสูจน์แล้วว่ารองรับ ERP เต็มรูปแบบด้วย "ทุกอย่างเป็น model + metadata"
Odoo เป็น LGPL-3 จึงนำมาใช้เฉพาะแนวคิด ไม่คัดลอกโค้ด

## Decisions

1. **Metadata-driven ORM** (`packages/engine`) — ทุก business object เป็น `ModelDef` ที่มี `FieldDef`
   ลงทะเบียนใน `Registry` ต่อ tenant (เทียบ `odoo/orm/models.py`, `fields.py`, `odoo/modules/registry.py`)
2. **สองแหล่งของ model** — จาก module (TypeScript, Low-Code) และจากตาราง `nx_model`/`nx_field`
   (No-Code, สร้างตอน runtime) รวมเป็นนิยามเดียวใน registry แล้ว rebuild แบบ atomic
3. **Table-per-model + schema sync** — engine สร้าง/แก้ตารางจริงจาก `ModelDef`
   (เพิ่ม column ได้อัตโนมัติ; การลบ/เปลี่ยนชนิดต้องผ่าน migration ที่ยืนยัน)
4. **PGlite + `SqlDriver` adapter** — SQL ที่สร้างเป็น Postgres dialect; driver แยกออกเพื่อเปลี่ยนเป็น
   PostgreSQL server ได้ PGlite มี connection เดียว → engine serialize transaction ต่อ tenant
5. **Database-per-tenant** — `TenantManager` เปิด PGlite data dir ต่อ tenant และถือ registry ของ tenant นั้น
6. **Domain DSL** (เทียบ `odoo/osv/expression.py`) — JSON AST `['&', ['state','=','draft'], ['partner_id.country_id.code','=','TH']]`
   compile เป็น SQL แบบ parameterized เท่านั้น ห้าม string-concat ค่า
7. **Environment** (เทียบ `odoo.api.Environment`) — ทุก operation ทำผ่าน `Env { tenant, uid, companyIds, context, su }`
   ซึ่งถือ transaction, cache และใช้ access check เสมอเว้นแต่ `sudo()`
8. **Security** — ACL ต่อ model×group (`ir.model.access`) + record rules เป็น domain ต่อ group (`ir.rule`)
   + multi-company rule; enforce ใน engine ไม่ใช่ใน API layer
9. **Module system** — manifest (`name`, `version`, `depends`, `models`, `data`, `hooks`), dependency graph
   แบบ topological, model extension (`extends`, เทียบ `_inherit`) และ delegation (`_inherits`)
10. **UI metadata เป็น JSON** — view (list/form/kanban/search), action, menu เก็บเป็น JSON tree;
    view inheritance ใช้ patch operations แทน XPath
11. **Low-code logic** — compute/onchange/constraint/automation เขียนเป็น TS ใน module;
    สิ่งที่สร้างจาก UI ใช้ expression ใน sandbox (จำกัด API, timeout, ไม่มี I/O)

## Consequences

- API layer (NestJS) บาง: แปลง HTTP → `env.model(name).method(...)`
- UI (Nuxt) generic: render จาก view metadata
- ต้องมี test suite ของ engine ที่เข้มแข็ง เพราะทุก module พึ่ง engine
- ความเสี่ยง: PGlite ไม่เหมาะกับ concurrency สูง — มี adapter เป็นทางออก

## Odoo reference map

| Concept | Odoo file |
|---|---|
| Model / recordset / env | `odoo/orm/models.py`, `odoo/api.py` |
| Field types, compute deps | `odoo/fields.py` |
| Domain → SQL | `odoo/osv/expression.py` |
| Registry, module load | `odoo/modules/registry.py`, `loading.py`, `graph.py` |
| Metadata models | `odoo/addons/base/models/ir_model.py` |
| Access, rules | `ir_model.py` (access), `ir_rule.py` |
| Views / actions / menus | `ir_ui_view.py`, `ir_actions.py`, `ir_ui_menu.py` |
| Sequence / cron | `ir_sequence.py`, `ir_cron.py` |
