<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Arvya Deal OS Working Context

- Keep `VISION.md` current when product philosophy, architecture, sequencing, or core MVP scope changes.
- Preserve the Brain-first model: Brains own sources, structured memory, open loops, workflows, answers, and agent runs.
- Build manual source ingestion before heavy integrations. Future connectors should plug into the same Source abstraction.
- Every important answer should be source-backed. Every model or agent workflow should be logged in `agent_runs`.
- Prefer flexible metadata and workflow definitions over rigid CRM-style fields unless a field is a core invariant.
- This repo uses pnpm workspaces. The first runnable app is `apps/web`; shared domain types live in `packages/core`; agent workflows live in `packages/agents`; prompt contracts live in `packages/prompts`; connector placeholders live in `packages/connectors`.
- Supabase migrations live in `supabase/migrations`, with Drizzle configured from the repo root.
- Keep agent package logic model-agnostic. `packages/agents` depends on the `AiClient` interface from `@arvya/core`; concrete Anthropic/OpenAI wiring belongs in `apps/web/lib/ai`.
- Preserve deterministic local fallbacks for demos without model keys, but do not represent those fallbacks as production-quality extraction or Q&A.
- When adding source-backed answers, retrieve memory first, answer only from retrieved memory, and include citations.
