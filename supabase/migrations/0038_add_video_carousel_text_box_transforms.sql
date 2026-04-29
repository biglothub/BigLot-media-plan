ALTER TABLE video_carousel_slides
  ADD COLUMN IF NOT EXISTS text_box_transforms_json jsonb NOT NULL DEFAULT '{}'::jsonb;
