-- Migration 0015: Add is_own flag to monitoring_content
-- แยก channel ของเรา (is_own=true) vs channel อ้างอิง (is_own=false)

ALTER TABLE public.monitoring_content
  ADD COLUMN IF NOT EXISTS is_own boolean NOT NULL DEFAULT false;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS idx_monitoring_content_is_own
  ON public.monitoring_content (is_own) WHERE is_own = true;
