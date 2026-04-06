ALTER TABLE public.carousel_projects
ADD COLUMN IF NOT EXISTS font_preset text NOT NULL DEFAULT 'biglot'
  CHECK (font_preset IN ('biglot', 'apple_clean', 'mitr_friendly', 'ibm_plex_thai', 'editorial_serif'));
