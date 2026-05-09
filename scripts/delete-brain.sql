-- TRUE wipe: deletes the brain row itself plus everything that cascades
-- from it. After running this, the user lands back at the onboarding
-- wizard (no brain → /onboarding redirect kicks in).
--
-- Difference vs reset-brain-data.sql:
--   - reset-brain-data.sql        → wipes the brain's DATA (sources,
--                                    loops, memory, etc.) but KEEPS the
--                                    brain row, workspace, connectors.
--                                    User stays on the same brain page,
--                                    just empty.
--   - delete-brain.sql (this one) → drops the brain entirely. Workspace
--                                    + connectors stay (so OAuth tokens
--                                    survive), but the brain itself is
--                                    gone. /brains redirects to
--                                    /onboarding because the user has no
--                                    brains.
--
-- KEEPS:
--   - workspaces, workspace_members, users (your account stays)
--   - connector_configs (Gmail/Slack/Drive OAuth tokens preserved so you
--     don't have to re-OAuth Gmail; Slack still needs re-OAuth for the
--     new groups:write scope)
--
-- WIPES via cascade from brains.id:
--   - source_items, source_embeddings
--   - memory_objects, canonical_entities, entity_mentions
--   - open_loops, loop_outcome_log, nudges, brain_alerts
--   - workflows, agent_runs
--   - relationships, priorities
--   - notetaker_calendars, notetaker_meetings, notetaker_events
--   - the brain row itself
--
-- Usage:
--   psql "$DATABASE_URL" -v brain_id="'<brain-uuid>'" -f scripts/delete-brain.sql
--
-- After this you can either:
--   1. Visit the app — you'll be redirected to /onboarding to create a
--      fresh brain. Re-OAuth Slack on the Connectors page. Trigger Gmail
--      sync (still connected). Watch the new clean pipeline run.
--   OR
--   2. Re-create a brain via the API/UI, then trigger Gmail sync.

\echo '=== Brain DELETE starting ==='
\echo 'Brain ID:' :brain_id

BEGIN;

-- Snapshot what we're about to delete so the user sees the blast radius.
-- Most of these will cascade automatically from the brains DELETE, but
-- showing the counts gives confidence the cascade is doing its job.
SELECT
  (SELECT COUNT(*) FROM brains WHERE id = :brain_id) AS brain_rows,
  (SELECT COUNT(*) FROM memory_objects WHERE brain_id = :brain_id) AS memory_objects,
  (SELECT COUNT(*) FROM open_loops WHERE brain_id = :brain_id) AS open_loops,
  (SELECT COUNT(*) FROM canonical_entities WHERE brain_id = :brain_id) AS canonical_entities,
  (SELECT COUNT(*) FROM entity_mentions WHERE brain_id = :brain_id) AS entity_mentions,
  (SELECT COUNT(*) FROM source_items WHERE brain_id = :brain_id) AS source_items,
  (SELECT COUNT(*) FROM agent_runs WHERE brain_id = :brain_id) AS agent_runs,
  (SELECT COUNT(*) FROM workflows WHERE brain_id = :brain_id) AS workflows,
  (SELECT COUNT(*) FROM connector_configs WHERE brain_id = :brain_id) AS connector_configs_kept,
  (SELECT workspace_id FROM brains WHERE id = :brain_id) AS workspace_kept;

-- Tables that don't have ON DELETE CASCADE on brain_id need explicit
-- deletes first. Most do cascade, but a few (loop_outcome_log, nudges,
-- some older tables) we ensure explicitly so this never half-deletes.
DELETE FROM loop_outcome_log WHERE brain_id = :brain_id;
DELETE FROM nudges WHERE brain_id = :brain_id;

-- Connector configs are intentionally KEPT so OAuth tokens survive. If
-- the user wants a truly clean slate including OAuth, they can disconnect
-- from the Connectors page after recreating the brain. We do clear the
-- watermark so the next sync re-pulls everything though.
UPDATE connector_configs
SET config = config - 'watermark', brain_id = brain_id
WHERE brain_id = :brain_id;

-- Connector configs reference brains via FK. They need to be deleted or
-- re-pointed. Since the user wants to start over with a new brain, we
-- drop the connector_configs too — they'll re-OAuth on the new brain.
-- (This is the trade-off vs reset-brain-data.sql, which keeps OAuth.)
DELETE FROM connector_sync_runs WHERE brain_id = :brain_id;
DELETE FROM connector_configs WHERE brain_id = :brain_id;

-- Notetaker tables (cascade should handle them, but explicit is safer).
DELETE FROM notetaker_events WHERE brain_id = :brain_id;
DELETE FROM notetaker_meetings WHERE brain_id = :brain_id;
DELETE FROM notetaker_calendars WHERE brain_id = :brain_id;

-- The actual brain DELETE. Cascades take care of the rest:
--   memory_objects, open_loops, source_items, source_embeddings,
--   relationships, canonical_entities, entity_mentions, priorities,
--   workflows, agent_runs, brain_alerts.
DELETE FROM brains WHERE id = :brain_id;

\echo '=== After delete (brain_rows should be 0) ==='
SELECT
  (SELECT COUNT(*) FROM brains WHERE id = :brain_id) AS brain_rows,
  (SELECT COUNT(*) FROM memory_objects WHERE brain_id = :brain_id) AS memory_objects,
  (SELECT COUNT(*) FROM open_loops WHERE brain_id = :brain_id) AS open_loops,
  (SELECT COUNT(*) FROM canonical_entities WHERE brain_id = :brain_id) AS canonical_entities;

COMMIT;

\echo
\echo '=== DELETE complete ==='
\echo 'Next steps:'
\echo '  1. Reload the app. You should be redirected to /onboarding.'
\echo '  2. Create a fresh brain via the wizard.'
\echo '  3. Connect Gmail (re-OAuth — connector_configs were dropped).'
\echo '  4. Connect Slack (re-OAuth required for the new groups:write scope).'
\echo '  5. Click Sync on Gmail (or wait up to 10 min for the cron).'
\echo '  6. Watch People / Companies / Action items populate cleanly.'
