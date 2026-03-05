-- Add CHECK constraint for production stages on production_calendar.status
-- Valid stages: planned, scripting, shooting, editing, published

-- First update any non-standard status values to 'planned'
UPDATE public.production_calendar
SET status = 'planned'
WHERE status NOT IN ('planned', 'scripting', 'shooting', 'editing', 'published');

-- Add CHECK constraint
ALTER TABLE public.production_calendar
  ADD CONSTRAINT chk_production_calendar_status
  CHECK (status IN ('planned', 'scripting', 'shooting', 'editing', 'published'));
