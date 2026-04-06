# BigLot Media Plan (SvelteKit + Supabase)

MVP สำหรับเก็บ `idea backlog` จากลิงก์คอนเทนต์ YouTube / Facebook / Instagram / TikTok
รองรับการระบุประเภทคอนเทนต์เป็น `Video` / `Post` / `Image`
โดยทุก backlog จะมีรหัสอ้างอิงอัตโนมัติในรูปแบบ `BL-YYYYMMDD-XXXXXXXX`

Workflow:
1. วางลิงก์
2. กด `Analyze Link`
3. เลือกประเภทคอนเทนต์ + ตรวจ/แก้ค่า engagement
4. กด `Save To Backlog`
5. หรือถ้าต้องการสร้างไอเดียเอง ให้กรอกในส่วน `Create Manually` แล้วกด `Save Manual Idea` (ช่อง `Content Link` ไม่บังคับ)
6. ลากไอเดียจาก backlog ไปวางบน `Shoot Calendar`
7. เลือกไอเดียใน calendar แล้วเพิ่ม `Produced Video` ได้หลายแพลตฟอร์ม (YouTube/Facebook/Instagram/TikTok) เพื่อเทียบ KPI แยกแพลตฟอร์ม
8. เข้า `Carousel Studio` เพื่อแตก idea backlog ให้กลายเป็น Instagram carousel พร้อม AI draft, Pexels asset search และ export package
9. เข้า `Content Monitoring` เพื่อสร้างรายการ `content ที่ผลิตจริง` โดยตรง (ไม่อิง backlog) แล้วเพิ่มคลิปย้อนหลัง/ดู preview ครบทุกแพลตฟอร์ม/ดู BI performance summary

## Tech Stack
- SvelteKit
- Supabase (`@supabase/supabase-js`)
- PostgreSQL migration scripts (`scripts/db-migrate.mjs` + `supabase/migrations/*.sql`)
- API route ภายใน SvelteKit: `GET /api/enrich` สำหรับดึง metadata + engagement แบบ best-effort

## Setup
1. ติดตั้ง dependency
```bash
npm install
```

2. ตั้งค่า environment
```bash
cp .env.example .env
```
จากนั้นแก้ค่าใน `.env`:
- `PUBLIC_SUPABASE_URL`
- `PUBLIC_SUPABASE_ANON_KEY`
- `DATABASE_URL` (Supabase Postgres connection string)
- `DEEPSEEK_API_KEY` (AI draft generation ผ่าน DeepSeek Chat API)
- `PEXELS_API_KEY` (Pexels stock photo search)
- `SUPABASE_SERVICE_ROLE_KEY` (server-side upload asset เข้า bucket `carousel-assets`)

3. สร้าง/อัปเดตฐานข้อมูล
```bash
npm run db:migrate
```

4. รันโปรเจกต์
```bash
npm run dev
```

ถ้าต้องการให้ apply migration อัตโนมัติก่อนรัน dev server:
```bash
npm run dev:auto
```
คำสั่งนี้จะเรียก `db:push:auto` (alias ของ `db:migrate`) ก่อนเปิด dev server ถ้ามี `DATABASE_URL`

## Scripts ที่มีจริง
- `npm run dev`: เปิด local dev server
- `npm run dev:auto`: migrate DB อัตโนมัติก่อนเปิด dev
- `npm run check`: `svelte-check` + type check
- `npm run build`: build production
- `npm run db:migrate`: apply SQL migrations จาก `supabase/migrations`
- `npm run db:push:auto`: alias ของ `db:migrate` (ใช้ใน `dev:auto`)
- `npm run db:check`: ตรวจรูปแบบ/ลำดับ migration files

## Automation ที่ตั้งไว้แล้ว
- `npm run dev:auto`: migrate อัตโนมัติแล้วค่อยเปิด dev server
- `npm run db:push:auto`: alias สำหรับงาน local auto-migrate
- `npm run db:check`: ตรวจ consistency ของ migrations ใน CI
- GitHub Actions: [`.github/workflows/ci-db.yml`](./.github/workflows/ci-db.yml)
  - PR: รัน `check`, `build`, `db:check`
  - Push เข้า `main` และ manual run: รัน `db:migrate` อัตโนมัติ
  - ต้องตั้ง GitHub Secret ชื่อ `DATABASE_URL`

หมายเหตุ: `dev:auto` โหลดค่า `.env` อัตโนมัติแล้ว ไม่ต้อง export ตัวแปรใน shell เพิ่ม

## Database Notes
- Source of truth ของโครงสร้าง DB คือไฟล์ migration ใน `supabase/migrations/*.sql`
- ไฟล์ [`supabase/schema.sql`](./supabase/schema.sql) เป็น full schema สำหรับ bootstrap database ใหม่ด้วย SQL ก้อนเดียว
- ถ้าเพิ่มคอลัมน์/ตารางใหม่ ให้เพิ่มไฟล์ migration ใหม่ก่อน แล้วค่อยรัน `npm run db:migrate`

## โครงสร้างสำคัญ
- หน้า UI: [`src/routes/+page.svelte`](./src/routes/+page.svelte)
- Carousel list: [`src/routes/carousel/+page.svelte`](./src/routes/carousel/+page.svelte)
- Carousel studio: [`src/routes/carousel/[id]/+page.svelte`](./src/routes/carousel/[id]/+page.svelte)
- Calendar: [`src/routes/calendar/+page.svelte`](./src/routes/calendar/+page.svelte)
- Kanban: [`src/routes/kanban/+page.svelte`](./src/routes/kanban/+page.svelte)
- KPI Compare: [`src/routes/kpi/+page.svelte`](./src/routes/kpi/+page.svelte)
- Content Monitoring: [`src/routes/monitoring/+page.svelte`](./src/routes/monitoring/+page.svelte)
- Supabase client: [`src/lib/supabase.ts`](./src/lib/supabase.ts)
- Type definitions: [`src/lib/types.ts`](./src/lib/types.ts)
- Enrichment API: [`src/routes/api/enrich/+server.ts`](./src/routes/api/enrich/+server.ts)
- OpenClaw API: [`src/routes/api/openclaw`](./src/routes/api/openclaw)
- Migration scripts: [`scripts/db-migrate.mjs`](./scripts/db-migrate.mjs), [`scripts/db-check.mjs`](./scripts/db-check.mjs)
- Full SQL schema: [`supabase/schema.sql`](./supabase/schema.sql)

## หมายเหตุ
- การดึง engagement จากบางแพลตฟอร์มอาจถูกจำกัด (private post, geo-block, anti-bot)
- endpoint ตอนนี้เป็น `best-effort` จาก JSON-LD/meta tags/regex fallback
- ถ้าต้องการความแม่นยำระดับ production ควรเชื่อม official API ของแต่ละแพลตฟอร์ม
- ก่อน deploy production ควรทบทวน RLS policies ให้เหมาะกับ auth model ที่ใช้งานจริง
