ALTER TABLE public.video_carousel_projects
  ADD COLUMN IF NOT EXISTS template_type text NOT NULL DEFAULT 'quiz';--> statement-breakpoint

ALTER TABLE public.video_carousel_projects
  DROP CONSTRAINT IF EXISTS video_carousel_projects_template_type_check;--> statement-breakpoint

ALTER TABLE public.video_carousel_projects
  ADD CONSTRAINT video_carousel_projects_template_type_check
    CHECK (template_type IN ('quiz', 'quote'));--> statement-breakpoint

ALTER TABLE public.video_carousel_slides
  DROP CONSTRAINT IF EXISTS video_carousel_slides_layout_type_check;--> statement-breakpoint

ALTER TABLE public.video_carousel_slides
  ADD CONSTRAINT video_carousel_slides_layout_type_check
    CHECK (layout_type IN ('standard', 'quiz', 'quote'));
