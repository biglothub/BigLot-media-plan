CREATE TABLE "idea_backlog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"url" text NOT NULL,
	"platform" text NOT NULL,
	"title" text,
	"description" text,
	"author_name" text,
	"thumbnail_url" text,
	"published_at" timestamp with time zone,
	"view_count" bigint,
	"like_count" bigint,
	"comment_count" bigint,
	"share_count" bigint,
	"save_count" bigint,
	"notes" text,
	"status" text DEFAULT 'new' NOT NULL,
	"engagement_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idea_backlog_platform_check" CHECK ("idea_backlog"."platform" in ('youtube', 'facebook', 'instagram', 'tiktok'))
);
--> statement-breakpoint
CREATE INDEX "idx_idea_backlog_created_at" ON "idea_backlog" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_idea_backlog_platform" ON "idea_backlog" USING btree ("platform");