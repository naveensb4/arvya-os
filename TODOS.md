# TODOS

## Embedding Batch-Window for Resolution Sweep

**What:** Batch embed() calls in the resolution sweep into groups of 20 instead of sequential per-loop calls.

**Why:** A brain with 200 open loops sends 200 sequential embedding API calls (~40s). Batching cuts wall-clock time to ~4s. Correctness is unchanged — purely a speed optimization for the progress bar UX during onboarding.

**Pros:**
- Prevents 40s+ sweep for power users with 200+ open loops
- Keeps progress bar responsive during onboarding
- Clean optimization that doesn't change correctness

**Cons:**
- Adds ~15 lines of batching logic to sweep function
- Minor complexity in error handling (partial batch failure)

**Context:** The resolution sweep (Phase 0, Step 4) embeds each open loop title to find matching sources via pgvector cosine similarity. The current design calls `ai.embed()` once per loop. The OpenAI/Anthropic embedding APIs support batch inputs — pass an array of strings, get an array of vectors. The sweep function in `apps/web/lib/inngest/functions/` should chunk loops into batches of 20, embed the batch, then fan out to pgvector queries.

**Depends on / blocked by:** Core resolution sweep must be working first (Phase 0 complete). Can ship as a fast-follow PR.

**Added:** 2026-05-10 via /plan-eng-review (D13, user chose "Add to TODOS.md")

---
