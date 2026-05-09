-- Wipe all extracted memory + ingested sources for a single brain so
-- the user can re-onboard (or re-sync Gmail/Outlook) and watch the new
-- LLM-driven extraction populate clean data.
--
-- KEEPS: brains, workspaces, workspace_members, connector_configs (so
--   you don't lose your Gmail/Slack/Drive OAuth and have to reconnect).
-- WIPES: memory_objects, open_loops, relationships, source_embeddings,
--   source_items, agent_runs, workflows, brain_alerts. Also clears the
--   connector watermark so the next sync re-fetches every message in
--   the Arvya Brain label/folder.
--
-- Usage:
--   psql "$DATABASE_URL" -v brain_id="'<brain-uuid>'" -f scripts/reset-brain-data.sql
-- Or interactively:
--   psql "$DATABASE_URL"
--   \set brain_id '<brain-uuid>'
--   \i scripts/reset-brain-data.sql

\echo '=== Brain data reset starting ==='
\echo 'Brain ID:' :brain_id

BEGIN;

-- Snapshot what we're about to remove so the user sees the blast radius.
SELECT
  (SELECT COUNT(*) FROM memory_objects WHERE brain_id = :brain_id) AS memory_objects,
  (SELECT COUNT(*) FROM open_loops WHERE brain_id = :brain_id) AS open_loops,
  (SELECT COUNT(*) FROM relationships WHERE brain_id = :brain_id) AS relationships,
  (SELECT COUNT(*) FROM canonical_entities WHERE brain_id = :brain_id) AS canonical_entities,
  (SELECT COUNT(*) FROM entity_mentions WHERE brain_id = :brain_id) AS entity_mentions,
  (SELECT COUNT(*) FROM source_items WHERE brain_id = :brain_id) AS source_items,
  (SELECT COUNT(*) FROM agent_runs WHERE brain_id = :brain_id) AS agent_runs,
  (SELECT COUNT(*) FROM workflows WHERE brain_id = :brain_id) AS workflows;

-- Delete in dependency order. relationships → memory_objects (FK).
-- source_embeddings → source_items (FK). agent_runs/workflows reference
-- both source_items and brain. open_loops → source_items (set null on
-- delete) and → brain_id (cascade).
-- entity_mentions FK to canonical_entities (cascade) and memory_objects
-- (set null), so safest order: entity_mentions → canonical_entities last
-- among entity tables.
DELETE FROM entity_mentions WHERE brain_id = :brain_id;
DELETE FROM relationships WHERE brain_id = :brain_id;
DELETE FROM source_embeddings
  WHERE source_item_id IN (SELECT id FROM source_items WHERE brain_id = :brain_id);
-- loop_outcome_log FK cascades from open_loops, but explicit is safer.
DELETE FROM loop_outcome_log WHERE brain_id = :brain_id;
-- nudges may reference open_loops (set null on delete), wipe brain-scoped ones.
DELETE FROM nudges WHERE brain_id = :brain_id;
DELETE FROM agent_runs WHERE brain_id = :brain_id;
DELETE FROM workflows WHERE brain_id = :brain_id;
DELETE FROM brain_alerts WHERE brain_id = :brain_id;
DELETE FROM open_loops WHERE brain_id = :brain_id;
DELETE FROM memory_objects WHERE brain_id = :brain_id;
-- canonical_entities deleted last among the entity layer (memory_objects FK
-- to canonical_entities is set-null on delete, so safe).
DELETE FROM canonical_entities WHERE brain_id = :brain_id;
DELETE FROM source_items WHERE brain_id = :brain_id;

-- Clear connector watermark so the next sync pulls every message that
-- matches the configured label/folder again. Otherwise sync will only
-- fetch items newer than the saved watermark and you'll see almost
-- nothing on the next run.
UPDATE connector_configs
SET config = config - 'watermark'
WHERE brain_id = :brain_id;

-- Optional: also clear connector_sync_runs history. Comment out if you
-- want to preserve audit history.
DELETE FROM connector_sync_runs WHERE brain_id = :brain_id;

\echo '=== After reset (should all be 0) ==='
SELECT
  (SELECT COUNT(*) FROM memory_objects WHERE brain_id = :brain_id) AS memory_objects,
  (SELECT COUNT(*) FROM open_loops WHERE brain_id = :brain_id) AS open_loops,
  (SELECT COUNT(*) FROM relationships WHERE brain_id = :brain_id) AS relationships,
  (SELECT COUNT(*) FROM canonical_entities WHERE brain_id = :brain_id) AS canonical_entities,
  (SELECT COUNT(*) FROM entity_mentions WHERE brain_id = :brain_id) AS entity_mentions,
  (SELECT COUNT(*) FROM source_items WHERE brain_id = :brain_id) AS source_items;

COMMIT;

\echo '=== Reset complete. Next steps: ==='
\echo '1. Open the Connectors page and click Sync on Gmail (or wait for the cron).'
\echo '2. Watch the People / Companies / Action items pages populate with clean data.'
\echo '3. If something still looks dirty, check apps/web/.next/dev/logs/next-development.log for extraction errors.'
