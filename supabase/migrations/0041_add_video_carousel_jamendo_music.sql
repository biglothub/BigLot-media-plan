ALTER TABLE public.video_carousel_projects
  ADD COLUMN IF NOT EXISTS music_source text NOT NULL DEFAULT 'generated',
  ADD COLUMN IF NOT EXISTS music_external_id text,
  ADD COLUMN IF NOT EXISTS music_title text,
  ADD COLUMN IF NOT EXISTS music_artist_name text,
  ADD COLUMN IF NOT EXISTS music_audio_url text,
  ADD COLUMN IF NOT EXISTS music_page_url text,
  ADD COLUMN IF NOT EXISTS music_license_url text,
  ADD COLUMN IF NOT EXISTS music_attribution_text text,
  ADD COLUMN IF NOT EXISTS music_duration_seconds integer,
  ADD COLUMN IF NOT EXISTS music_image_url text;

ALTER TABLE public.video_carousel_projects
  DROP CONSTRAINT IF EXISTS video_carousel_projects_music_source_check;

ALTER TABLE public.video_carousel_projects
  ADD CONSTRAINT video_carousel_projects_music_source_check
    CHECK (music_source IN ('generated', 'jamendo'));

ALTER TABLE public.video_carousel_projects
  DROP CONSTRAINT IF EXISTS video_carousel_projects_music_duration_seconds_check;

ALTER TABLE public.video_carousel_projects
  ADD CONSTRAINT video_carousel_projects_music_duration_seconds_check
    CHECK (music_duration_seconds IS NULL OR music_duration_seconds >= 0);
