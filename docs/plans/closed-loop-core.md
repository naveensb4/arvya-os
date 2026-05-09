# Plan: Closed-Loop Core (Strategy B)

Date: 2026-05-09
Branch: os-redesign
Mode: SELECTIVE EXPANSION (CEO review)
Status: ACTIVE

## The bet

Arvya is not an inbox. It's an operating system. Today the brain reads things and forgets to do anything about them. After this build the brain *acts*: dedupes people on its own, closes loops on its own when evidence shows up, nudges PB and Naveen on Slack before things drop.

This delivers MVP requirement #13 from VISION.md ("Close loops with outcomes, learn from the outcome, and update memory") which is the closed-loop thesis.

## Why not just tighten the prompt

The current architecture has three structural gaps that no prompt change fixes:

1. **Dedup is string-only.** `canonicalMemoryName()` in `apps/web/lib/brain/memory-quality.ts:17` lowercases and strips Inc/LLC. "Sudi" and "Sudi Mariappa" produce different keys forever. The LLM doesn't know what's already in the DB so it can't write a single canonical name.
2. **No closed-loop matcher.** When an email arrives saying "thanks for the deck", nothing in the codebase asks "did this resolve any open loop?" `runClosedLoopAlignmentMonitor` only detects *missing* outcomes, not *new* ones.
3. **No notifier.** `runOpenLoopMonitor` writes brain_alerts post-overdue but doesn't post to Slack, doesn't email, doesn't surface in any UI banner. PB never finds out a loop is dropping until he opens the dashboard.

These are architectural pieces, not prompt revisions.

## Decisions locked in

| # | Decision | Choice |
|---|---|---|
| 1 | Strategic approach | B — closed-loop core (not A polish, not C cathedral) |
| 2 | Slack target | Auto-create private `#arvya-brain`, invite PB + Naveen |
| 3 | Retroactive matcher | Dry-run first → human approves → apply |
| 4 | Old runOpenLoopMonitor | Kill in week 4, replace with new nudger |

Two C-hooks embedded inside B at near-zero cost:
- Persist entity embeddings (enables future graph UI in C)
- `loop_outcome_log` table (enables future voice/pattern learning in C)

## Cost profile (sanity check)

Total LLM spend ~$0.50–$1/week at Arvya's scale. Retroactive run is one-time $0.50–$2. Cost is rounding error. Engineering hours are the constraint.

Cost-aware design baked in:
- Haiku 4.5 for entity resolution and pre-filter passes
- Sonnet 4.6 only for closed-loop matcher (accuracy critical)
- Vector + lexical retrieval before any LLM call
- Email-domain exact match → auto-link, skip LLM
- Single batched LLM call per source (not N calls per candidate)
- Embedding cache, re-embed only when entity changes

## What schema we already have (audited 2026-05-09)

Before I started, I assumed we'd need new tables for entity tracking. Audit shows we have most of it:

| Table | Status | Notes |
|---|---|---|
| `canonical_entities` | exists, 54 rows | populated by an old regex pipeline, contents are mostly junk ("Hi Sumit", "GMT", etc.). Wipe + repopulate via the new resolver. |
| `entity_mentions` | exists, 128 rows | same — wipe and repopulate. Schema is correct (mention_text, context_snippet, memory_object_id, source_item_id, canonical_entity_id). Plays the role I'd called `memory_object_aliases`. |
| `memory_objects.embedding` | column exists, **0 rows populated** | vector(1536) with HNSW index already in place. We just need to start writing to it. |
| `memory_objects.canonical_entity_id` | FK exists, mostly NULL | the resolver will set this on every save. |
| `relationships` | exists | populated only by regex today. Resolver will populate from LLM-emitted typed edges. |
| `nudges` | exists | generic table with `nudgeType`, `relatedOpenLoopId`, `deliveryChannels`, `acknowledgedAt`. The deadline nudger writes here. **Don't make a new `loop_nudges` table.** |
| `notifications` / `notification_preferences` | exist | for future Slack/email delivery preferences per user. |
| `pending_actions`, `skills`, `skill_executions` | exist | future agent automation surface, untouched in B. |

**One brand-new table is genuinely needed: `loop_outcome_log`.** Audit trail for the closed-loop matcher's decisions. Distinct from `nudges` (which is "what we sent the user") and from `agent_runs` (which is "what the model called").

**Two cleanup migrations:**
- Truncate `canonical_entities` and `entity_mentions` for affected brains as part of the reset script. The existing data was generated from the broken regex pipeline.
- Repopulate via the new resolver as part of the retroactive run in week 4.

## How the knowledge graph gets populated (the decision tree)

User asked the right question: when a name comes in that's similar to one we already have, do we check the graph FIRST? Yes. Here's the explicit flow.

```
NEW ENTITY EXTRACTED
  e.g. {name: "Sudi", email: "sudi@gmail.com", role: "founder", company: "AllDay"}
        │
        ▼
┌────────────────────────────────────────────────┐
│ STEP 1 — exact key fast path                   │
│  (deterministic, no LLM, no embedding)         │
│                                                │
│  a) email match?                               │
│     SELECT * FROM canonical_entities           │
│     WHERE properties->>'email' = 'sudi@...'    │
│     AND brain_id = $brain                      │
│                                                │
│  b) verified-alias match?                      │
│     SELECT * FROM canonical_entities           │
│     WHERE 'Sudi' = ANY(aliases)                │
│     AND entity_type = 'person'                 │
└────────────────────────────────────────────────┘
        │
        ├─ HIT → MERGE path (skip step 2-3)
        └─ MISS
                │
                ▼
┌────────────────────────────────────────────────┐
│ STEP 2 — vector similarity                     │
│  (embed once with text-embedding-3-small)      │
│                                                │
│  query = embed(name + email + role + company)  │
│  SELECT id, canonical_name, properties         │
│  FROM canonical_entities                       │
│  WHERE brain_id = $brain                       │
│    AND entity_type = 'person'                  │
│  ORDER BY embedding <-> query                  │
│  LIMIT 5                                       │
└────────────────────────────────────────────────┘
        │
        ▼
┌────────────────────────────────────────────────┐
│ STEP 3 — Haiku reconciliation                  │
│  (one short structured call, ~$0.0001)         │
│                                                │
│  prompt: "Is this newly extracted person the   │
│  same as any of these existing entities?       │
│  [new] vs [candidate 1, 2, 3, 4, 5]            │
│  Return {match_id | null, confidence, reason}" │
└────────────────────────────────────────────────┘
        │
        ├─ match_id, conf ≥ 0.85 → MERGE
        ├─ match_id, conf 0.5–0.85 → MERGE + flag for review
        ├─ null, top cosine < 0.7 → CREATE NEW canonical
        └─ null, top cosine 0.7–0.85 → CREATE NEW + add review queue entry
                │
                ▼
┌────────────────────────────────────────────────┐
│ MERGE path                                     │
│                                                │
│  UPDATE canonical_entities                     │
│  SET                                           │
│    aliases = aliases ∪ {"Sudi"}                │
│    properties.email = COALESCE(...,            │
│      'sudi@gmail.com')                         │
│    properties.evidence = append({source, quote})│
│    properties.last_seen_at = now()             │
│    properties.mention_count += 1               │
│    embedding = re-embed if name/email changed  │
│                                                │
│  INSERT INTO entity_mentions                   │
│    (canonical_entity_id, memory_object_id,     │
│     mention_text, context_snippet, source_id)  │
│                                                │
│  INSERT INTO relationships from LLM-emitted    │
│  typed edges (works_at, attended, sent_to, ...) │
│                                                │
│  UPDATE memory_objects                         │
│  SET canonical_entity_id = $canonical          │
└────────────────────────────────────────────────┘
        OR
┌────────────────────────────────────────────────┐
│ CREATE NEW path                                │
│                                                │
│  INSERT INTO canonical_entities                │
│  (brain_id, entity_type, canonical_name,       │
│   aliases=['Sudi'], properties={email,role,..} │
│   merged_from=[], confidence=0.85)             │
│                                                │
│  Embed and store immediately.                  │
│  Then INSERT entity_mentions row.              │
│  INSERT memory_objects row WITH                │
│  canonical_entity_id set on creation           │
└────────────────────────────────────────────────┘
```

**What gets written to the knowledge graph on every extraction:**

1. `canonical_entities` — one row per unique person/company. Updated in place with new aliases, evidence, embedding.
2. `entity_mentions` — one row per *mention* in a source. So if "Sudi" shows up in 5 emails, there are 5 rows here, all pointing to the same `canonical_entity_id`.
3. `memory_objects` — the raw extraction stays here, but with `canonical_entity_id` set so we can join.
4. `relationships` — typed edges from the LLM (`works_at`, `attended`, `sent_to`, `mentioned_in`, `reports_to`, `customer_of`, `investor_in`, `advisor_to`). This is what makes the graph navigable later.
5. `loop_outcome_log` — only on outcome detection, not on entity resolution.

**Voice/pattern learning data flow (the C-hook for cheap):**

After 50+ resolutions, the per-brain alias map (`Sudi` → `Sudi Mariappa`, `PB` → `Prashanth Babu`) is queryable from `canonical_entities.aliases`. We can feed this back into the source-ingestion prompt as a one-liner: "This brain's known aliases: PB=Prashanth Babu, Naveen=Naveen Siva, …". The brain learns *your voice* from accumulated usage.

That's a future C-week addition, but the data is there from day 1 of B because we're using the existing `aliases` column properly.

## The four layers of "identify, learn, remember"

Today: layer 1 only. After this build: all four.

1. **Extract** — LLM reads source, emits person/company blob. (We already have this after today's earlier ship.)
2. **Resolve** — vector retrieval → top-5 candidates → Haiku reconciliation → merge or create. Handles "Sudi" = "Sudi Mariappa" = "Sudi Mariappa <sudi@gmail.com>".
3. **Enrich** — on every resolution, append aliases, upgrade unverified to verified email when seen in headers, append role/company evidence, increment mentionCount, populate typed relationships into `relationships` table.
4. **Voice/pattern learning** — `entity_aliases` log records every canonical-pick. After enough confirmations, feed canonical preference back into the extraction prompt as context. The brain learns *PB's* voice, not generic.

## Implementation: 4 weeks

### Week 1 — Entity Resolver

**Goal:** No more "Sudi" + "Sudi Mariappa" + "Hi Sudi" duplicates. People page becomes a real contact graph. Every extraction checks the knowledge graph BEFORE adding (see decision tree above).

Files:
- New: `packages/agents/src/entity-resolver-agent.ts` — the resolver (vector retrieval + Haiku reconciliation).
- New: `apps/web/lib/brain/entity-resolver.ts` — adapter that pulls from `canonical_entities`, embeds, calls the agent, writes back.
- Modify: `apps/web/lib/brain/memory-quality.ts` — `mergeMemoryObjectsForIngestion()` calls the resolver per person/company before its current canonical-key dedup. Canonical-key dedup stays as a fast path.
- Modify: `packages/prompts/src/source-ingestion.ts` — already updated this morning to ask for email/role/company. Add explicit ask for typed relationship edges (works_at, attended, sent_email_to, etc.) so we populate `relationships` properly.
- Modify: `apps/web/lib/db/repository.ts` + `supabase-repository.ts` — add CRUD for canonical_entities, entity_mentions.
- Modify: `scripts/reset-brain-data.sql` — also wipe canonical_entities + entity_mentions.

**Schema:** zero migrations. Tables already exist. Just start using them.

Algorithm (the explicit decision tree):

1. **Step 1 (deterministic, no LLM):**
   - Email exact match: `SELECT * FROM canonical_entities WHERE properties->>'email' = $email AND brain_id = $brain`
   - Verified-alias match: `WHERE $name = ANY(aliases) AND entity_type = $type`
   - If hit, MERGE path. Done. Cost: $0.
2. **Step 2 (vector retrieval, single embedding call):**
   - `embed("$name · $email · $role · $company")` using text-embedding-3-small.
   - Cosine search on `canonical_entities.embedding` (column we'll add to canonical_entities — yes, this IS one schema add I missed; updating). Top 5.
   - If top cosine < 0.7: skip step 3, CREATE NEW.
   - If top cosine ≥ 0.92: skip step 3, MERGE into top-1 (high confidence, no LLM needed).
   - Otherwise: step 3.
3. **Step 3 (Haiku reconciliation):**
   - Prompt with new extraction + top-3 candidates (name + last 3 evidence quotes from each).
   - Structured output: `{match_id, confidence, reason}`.
   - If `match_id` and conf ≥ 0.85: MERGE into match_id.
   - If `match_id` and conf 0.5–0.85: MERGE + flag for review.
   - Else: CREATE NEW.
4. **MERGE path writes:**
   - `UPDATE canonical_entities SET aliases = aliases ∪ [$name], properties.evidence ||= ..., properties.last_seen_at = now(), properties.mention_count += 1, embedding = re-embed if name/email changed`
   - `INSERT INTO entity_mentions (canonical_entity_id, memory_object_id, source_item_id, mention_text, context_snippet, mentioned_at)`
   - `INSERT INTO relationships` from any LLM-emitted typed edges
   - `UPDATE memory_objects SET canonical_entity_id = $canonical`
5. **CREATE NEW path writes:**
   - `INSERT INTO canonical_entities (...)` with embedding
   - Then steps 4b–4d above

**Schema correction:** `canonical_entities` doesn't currently have an `embedding` column. That IS a schema add. Updating the migration plan.

Demo: Ingest a transcript mentioning "Sudi" + an email from "Sudi Mariappa <sudi@xyz.com>". Result: ONE canonical entity. `aliases = ['Sudi', 'Sudi Mariappa']`. `properties.email = 'sudi@xyz.com'`. Two `entity_mentions` rows linked to it. Two `memory_objects` rows both pointing to the same `canonical_entity_id`.

Specifically also: company resolution with domain matching. `arvya.ai` (domain) and "Arvya AI" and "Arvya" all canonicalize because the resolver also checks `properties->>'domain' = 'arvya.ai'` as a Step 1 fast path for entity_type = 'company'.

### Week 2 — Closed-Loop Matcher

**Goal:** Brain auto-closes loops when later sources show resolution. The killer feature.

Files:
- New: `packages/agents/src/outcome-detector-agent.ts`
- Modify: `apps/web/lib/workflows/source-ingestion.ts` — call matcher after `mergeRelationshipsForIngestion`
- New migration: `loop_outcome_log` table
- New UI: loop history view on the open-loop detail page showing source → commitment → nudge → resolution → outcome chain

Algorithm (per ingested source):
1. Fetch active open_loops for this brain (status: open / in_progress / needs_review)
2. **Pre-filter** by participant overlap: if loop owner / mentioned person isn't in this source's participants, skip it. Cuts candidate set ~5x.
3. Single Sonnet 4.6 call with the source content + filtered candidates:
   ```
   Schema: [{loopId, decision: 'closed'|'advanced'|'contradicts'|'no_match',
            evidence_quote, confidence}]
   ```
4. For each `closed` with confidence ≥ 0.85: update loop status to `closed`, write outcome memory with `properties.memory_source = "open_loop_outcome"`, link source as evidence
5. For `closed` with 0.5–0.85: queue for nudger (send Slack confirmation prompt with inline buttons)
6. For `advanced`: update loop's `properties.lastEvidenceAt`, append note
7. For `contradicts`: open a drift signal
8. Always: write a row to `loop_outcome_log` (audit trail + future training data)

Demo: Email "thanks for the deck" comes in. Matcher reads it, sees an active "Send Sumit deck" loop with Sumit in participants, returns `closed` with quote `"thanks for the deck"`. Loop closes automatically. Daily brief: "1 loop closed via inbound email."

### Week 3 — Smart Nudger

**Goal:** PB and Naveen find out about deadlines BEFORE they slip. From Slack, not from a dashboard they have to remember to open.

Files:
- New: `apps/web/lib/inngest/functions/deadline-nudger.ts`
- New: `apps/web/lib/slack-bot/nudge.ts` (post + interactive buttons)
- New: `apps/web/lib/slack-bot/channel-bootstrap.ts` (auto-create `#arvya-brain`)
- New API routes: `/api/loops/[id]/snooze`, `/api/loops/[id]/close-via-slack`, `/api/slack/interactions`
- Schema additions:
  ```
  open_loops.properties.lastNudgedAt timestamp
  loop_nudges (new):
    id, loop_id, kind, sent_at, channel, slack_ts, status, action_taken
  ```

Slack scope upgrade:
- Add `groups:write` to existing scopes (`app_mentions:read, channels:history, channels:read, chat:write, im:history, im:write, users:read`)
- One-time re-OAuth required — surface this in the connectors UI

Channel bootstrap (one-time per brain):
1. Try `conversations.create` with `name: 'arvya-brain'`, `is_private: true`
2. If success: invite PB + Naveen via `conversations.invite`
3. If `name_taken`: look up via `conversations.list` (already used in slack-bot lib), use that channel_id
4. Cache `channel_id` in brain.metadata

Three nudge types, all post to `#arvya-brain`:

| Kind | Trigger | Cadence | Throttle |
|---|---|---|---|
| Pre-deadline | `due_date` in next 24h, status open/in_progress | hourly cron | 1 per loop per day |
| Stale | No source-evidence in 5+ days, not closed | daily 9am cron | 1 per loop per week |
| Outcome-uncertain | Matcher returned confidence 0.5–0.85 | reactive | 1 per match |

Block Kit format (interactive buttons): "Mark done" / "Snooze 3 days" / "Open in Arvya". Button presses hit the API and update the loop.

Bundling: if more than 5 nudges fire in one hour, post a single digest message instead of 5 separate ones.

Demo: 9am Slack posts "3 loops due today, 2 stale (no movement in a week)." Click snooze on one. Loop's `due_date` updates. Click "Mark done." Loop closes. The brain feels alive.

### Week 4 — Retroactive run + polish + demo

**Retroactive matcher run:**
1. Add a `/api/brains/[brainId]/retroactive-match` admin endpoint
2. Iterate all 14 source items × 131 active loops with the pre-filter
3. Output: review queue UI showing each "I think this loop closed because of this source" with the evidence quote
4. User clicks "approve all" / per-row approve / reject
5. Approved: apply (close the loops, write outcome memories, log to `loop_outcome_log`)

**Loop history view** (`/brains/[id]/open-loops/[loopId]`):
- Source → commitment → nudge → resolution → outcome chain visualized
- Time-ordered evidence timeline
- "Re-open" button if customer wants to undo

**Daily brief integration:**
- "This week the brain closed 12 loops on its own"
- "Top 3 closures with highest learning value"
- Outcome memories surfaced as a separate "what we learned" section

**Kill the old `runOpenLoopMonitor`:**
- Audit `brain_alerts` reads first to confirm no UI breaks
- Delete the inngest function, the runtime function, mark `alertType=overdue_open_loop` as legacy in docs
- Migrate any remaining alerts into the new nudge flow

**Voice learning seed:** start writing to `entity_aliases` log on every resolution. Don't yet feed back into prompts (that's C). But the data starts accumulating week 1, so by quarter end we have enough signal to make C trivial.

## Schema changes summary (final, after audit)

**Existing tables we'll start using properly (no schema change):**
- `canonical_entities` — already has `aliases text[]`, `properties jsonb`, `merged_from uuid[]`, `confidence`. Wipe legacy + repopulate via resolver.
- `entity_mentions` — already correct shape. Plays the role I'd called `memory_object_aliases`. Wipe legacy + repopulate.
- `memory_objects.embedding` — column exists with HNSW index, just start writing to it.
- `memory_objects.canonical_entity_id` — FK exists, resolver sets it on every save.
- `relationships` — populate from LLM-emitted typed edges instead of just regex.
- `nudges` — generic table. Reuse for `nudge_type` in {`pre_deadline`, `stale`, `outcome_uncertain`, `digest`}. No new `loop_nudges` table.

**Two schema additions in `supabase/migrations/0017_closed_loop_core.sql`:**

1. `canonical_entities.embedding vector(1536)` with HNSW cosine index. Required so the resolver can vector-retrieve top-N candidates before deciding merge vs create. (`memory_objects.embedding` exists for source-side retrieval; `canonical_entities.embedding` is the new entity-side one.)

2. `loop_outcome_log` table — audit trail for the closed-loop matcher.
```sql
CREATE TYPE loop_outcome_decision AS ENUM ('closed','advanced','contradicts','no_match','uncertain');
CREATE TABLE loop_outcome_log (
  id, brain_id, loop_id, source_item_id, decision, confidence,
  evidence_quote, agent_run_id, decided_at, human_overrode,
  human_override_at, properties
);
```
Distinct from `nudges` ("what we sent the user") and `agent_runs` ("what the model call did at a step level"). This is the audit of every closed-loop *decision* — also future training data for voice-tuned matching in C.

**Reset script update:** `scripts/reset-brain-data.sql` from earlier today must also wipe `canonical_entities` and `entity_mentions` for the brain (they have 54+128 rows of regex-extraction junk that would corrupt the resolver's vector retrieval).

**No migrations needed for these (using jsonb):**
- `open_loops.properties.lastNudgedAt`, `properties.lastEvidenceAt` — stashed in existing jsonb.
- `brains.metadata.slack_arvya_brain_channel_id` — cached in existing jsonb.
- Drizzle schema — only need to add `embedding` to the `canonicalEntities` definition and a new `loopOutcomeLog` table.

## Demo at end of week 4

The 5-step Sumit demo running end-to-end on real data:

1. PB sends email "Following up — sending the deck Friday" → brain ingests, creates "Send deck to Sumit" loop with `due_date = Friday`
2. Wednesday 9am: Slack post in `#arvya-brain`: "Heads up: 'Send deck to Sumit' due in 2 days. [Mark done] [Snooze]"
3. PB sends the deck via Gmail. Outbound email ingested. Matcher detects the closure. Loop status → `closed`, outcome memory written: "Deck sent Friday 5/29 to Sumit Roy."
4. Sumit replies "thanks, will review by Wed." Brain ingests. Creates new "Awaiting Sumit's review" loop with `due_date = next Wed`.
5. Saturday daily brief: "This week we closed 12 loops. Top open: Sumit's review (due Thu). 2 product insights from this thread."

That's the demo that converts customer #1 into reference customer for customer #2.

## What's NOT in scope (deferred)

These were considered and explicitly cut from B. They go to TODOS or wait for Strategy C.

- Spec/issue generation agent (product insight → GitHub issue draft) — vision First Workflows §7
- Knowledge graph traversal UI (interactive entity navigator) — schema is ready, UI is not
- Calendar context inside extraction (attendee history piped to prompt)
- Slack thread ingestion as sources (lib exists, not wired)
- Daily founder brief as proactive Slack DM (currently a webpage)
- Outcome learning that updates the *next* extraction prompt with PB's voice
- Multi-brain (Arvya Company Brain + future Deal Brain) workspace switching
- Mobile app
- Public-facing API

## Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Matcher mis-closes a real open loop | Med | Confidence threshold ≥ 0.85 for auto-close, 0.5–0.85 prompts human, retroactive run is dry-run only |
| Slack rate limits on nudge bursts | Low | Bundling >5 nudges/hour into a digest |
| pgvector migration fails on prod | Med | Test on staging brain first, have rollback SQL ready |
| Entity resolver merges two distinct people | Med | Confidence threshold ≥ 0.7 to merge, manual review queue for 0.5–0.7 |
| Customer doesn't trust auto-close | Low | Every auto-close shows the evidence quote, "Re-open" button always available |
| LLM cost spikes if traffic 10x's | Low | Cost ceiling: $10/week per brain. Alert if exceeded. |

## Success metrics (week 4 retro)

- People page: 0 obvious duplicates (today: ~30 of 65 are dupes)
- Open loops auto-closed via matcher: target ≥10 closures from retroactive run + ≥5 from new traffic
- Slack nudges acted on within 24h: target ≥60%
- Customer NPS / qualitative: "the brain feels alive now"
