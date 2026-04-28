ALTER TABLE carousel_slides
ADD COLUMN IF NOT EXISTS history_json jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Drop range check on position so reorder endpoint can use temp negative values during two-phase swap
ALTER TABLE carousel_slides DROP CONSTRAINT IF EXISTS carousel_slides_position_check;
