# Nexa

แพลตฟอร์ม ERP แบบ No-Code/Low-Code บน metadata-driven engine (`packages/engine`) ที่ออกแบบโดยศึกษาแนวคิดจาก Odoo
(ดู `docs/adr/0001-engine-core.md`) ใช้ Nuxt, NestJS และ PGlite (Postgres แบบ embedded หนึ่งฐานต่อ tenant) ร่วมกับ pnpm workspaces และ Turborepo

## เริ่มโปรเจกต์

สร้าง repo ใหม่จาก template โดยคัดลอกไฟล์ซ่อนด้วย เช่น `.github`, `.codex` และ `.node-version` ใช้ Node ตาม `.node-version` และ pnpm ตามฟิลด์ `packageManager` ใน `package.json`

เมื่อตั้งต้น repo ที่ยังไม่มี `pnpm-lock.yaml` ให้ผู้ดูแลรัน `pnpm install --no-frozen-lockfile` ในเครื่องที่เข้าถึง npm registry ได้ แล้วบันทึก lockfile ไว้ใน repo ก่อนใช้ CI หรือสร้างโปรเจกต์จาก template

```sh
pnpm install --frozen-lockfile
cp apps/api/.env.example apps/api/.env
pnpm dev
```

เว็บเปิดที่ <http://localhost:3000> และ API เปิดที่ <http://localhost:3001> ตรวจว่า API รับคำขอได้ด้วย `curl -fsS http://localhost:3001/health` ซึ่งควรตอบ `{"status":"ok"}`

ฐานข้อมูลไม่ต้อง migrate เอง: engine สร้างและปรับ schema ของแต่ละ tenant จาก model ของ module ที่ติดตั้ง
ข้อมูลอยู่ใน `NEXA_DATA_DIR` (ค่าเริ่มต้น `apps/api/data/<tenant>`) และเปิดได้เฉพาะ tenant ใน `NEXA_TENANTS`
ดูตัวแปรทั้งหมดใน `apps/api/.env.example`

### Engine API

ตั้งรหัสผ่านครั้งแรกให้ผู้ดูแล `admin` ของแต่ละ tenant ด้วยคำสั่งด้านล่างหลัง build โดยใช้ config เดียวกับ API และหยุด API ก่อนเปิดฐาน PGlite จาก CLI คำสั่งจะแจ้งให้กรอกรหัสผ่าน การตั้งรหัสผ่านใหม่จะเพิกถอน session และ API key เดิมของผู้ใช้นั้น

```sh
pnpm build
pnpm --filter @nexa/api auth:provision dev admin
```

เข้าสู่ระบบด้วย `POST /api/auth/login` ส่ง `{tenant, login, password}` และใช้ `accessToken` ที่ได้รับใน header `Authorization: Bearer <token>` ระบบระบุผู้ใช้และ tenant จาก credential ที่ตรวจแล้ว ให้ใช้ HTTPS เมื่อเรียก API ผ่านเครือข่าย

```sh
curl -s -X POST localhost:3001/api/model/res.users/search_read \
  -H 'content-type: application/json' -H "Authorization: Bearer ${NEXA_TOKEN}" \
  -d '{"fields":["login"],"limit":10}'
```

ออกจากระบบด้วย `POST /api/auth/logout` ใช้ session พร้อมรหัสผ่านกับ `POST /api/auth/api-keys` เพื่อสร้าง API key สำหรับงานอัตโนมัติ เก็บค่า `token` จากผลตอบกลับไว้เมื่อสร้าง และเพิกถอนด้วย `POST /api/auth/api-keys/:id/revoke`

สำหรับการทดสอบในเครื่อง สามารถตั้ง `NEXA_DEV_AUTH=1` เพื่อใช้ `X-Nexa-Tenant` กับ `X-Nexa-Uid` ได้เมื่อคำขอไม่มี bearer credential โหมด production ใช้ bearer เท่านั้น และ uid 1 สงวนไว้ให้ engine ภายใน

เมื่อ tenant มีผู้ดูแลที่ active และมีสิทธิ์ทั้ง Settings และ ERP Manager ระบบจะปฏิเสธการเปลี่ยนแปลงที่ทำให้ผู้ดูแลกลุ่มนี้เหลือศูนย์ การ archive บัญชีจะเพิกถอน session และ API key ของบัญชีนั้น การเปิดบัญชีใหม่ต้องเข้าสู่ระบบอีกครั้ง

| Endpoint | หน้าที่ |
|---|---|
| `POST /api/model/:model/search_read` | `{domain, fields, offset, limit, order}` → `{records, length}` |
| `POST /api/model/:model/search_count` · `read` · `create` · `write` · `unlink` · `onchange` | CRUD ตาม contract ใน `@nexa/shared` |
| `POST /api/model/:model/name_search` | `{name, domain, limit, context}` → `{records: [{id, display_name}]}` |
| `POST /api/model/:model/read_group` | `{domain, groupBy, aggregates, offset, limit, context}` → `{groups}` แต่ละกลุ่มมี `__count` และผล aggregate ชื่อ `<field>_<op>` |
| `POST /api/model/:model/fields_get` · `default_get` | รับ `fields` และคืน metadata ที่ผู้ใช้เห็นได้หรือค่าเริ่มต้นของฟิลด์ที่ขอ |
| `POST /api/model/:model/copy` | `{id, defaults, context}` → `{ids}` โดยสร้าง record ใหม่ผ่าน ORM |
| `POST /api/model/:model/call/:method` | เรียก method ที่ประกาศใน model เท่านั้น |
| `GET /api/ui/view/:model/:type` · `/api/ui/action/:xmlId` · `/api/ui/menus` | metadata สำหรับ UI ตามสิทธิ์ผู้ใช้ |

ข้อผิดพลาดตอบเป็น `{error: {type, message}}`: 400 คำขอผิดรูป, 401 ไม่ได้ยืนยันตัวตน, 403 ไม่มีสิทธิ์, 404 ไม่พบ record, 422 ข้อมูลไม่ผ่านการตรวจ

ส่ง `context: {activeTest: false}` ในคำขอค้นหาเพื่อนับและอ่าน record ที่ archive แล้ว ส่ง `context: {defaults: {field: value}}` ใน `default_get` หรือ `create` เพื่อกำหนดค่าเริ่มต้น โดยค่าที่ส่งใน `create.values` มีลำดับสูงกว่า

`read_group` รองรับช่วงเวลา `day`, `week`, `month`, `quarter` และ `year` เช่น `groupBy: ["create_date:month"]` สำหรับการจัดกลุ่มตามเดือน การจัดกลุ่ม datetime ใช้ UTC

### NX-Expr ใน Studio

ผู้ดูแล Settings ตั้ง `defaultExpr` หรือ `computeExpr` ผ่าน `POST /api/studio/field` เช่น `"computeExpr": "record.x_qty * 2"` ใช้ `"store": true` เมื่อต้องการเก็บค่าคำนวณจากฟิลด์ scalar ที่ผู้อ่าน record ทุกคนเห็นได้ ระบบเติมค่าให้ record เดิมเมื่อเพิ่มฟิลด์

`POST /api/studio/expressions` แทนที่ onchange และ constraints ของ custom model ที่ระบุ ส่ง `onchange` เป็น map จากฟิลด์ที่เปลี่ยนไปยัง expression ที่คืนคู่ `[field, value]` และส่ง `constraints` เป็นรายการที่มี `name`, `expression` และ `message` ตามต้องการ Constraint ต้องคืน `true` จึงผ่าน หากส่ง map หรือรายการว่าง ระบบจะล้าง hooks ชนิดนั้น

Expression constraint ใช้ได้กับฟิลด์ scalar ที่เก็บใน record เดียวกัน การตรวจจะทำในธุรกรรมที่สร้างหรือแก้ record นั้น

โมดูลเขียน record-rule domain เป็น NX-Expr ได้ เช่น `'[["company_id", "in", companyIds]]'` ผลลัพธ์ต้องเป็น domain ที่ engine ตรวจสอบได้

### ทดลอง Contacts และ Sales

ตั้ง `NEXA_MODULES=base,contacts,sales_lite` ใน `apps/api/.env` แล้วรีสตาร์ต API เมื่อเปิด tenant ครั้งถัดไป engine จะติดตั้งโมดูลที่ยังขาด จากนั้นเปิดเมนู **Contacts** และ **Sales** เพื่อดูผู้ติดต่อและใบสั่งขายตัวอย่าง

## ขอบเขตแพ็กเกจ

| ส่วน | หน้าที่ |
|---|---|
| `apps/web` | หน้า Nuxt และ integration ฝั่งเว็บ ใช้ `@nexa/ui` กับ contracts ใน `@nexa/shared` |
| `apps/api` | NestJS: HTTP adapter บาง ๆ ของ engine (auth, validation, error mapping) |
| `packages/engine` | ORM, domain, security, module system และ UI metadata ของ ERP (ทำงานบน PGlite) |
| `packages/core` | กติกาธุรกิจและ use cases พร้อม interface ของ dependency ที่ use case ต้องใช้ |
| `packages/shared` | Types, validation schemas และ API contracts ที่ใช้ข้ามแอป |
| `packages/ui` | Nuxt layer สำหรับธีมและ wrappers กลาง `NexaForm`, `NexaTable` และ `NexaDialog` |

เริ่มเพิ่มกติกาธุรกิจใน `core` แล้วให้ Nest ประกอบ implementation ที่ต้องติดต่อฐานข้อมูล ใช้หน้าแรกของเว็บเป็นตัวอย่างการใช้ wrapper ทั้งสาม และใช้ไฟล์ layer สำหรับกำหนดธีมเริ่มต้นของโปรเจกต์

## ตรวจงาน

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

GitHub Actions ใช้คำสั่งชุดเดียวกันเมื่อเปิดหรืออัปเดต pull request

## AI agent team workflow

มี workflow กลางใน `team/` (รวม checklist UX) พร้อมคำสั่งและ agent roles สำหรับ Claude
Code, Codex, GitHub Copilot และ OpenCode โดยแยกจากโปรไฟล์เดิม:

| เครื่องมือ | เริ่มงานทีม | ต่อ / ดูสถานะ |
|---|---|---|
| Claude Code | `/team` | `/team-resume`, `/team-status` |
| Codex | `$team-workflow` | ใช้ skill เดิมพร้อมขอ resume หรือ status |
| GitHub Copilot | เลือก prompt `team` | `team-resume`, `team-status` |
| OpenCode | `/team` | `/team-resume`, `/team-status` |

การทำงานหลายขั้นตอนบันทึกสถานะไว้ที่ `team/STATE.md` ซึ่งถูก ignore โดยค่าเริ่มต้น
เพื่อไม่ให้ข้อมูลสถานะงานเฉพาะรอบปะปนกับ source ของ template.
