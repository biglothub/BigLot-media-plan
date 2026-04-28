ALTER TABLE public.video_carousel_projects ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "public_read_video_carousel_projects"
  ON public.video_carousel_projects AS PERMISSIVE FOR SELECT TO public USING (true);--> statement-breakpoint

CREATE POLICY "public_insert_video_carousel_projects"
  ON public.video_carousel_projects AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);--> statement-breakpoint

CREATE POLICY "public_update_video_carousel_projects"
  ON public.video_carousel_projects AS PERMISSIVE FOR UPDATE TO public USING (true) WITH CHECK (true);--> statement-breakpoint

CREATE POLICY "public_delete_video_carousel_projects"
  ON public.video_carousel_projects AS PERMISSIVE FOR DELETE TO public USING (true);--> statement-breakpoint

ALTER TABLE public.video_carousel_slides ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "public_read_video_carousel_slides"
  ON public.video_carousel_slides AS PERMISSIVE FOR SELECT TO public USING (true);--> statement-breakpoint

CREATE POLICY "public_insert_video_carousel_slides"
  ON public.video_carousel_slides AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);--> statement-breakpoint

CREATE POLICY "public_update_video_carousel_slides"
  ON public.video_carousel_slides AS PERMISSIVE FOR UPDATE TO public USING (true) WITH CHECK (true);--> statement-breakpoint

CREATE POLICY "public_delete_video_carousel_slides"
  ON public.video_carousel_slides AS PERMISSIVE FOR DELETE TO public USING (true);
