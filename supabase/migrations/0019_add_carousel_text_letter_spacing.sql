ALTER TABLE public.carousel_projects
ADD COLUMN IF NOT EXISTS text_letter_spacing_em numeric(5, 3) NOT NULL DEFAULT 0
  CHECK (text_letter_spacing_em >= -0.08 AND text_letter_spacing_em <= 0.24);
