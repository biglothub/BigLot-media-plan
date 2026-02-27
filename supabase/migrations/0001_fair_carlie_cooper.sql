ALTER TABLE "idea_backlog" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "public_read_backlog" ON "idea_backlog" AS PERMISSIVE FOR SELECT TO public USING (true);--> statement-breakpoint
CREATE POLICY "public_insert_backlog" ON "idea_backlog" AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "public_update_backlog" ON "idea_backlog" AS PERMISSIVE FOR UPDATE TO public USING (true) WITH CHECK (true);