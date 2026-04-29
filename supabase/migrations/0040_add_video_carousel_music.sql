ALTER TABLE public.video_carousel_projects
  ADD COLUMN IF NOT EXISTS music_track_id text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS music_volume_percent integer NOT NULL DEFAULT 45;

ALTER TABLE public.video_carousel_projects
  DROP CONSTRAINT IF EXISTS video_carousel_projects_music_track_id_check;

ALTER TABLE public.video_carousel_projects
  ADD CONSTRAINT video_carousel_projects_music_track_id_check
    CHECK (music_track_id IN ('none', 'biglot_pulse', 'market_lofi', 'calm_focus'));

ALTER TABLE public.video_carousel_projects
  DROP CONSTRAINT IF EXISTS video_carousel_projects_music_volume_percent_check;

ALTER TABLE public.video_carousel_projects
  ADD CONSTRAINT video_carousel_projects_music_volume_percent_check
    CHECK (music_volume_percent BETWEEN 0 AND 100);
