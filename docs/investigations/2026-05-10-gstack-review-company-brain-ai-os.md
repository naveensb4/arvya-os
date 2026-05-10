# GStack Review: Company Brain / AI OS

Date: 2026-05-10
Branch: `os-redesign`
Inputs:

- `VISION.md`
- `README.md`
- `DESIGN.md`
- `docs/plans/closed-loop-core.md`
- `docs/investigations/2026-05-10-company-brain-ai-os-research.md`
- Current closed-loop implementation, schema, retrieval, APIs, and verifier scripts

## Overall Verdict

**Direction approved, implementation blocked before broader rollout.**

The research and existing product vision are aligned: Arvya should build a closed-loop company operating system, not a generic chatbot or search wrapper. The active `closed-loop-core.md` plan picks the right wedge: entity resolution, outcome detection, loop nudging, Slack operating cadence, and loop history.

The architecture is close, but several trust-critical implementation details need fixing before Arvya should rely on the closed-loop core for real operating decisions.

## Phase 1: CEO / Strategy Review

Verdict: **SELECTIVE EXPANSION**

The strategic wedge is correct. Arvya should keep prioritizing the internal Company Brain until it reliably runs the company. The strongest product metric is not sources ingested or questions answered; it is important loops detected, advanced, resolved, or prevented from dropping.

Top strategy findings:

- The closed-loop core is the right product wedge.
- Trust infrastructure is under-scoped: evals, false-positive controls, human overrides, and auditability should ship with the matcher.
- Slack should become a founder operating cadence, not just an alert sink.
- Entity resolution is necessary but not the product moment. The wow moment is the Brain noticing a loop changed and creating the next action.
- Positioning is strongest as "closed-loop company OS," not generic AI OS or early Deal Brain platform.

Accepted scope changes:

- Add an eval harness for entity resolution, loop creation, outcome matching, false auto-close rate, and human override rate.
- Add a trust surface to loop history: evidence quote, confidence, decision reason, reopen, override, and audit trail.
- Add or tighten the active priorities model so daily brief and drift can compare current reality against stated intent.
- Make the demo narrative: source creates loop -> Slack prevents drop -> later source closes loop -> Brain creates next loop -> brief captures learning.

Deferred:

- Full graph explorer.
- Broad connector expansion.
- Workflow builder.
- MCP marketplace.
- Deal Brain productization.

## Phase 2: Design / UX Review

Verdict: **DONE WITH CONCERNS**

The product still reads like a collection of dashboards in places. The desired UX is an operating cockpit: what needs attention now, what changed, what the Brain believes, and why it believes it.

Scores:

- IA: 7/10
- Trust: 5/10
- Loop workflow: 7/10
- Daily cadence: 6/10
- Design-system alignment: 5/10
- Responsiveness/accessibility: 5/10

Top design findings:

- The core loop is not yet the first-class IA. `Sources`, `Memory`, `Open Loops`, `Brief`, `Drift`, and `Agent Runs` are separate, but Naveen/PB need one "what needs attention now?" path.
- Trust is weakened by static/prototype data in pages like sources, graph, and agent-runs. For an AI OS, fake operating data is worse than an empty state.
- `open-loops` is the strongest product anchor, but loop detail needs explicit controls for approve close, reject match, snooze, assign, reopen, and correct memory.
- The dashboard should prioritize urgent promises, founder-only decisions, and evidence-backed suggested actions.
- `DESIGN.md` and the implemented dark shell/status colors need reconciliation.

Concrete UX changes:

- Rename primary nav from "Action items" to "Open loops" or "Loops."
- Add a top-level `Today` cockpit with: `Needs action`, `Recently closed by Brain`, `Needs founder decision`.
- Label or remove all prototype/static data.
- Add a "why this happened" trust panel to automated closures.
- Add a separate uncertain outcomes review queue.
- Make daily brief a morning ritual: changed since last brief, top 3 for Naveen, top 3 for PB, waiting on evidence, founder-only questions.

Deferred:

- Full interactive graph exploration.
- Agent builder UI.
- Visual analytics.
- Connector marketplace polish.

## Phase 3: Engineering Review

Verdict: **Architecture-approved, implementation-blocked**

Architecture diagram:

```text
Sources
  | manual / email / drive / recall
  v
source_items
  |
  v
source-ingestion workflow
  |-- classify / extract memory / detect loops
  |-- mergeMemoryObjectsForIngestion
  |     |-- legacy canonical-key dedupe
  |     `-- entity resolver
  |           |-- exact email/domain/alias
  |           |-- canonical_entities vector search
  |           `-- LLM reconciliation
  |
  |-- mergeRelationshipsForIngestion
  |-- create open_loops
  |-- outcome detector
  |     |-- active loop prefilter
  |     |-- LLM batch decision
  |     |-- close / advance / contradict
  |     `-- loop_outcome_log
  |
  `-- source_embeddings

Ask Brain / Daily Brief / UI
  |-- retrieval: source_embeddings + lexical memory/open_loops/source_items
  |-- people/companies UI: memory_objects today
  `-- retroactive matcher review: loop_outcome_log dry-run proposals
```

Critical findings:

- `memory_objects.canonical_entity_id` is not actually written. The schema has the column, but repository create/update types do not expose it, `supabase-repository` does not map it, and `memory-quality.ts` currently stores `canonicalEntityId` inside `properties` instead of the FK column.
- New Supabase brains can silently disable the resolver. `onboarding/actions.ts` passes `workspaceId`, but `createBrain` in `store.ts` discards it, so `source-ingestion.ts` can see no `brain.workspaceId` and skip resolver execution.

High findings:

- People/companies pages still read raw `memory_objects`, not `canonical_entities`, so the UI can still show duplicates even if canonical rows exist.
- Outcome detector and entity resolver need explicit `agent_runs`; the highest-risk AI decisions should not be hidden inside `save_results` or console logs.
- `verify:closed-loop` proves manual close/learning, but not the new auto outcome matcher, uncertain path, contradiction path, or Supabase persistence.
- Outcome memory metadata uses both `openLoopId` and `open_loop_id`; retrieval/UI can miss one or the other.

Medium findings:

- `memory_objects.embedding` exists but is not populated by repository create/update paths.
- Retroactive matcher should move out of synchronous request/response before real scale.
- Brain-scoped API/page operations need explicit workspace membership checks if service-role DB access bypasses RLS.
- Relationship graph is memory-object based; this is acceptable only once canonical FK linkage is real.

Recommended implementation changes:

1. Add `canonicalEntityId` and `embedding` to memory create/update/repository mapping.
2. Persist `workspaceId` and `createdByUserId` in brain creation.
3. Switch people/companies UI to `canonical_entities` + `entity_mentions`, or group by `canonical_entity_id` first.
4. Create dedicated `agent_runs` for `entity_resolver` and `outcome_detector`.
5. Normalize outcome metadata to one key.
6. Promote retroactive matching to a background job with progress, cancellation, retry, and per-source failure logging.

## Phase 3.5: Developer Experience Review

Verdict: **DONE WITH CONCERNS**

Persona: internal platform engineer joining Arvya OS to build the next connector, verifier, or agent tool surface.

Scores:

- Setup: 6.5/10
- Scripts: 7/10
- APIs: 6/10
- Errors: 5/10
- Docs: 7/10
- Local dev: 7.5/10
- Observability: 7/10
- Measurement: 6.5/10

Top DX findings:

- The repo has real primitives: ingestion, memory, open loops, outcomes, evals, connector health, and agent runs.
- Verifier coverage is good, but there is no quick way to know which verifier proves what.
- API ergonomics are pre-platform: route contracts are scattered across JSON handlers, server actions, redirects, and form posts.
- MCP/tool interfaces are still research-level. Typed tool contracts should exist before MCP wrapping.
- Error responses need hints and next commands, not just failure strings.

Concrete DX improvements:

- Add `docs/dx/quickstart.md` with 5-minute local, 15-minute Supabase, and live staging paths.
- Add `pnpm verify:list` or a verifier matrix with env requirements, LLM usage, live DB behavior, runtime, and what each command proves.
- Add API examples for ask, ingest, close loop, retroactive match, connector sync, and health.
- Standardize API errors as `{ error, code, issues?, hint?, docsUrl? }`.
- Create `packages/tools` for typed action contracts before MCP exposure.
- Make `/api/health` and agent-runs answer: "is the OS healthy enough to trust today?"

Deferred:

- Public SDK.
- Full MCP server packaging.
- OAuth walkthrough videos.
- Connector marketplace docs.
- Multi-tenant permission tutorials.

## Verification Run

Commands run:

- `pnpm typecheck` — failed.
- `pnpm test` — passed, 8 files / 37 tests.
- `pnpm verify:memory-quality` — passed.
- `pnpm verify:closed-loop` — passed, 30/30 checks.
- Fresh `pnpm dev` — running.
- `curl -s http://localhost:3000/api/health` — returned `status: ok`.

Typecheck failure summary:

- Stale `.next/types/validator.ts` route references for removed/moved app routes.
- `InMemoryRepository` missing newer `BrainRepository` methods.
- `WorkspaceInvite` imported but not exported from `@arvya/core`.
- Workspace member role mismatch: repository emits `admin` / `viewer`, core type only allows `owner` / `member`.
- Several Supabase repository connector return types are too loose (`string` instead of `ConnectorType` / `SourceType`).

Health endpoint summary:

- App status: ok.
- Database: configured and reachable.
- Supabase API/storage: configured and reachable.
- Recall, Inngest, Google, Microsoft, AI, and Supabase env groups: configured.
- Connector health includes existing reconnect/configuration issues for Gmail, Drive, Calendar, and Outlook.

## Final Recommendation

Do not expand into general platform, Deal Brain, MCP marketplace, or broad connector work yet.

Next build should be a hardening sprint for the closed-loop core:

1. Fix canonical entity FK persistence and workspace persistence.
2. Add dedicated agent runs for resolver and matcher.
3. Add matcher evals and Supabase integration tests.
4. Add the trust UI for automated outcomes.
5. Make `#arvya-brain` / `Today` the founder operating cadence.
6. Clean up typecheck drift enough that CI can trust this branch again.

The product direction is strong. The next bar is trust.
