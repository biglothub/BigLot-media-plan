ALTER TABLE video_carousel_slides
  ADD COLUMN IF NOT EXISTS sources_json jsonb NOT NULL DEFAULT '[]'::jsonb;
