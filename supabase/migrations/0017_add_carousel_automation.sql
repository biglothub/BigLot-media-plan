CREATE TABLE IF NOT EXISTS public.carousel_projects (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  backlog_id        uuid NOT NULL UNIQUE REFERENCES public.idea_backlog (id) ON DELETE CASCADE,
  platform          text NOT NULL DEFAULT 'instagram'
    CHECK (platform IN ('instagram')),
  status            text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'ready', 'exported', 'archived')),
  title             text,
  visual_direction  text,
  caption           text,
  hashtags_json     jsonb NOT NULL DEFAULT '[]'::jsonb,
  slide_count       integer NOT NULL DEFAULT 0,
  last_generated_at timestamptz,
  last_exported_at  timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_carousel_projects_updated_at
  ON public.carousel_projects (updated_at DESC);

ALTER TABLE public.carousel_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY public_read_carousel_projects
  ON public.carousel_projects FOR SELECT TO public USING (true);
CREATE POLICY public_insert_carousel_projects
  ON public.carousel_projects FOR INSERT TO public WITH CHECK (true);
CREATE POLICY public_update_carousel_projects
  ON public.carousel_projects FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY public_delete_carousel_projects
  ON public.carousel_projects FOR DELETE TO public USING (true);

CREATE TABLE IF NOT EXISTS public.carousel_slides (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id                  uuid NOT NULL REFERENCES public.carousel_projects (id) ON DELETE CASCADE,
  position                    integer NOT NULL CHECK (position >= 1 AND position <= 20),
  role                        text NOT NULL
    CHECK (role IN ('cover', 'body', 'cta')),
  layout_variant              text NOT NULL
    CHECK (layout_variant IN ('cover', 'content', 'cta')),
  headline                    text,
  body                        text,
  cta                         text,
  visual_brief                text,
  freepik_query               text,
  candidate_assets_json       jsonb NOT NULL DEFAULT '[]'::jsonb,
  selected_asset_json         jsonb,
  selected_asset_storage_path text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_carousel_slides_project_position
  ON public.carousel_slides (project_id, position);
CREATE INDEX IF NOT EXISTS idx_carousel_slides_project
  ON public.carousel_slides (project_id, position);

ALTER TABLE public.carousel_slides ENABLE ROW LEVEL SECURITY;

CREATE POLICY public_read_carousel_slides
  ON public.carousel_slides FOR SELECT TO public USING (true);
CREATE POLICY public_insert_carousel_slides
  ON public.carousel_slides FOR INSERT TO public WITH CHECK (true);
CREATE POLICY public_update_carousel_slides
  ON public.carousel_slides FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY public_delete_carousel_slides
  ON public.carousel_slides FOR DELETE TO public USING (true);

INSERT INTO storage.buckets (id, name, public)
VALUES ('carousel-assets', 'carousel-assets', true)
ON CONFLICT (id) DO NOTHING;
