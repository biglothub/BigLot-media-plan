-- video_carousel_projects: top-level project record
CREATE TABLE IF NOT EXISTS public.video_carousel_projects (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  status      text NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'composing', 'ready', 'exported')),
  font_preset text NOT NULL DEFAULT 'biglot',
  aspect_ratio text NOT NULL DEFAULT '9:16',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

-- video_carousel_slides: one row per clip
CREATE TABLE IF NOT EXISTS public.video_carousel_slides (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id          uuid NOT NULL
                        REFERENCES public.video_carousel_projects (id)
                        ON DELETE CASCADE,
  position            integer NOT NULL,
  text                text NOT NULL DEFAULT '',
  subtext             text,
  text_position       text NOT NULL DEFAULT 'center'
                        CHECK (text_position IN ('top', 'center', 'bottom')),
  pexels_video_id     bigint,
  video_url           text,
  thumbnail_url       text,
  duration_seconds    integer NOT NULL DEFAULT 10,
  search_query        text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_video_carousel_slides_project
  ON public.video_carousel_slides (project_id, position);--> statement-breakpoint

CREATE OR REPLACE FUNCTION update_video_carousel_project_timestamp()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.video_carousel_projects
  SET updated_at = now()
  WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.project_id ELSE NEW.project_id END;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint

DROP TRIGGER IF EXISTS trg_video_carousel_slides_touch_project
  ON public.video_carousel_slides;--> statement-breakpoint

CREATE TRIGGER trg_video_carousel_slides_touch_project
  AFTER INSERT OR UPDATE OR DELETE ON public.video_carousel_slides
  FOR EACH ROW EXECUTE FUNCTION update_video_carousel_project_timestamp();
