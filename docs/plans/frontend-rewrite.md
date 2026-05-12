# Arvya OS — Backend + Frontend Overhaul Plan

## Context

We have two design prototypes exported from Claude Design:
- **Bundle 1**: `https://api.anthropic.com/v1/design/h/q0osMaIQXjDSjVbIf7QwAA?open_file=Dashboard.html` — 13 pages (Dashboard, Brief, Ask, OpenLoops, Sources, People, Companies, Graph, Drift, Agents, Connectors, Onboarding, index)
- **Bundle 2**: `https://api.anthropic.com/v1/design/h/4eBOk2THuh2sLt0jMKnk1A?open_file=People.html` — updated People (CRM table with AI columns, heat scores, "owe a reply" tracking) + new Company detail page (Marlowe Health — timeline, KPIs, action items, transcript viewer, right rail with contacts/fields/ledger)

The prototypes represent the target product: a Company Brain dashboard that surfaces meetings, action items, drift signals, live agent activity, source ingestion stats, entity profiles with behavioral models, and a Claude-style Ask Brain. Our backend has ~80% of the data and agents already built. The gap is primarily: 4 new tables, 3 new API endpoints, 2 new agents, nav restructure, and a full frontend rewrite.

**This plan covers the backend work first**, then the frontend rewrite that consumes it.

---

## Phase 0: Developer Setup (from DX review)

**Goal**: Any developer (including future hires) can go from `git clone` to running app in under 5 minutes.

### 0.1 Create `.env.example`
README references `.env.example` but the file doesn't exist. Create it with all required variables, grouped by service, with inline comments.

```
# — Database (required for Supabase mode, skip for in-memory demo)
DATABASE_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# — AI (at least one required for LLM extraction)
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
DEFAULT_MODEL_PROVIDER=anthropic
DEFAULT_MODEL=claude-sonnet-4-20250514

# — Inngest (local dev uses Inngest dev server)
INNGEST_SIGNING_KEY=
INNGEST_EVENT_KEY=

# — OAuth connectors (optional, per connector)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
```

**File**: `apps/web/.env.example` (new)

### 0.2 Add CLAUDE.md project documentation
Current CLAUDE.md only has skill routing rules. Add project context so any AI assistant (or new developer) understands the codebase.

Add sections:
- Architecture overview (monorepo structure, key directories)
- Database: Drizzle + Supabase, `pnpm drizzle-kit generate && push` for migrations
- Two modes: in-memory (no DB) vs supabase (with DB)
- Testing: `pnpm test` (vitest), `pnpm verify:*` scripts for integration checks
- Key patterns: repository interface, Inngest fan-out, requireBrainRole auth

**File**: `CLAUDE.md` (extend)

### 0.3 Test infrastructure setup
Only 1 test file exists in the entire codebase. Before adding 8+ test files (from eng review), create shared fixtures and helpers.

- Test database factory: creates a test brain + test entities for repository tests
- API route test helper: wraps Next.js route handlers with mock request/response
- Brain module test fixtures: sample source_items, entity_mentions, canonical_entities

**Files**: `apps/web/lib/test-utils/` (new directory with fixtures.ts, api-helpers.ts, db-factory.ts)

---

## Phase 1: Schema — New Tables + Column Additions

**Goal**: Every data field visible in the prototype has a backing column or table.

### 1.1 New table: `entity_notes`
User-authored and brain-auto-generated notes on entities (People/Companies).

```
entity_notes:
  id            uuid PK
  brain_id      uuid FK → brains
  entity_id     uuid FK → canonical_entities
  author_id     uuid FK → users (nullable — null = brain-generated)
  body          text
  is_auto       boolean default false
  source_item_id uuid FK → source_items (nullable)
  created_at    timestamptz
  updated_at    timestamptz
```

**File**: `apps/web/lib/db/schema.ts` — add table + index on (brain_id, entity_id)

### 1.2 New table: `daily_briefs`
Persisted daily brief output (currently computed on-the-fly, not stored).

```
daily_briefs:
  id              uuid PK
  brain_id        uuid FK → brains
  brief_number    integer
  headline        text
  lede            text
  body_json       jsonb (structured: overnight[], priorities[], promises[], questions[])
  signal_score    numeric(3,2)
  sources_count   integer
  entity_pages_updated integer
  delivery_channels text[] (email, slack)
  delivered_at    jsonb ({email: timestamp, slack: timestamp})
  compiled_at     timestamptz
  created_at      timestamptz
```

**File**: `apps/web/lib/db/schema.ts`

### 1.3 New table: `ai_columns` + `ai_column_values`
User-defined AI-computed columns on entity tables (People/Companies).

```
ai_columns:
  id          uuid PK
  brain_id    uuid FK → brains
  column_name text
  prompt      text (the question to answer per row)
  entity_type text (person | company)
  created_at  timestamptz

ai_column_values:
  id          uuid PK
  column_id   uuid FK → ai_columns
  entity_id   uuid FK → canonical_entities
  value       text
  confidence  numeric(3,2)
  evidence    jsonb ({source_ids: [], reasoning: string})
  computed_at timestamptz
```

**File**: `apps/web/lib/db/schema.ts`

### 1.4 New pgEnums (4 new enums)

```
heatLabelEnum: hot, warm, cool, cold
relationTypeEnum: investor, customer, prospect, partner, team, press, recruit, advisor
closedByEventEnum: email_sent, pr_merged, doc_shared, inbound_thanks
lastTouchChannelEnum: email, slack, call, meeting
```

### 1.5 Column additions to existing tables

**`canonical_entities`** — add:
- `heat_score` numeric(3,2) — materialized from interaction counts
- `heat_label` heatLabelEnum — HOT/WARM/COOL/COLD
- `heat_updated_at` timestamptz
- `relation_type` relationTypeEnum — investor/customer/prospect/partner/team/press/recruit/advisor
- `role` text — Partner, VP, CTO, etc.
- `email` text
- `company_entity_id` uuid FK → canonical_entities (self-ref for person→company)
- `last_touch_at` timestamptz
- `last_touch_channel` lastTouchChannelEnum — email/slack/call/meeting
- `owe_reply_who` text — "you" or "them" (precomputed by owe-reply-refresh cron)
- `owe_reply_urgency` text — "ok", "warn", "late" (precomputed, avoids N+1 in People CRM)

**`open_loops`** — add:
- `recipient` text — who the promise is to
- `recipient_entity_id` uuid FK → canonical_entities
- `closed_by_source_id` uuid FK → source_items
- `closed_by_event` closedByEventEnum — email_sent/pr_merged/doc_shared/inbound_thanks

**`agent_runs`** — add:
- `cost_usd` numeric(8,4)
- `tokens_in` integer
- `tokens_out` integer

### 1.7 Data verification: canonical_entities population

Before building the CRM on canonical_entities, verify the table is populated. The current People page reads from `memoryObjects` (objectType='person'), not canonical_entities. If entity resolution hasn't populated canonical_entities for existing brains, the new CRM page will show empty.

Steps:
1. Query `SELECT COUNT(*) FROM canonical_entities WHERE brain_id = ? AND entity_type = 'person'`
2. If count is low vs memoryObjects person count, run entity resolution backfill
3. Ensure the `source/ingested` pipeline creates canonical_entities for new entities going forward

### 1.8 Generate migration

```bash
pnpm drizzle-kit generate
pnpm drizzle-kit push
```

**Files to modify**:
- `apps/web/lib/db/schema.ts` (all table definitions)
- `supabase/migrations/` (auto-generated)

---

## Phase 2: Repository Layer — New Methods

**Goal**: Every new table and column is accessible through the repository interface.

**File**: `apps/web/lib/db/repository.ts`

### 2.1 Entity Notes CRUD
- `createEntityNote({ brainId, entityId, authorId?, body, isAuto, sourceItemId? })` → EntityNote
- `listEntityNotes({ brainId, entityId, limit? })` → EntityNote[]
- `deleteEntityNote(noteId)` → boolean

### 2.2 Daily Briefs
- `createDailyBrief(CreateDailyBriefData)` → DailyBrief
- `getLatestDailyBrief(brainId)` → DailyBrief | null
- `listDailyBriefs(brainId, limit?)` → DailyBrief[]

### 2.3 AI Columns
- `createAiColumn({ brainId, columnName, prompt, entityType })` → AiColumn
- `listAiColumns(brainId, entityType?)` → AiColumn[]
- `deleteAiColumn(columnId)` → boolean
- `upsertAiColumnValue({ columnId, entityId, value, confidence, evidence })` → AiColumnValue
- `listAiColumnValues(columnId)` → AiColumnValue[]

### 2.4 Extended Entity Queries
- `listCanonicalEntitiesWithHeat(brainId, { entityType?, relationTypes?, heatLabels?, limit?, offset? })` → CanonicalEntity[] (includes heat, relation, last_touch, company join)
- `updateEntityHeat(entityId, { heatScore, heatLabel })` → void
- `updateEntityRelation(entityId, { relationType, role, email, companyEntityId })` → void

### 2.5 Extended Open Loop Queries
- `getOpenLoopStats(brainId)` → { total, overdue, quiet, closedLast7d }
- `listOpenLoopsByStatus(brainId, statuses[])` → OpenLoop[]

### 2.6 Dashboard Pulse Query
- `getDashboardPulse(brainId)` → { ingestingNow, compiledToday, promisesTracked, promisesOverdue, lastDreamCycleAt, newEdgesSinceDream }

**Files to modify**:
- `apps/web/lib/db/repository.ts` — add methods to interface + both implementations
- `packages/core/src/types.ts` — add EntityNote, DailyBrief, AiColumn, AiColumnValue types

---

## Phase 3: New API Endpoints

**Goal**: Every UI component in the prototype can fetch its data.

### 3.0 Structured error response format (from DX review)
All 11 new API routes must return structured error responses, not raw strings. This makes debugging faster and enables consistent frontend error handling.

```typescript
// Error response shape for all new routes
{ error: string, code: string, detail?: string }
// Examples:
{ error: "Brain not found", code: "BRAIN_NOT_FOUND" }
{ error: "Entity not found", code: "ENTITY_NOT_FOUND", detail: "No entity with id abc-123" }
{ error: "Unauthorized", code: "BRAIN_AUTH_REQUIRED" }
```

**File**: `apps/web/lib/api/error-response.ts` (new — shared helper used by all 11 routes)

### 3.1 Dashboard Pulse
`GET /api/brains/[brainId]/pulse`
Returns: `{ ingesting, compiledToday, promisesTracked, promisesOverdue, lastDreamCycleAgo, newEdges, sourcesToday, sourcesLast14d[], memoryObjectCount, actionItemCount, brainConfidence }`

Aggregates from: `source_items` (count by day), `open_loops` (status counts), `agent_runs` (running count + today count), `workflows` (last dream cycle), `memory_objects` (total), `entity_pages` (compiled today count).

### 3.2 Meetings
`GET /api/brains/[brainId]/meetings`
Returns: `{ today: Meeting[], tomorrow: Meeting[], thisWeek: Meeting[] }`
Each meeting: `{ id, title, startTime, endTime, meetingUrl, participants: {name, initials, entityId}[], hasPrepBrief, isLive }`

Source: `notetaker_meetings` JOIN `notetaker_calendars` + participant resolution via `canonical_entities`.

### 3.3 Entity Notes
`GET /api/brains/[brainId]/entities/[entityId]/notes` → EntityNote[]
`POST /api/brains/[brainId]/entities/[entityId]/notes` → EntityNote (create)
`DELETE /api/brains/[brainId]/entities/[entityId]/notes/[noteId]` → 204

### 3.4 Daily Briefs
`GET /api/brains/[brainId]/briefs` → DailyBrief[] (paginated)
`GET /api/brains/[brainId]/briefs/latest` → DailyBrief

### 3.5 AI Columns
`POST /api/brains/[brainId]/ai-columns` → AiColumn (create + trigger computation)
`GET /api/brains/[brainId]/ai-columns?entityType=person` → AiColumn[] with values
`DELETE /api/brains/[brainId]/ai-columns/[columnId]` → 204

### 3.6 People CRM
`GET /api/brains/[brainId]/people` → { people: PersonRow[], total, filters }
PersonRow: `{ id, name, email, avatarInitials, company, role, relationType, heatScore, heatLabel, lastTouchAt, lastTouchChannel, oweReply: {who, urgency, deadline}, aiSignal: {text, confidence}, openLoopCount }`

Joins: `canonical_entities` (person type) + company self-join + `open_loops` count + `relationships` for last touch + AI column "why now" default.

### 3.7 Company Detail
`GET /api/brains/[brainId]/companies/[entityId]` → CompanyDetail
CompanyDetail: `{ entity, kpis: {contacts, openLoops, overdueLoops, lastTouch, nps}, people: PersonRow[], timeline: TimelineEvent[], actionItems: OpenLoop[], transcripts: SourceItem[] }`

### 3.8 Entity Timeline
`GET /api/brains/[brainId]/entities/[entityId]/timeline` → TimelineEvent[]
TimelineEvent: `{ id, type (email|call|meeting|doc|brain|promise), timestamp, title, body, sourceItemId, memoryIds[], pills: {label, variant}[] }`

Source: `brain_events` + `source_items` + `memory_objects` + `open_loops` filtered to entity.

### 3.9 Live Agent Stream
`GET /api/brains/[brainId]/agent-stream` → AgentStreamEvent[]
Returns last 10 agent runs with: `{ name, stepName, args, status, duration, cost }`

Source: `agent_runs` ORDER BY started_at DESC LIMIT 10.

### 3.10 "Owe a Reply" Detection
`GET /api/brains/[brainId]/owe-replies` → OweReply[]
OweReply: `{ entityId, entityName, who (you|them), urgency (ok|warn|late), deadline?, sourceItemId }`

Logic: For each "hot" person entity, check last inbound source_item vs last outbound. If inbound is newer and >24h old → "you owe". Time thresholds by relation_type (investors = 4h patience, customers = 24h, partners = 3d).

**Files to create/modify**:
- `apps/web/app/api/brains/[brainId]/pulse/route.ts` (new)
- `apps/web/app/api/brains/[brainId]/meetings/route.ts` (new)
- `apps/web/app/api/brains/[brainId]/entities/[entityId]/notes/route.ts` (new)
- `apps/web/app/api/brains/[brainId]/entities/[entityId]/timeline/route.ts` (new)
- `apps/web/app/api/brains/[brainId]/briefs/route.ts` (new)
- `apps/web/app/api/brains/[brainId]/briefs/latest/route.ts` (new)
- `apps/web/app/api/brains/[brainId]/ai-columns/route.ts` (new)
- `apps/web/app/api/brains/[brainId]/people/route.ts` (new)
- `apps/web/app/api/brains/[brainId]/companies/[entityId]/route.ts` (new)
- `apps/web/app/api/brains/[brainId]/agent-stream/route.ts` (new)
- `apps/web/app/api/brains/[brainId]/owe-replies/route.ts` (new)

---

## Phase 4: New Agents + Backend Logic

### 4.1 "Owe a Reply" Detection Engine
**File**: `apps/web/lib/brain/owe-reply.ts` (new)

Logic:
1. For each person entity with heat ≥ WARM:
2. Find last inbound source_item (email/slack from them)
3. Find last outbound source_item (email/slack to them)
4. If inbound > outbound and age > patience_window → "you owe"
5. Patience windows: investor=4h, customer=24h, partner=72h, default=48h

### 4.2 AI Column Computation Agent
**File**: `apps/web/lib/brain/ai-column-agent.ts` (new)

Takes a column prompt + list of entities, runs the prompt against each entity's compiled page + recent sources, returns value + confidence per entity.

**Inngest function**: `ai-column-compute` — triggered by `ai-column/created` event, processes all entities for the column in batches of 10.

### 4.3 Heat Score Materialization
**File**: `apps/web/lib/brain/heat-score.ts` (new)

Runs after ingestion or on schedule. For each person/company entity:
- Counts interactions in last 7d, 30d, 90d
- Weights by type (call=5, email=2, slack=1, meeting=3)
- HOT = 7d score ≥ 10, WARM = 30d score ≥ 5, COOL = 90d score ≥ 2, COLD = else
- Updates `canonical_entities.heat_score`, `heat_label`, `heat_updated_at`

**Data source query path** (from eng review):
```sql
SELECT ce.id, si.type, si.created_at
FROM canonical_entities ce
JOIN entity_mentions em ON em.canonical_entity_id = ce.id
JOIN source_items si ON si.id = em.source_item_id
WHERE ce.brain_id = ? AND si.created_at > NOW() - INTERVAL '90 days'
```
Requires index on `entity_mentions(canonical_entity_id, created_at)`.

**Inngest function**: `heat-score-refresh` — separate fan-out function triggered by `source/ingested` event + daily cron `0 5 * * *`.

### 4.4 Daily Brief Persistence
**Modify**: `apps/web/lib/inngest/functions/index.ts` — `dailyFounderBrief` function

After `buildDailyBrief()` completes, persist the result to the new `daily_briefs` table via `repository.createDailyBrief()`. Increment `brief_number` from the last brief for this brain.

### 4.5 Promise Closure Detection
**File**: `apps/web/lib/brain/promise-closure.ts` (new)

After each source ingestion, check if any open loops can be auto-closed:
- Email sent to loop recipient → close with `closed_by_event: 'email_sent'`
- PR merged matching loop description → close with `closed_by_event: 'pr_merged'`
- Doc shared with loop recipient → close with `closed_by_event: 'doc_shared'`
- Inbound "thanks" or "got it" from recipient → close with `closed_by_event: 'inbound_thanks'`

**Inngest function**: `promise-closure-check` — separate fan-out function triggered by `source/ingested` event (NOT inline in sourceIngested — matches the established fan-out pattern used by graphSyncAfterIngestion, postIngestionThreadGrouping, etc.).

### 4.6 Entity Auto-Note Generation
After entity page compilation, extract 1-2 auto-notes (behavioral patterns, reading habits, communication style) and save to `entity_notes` with `is_auto: true`.

Wire into entity page compilation in `apps/web/lib/brain/entity-pages.ts`.

**Files to create**:
- `apps/web/lib/brain/owe-reply.ts`
- `apps/web/lib/brain/ai-column-agent.ts`
- `apps/web/lib/brain/heat-score.ts`
- `apps/web/lib/brain/promise-closure.ts`

### 4.7 Nudge Detector Simplification
After heat-score and owe-reply systems are live, refactor existing nudge detectors to use them:
- `lib/nudge/detectors/entity-going-cold.ts` → check `heat_label = 'COLD'` instead of entity_mentions join
- `lib/nudge/detectors/missed-follow-up.ts` → check `owe_reply_urgency IN ('warn', 'late')` instead of open_loops query

**Files to create**:
- `apps/web/lib/brain/owe-reply.ts`
- `apps/web/lib/brain/ai-column-agent.ts`
- `apps/web/lib/brain/heat-score.ts`
- `apps/web/lib/brain/promise-closure.ts`

**Files to modify**:
- `apps/web/lib/inngest/functions/index.ts` (add 5 new fan-out functions, modify 1 existing)
- `apps/web/lib/brain/entity-pages.ts` (add auto-note hook)
- `apps/web/lib/nudge/detectors/entity-going-cold.ts` (simplify to use heat_label)
- `apps/web/lib/nudge/detectors/missed-follow-up.ts` (simplify to use owe_reply columns)

---

## Phase 5: Frontend — Design System Migration

### 5.0 DESIGN.md Rewrite (from design review)
Current DESIGN.md specifies Geist + stone colors + rounded-3xl + no colored badges. The prototype design system contradicts all of these. Rewrite DESIGN.md BEFORE implementing tokens so every contributor builds from the same source of truth.

**What changes:**
- Typography: Geist → Roboto Slab (display/serif) + Instrument Sans (UI/sans) + JetBrains Mono (meta/mono)
- Colors: stone-based → navy/gold/cream system (--arvya-dark-900 through --cream-400)
- Radius: rounded-3xl (24px) → 12px default cards (radius-lg), 8px buttons/inputs (radius-md)
- Shadows: shadow-sm only → shadow scale (xs through xl) + gold variants for focus states
- Status: "no colored badges" → relation-type pills use semantic colors (gold=investor, green=customer, blue=partner, purple=team)
- Cards: white bg with stone-200 border → white bg with cream-300 border (border-subtle)
- Interactive: stone-950 borders on focus → gold border on focus (border-focus: var(--arvya-gold))

**What stays:**
- Warm cream page background (value changes from #f6f2ea to --cream-100 / #FAF8F5 — same warmth, lighter)
- Terse uppercase eyebrow labels (now in JetBrains Mono)
- No icon libraries, no modal dialogs, no toast notifications, no dark mode
- Single-sentence descriptions, direct error messages, text loading states
- 44px minimum touch targets

**File**: `DESIGN.md` — full rewrite to match `/tmp/arvya-design/arvya-os/project/assets/tokens.css`

### 5.1 Design Tokens
Replace Geist fonts with Roboto Slab + Instrument Sans + JetBrains Mono. Update color palette from stone-based to the prototype's navy/gold/cream system.

**File**: `apps/web/app/globals.css` — port CSS custom properties from `tokens.css`

Port `tokens.css` variables into CSS custom properties (Tailwind v4 uses postcss mode with CSS variables, NOT tailwind.config.ts):
- `--arvya-dark-900: #0E1726` through `--arvya-dark-500`
- `--arvya-gold: #D89A3F`, `--arvya-gold-700: #8F6420`
- `--cream-50` through `--cream-400`
- Semantic mappings: `--bg-primary`, `--text-primary`, `--border-subtle`, etc.
- Shadow scale (xs through xl + gold variants)
- Radius scale (4/8/12/16/20/9999px)
- Font stack variables: `--font-serif`, `--font-sans`, `--font-mono`

**Note**: This project uses Tailwind v4 (postcss mode). There is no `tailwind.config.ts`. Extend via CSS `@theme` blocks in `globals.css`.

### 5.2 Shell Components (Sidebar + Topbar)
Replace `components/brain/brain-nav.tsx` with new sidebar matching prototype:
- Dark navy (#0E1726) background
- Brand mark + brain switcher
- Nav groups: Daily surfaces / Memory / Operations
- Badge counts from live DB (not hardcoded)
- Footer: Settings + Log out + user identity

**New nav items**: Today (dashboard), Daily brief, Ask brain, Action items, Sources, People, Companies, Knowledge graph, Drift review, Agent runs, Connectors

**File**: `apps/web/components/brain/brain-nav.tsx` (rewrite)

### 5.3 Shared UI Primitives
Create reusable components matching prototype patterns:
- `<Pill variant="gold|warn|ok|dark">` — status pills with optional pulsing dot
- `<Cite>` — inline citation chip (⌕ source · label)
- `<HeatBadge score={0.8} />` — 4-bar heat indicator
- `<KpiStrip items={[]} />` — 4-5 column metric strip
- `<AvatarStack people={[]} />` — overlapping initials circles
- `<TagPill type="investor|customer|..." />`
- `<EyebrowLabel>` — monospace uppercase label

**Files**: `apps/web/components/ui/` (new components)

---

## Phase 6: Frontend — Page Rewrites

### Design handoff reference
Each page implementation should:
> Fetch this design file, read its readme, and implement the relevant aspects of the design. https://api.anthropic.com/v1/design/h/4eBOk2THuh2sLt0jMKnk1A?open_file=People.html
> Implement: People.html

The design bundles are extracted at `/tmp/arvya-design/` and `/tmp/arvya-design2/` for reference.

### 6.1 Dashboard (`/brains/[brainId]/page.tsx`) — FULL REWRITE
**Data**: `/api/brains/{id}/pulse` + `/api/brains/{id}/meetings` + `/api/brains/{id}/owe-replies` + `listOpenLoops` + `getLatestDriftReview` + `/api/brains/{id}/agent-stream`

Sections:
1. Greeting header with date, brain-online pulse, overnight summary stats
2. Ask bar with skill toggles + quick prompt chips → routes to /ask
3. Pulse strip (4 KPIs: ingesting, compiled today, promises tracked, last dream cycle)
4. 2-column grid:
   - LEFT: Meetings card (today + tomorrow, avatars, prep/join buttons), Drift card (top 3 signals), Action items (top 5, checkable, brain-ranked)
   - RIGHT: Sources sparkline (14d), Compile confidence donut, Promises by status bars, Live agent stream

### 6.2 People (`/brains/[brainId]/people/page.tsx`) — FULL REWRITE
**Data**: `/api/brains/{id}/people` + `/api/brains/{id}/ai-columns?entityType=person`

Sections:
1. Header: "184 contacts" eyebrow
2. Saved-view strip (All, Owe a reply, Hot this week, Cooling, Investors)
3. Toolbar: Table/Cards/Queue toggle, filters (Relation, Last touch, Owes reply), search, + New contact
4. CRM table: Name (avatar+email), Relation (tag pill), Company, Role, Last touch, Owes (pill), Heat (4-bar), AI "Why now" column, + Add column
5. Row click → navigates to entity detail page

### 6.3 Company Detail (`/brains/[brainId]/companies/[entityId]/page.tsx`) — NEW
**Data**: `/api/brains/{id}/companies/{entityId}` + `/api/brains/{id}/entities/{entityId}/timeline` + `/api/brains/{id}/entities/{entityId}/notes`

Sections:
1. Header: Logo, name, relation pill, domain/employees/location, action buttons (Catch me up, Schedule, Reply to X)
2. KPI strip (5): Contacts, Open loops, Overdue, Last touch, NPS/Health
3. 2-column: LEFT = tabs (Timeline, Action items, Transcripts, Sources) + content, RIGHT = panels (About fields, Contacts list with heat dots, Open loops ledger, AI signals)

### 6.4 Daily Brief (`/brains/[brainId]/brief/page.tsx`) — NEW
**Data**: `/api/brains/{id}/briefs/latest`

Editorial layout matching prototype: delivery note, masthead (brief number + date + signal score), headline (serif 44px), lede (serif italic), 4-section TOC, overnight cards with quotes + citations, priorities-by-person grid, promises table, questions-for-founders dark card, footer.

### 6.5 Ask Brain (`/brains/[brainId]/ask/page.tsx`) — MAJOR UPGRADE
**Data**: existing `/api/brains/{id}/ask` (needs streaming upgrade)

Changes:
- Empty state: mark icon, "Ask the brain anything", preset prompt chips
- Composer pinned to bottom with source filter chips + send button
- Claude-style response: Thinking pill → reasoning trace (gold border, streaming) → tool calls (running/done states) → answer prose (word-by-word stream) → sources panel with confidence meter
- Follow-up suggestion chips
- URL param `?q=` for handoff from dashboard

### 6.6 Action Items (`/brains/[brainId]/open-loops/page.tsx`) — REWRITE
**Data**: `listOpenLoops` + `getOpenLoopStats`

Changes:
- Summary banner (3 KPIs: overdue, quiet, closed last 7d)
- Toolbar: owner filter, view toggle (Board/List/Timeline)
- Kanban board: 4 columns (Promised, In flight, Quiet/Stalled, Closed last 7d)
- Cards with age, recipient pill, promise text, owner, source citations

### 6.7 Sources (`/brains/[brainId]/sources/page.tsx`) — REWRITE
**Data**: `listSourceItems` (expanded) + `/api/brains/{id}/stats`

Changes:
- KPI strip (total artifacts, last 24h, memories extracted, failed parses)
- Left filter rail (by type + status + saved views)
- Source list with extraction badges (memory count, opens/closes loop, entity cites)
- Right detail panel (full body + "what the brain extracted")

### 6.8 Graph (`/brains/[brainId]/graph/page.tsx`) — UPGRADE
- Add left filter panel (node type toggles + edge type toggles + confidence slider)
- Add layout toggle (Force/Tree/Cluster)
- Upgrade node detail panel with full edge list
- Add saved chains card

### 6.9 Drift (`/brains/[brainId]/drift/page.tsx`) — UPGRADE
- Add said-vs-did two-column compare
- Pattern cards with Snooze/Review action buttons
- Single-statement headline

### 6.10 Agent Runs (`/brains/[brainId]/agent-runs/page.tsx`) — UPGRADE
- KPI grid (4 agent type counts)
- Tab filters (All/Running/Failed/Manual/Scheduled/Dream)
- Live trace detail (dark card with step events, cost, tokens, duration)
- Scheduled agents section

### 6.11 Connectors (`/brains/[brainId]/connections/page.tsx`) — UPGRADE
- Privacy rules section (5 toggles)
- Per-connector health metrics

### 6.12 Onboarding (`/onboarding/page.tsx`) — EXTEND
- Add step 4: Set boundaries (privacy toggles)
- Add step 5: First brief (brain reads, you review, progress gauge)

### 6.13 Settings (`/brains/[brainId]/settings/page.tsx`) — EXTEND
- Team management UI (RBAC roles)
- Notification preferences
- Brain configuration

---

## Phase 5A: Design Specifications (from design review)

### Interaction States (Pass 2 — all P0 pages)

Every page must implement these states. Pattern: skeleton (cream-200 pulse) for loading, warm text + CTA for empty, inline error message for failure.

| Page | Loading | Empty | Error | Partial |
|------|---------|-------|-------|---------|
| Dashboard | Skeleton pulse strip + skeleton meeting rows + skeleton right column | "Your brain is waking up. Connect your first source to see it think." + Connect source CTA | Inline "Couldn't reach the brain. Retry." per failed section | Meetings loaded, pulse still loading → show available sections, skeleton for pending |
| People CRM | Table skeleton with 5 placeholder rows (cream-200 bars) | "No contacts yet. The brain finds people as it reads your sources." + Connect source CTA | "Couldn't load contacts. Retry." above table | Table renders with available data, AI column shows "computing..." per cell |
| Company Detail | Header skeleton + KPI strip skeleton + timeline skeleton | "No data for this company yet. The brain is still building its understanding." | Per-section error: "Timeline unavailable" / "Contacts unavailable" | Header loads first, tabs load independently |
| Daily Brief | Editorial skeleton (headline bar + body bars) | "No briefs yet. Your first brief arrives tomorrow morning at 8am." + explain what briefs contain | "Brief couldn't be loaded. Retry." | N/A — briefs are atomic |
| Ask Brain | N/A (empty state IS the default) | Mark icon + "Ask the brain anything" + 4 preset prompt chips | Streaming error → "The brain hit a snag. Try rephrasing." inline in chat | Thinking pill visible → tools visible → answer streams |

**Empty state principles (from prior learning, confidence 10/10):**
- Never show bare zero counts ("0 contacts"). Show warm, actionable text.
- Never use demo/fake data fallbacks. Empty is honest. Fake data erodes trust.
- Every empty state tells the user: (1) what this feature does, (2) why it's empty, (3) what action fills it.

### Loading Pattern
Skeleton screens using `--cream-200` background with pulse animation (matches prototype's `@keyframes brainpulse`). Skeleton shapes match the content they replace (rectangle for text, circle for avatars, bar for KPI numbers).

### Error Pattern
Inline text below the failed section header: "[Section] couldn't load. [Retry button]". No toast, no modal, no full-page error. Failed sections don't block other sections from rendering.

### First-Time User Journey (Pass 3)

| Step | User Does | User Feels | Plan Supports? |
|------|-----------|------------|----------------|
| 1 | Completes onboarding (connects first source) | Anticipation — "let's see what it finds" | Onboarding steps 1-5 (Phase 6.12) |
| 2 | Lands on Dashboard | Brief confusion — everything is empty | Dashboard empty state with "brain is waking up" + live ingestion counter |
| 3 | Sees first source processing | Excitement — "it's reading my stuff" | Live agent stream shows ingestion steps |
| 4 | Checks People page | Patience — "contacts will appear as it reads" | People empty state explains this |
| 5 | Next morning: first Daily Brief | Delight — "it actually knows things" | Brief arrives at 8am with real content |
| 6 | Clicks person in People | Engagement — "it built a profile" | Entity detail with timeline + compiled data |

**The emotional arc**: anticipation → brief emptiness (honest, warm) → first signs of life → morning delight. The product earns trust by being transparent about what it's still learning, not by faking readiness.

### Responsive Specs (Pass 6)

**Sidebar**: At `<1024px`, sidebar collapses to icon-only rail (26px wide, icons centered, tooltips on hover). At `<768px`, sidebar becomes a slide-in drawer triggered by hamburger icon in top-left. Drawer overlays content with semi-transparent backdrop.

**Dashboard**: `<1100px` (matches prototype media query): 2-col grid collapses to single column. LEFT column (meetings, drift, action items) stacks above RIGHT column (sources, confidence, promises, agent stream). LEFT is primary — user sees meetings and action items first.

**People CRM table**: `<1024px`: hide Role, Company, AI "Why now" columns. Show Name, Relation, Heat, Owes reply. `<768px`: switch to card view (each person = one card with avatar, name, relation pill, heat badge, owe-reply indicator). Card view is the default on mobile.

**Company Detail**: `<1024px`: right rail moves below tabs (stacks vertically). `<768px`: tab-based mobile layout — 3 tabs: Overview (KPIs + About fields + Contacts), Activity (Timeline + Action items), Sources (Transcripts + Sources). Per prior learning `entity-page-tab-mobile` (confidence 8/10).

**Daily Brief**: Already max-width 880px (centered). Responsive by default. TOC grid goes from 4-col to 2-col at `<768px`. Headline font-size: 44px → 32px at `<768px`.

**Ask Brain**: Already full-height flex column. Prompt chips go from 2-col to 1-col at `<640px`. Composer stays pinned to bottom on all viewports.

### Accessibility Requirements (Pass 6)

**Keyboard Navigation:**
- Sidebar: Tab through nav items, Enter to navigate, Escape to close drawer (mobile)
- CRM table: Arrow keys to move between rows, Enter to open entity detail, Tab to move between columns
- Company detail tabs: Arrow keys to switch tabs, Tab to enter tab content
- Ask Brain: Tab to reach composer, Ctrl+Enter to submit, Escape to cancel

**ARIA:**
- Sidebar: `nav` landmark with `aria-label="Brain navigation"`, `aria-current="page"` on active item
- CRM table: `role="grid"` with `aria-sort` on sortable columns
- Heat badge: `aria-label="Heat: warm, 3 of 4 bars"` (text alternative for visual bars)
- Relation pills: `aria-label="Relation: investor"` (text alternative for color-coded pill)
- Live agent stream: `aria-live="polite"` for streaming updates

**Contrast:**
- All functional text on cream backgrounds: minimum 4.5:1 contrast ratio (WCAG AA)
- `--text-tertiary: #71717A` on `--cream-50: #FDFCFA` = 4.7:1 — passes AA
- `--cream-400: #DED5C8` on cream — decorative ONLY, never for readable text
- Heat bar colors: `--cream-300` (off) vs `--cream-400` (on) — both decorative, text label provides information

**Touch Targets:**
- All interactive elements: minimum 44x44px tap area (sidebar nav links: 8px+10px padding, buttons: 6px+14px padding — verify these meet 44px height)
- CRM table rows: minimum 44px height (11px padding + content = ~44px ✓)
- Mobile drawer close button: 44x44px

### Connector Page Design (from prior learning)

**Google Workspace card (from prior learning `google-oauth-shared-token-reconnect`, confidence 9/10):**
Unified Google OAuth shares one refresh_token across Gmail, Drive, and Calendar. The Connectors page must show a single "Google Workspace" card (not separate Gmail/Drive/Calendar reconnect buttons). Individual reconnect would invalidate the shared token and silently break other services.

---

## Phase 7: Inngest Wiring

New scheduled/event functions:

| Function | Trigger | What |
|---|---|---|
| `heat-score-refresh` | `0 5 * * *` + `source/ingested` | Recompute heat for all entities |
| `ai-column-compute` | `ai-column/created` event | Run AI column prompt on all entities |
| `promise-closure-check` | `source/ingested` (fan-out) | Auto-close loops based on evidence |
| `auto-note-generation` | after entity page compile | Extract behavioral notes |
| `owe-reply-refresh` | `*/30 * * * *` | Refresh owe-a-reply status |

**File**: `apps/web/lib/inngest/functions/index.ts`

---

## Execution Order

### Week 0.5: Developer Setup (before backend work)
0. Developer setup (Phase 0): .env.example, CLAUDE.md docs, test infrastructure

### Week 1: Backend Foundation
1. Schema changes (Phase 1) — new tables + column additions
2. Generate + apply migration
3. Repository methods (Phase 2)
4. Core API endpoints (Phase 3): error helper (3.0), pulse, meetings, people, agent-stream
5. Heat score materialization (Phase 4.3)
6. Owe-a-reply engine (Phase 4.1)

### Week 2: Backend Intelligence
7. Promise closure detection (Phase 4.5)
8. Daily brief persistence (Phase 4.4)
9. AI column agent (Phase 4.2)
10. Entity notes + auto-notes (Phase 4.6)
11. Remaining API endpoints (Phase 3): timeline, briefs, ai-columns, companies, owe-replies, entity notes
12. Inngest wiring (Phase 7)

### Week 3: Frontend Foundation
13. Design tokens migration (Phase 5.1)
14. Shell components — sidebar + topbar (Phase 5.2)
15. Shared UI primitives (Phase 5.3)
16. Dashboard rewrite (Phase 6.1)
17. People CRM table (Phase 6.2)

### Week 4: Frontend Pages
18. Company detail (Phase 6.3)
19. Daily Brief (Phase 6.4)
20. Ask Brain upgrade (Phase 6.5)
21. Action Items kanban (Phase 6.6)
22. Sources feed (Phase 6.7)
23. Graph/Drift/Agents/Connectors upgrades (Phase 6.8-6.11)
24. Onboarding + Settings extensions (Phase 6.12-6.13)

---

## Build Checkpoint

### Resume Command
```
Read the plan at ~/.claude/plans/crystalline-mixing-moonbeam.md and the test plan at ~/.gstack/projects/arvya-os/prashanthbabu--eng-review-test-plan-20260507-224733.md, then start building Phase 1 (schema changes).
```

### Parallel Lanes
- **Lane A**: Schema → Repo → APIs (sequential) — start immediately
- **Lane B**: Brain modules (after schema, parallel with A) — start after Phase 1 migration
- **Lane C**: Design system (fully independent) — start immediately
- **Lane D**: Frontend pages (after A + C) — start after both complete
- **Lane E**: Inngest wiring (after B) — start after brain modules complete

**Conflict flag**: Lanes A and B both touch `lib/db/schema.ts`. Run A first, then B starts after migration is applied.

### Review Gate Status
- Eng Review: **CLEARED** — 9 issues found, all resolved
- Design Review: **CLEARED** — 5/10 → 8/10, 12 decisions integrated
- DX Review: **CLEARED** — 4/10 → 7/10, Phase 0 added (dev setup), structured errors added
- CEO Review: not run
- Codex Review: not run (outside voice used instead)

### Key Files for Resume
- Plan: `~/.claude/plans/crystalline-mixing-moonbeam.md`
- Test plan: `~/.gstack/projects/arvya-os/prashanthbabu--eng-review-test-plan-20260507-224733.md`
- Design prototypes: `/tmp/arvya-design/arvya-os/project/` (Bundle 1), `/tmp/arvya-design2/arvya-os/project/` (Bundle 2)
- Checkpoint: `~/.gstack/projects/arvya-os/checkpoint-eng-review-20260507.md`

---

## Verification

### Backend verification
1. `pnpm typecheck` — zero errors after all schema + API changes
2. `pnpm vitest run` — all existing tests pass + new brain_id enforcement test passes
3. Manual: ingest a source → verify heat scores update, promise closure fires, auto-notes generate
4. Manual: `GET /api/brains/{id}/pulse` returns live counts
5. Manual: `GET /api/brains/{id}/meetings` returns today's calendar
6. Manual: `GET /api/brains/{id}/people` returns CRM-style rows with heat + owe-reply

### Frontend verification
1. `pnpm dev` → navigate every page, no console errors
2. Dashboard: pulse strip shows live KPIs, meetings render from calendar, action items are interactive, charts animate
3. People: table renders with heat bars, relation tags, AI column, "owe a reply" pills
4. Company detail: timeline loads, right rail shows contacts + fields
5. Ask Brain: submit query → see thinking → tools → streamed answer with citations
6. Sidebar: all nav items route correctly, badge counts are live from DB

### Design verification (from design review)
7. Empty states: disconnect all sources → navigate each P0 page → verify warm empty state (no bare zeros, no fake data, clear CTA)
8. Responsive: resize to 1024px → sidebar collapses to icon rail. Resize to 768px → sidebar becomes drawer, CRM table switches to card view, company detail uses tabs
9. Keyboard: Tab through sidebar nav → all items reachable. Arrow keys in CRM table → rows navigable. Enter opens entity detail
10. Contrast: inspect `--text-tertiary` on cream backgrounds → verify 4.5:1 minimum ratio
11. Touch targets: on mobile viewport, verify all interactive elements ≥ 44px tap area
12. DESIGN.md: verify DESIGN.md matches implemented tokens (fonts, colors, radius, shadows)
13. Loading: throttle network in DevTools → verify skeleton screens appear (not blank white)
14. Connector page: verify single Google Workspace card (not separate Gmail/Drive/Calendar reconnects)

### Automated test layer (from eng review)
Every new module gets unit tests alongside implementation:
- `lib/brain/__tests__/heat-score.test.ts` — tier boundaries, weights, zero-interaction edge case
- `lib/brain/__tests__/owe-reply.test.ts` — patience windows by relation_type, no-messages edge case
- `lib/brain/__tests__/promise-closure.test.ts` — each closure type, already-closed no-op
- `lib/brain/__tests__/ai-column-agent.test.ts` — prompt execution, confidence, no-compiled-page fallback
- `lib/db/__tests__/repository-entity-notes.test.ts` — CRUD operations
- `lib/db/__tests__/repository-daily-briefs.test.ts` — create, getLatest, list
- `lib/db/__tests__/repository-ai-columns.test.ts` — create, delete cascade, upsert value
- API route tests for all 11 new endpoints (auth enforcement + happy path + error cases)

### Critical files summary
- `apps/web/.env.example` — create with all required variables (Phase 0.1)
- `CLAUDE.md` — extend with project documentation (Phase 0.2)
- `apps/web/lib/test-utils/` — test infrastructure: fixtures, helpers, db factory (Phase 0.3)
- `apps/web/lib/api/error-response.ts` — structured error helper for all new routes (Phase 3.0)
- `DESIGN.md` — full rewrite to match new design system (Phase 5.0)
- `apps/web/app/globals.css` — CSS custom properties from tokens.css + @theme blocks
- `apps/web/lib/db/schema.ts` — 4 new tables, column additions to 3 tables
- `apps/web/lib/db/repository.ts` — ~15 new methods
- `apps/web/app/api/brains/[brainId]/` — 11 new route files
- `apps/web/lib/brain/` — 4 new files (owe-reply, ai-column-agent, heat-score, promise-closure)
- `apps/web/lib/inngest/functions/index.ts` — 5 new Inngest functions
- `apps/web/components/brain/brain-nav.tsx` — full rewrite
- `apps/web/components/ui/` — ~7 new shared components
- `apps/web/app/brains/[brainId]/` — 6 page rewrites, 2 new pages, 5 page upgrades
- `packages/core/src/types.ts` — 3 new type definitions (EntityNote, AiColumn, AiColumnValue) + update existing DailyBrief
- `apps/web/lib/nudge/detectors/entity-going-cold.ts` — simplify to use heat_label
- `apps/web/lib/nudge/detectors/missed-follow-up.ts` — simplify to use owe_reply columns

---

## Cut Line (from eng review)

### P0 — Must-ship (core product matches prototype)
- Phase 0: Developer setup (.env.example, CLAUDE.md docs, test infrastructure, error helper)
- Phase 1: All schema changes (foundation for everything)
- Phase 2: All repository methods
- Phase 3 Core: pulse, people, company, meetings, briefs/latest, agent-stream endpoints
- Phase 4.3: Heat score materialization (feeds People CRM)
- Phase 5.0: DESIGN.md rewrite (must precede all frontend work)
- Phase 5: All design system work (tokens, sidebar, primitives)
- Phase 5A: Interaction states + responsive specs + accessibility for P0 pages
- Phase 6.1-6.5: Dashboard, People, Company, Daily Brief, Ask Brain

### P1 — Ship next (intelligence layer + remaining pages)
- Phase 3 Remaining: ai-columns, entity notes, timeline, owe-replies endpoints
- Phase 4.1/4.2/4.5/4.6: Owe-reply detection, AI columns, promise closure, auto-notes
- Phase 4.4: Daily brief persistence
- Phase 6.6-6.13: Action Items, Sources, Graph, Drift, Agents, Connectors, Onboarding, Settings
- Phase 7: All 5 new Inngest functions

---

## NOT in scope

- **InMemoryRepository removal** — evaluate separately (TODO captured). Doubles implementation cost but removing it risks breaking demo mode.
- **Dual dream cycle cleanup** — both dreamCycleCron and dreamCycleV2Cron fire at 0 3 * * *, doubling LLM costs. Fix separately (TODO captured).
- **Direct getDb() call consolidation** — 88 places bypass the repository. Architectural debt, not blocking this plan.
- **Serial brain loop refactoring** — 9 existing Inngest functions loop all brains in one step. Should fan-out per brain, but that's a separate initiative.
- **Unique constraint on canonical_entities(brain_id, canonical_name, entity_type)** — needed to prevent duplicate entities, but may require data dedup first (TODO captured).
- **Dark mode** — single warm-cream theme. Not in this plan per DESIGN.md.
- **RTL language support** — all prototypes are LTR. Defer until international users appear.
- **Drag-and-drop in kanban** — Action Items kanban (Phase 6.6) uses click-to-move between columns. Drag-and-drop adds complexity for a P1 page. Add later if users request.
- **Animation/motion spec** — prototype uses `transition: .14s` on hovers. Full motion design (entrance animations, scroll-linked effects, page transitions) deferred to a polish pass after all pages ship.

---

## What already exists

| Component | Existing code | Plan reuses or rebuilds? |
|-----------|--------------|--------------------------|
| DailyBrief type | `packages/core/src/types.ts` — `DailyBrief`, `StructuredDailyBrief` | Extend (add table, keep type) |
| People page | `components/people/people-page-client.tsx` | Rewrite (CRM table) |
| Entity detail route | `api/brains/[brainId]/entities/[entityId]/route.ts` | Keep (company endpoint is separate) |
| Entity timeline UI | `components/entity/conversation-timeline.tsx` | Rewrite (new data sources) |
| Commitment nudge | `lib/nudge/commitment-nudge.ts` (every 30 min) | Keep (complementary to promise-closure) |
| Entity cold detection | `lib/nudge/detectors/entity-going-cold.ts` | Simplify (use heat_label) |
| Missed follow-up | `lib/nudge/detectors/missed-follow-up.ts` | Simplify (use owe_reply columns) |
| Stats endpoint | `api/brains/[brainId]/stats/route.ts` | Keep (pulse is different aggregation) |
| Dream cycle | `lib/brain/dream-cycle-v2.ts` | Keep (entity page compilation feeds auto-notes) |
| requireBrainRole | `lib/auth/require-role.ts` | Reuse in all 11 new endpoints |
| DESIGN.md | `DESIGN.md` — Geist + stone color system | Rewrite (Phase 5.0 — new token system) |
| Design prototypes | `/tmp/arvya-design/arvya-os/project/` — 13 HTML pages + tokens.css + app.css | Reference (visual source of truth) |
| Design prototypes v2 | `/tmp/arvya-design2/arvya-os/project/` — updated People + Company pages | Reference (CRM table + company detail) |

---

## Failure modes

| Codepath | Failure scenario | Test? | Error handling? | User sees |
|----------|-----------------|-------|-----------------|-----------|
| Heat score cron | entity_mentions empty for entity | Test | Returns COLD | Low heat, correct |
| Heat score cron | 3-table join times out | No test | Inngest retry | Stale heat (30min max) |
| Owe-reply refresh | No source_items for entity | Test | Returns empty | No "owe" pill, correct |
| Promise closure | Semantic match fails (email != loop) | No test | No auto-close | Manual close needed |
| AI column compute | Entity has no compiled page | Test | Returns "insufficient data" | Shows fallback text |
| People CRM query | canonical_entities underpopulated | Test | Returns empty list | Empty CRM (see 1.7 migration) |
| Daily brief persist | dailyFounderBrief fails mid-run | No test | Inngest retry | No brief today |
| Entity timeline | 4-table UNION returns >1000 rows | No test | LIMIT clause | Truncated timeline |

**Critical gap**: Promise closure semantic matching (matching an email to an existing open loop) has no test and no error handling for false matches. This is the hardest engineering problem in Phase 4.5 and the plan treats it as a simple function.

---

## TODOS.md updates (transfer during implementation)

### Unique constraint on canonical_entities (P1)
- **What:** Add unique constraint on `(brain_id, canonical_name, entity_type)` to prevent duplicate entities.
- **Why:** Duplicate entities split heat scores, owe-reply flags, and AI column values across rows. Entity resolution tries to prevent duplicates but has no database-level safety net.
- **Effort:** XS (human: ~15 min / CC: ~5 min). May need data dedup first.
- **Depends on:** Phase 1 schema changes (do alongside).

### Dual dream cycle cleanup (P1)
- **What:** Disable `dreamCycleCron` (v1) -- only `dreamCycleV2Cron` should run at `0 3 * * *`.
- **Why:** Both fire at the same cron, doubling nightly LLM costs. Only v2 should be active.
- **Effort:** XS (human: ~5 min / CC: ~2 min). Comment out or remove the v1 function.
- **Depends on:** Nothing -- can be done immediately.

### InMemoryRepository evaluation (P2)
- **What:** Evaluate whether `InMemoryRepository` (1082 lines) should be removed. Every new BrainRepository method requires dual implementation.
- **Why:** The codebase has Docker Postgres in development. InMemoryRepository doubles the implementation cost of every new method (15 methods = 30 implementations). It may already be broken for features that use direct getDb() calls (88 places).
- **Effort:** S (human: ~1 day / CC: ~30 min). Need to assess demo mode dependency.
- **Depends on:** After this overhaul ships -- removing during the overhaul is risky.

---

## Worktree parallelization strategy

| Step | Modules touched | Depends on |
|------|----------------|------------|
| Developer setup (Phase 0) | .env.example, CLAUDE.md, test-utils/ | -- |
| Schema + migration (Phase 1) | lib/db/ | Phase 0 |
| Repository methods (Phase 2) | lib/db/ | Phase 1 |
| API endpoints (Phase 3) | app/api/ | Phase 2 |
| Brain modules (Phase 4) | lib/brain/ | Phase 1 |
| Design system (Phase 5) | app/globals.css, components/ | -- |
| Frontend pages (Phase 6) | app/brains/ | Phase 3, Phase 5 |
| Inngest wiring (Phase 7) | lib/inngest/ | Phase 4 |

**Parallel lanes:**
- Lane A: Phase 1 → Phase 2 → Phase 3 (backend data layer, sequential)
- Lane B: Phase 4 brain modules (independent of API routes, depends only on schema)
- Lane C: Phase 5 design system (fully independent of backend)
- Lane D: Phase 6 frontend pages (depends on A + C completing)
- Lane E: Phase 7 Inngest wiring (depends on B completing)

**Execution**: Launch A + B + C in parallel. After A + C complete, launch D. After B completes, launch E. Merge all.

**Conflict flags**: Lanes A and B both touch `lib/db/schema.ts` (A creates tables, B reads them). Run A first, then B can start after migration is applied.

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | -- | -- |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | -- | -- |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 9 issues, 1 critical gap |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAR (PLAN) | score: 5/10 → 8/10, 12 decisions |
| DX Review | `/plan-devex-review` | Developer experience gaps | 1 | CLEAR (PLAN) | score: 4/10 → 7/10, 4 additions |

- **OUTSIDE VOICE:** Claude subagent (Codex quota exceeded). Found 13 issues. 3 cross-model tensions resolved (D11-D13). Key finds: canonical_entities data source mismatch, heat score query path unspecified, dual dream cycles.
- **DESIGN REVIEW:** 7 passes complete. Initial 5/10, final 8/10. Key additions: DESIGN.md rewrite (Phase 5.0), interaction states table (5 pages), responsive specs (6 breakpoint rules), accessibility (keyboard nav + ARIA + contrast), first-time user journey, connector card redesign. 3 prior learnings applied (warm-empty-state, entity-page-tab-mobile, google-oauth-reconnect). 4 items deferred to NOT in scope (dark mode, RTL, drag-and-drop, motion spec).
- **DX REVIEW:** 8 passes complete. Initial 4/10, final 7/10. Product type: Internal API/Service. Key additions: Phase 0 (developer setup — .env.example, CLAUDE.md project docs, test infrastructure), structured error response format (Phase 3.0). Key gaps found: missing .env.example (README references nonexistent file), zero test infrastructure (1 test file in entire codebase), raw error strings in all API routes, no project documentation in CLAUDE.md. 2 prior learnings applied (design-system-rewrite-before-tokens, demo-data-fallbacks-in-dashboard). DX scorecard: Getting Started 5→7, API Design 6→7, Errors 3→6, Docs 4→7, Upgrade 5, Dev Environment 5→7, Community N/A, Measurement 2.
- **UNRESOLVED:** 0 decisions pending.
- **VERDICT:** ENG + DESIGN + DX CLEARED. All issues resolved, all decisions integrated into plan.
