ALTER TABLE video_carousel_slides
  ADD COLUMN IF NOT EXISTS video_filter text NOT NULL DEFAULT 'none';

ALTER TABLE video_carousel_slides
  DROP CONSTRAINT IF EXISTS video_carousel_slides_video_filter_check;

ALTER TABLE video_carousel_slides
  ADD CONSTRAINT video_carousel_slides_video_filter_check
  CHECK (video_filter IN ('none', 'grayscale'));
