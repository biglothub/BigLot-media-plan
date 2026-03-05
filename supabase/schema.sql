-- BigLot Media Plan — Full Schema
-- Run this in Supabase SQL Editor to create all tables
-- Last updated: 2026-03-03

-- ============================================================
-- 1. idea_backlog
-- ============================================================
CREATE TABLE IF NOT EXISTS public.idea_backlog (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idea_code     text NOT NULL DEFAULT (
    'BL-' || to_char(timezone('utc', now()), 'YYYYMMDD') || '-' ||
    upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8))
  ),
  url           text,
  platform      text NOT NULL
    CHECK (platform IN ('youtube', 'facebook', 'instagram', 'tiktok')),
  content_type  text NOT NULL DEFAULT 'video'
    CHECK (content_type IN ('video', 'post', 'image')),
  title         text,
  description   text,
  author_name   text,
  thumbnail_url text,
  published_at  timestamptz,
  view_count    bigint,
  like_count    bigint,
  comment_count bigint,
  share_count   bigint,
  save_count    bigint,
  notes         text,
  status        text NOT NULL DEFAULT 'new',
  engagement_json jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_idea_backlog_idea_code
  ON public.idea_backlog (idea_code);
CREATE INDEX IF NOT EXISTS idx_idea_backlog_created_at
  ON public.idea_backlog (created_at);
CREATE INDEX IF NOT EXISTS idx_idea_backlog_platform
  ON public.idea_backlog (platform);

ALTER TABLE public.idea_backlog ENABLE ROW LEVEL SECURITY;

CREATE POLICY public_read_backlog   ON public.idea_backlog FOR SELECT TO public USING (true);
CREATE POLICY public_insert_backlog ON public.idea_backlog FOR INSERT TO public WITH CHECK (true);
CREATE POLICY public_update_backlog ON public.idea_backlog FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY public_delete_backlog ON public.idea_backlog FOR DELETE TO public USING (true);

-- ============================================================
-- 2. production_calendar
-- ============================================================
CREATE TABLE IF NOT EXISTS public.production_calendar (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  backlog_id  uuid NOT NULL REFERENCES public.idea_backlog (id) ON DELETE CASCADE,
  shoot_date  date NOT NULL,
  status      text NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'scripting', 'shooting', 'editing', 'published')),
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_production_calendar_backlog
  ON public.production_calendar (backlog_id);
CREATE INDEX IF NOT EXISTS idx_production_calendar_shoot_date
  ON public.production_calendar (shoot_date);

ALTER TABLE public.production_calendar ENABLE ROW LEVEL SECURITY;

CREATE POLICY public_read_calendar   ON public.production_calendar FOR SELECT TO public USING (true);
CREATE POLICY public_insert_calendar ON public.production_calendar FOR INSERT TO public WITH CHECK (true);
CREATE POLICY public_update_calendar ON public.production_calendar FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY public_delete_calendar ON public.production_calendar FOR DELETE TO public USING (true);

-- ============================================================
-- 3. produced_videos
-- ============================================================
CREATE TABLE IF NOT EXISTS public.produced_videos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_id   uuid NOT NULL REFERENCES public.production_calendar (id) ON DELETE CASCADE,
  url           text NOT NULL,
  platform      text NOT NULL
    CHECK (platform IN ('youtube', 'facebook', 'instagram', 'tiktok')),
  title         text,
  thumbnail_url text,
  published_at  timestamptz,
  view_count    bigint,
  like_count    bigint,
  comment_count bigint,
  share_count   bigint,
  save_count    bigint,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_produced_videos_calendar
  ON public.produced_videos (calendar_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_produced_videos_calendar_platform
  ON public.produced_videos (calendar_id, platform);
CREATE INDEX IF NOT EXISTS idx_produced_videos_platform
  ON public.produced_videos (platform);

ALTER TABLE public.produced_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY public_read_produced_videos   ON public.produced_videos FOR SELECT TO public USING (true);
CREATE POLICY public_insert_produced_videos ON public.produced_videos FOR INSERT TO public WITH CHECK (true);
CREATE POLICY public_update_produced_videos ON public.produced_videos FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY public_delete_produced_videos ON public.produced_videos FOR DELETE TO public USING (true);

-- ============================================================
-- 4. monitoring_content
-- ============================================================
CREATE TABLE IF NOT EXISTS public.monitoring_content (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_code  text NOT NULL DEFAULT (
    'MC-' || to_char(timezone('utc', now()), 'YYYYMMDD') || '-' ||
    upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8))
  ),
  title         text NOT NULL,
  description   text,
  notes         text,
  status        text NOT NULL DEFAULT 'active',
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_monitoring_content_code
  ON public.monitoring_content (content_code);
CREATE INDEX IF NOT EXISTS idx_monitoring_content_created_at
  ON public.monitoring_content (created_at);

ALTER TABLE public.monitoring_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY public_read_monitoring_content   ON public.monitoring_content FOR SELECT TO public USING (true);
CREATE POLICY public_insert_monitoring_content ON public.monitoring_content FOR INSERT TO public WITH CHECK (true);
CREATE POLICY public_update_monitoring_content ON public.monitoring_content FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY public_delete_monitoring_content ON public.monitoring_content FOR DELETE TO public USING (true);

-- ============================================================
-- 5. monitoring_content_platform
-- ============================================================
CREATE TABLE IF NOT EXISTS public.monitoring_content_platform (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id    uuid NOT NULL REFERENCES public.monitoring_content (id) ON DELETE CASCADE,
  url           text NOT NULL,
  platform      text NOT NULL
    CHECK (platform IN ('youtube', 'facebook', 'instagram', 'tiktok')),
  title         text,
  thumbnail_url text,
  published_at  timestamptz,
  view_count    bigint,
  like_count    bigint,
  comment_count bigint,
  share_count   bigint,
  save_count    bigint,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_monitoring_content_platform_content
  ON public.monitoring_content_platform (content_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_monitoring_content_platform_unique
  ON public.monitoring_content_platform (content_id, platform);
CREATE INDEX IF NOT EXISTS idx_monitoring_content_platform_platform
  ON public.monitoring_content_platform (platform);

ALTER TABLE public.monitoring_content_platform ENABLE ROW LEVEL SECURITY;

CREATE POLICY public_read_monitoring_content_platform   ON public.monitoring_content_platform FOR SELECT TO public USING (true);
CREATE POLICY public_insert_monitoring_content_platform ON public.monitoring_content_platform FOR INSERT TO public WITH CHECK (true);
CREATE POLICY public_update_monitoring_content_platform ON public.monitoring_content_platform FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY public_delete_monitoring_content_platform ON public.monitoring_content_platform FOR DELETE TO public USING (true);

-- ============================================================
-- 6. calendar_assignments
-- ============================================================
CREATE TABLE IF NOT EXISTS public.calendar_assignments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_id  uuid NOT NULL REFERENCES public.production_calendar (id) ON DELETE CASCADE,
  member_name  text NOT NULL CHECK (member_name IN ('โฟน','ฟิวส์','อิก','ต้า')),
  role_detail  text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_calendar_assignments_member
  ON public.calendar_assignments (calendar_id, member_name);
CREATE INDEX IF NOT EXISTS idx_calendar_assignments_calendar
  ON public.calendar_assignments (calendar_id);

ALTER TABLE public.calendar_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY public_read_calendar_assignments   ON public.calendar_assignments FOR SELECT TO public USING (true);
CREATE POLICY public_insert_calendar_assignments ON public.calendar_assignments FOR INSERT TO public WITH CHECK (true);
CREATE POLICY public_update_calendar_assignments ON public.calendar_assignments FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY public_delete_calendar_assignments ON public.calendar_assignments FOR DELETE TO public USING (true);
