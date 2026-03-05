from __future__ import annotations

import os


SUPABASE_URL: str = os.environ.get("PUBLIC_SUPABASE_URL", "")
SUPABASE_ANON_KEY: str = os.environ.get("PUBLIC_SUPABASE_ANON_KEY", "")
