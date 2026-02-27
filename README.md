# BigLot Idea Backlog (Svelte + Supabase + Drizzle)

MVP สำหรับเก็บ `idea backlog` จากลิงก์วิดีโอ YouTube / Facebook / Instagram / TikTok

Workflow:
1. วางลิงก์
2. กด `Analyze Link`
3. ตรวจ/แก้ค่า engagement
4. กด `Save To Backlog`

## Tech Stack
- SvelteKit
- Supabase (`@supabase/supabase-js`)
- Drizzle ORM + Drizzle Kit (schema/migrations)
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

3. สร้าง/อัปเดตฐานข้อมูลด้วย Drizzle
```bash
npm run db:generate
npm run db:migrate
```

ถ้าต้องการ sync แบบเร็ว (ไม่สร้าง migration file):
```bash
npm run db:push
```

โหมดอัตโนมัติสำหรับ local:
```bash
npm run dev:auto
```
คำสั่งนี้จะ `db:push:auto` ก่อนเปิด dev server (ถ้ามี `DATABASE_URL`)

4. รันโปรเจกต์
```bash
npm run dev
```

## วิธีใช้งาน Drizzle (ปรับ DB ตามโค้ด)
1. แก้ schema ที่ [`src/lib/server/db/schema.ts`](./src/lib/server/db/schema.ts)
2. สร้าง migration ใหม่ด้วย `npm run db:generate`
3. Apply migration ด้วย `npm run db:migrate`

## Automation ที่ตั้งไว้แล้ว
- `npm run dev:auto`: auto sync schema ด้วย `db:push:auto` แล้วค่อยเปิด dev server
- `npm run db:push:auto`: `drizzle-kit push --strict=false --force` (เหมาะกับ local dev)
- `npm run db:check`: ตรวจ consistency ของ migrations ใน CI
- GitHub Actions: [`.github/workflows/ci-db.yml`](./.github/workflows/ci-db.yml)
  - PR: รัน `check`, `build`, `db:check`
  - Push เข้า `main` และ manual run: รัน `db:migrate` อัตโนมัติ
  - ต้องตั้ง GitHub Secret ชื่อ `DATABASE_URL`

หมายเหตุ: `dev:auto` โหลดค่า `.env` อัตโนมัติแล้ว ไม่ต้อง export ตัวแปรใน shell เพิ่ม

## โครงสร้างสำคัญ
- หน้า UI: [`src/routes/+page.svelte`](./src/routes/+page.svelte)
- Supabase client: [`src/lib/supabase.ts`](./src/lib/supabase.ts)
- Type definitions: [`src/lib/types.ts`](./src/lib/types.ts)
- Enrichment API: [`src/routes/api/enrich/+server.ts`](./src/routes/api/enrich/+server.ts)
- Drizzle config: [`drizzle.config.ts`](./drizzle.config.ts)
- Drizzle schema: [`src/lib/server/db/schema.ts`](./src/lib/server/db/schema.ts)
- Legacy SQL schema: [`supabase/schema.sql`](./supabase/schema.sql)

## หมายเหตุ
- การดึง engagement จากบางแพลตฟอร์มอาจถูกจำกัด (private post, geo-block, anti-bot)
- endpoint ตอนนี้เป็น `best-effort` จาก JSON-LD/meta tags/regex fallback
- ถ้าต้องการความแม่นยำระดับ production ควรเชื่อม official API ของแต่ละแพลตฟอร์ม
