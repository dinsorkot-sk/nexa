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

### Engine API (ช่วงพัฒนา)

ทุกคำขอระบุผู้ใช้ด้วย header `X-Nexa-Tenant` และ `X-Nexa-Uid` ซึ่งใช้ได้เมื่อ `NEXA_DEV_AUTH=1` เท่านั้น
(ห้ามเปิดใน production; uid 1 คือ superuser ภายในและเรียกผ่าน API ไม่ได้) ผู้ดูแลเริ่มต้นคือ user `admin`

```sh
curl -s -X POST localhost:3001/api/model/res.users/search_read \
  -H 'content-type: application/json' -H 'x-nexa-tenant: dev' -H 'x-nexa-uid: 2' \
  -d '{"fields":["login"],"limit":10}'
```

| Endpoint | หน้าที่ |
|---|---|
| `POST /api/model/:model/search_read` | `{domain, fields, offset, limit, order}` → `{records, length}` |
| `POST /api/model/:model/search_count` · `read` · `create` · `write` · `unlink` · `onchange` | CRUD ตาม contract ใน `@nexa/shared` |
| `POST /api/model/:model/call/:method` | เรียก method ที่ประกาศใน model เท่านั้น |
| `GET /api/ui/view/:model/:type` · `/api/ui/action/:xmlId` · `/api/ui/menus` | metadata สำหรับ UI ตามสิทธิ์ผู้ใช้ |

ข้อผิดพลาดตอบเป็น `{error: {type, message}}`: 400 คำขอผิดรูป, 401 ไม่ได้ยืนยันตัวตน, 403 ไม่มีสิทธิ์, 404 ไม่พบ record, 422 ข้อมูลไม่ผ่านการตรวจ

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
