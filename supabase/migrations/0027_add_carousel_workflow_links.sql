ALTER TABLE public.production_calendar
  ADD COLUMN IF NOT EXISTS carousel_project_id uuid,
  ADD COLUMN IF NOT EXISTS handoff_source text NOT NULL DEFAULT 'manual';--> statement-breakpoint

ALTER TABLE public.production_calendar
  DROP CONSTRAINT IF EXISTS production_calendar_handoff_source_check;--> statement-breakpoint

ALTER TABLE public.production_calendar
  ADD CONSTRAINT production_calendar_handoff_source_check
    CHECK (handoff_source IN ('manual', 'carousel_handoff'));--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'production_calendar_carousel_project_id_fk'
  ) THEN
    ALTER TABLE public.production_calendar
      ADD CONSTRAINT production_calendar_carousel_project_id_fk
        FOREIGN KEY (carousel_project_id)
        REFERENCES public.carousel_projects (id)
        ON DELETE SET NULL;
  END IF;
END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_production_calendar_carousel_project
  ON public.production_calendar (carousel_project_id);--> statement-breakpoint

UPDATE public.production_calendar cal
SET carousel_project_id = cp.id
FROM public.carousel_projects cp
WHERE cal.backlog_id = cp.backlog_id
  AND cal.carousel_project_id IS NULL;--> statement-breakpoint

ALTER TABLE public.carousel_projects
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS review_notes text,
  ADD COLUMN IF NOT EXISTS reviewed_by text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;--> statement-breakpoint

ALTER TABLE public.carousel_projects
  DROP CONSTRAINT IF EXISTS carousel_projects_review_status_check;--> statement-breakpoint

ALTER TABLE public.carousel_projects
  ADD CONSTRAINT carousel_projects_review_status_check
    CHECK (review_status IN ('draft', 'pending_review', 'approved', 'changes_requested'));--> statement-breakpoint

ALTER TABLE public.produced_videos
  ADD COLUMN IF NOT EXISTS carousel_project_id uuid,
  ADD COLUMN IF NOT EXISTS content_kind text NOT NULL DEFAULT 'video';--> statement-breakpoint

ALTER TABLE public.produced_videos
  DROP CONSTRAINT IF EXISTS produced_videos_content_kind_check;--> statement-breakpoint

ALTER TABLE public.produced_videos
  ADD CONSTRAINT produced_videos_content_kind_check
    CHECK (content_kind IN ('video', 'carousel', 'post'));--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'produced_videos_carousel_project_id_fk'
  ) THEN
    ALTER TABLE public.produced_videos
      ADD CONSTRAINT produced_videos_carousel_project_id_fk
        FOREIGN KEY (carousel_project_id)
        REFERENCES public.carousel_projects (id)
        ON DELETE SET NULL;
  END IF;
END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_produced_videos_carousel_project
  ON public.produced_videos (carousel_project_id);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS ux_produced_videos_carousel_project
  ON public.produced_videos (carousel_project_id)
  WHERE carousel_project_id IS NOT NULL;--> statement-breakpoint

UPDATE public.produced_videos pv
SET carousel_project_id = cal.carousel_project_id,
    content_kind = CASE
      WHEN cal.carousel_project_id IS NOT NULL THEN 'carousel'
      ELSE pv.content_kind
    END
FROM public.production_calendar cal
WHERE pv.calendar_id = cal.id
  AND (pv.carousel_project_id IS NULL OR pv.content_kind <> 'carousel');
