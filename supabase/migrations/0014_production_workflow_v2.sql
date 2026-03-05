-- Migration 0014: Production Workflow v2
-- เพิ่ม revision_count, approval_status, submitted_at
-- และ review stage ใน production_calendar

ALTER TABLE public.production_calendar
  ADD COLUMN IF NOT EXISTS revision_count  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS approval_status text    NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS submitted_at    timestamptz;--> statement-breakpoint

ALTER TABLE public.production_calendar
  ADD CONSTRAINT production_calendar_approval_status_check
    CHECK (approval_status IN ('draft', 'pending_review', 'approved', 'rejected'));--> statement-breakpoint

-- อัปเดต status check เพื่อรองรับ review stage
-- (ชื่อ constraint อาจต่างกันใน instance ของคุณ ลอง query pg_constraint ก่อนถ้า error)
ALTER TABLE public.production_calendar
  DROP CONSTRAINT IF EXISTS production_calendar_status_check;--> statement-breakpoint

ALTER TABLE public.production_calendar
  ADD CONSTRAINT production_calendar_status_check
    CHECK (status IN ('planned', 'scripting', 'shooting', 'editing', 'review', 'published'));--> statement-breakpoint
