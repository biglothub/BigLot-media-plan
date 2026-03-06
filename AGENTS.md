# BigLot Media Plan — AGENTS.md

## Project Overview

**BigLot Media Plan** is a SvelteKit 5 web application for managing social media content planning, production tracking, and performance monitoring for a Thai content team.

Core capabilities:
- **Idea Backlog** — collect & enrich content ideas from YouTube, Facebook, Instagram, TikTok
- **Kanban Board** — track production stages (planned → scripting → shooting → editing → review → published)
- **Shoot Calendar** — schedule shoots with team assignments and deadlines
- **Monitoring** — watch competitor/own channels, take metric snapshots, auto-sync YouTube video lists
- **Produced Videos** — log published videos and track post-publish performance

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | SvelteKit 5 (Svelte 5 runes) |
| Language | TypeScript (strict) |
| Database | Supabase (PostgreSQL) |
| Styling | Inline `<style>` per component, no CSS framework |
| Fonts | Noto Sans Thai + Space Grotesk (Google Fonts) |
| Build | Vite 7 |
| Package manager | npm (`.npmrc` present) |

---

## Repository Structure

```
src/
  app.d.ts                         # TypeScript ambient types
  app.html                         # HTML shell
  lib/
    index.ts                       # Re-exports
    supabase.ts                    # Supabase client (nullable when env missing)
    team.ts                        # Team member names (single source of truth)
    types.ts                       # All shared TypeScript interfaces & enums
    media-plan.ts                  # Utility functions (formatters, date helpers, embed URLs)
    server/
      platform-oembed.ts           # oEmbed fetchers for YouTube/Facebook/TikTok
      auto-snapshot.ts             # Auto-snapshot logic for monitoring
      youtube-channel.ts           # YouTube channel video list scraper
  routes/
    +layout.svelte                 # Top nav (Backlog, Kanban, Shoot Calendar)
    +page.svelte                   # Backlog (idea_backlog table)
    kanban/+page.svelte            # Kanban board (production_calendar)
    calendar/+page.svelte          # Shoot calendar (monthly grid)
    monitoring/+page.svelte        # Monitoring dashboard
    dashboard/+page.svelte         # Summary dashboard
    api/
      enrich/+server.ts            # GET /api/enrich?url=... — scrapes metadata+metrics
      openclaw/
        ideas/                     # CRUD for idea_backlog
        schedule/                  # CRUD for production_calendar
        produced-videos/           # CRUD for produced_videos
        monitoring/                # CRUD for monitoring_content + platforms + snapshots
        monitoring/sync-all/       # POST — sync all YouTube channels

supabase/
  migrations/                      # Drizzle-generated SQL migration files

scripts/
  dev-auto.mjs                     # Dev helper (npm run dev:auto)
  db-check.mjs                     # Database connectivity check
  db-migrate.mjs                   # Migration runner
```

---

## Database Schema (Key Tables)

| Table | Purpose |
|---|---|
| `idea_backlog` | Content ideas with metrics, platform, status, content_type, content_category |
| `production_calendar` | Shoot schedules linked to backlog; tracks stage + approval |
| `calendar_assignments` | Team member assignments per calendar entry |
| `produced_videos` | Published video records with post-publish metrics |
| `monitoring_content` | Competitor/own channels to monitor; has `is_own` flag |
| `monitoring_content_platforms` | Per-platform URLs for a monitored content entry |
| `monitoring_metric_snapshots` | Time-series metric snapshots for monitoring |
| `monitoring_channel_videos` | Video list scraped from YouTube channels |

---

## Key Types & Constants

**`src/lib/types.ts`** — all shared interfaces. Edit here when adding columns.

**`src/lib/team.ts`** — team members list:
```ts
export const TEAM_MEMBERS = ['โฟน', 'ฟิวส์', 'อิก', 'ต้า'] as const;
```
To add/remove team members, edit only this file.

**Supported platforms:** `youtube | facebook | instagram | tiktok`

**Content types:** `video | post | image | live`

**Content categories:** `hero | help | hub`

**Production stages:** `planned → scripting → shooting → editing → review → published`

**Approval statuses:** `draft | pending_review | approved | rejected`

**Monitoring priority:** `low | normal | high | urgent`

---

## Environment Variables

Required in `.env` (not committed):

```
PUBLIC_SUPABASE_URL=...
PUBLIC_SUPABASE_ANON_KEY=...
```

The Supabase client is nullable — `supabase` from `$lib/supabase.ts` can be `null` when env vars are missing.

---

## API Routes (OpenClaw namespace)

All under `/api/openclaw/` — JSON REST endpoints using SvelteKit `+server.ts` handlers.

| Endpoint | Methods | Description |
|---|---|---|
| `/api/openclaw/ideas` | GET, POST | List / create ideas |
| `/api/openclaw/ideas/[id]` | PATCH, DELETE | Update / delete idea |
| `/api/openclaw/schedule` | GET, POST | List / create calendar entries |
| `/api/openclaw/schedule/[id]` | PATCH, DELETE | Update / delete entry |
| `/api/openclaw/schedule/[id]/assignments` | GET, POST, DELETE | Team assignments |
| `/api/openclaw/produced-videos` | GET, POST | List / create produced videos |
| `/api/openclaw/produced-videos/[id]` | PATCH, DELETE | Update / delete produced video |
| `/api/openclaw/monitoring` | GET, POST | List / create monitoring content |
| `/api/openclaw/monitoring/[id]` | PATCH, DELETE | Update / delete monitoring entry |
| `/api/openclaw/monitoring/[id]/platforms` | GET, POST | Manage platform URLs |
| `/api/openclaw/monitoring/[id]/snapshots` | GET, POST | Metric snapshots |
| `/api/openclaw/monitoring/[id]/auto-snapshot` | POST | Trigger auto-snapshot |
| `/api/openclaw/monitoring/sync-all` | POST | Sync all YouTube channel video lists |
| `/api/openclaw/monitoring/platforms/[platformId]/videos` | GET | Videos for a platform |
| `/api/openclaw/daily-summary` | GET | Daily content summary |
| `/api/enrich` | GET `?url=` | Scrape metadata + metrics from social URL |

---

## Enrich API (`/api/enrich`)

Extracts metadata and engagement metrics from a social media URL without API keys. Strategy (in priority order):

1. JSON-LD structured data (`application/ld+json`)
2. HTML regex patterns (viewCount, likeCount, etc.)
3. oEmbed endpoints (YouTube, Facebook, TikTok)
4. og:/twitter: meta tags
5. Platform-specific HTML scraping

Supports Thai and English metric label patterns.

---

## Coding Conventions

- **Svelte 5 runes** throughout: use `$state`, `$derived`, `$props`, `$effect` — no Svelte 4 stores
- **No CSS framework** — all styles are scoped `<style>` blocks in `.svelte` files
- **Server-only code** lives in `src/lib/server/` — never imported from client components
- **Types first** — add new DB columns to `types.ts` interfaces before touching components
- **Team members** — always source from `$lib/team.ts`, never hardcode names elsewhere
- **Supabase null check** — always guard `if (!supabase)` before DB calls
- **Date helpers** — use `toIsoLocalDate`, `parseIsoDate` from `$lib/media-plan.ts` for consistent local-date handling (avoids UTC offset bugs)

---

## Common Tasks

### Add a new column to a table
1. Create a migration SQL file in `supabase/migrations/`
2. Update the interface in `src/lib/types.ts`
3. Update relevant API handlers and Svelte components

### Add a team member
Edit `TEAM_MEMBERS` array in `src/lib/team.ts` only.

### Add a new platform
1. Add to `SupportedPlatform` union in `types.ts`
2. Add to `SUPPORTED_HOSTS` in `api/enrich/+server.ts`
3. Add label to `platformLabel` in `media-plan.ts`
4. Implement oEmbed/scrape logic in `server/platform-oembed.ts` if needed

### Run dev server
```bash
npm run dev
# or with auto-features:
npm run dev:auto
```

### Run migrations
```bash
npm run db:migrate
```
