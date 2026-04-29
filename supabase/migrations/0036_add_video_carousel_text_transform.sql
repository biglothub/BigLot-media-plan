ALTER TABLE video_carousel_slides
  ADD COLUMN IF NOT EXISTS text_scale_percent integer NOT NULL DEFAULT 100;

ALTER TABLE video_carousel_slides
  DROP CONSTRAINT IF EXISTS video_carousel_slides_text_scale_percent_check;

ALTER TABLE video_carousel_slides
  ADD CONSTRAINT video_carousel_slides_text_scale_percent_check
  CHECK (text_scale_percent BETWEEN 50 AND 180);
