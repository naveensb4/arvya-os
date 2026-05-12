# Frontend rewrite — work breakdown

This document is the operational index that turns `frontend-rewrite.md` into a concrete shipping plan.

- One row per prototype HTML file in `docs/prototype/`, mapped to the codebase page that owns the rewrite.
- One row per non-page phase from the plan, with the branch + PR title that will deliver it.
- Visual source of truth: `docs/prototype/*.html`. Design intent transcript: `docs/prototype/chat1.md`. Tokens: `docs/prototype/assets/tokens.css`.

All branches start with `claude/` and branch off `claude/prep-frontend-rewrite`. PRs target `naveensb4/arvya-os` `main`. Branches are pushed to fork `Pbabu-Github/arvya-os`.

## Page rewrites — one PR per page

| # | Prototype HTML | Codebase page | Plan phase | Branch | PR title | Status |
|---|----------------|----------------|------------|--------|----------|--------|
| 1 | `Dashboard.html` | `apps/web/app/brains/[brainId]/page.tsx` | 6.1 (P0) | `claude/frontend-dashboard` | Frontend: Dashboard (prototype match) | pending |
| 2 | `Brief.html` | `apps/web/app/brains/[brainId]/brief/page.tsx` (NEW) | 6.4 (P0) | `claude/frontend-brief` | Frontend: Daily Brief (prototype match) | pending |
| 3 | `Ask.html` | `apps/web/app/brains/[brainId]/ask/page.tsx` | 6.5 (P0) | `claude/frontend-ask` | Frontend: Ask Brain (prototype match) | pending |
| 4 | `Agents.html` | `apps/web/app/brains/[brainId]/agent-runs/page.tsx` | 6.10 (P1) | `claude/frontend-agents` | Frontend: Agent Runs (prototype match) | pending |
| 5 | `OpenLoops.html` | `apps/web/app/brains/[brainId]/open-loops/page.tsx` | 6.6 (P1) | `claude/frontend-open-loops` | Frontend: Action Items (prototype match) | pending |
| 6 | `Companies.html` | `apps/web/app/brains/[brainId]/companies/page.tsx` (NEW) | 6.3-list (P0) | `claude/frontend-companies` | Frontend: Companies (prototype match) | pending |
| 7 | `Company.html` | `apps/web/app/brains/[brainId]/companies/[entityId]/page.tsx` (NEW) | 6.3 (P0) | `claude/frontend-company` | Frontend: Company detail (prototype match) | pending |
| 8 | `People.html` | `apps/web/app/brains/[brainId]/people/page.tsx` | 6.2 (P0) | `claude/frontend-people` | Frontend: People CRM (prototype match) | pending |
| 9 | `Sources.html` | `apps/web/app/brains/[brainId]/sources/page.tsx` | 6.7 (P1) | `claude/frontend-sources` | Frontend: Sources (prototype match) | pending |
| 10 | `Connectors.html` | `apps/web/app/brains/[brainId]/connections/page.tsx` | 6.11 (P1) | `claude/frontend-connectors` | Frontend: Connectors (prototype match) | pending |
| 11 | `Graph.html` | `apps/web/app/brains/[brainId]/graph/page.tsx` | 6.8 (P1) | `claude/frontend-graph` | Frontend: Knowledge Graph (prototype match) | pending |
| 12 | `Drift.html` | `apps/web/app/brains/[brainId]/drift/page.tsx` | 6.9 (P1) | `claude/frontend-drift` | Frontend: Drift Review (prototype match) | pending |
| 13 | `Onboarding.html` | `apps/web/app/onboarding/page.tsx` (NEW) | 6.12 (P1) | `claude/frontend-onboarding` | Frontend: Onboarding (prototype match) | pending |

`index.html` is the prototype TOC; it has no codebase counterpart and is reference-only.

## Non-page phases — one PR per logical chunk

Run these in the order listed. Foundation must go green before pages start.

| # | Phase | Scope | Branch | PR title | Depends on |
|---|-------|-------|--------|----------|-----------|
| F1 | 5.1 (foundation) | Port `tokens.css` to `apps/web/app/globals.css` via Tailwind v4 `@theme`; wire Roboto Slab + Instrument Sans + JetBrains Mono | `claude/frontend-tokens` | Frontend: design tokens (foundation) | — |
| F2 | 5.0 | Rewrite `DESIGN.md` to match new tokens (navy/gold/cream, Roboto Slab, semantic relation colors) | `claude/frontend-design-md` | Frontend: DESIGN.md rewrite | F1 |
| F3 | 5.2 | Rewrite `components/brain/brain-nav.tsx` as the dark-navy sidebar matching `shell.js`; add brain switcher, group labels, footer (Settings + Log out + me) | `claude/frontend-shell` | Frontend: shell — sidebar + topbar | F1 |
| F4 | 5.3 | Add reusable UI primitives in `apps/web/components/ui/`: `Pill`, `Cite`, `HeatBadge`, `KpiStrip`, `AvatarStack`, `TagPill`, `EyebrowLabel` | `claude/frontend-primitives` | Frontend: shared UI primitives | F1 |
| B1 | 0 (DX) | `apps/web/.env.example` + extend `CLAUDE.md` project docs + `apps/web/lib/test-utils/` (fixtures, api-helpers, db-factory) | `claude/frontend-dev-setup` | Frontend: developer setup (.env.example, test infra) | — |
| B2 | 1 + 1.7 + 1.8 | Schema: 4 new tables (`entity_notes`, `daily_briefs`, `ai_columns`, `ai_column_values`), 4 new pgEnums, column additions on `canonical_entities` / `open_loops` / `agent_runs`; canonical_entities backfill verifier; generate + push migration | `claude/frontend-schema` | Backend: schema + migrations (Phase 1) | — |
| B3 | 2 | Repository methods for new tables + extended entity/open-loop/pulse queries | `claude/frontend-repo` | Backend: repository methods (Phase 2) | B2 |
| B4 | 3.0 | `apps/web/lib/api/error-response.ts` (structured `{error, code, detail}` helper) | `claude/frontend-error-helper` | Backend: structured error helper (Phase 3.0) | — |
| B5 | 3.1–3.5 (P0 core APIs) | `pulse`, `meetings`, `briefs/latest`, `agent-stream`, `people` routes | `claude/frontend-api-core` | Backend: core API endpoints (pulse, meetings, briefs, agent-stream, people) | B3, B4 |
| B6 | 3.6–3.10 (P1 APIs) | `companies/[entityId]`, entity timeline, entity notes CRUD, `briefs` (list), `ai-columns`, `owe-replies` | `claude/frontend-api-rest` | Backend: remaining API endpoints | B3, B4 |
| B7 | 4.3 | Heat-score materialization (`lib/brain/heat-score.ts`) + index on `entity_mentions(canonical_entity_id, created_at)` | `claude/frontend-heat-score` | Backend: heat score materialization (Phase 4.3) | B2 |
| B8 | 4.1 | Owe-a-reply detection engine (`lib/brain/owe-reply.ts`) | `claude/frontend-owe-reply` | Backend: owe-reply detection (Phase 4.1) | B2, B7 |
| B9 | 4.5 | Promise closure detection (`lib/brain/promise-closure.ts`) — fan-out from `source/ingested` | `claude/frontend-promise-closure` | Backend: promise closure detection (Phase 4.5) | B2 |
| B10 | 4.4 | Persist daily brief output to `daily_briefs` from `dailyFounderBrief` Inngest function | `claude/frontend-brief-persist` | Backend: daily brief persistence (Phase 4.4) | B2 |
| B11 | 4.2 + 4.6 | AI column compute agent + entity auto-note generation (hooked into entity-page compile) | `claude/frontend-ai-columns` | Backend: AI columns + auto-notes (Phase 4.2 + 4.6) | B2 |
| B12 | 4.7 | Simplify `entity-going-cold` and `missed-follow-up` nudge detectors to use `heat_label` / `owe_reply_*` | `claude/frontend-nudge-simplify` | Backend: nudge detectors use materialized columns (Phase 4.7) | B7, B8 |
| B13 | 7 | Wire 5 new Inngest functions: `heat-score-refresh`, `ai-column-compute`, `promise-closure-check`, `auto-note-generation`, `owe-reply-refresh` | `claude/frontend-inngest` | Backend: Inngest wiring (Phase 7) | B7, B8, B9, B11 |

## Order of operations

1. **Mapping PR** (this doc) lands first — sets the contract.
2. **Foundation, serial:** F1 (tokens) → F3 (shell) + F4 (primitives) in parallel → F2 (DESIGN.md) any time after F1.
3. **Backend, parallel with foundation:** B1, B2 first; then B3 + B4; then B5/B6/B7/B8/B9/B10/B11 in parallel; B12 after B7+B8; B13 last.
4. **Pages (Step 4):** spawn 4–6 page sub-agents at a time. Pages depend on F1 + F3 + F4 visually, and on B5/B6 for live data — but each page can ship a static-then-wired increment if its API isn't ready, with a follow-up to wire data.

## Resume rules

- Before starting any branch from this list, run `gh pr list --repo naveensb4/arvya-os --state open --json headRefName --jq '.[].headRefName' | grep claude/frontend-` and skip branches that already have an open PR.
- Sub-agents that hit a blocker post to `#claude-dev` tagging `@Pbabu` and exit cleanly — don't wedge the pipeline.
- A page is "done" only when CI is green or a clear blocker is posted to `#claude-dev`.

## Hard rules (from the prompt)

- Never push to `naveensb4/arvya-os` directly — only via PR.
- Push branches only to `Pbabu-Github/arvya-os` (`fork` remote).
- One PR per page or per logical chunk — never one giant PR.
- No em dashes in user-facing copy anywhere.
- Follow `CLAUDE.md` / `AGENTS.md` (Brain-first model, Tailwind v4 postcss, shared `AiClient`, source-backed answers, no demo-data fallbacks).
