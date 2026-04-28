ALTER TABLE public.video_carousel_slides
  ADD COLUMN IF NOT EXISTS layout_type text NOT NULL DEFAULT 'standard'
    CHECK (layout_type IN ('standard', 'quiz')),
  ADD COLUMN IF NOT EXISTS accent_text text,
  ADD COLUMN IF NOT EXISTS options_json jsonb;
