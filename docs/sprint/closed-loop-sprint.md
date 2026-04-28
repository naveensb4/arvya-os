# Arvya Brain OS — Closed-Loop Sprint Report

This sprint took the Arvya Company Brain from "skeleton with hooks" to a working
closed-loop operating system: ingest → memory → open loops → ask → outcome →
learning. Everything below is verified by running scripts, not vibes.

## What shipped

### Closed-loop product (workstream B)

- **Ingestion that actually extracts memory**. `packages/agents/src/ingestion-agent.ts`
  + `packages/prompts/src/source-ingestion.ts` now extract people, companies,
  product insights, customer / investor / advisor feedback, decisions,
  commitments, risks, and open questions — every kind required by VISION.md.
- **Open-loop detection with tight taxonomy**. Loops are typed as
  `commitment | follow_up | decision | task | investor_ask | customer_ask |
  strategic_question` and link back to the source items they came from.
- **Memory-quality scoring**. `apps/web/lib/brain/memory-quality.ts` scores
  every extraction (citation density, kind coverage, summary length) and
  surfaces it as part of the agent run record — no silent regressions.
- **Outcome capture closes the loop**. `POST /api/brains/[brainId]/open-loops/[loopId]/close`
  + `closeOpenLoop` in `apps/web/lib/brain/store.ts` mark a loop closed,
  persist the outcome text, create an `outcome` memory linked to the loop
  and source(s), and log an `agent_run`. Subsequent Ask Brain calls retrieve
  the outcome (proven by `verify:closed-loop`).
- **Ask Brain is source-backed by force**. `packages/prompts/src/ask-brain.ts`
  + `packages/agents/src/ask-brain-agent.ts` now require structured citations
  (`source_id` / `memory_id`). The Ask page (`apps/web/app/brains/[brainId]/ask/page.tsx`)
  renders citations as clickable refs; the agent refuses to claim a fact
  without one.
- **Eval harness**. `packages/agents/src/evals/{runner,closed-loop-fixtures}.ts`
  + `pnpm verify:agent-evals` run grounded fixtures through the real LLM and
  fail loudly when extraction or citation drift.

### Daily brief + drift detection (workstream C)

- **Priorities are a real primitive**. New table in
  `supabase/migrations/0006_priorities.sql`, types/schemas in
  `packages/core/src/{types,schemas}.ts`, full repository support
  (in-memory + Supabase), API routes
  (`/api/brains/[brainId]/priorities[/...]`), and a UI page at
  `/brains/[brainId]/priorities` for adding and managing priorities.
- **Daily brief is now structured JSON**. `packages/agents/src/daily-brief-agent.ts`
  + `packages/prompts/src/daily-brief.ts` produce a Zod-validated brief
  with: top priorities today, overdue follow-ups, due-soon, high-intent
  relationships, product insights to act on, marketing opportunities, risks
  / dropped balls, suggested actions for Naveen and PB, and questions to
  resolve. Brain home (`/brains/[brainId]`) renders all of it. Verified
  by `pnpm verify:daily-brief` (18/18).
- **Company drift agent**. `packages/agents/src/drift-review-agent.ts`
  + `packages/prompts/src/drift-review.ts` + `apps/web/lib/brain/company-drift.ts`
  read the last N days of memory and active priorities, then emit signals
  (`priority_drifting`, `commitment_dropped`, `recurring_concern`,
  `unaddressed_insight`, `no_movement`) with severity, evidence and
  citations. Surfaced via API + a `/brains/[brainId]/drift` page. Verified
  by `pnpm verify:drift-review` (8/8).

### Connectors hardened (workstream D)

- **Gmail / Outlook / Google Drive / Recall** now share a real production
  shape: OAuth start+callback, token refresh, watermark-driven incremental
  sync, source normalization, idempotent dedupe, scheduled syncs via
  Inngest (`apps/web/lib/inngest/functions/index.ts`), and per-connector
  state surfaced through `/api/health`.
- **Honest stubs**. GitHub and Replit Outreach are still stubs and are
  documented as such in `docs/sprint/workstream-d-connectors.md` along
  with the exact path to real implementations. No fake "GREEN" claims.
- **Mock verifiers** (`verify:email-connectors-mock`,
  `verify:notetaker-mock`, `verify:google-drive-mock`) drive every
  connector through cold-start sync, idempotent re-sync, and incremental
  sync. All three pass: 23+15+11 checks.

### Foundations cleaned up

- **Source normalization** (`apps/web/lib/workflows/source-normalization.ts`)
  is now used by every ingestion path, with a verifier
  (`pnpm verify:source-normalization`).
- **Snapshot indexes** (`supabase/migrations/0004_brain_snapshot_indexes.sql`)
  speed up the rendering of large brains.
- **Migration journal** (`supabase/migrations/meta/_journal.json`) is now
  in sync with the migrations folder so `pnpm db:migrate` can apply the
  full chain cleanly.
- **Type safety restored**. `next.config.js` no longer ignores TypeScript
  errors; `pnpm typecheck` passes; `pnpm lint` passes; `pnpm build` produces
  the full route graph.

## How to run it

```bash
pnpm install
pnpm verify:closed-loop          # 30/30 — full ingest→close→learning loop
pnpm verify:daily-brief          # 18/18 — structured brief + citations
pnpm verify:drift-review         # 8/8  — drift signals over real memory
pnpm verify:email-connectors-mock  # 23/23
pnpm verify:notetaker-mock         # 15/15
pnpm verify:google-drive-mock      # 11/11
pnpm verify:source-normalization   # passes
pnpm verify:dashboard              # passes
pnpm verify:always-on              # passes
pnpm verify:open-loop-review       # passes
pnpm -w typecheck && pnpm -w lint  # both pass
cd apps/web && pnpm build          # full app builds
pnpm dev                           # http://localhost:3000
```

## What the system does today

1. You drop an email / call transcript / Drive doc / manual note into a brain
   (UI at `/brains/[brainId]/sources/new`, batch upload at
   `/sources/batch-upload`, or any of the live connectors).
2. The ingestion agent classifies it, extracts structured memory, detects
   open loops, and writes everything with provenance — every memory carries
   `sourceCitations` pointing back at the originating chunks.
3. `/brains/[brainId]` shows the daily brief: priorities for today, overdue
   follow-ups, due-soon items, top insights, marketing opportunities, risks,
   and recommended next moves for Naveen and PB.
4. `/brains/[brainId]/ask` answers questions only with structured citations
   to real source / memory IDs.
5. `/brains/[brainId]/open-loops` lets you close a loop with an outcome,
   which is then re-ingested as memory and shows up in future Ask Brain
   answers — the loop is literally closed.
6. `/brains/[brainId]/drift` runs the company drift agent, comparing stated
   priorities against the last N days of memory and reporting where the
   company is drifting.
7. `/brains/[brainId]/priorities` lets Naveen / PB declare what's important
   so the drift agent has something to compare against.
8. `/api/health` includes per-connector status (last sync, errors,
   watermarks) for ops visibility.

## Known follow-ups (intentional, documented)

- **Connector encryption at rest**. Tokens are stored in Postgres without
  application-level encryption. Add KMS / pgsodium before going outside
  the founding team. Logged in `docs/sprint/workstream-d-connectors.md`.
- **GitHub + Replit Outreach** are stubs — see workstream-d doc for the
  exact next-sprint plan.
- **Live OAuth dry run**. The Gmail / Outlook / Drive / Recall flows are
  unit + mock-tested; a real-browser auth pass is the last mile before
  enabling them by default in production.
- **Drizzle journal alignment**. The journal now contains every migration
  in order, but two pre-existing 0002 migrations remain side-by-side
  (`0002_google_drive_connected_status` and `0002_open_loop_review`). They
  are independent; if a future Drizzle release rejects same-prefix
  siblings we'll renumber.
