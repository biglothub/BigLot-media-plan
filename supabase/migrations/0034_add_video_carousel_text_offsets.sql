ALTER TABLE public.video_carousel_slides
  ADD COLUMN IF NOT EXISTS text_offset_x_px integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS text_offset_y_px integer NOT NULL DEFAULT 0;
