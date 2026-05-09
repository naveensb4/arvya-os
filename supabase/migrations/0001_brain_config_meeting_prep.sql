-- Meeting Prep Agent: brain-level settings
-- Settings are stored as keys in the existing brains.metadata jsonb column:
--   meeting_prep_enabled   (boolean, default false)
--   linkedin_enrichment_enabled (boolean, default false)
--   web_search_enabled     (boolean, default true)
--   timezone               (string, default "UTC")
--
-- No schema change needed — metadata column already exists.
-- This migration is a marker for the feature landing.
SELECT 1;
