ALTER TABLE "idea_backlog" ADD COLUMN "content_category" text DEFAULT NULL;--> statement-breakpoint
ALTER TABLE "idea_backlog" ADD CONSTRAINT "idea_backlog_content_category_check" CHECK ("idea_backlog"."content_category" IS NULL OR "idea_backlog"."content_category" IN ('hero', 'help', 'hub'));
