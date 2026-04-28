# Arvya OS

AI operating system for Arvya Company Brain today and customer Deal Brains later.

The immediate product target is for Arvya Company Brain to run the company as a source-backed, closed-loop operating layer: capture company artifacts, make them queryable, track open loops, surface drift, draft next actions, and learn from outcomes.

## What Works Now

- pnpm workspace monorepo with `apps/web` as the first working app.
- Create/select a Brain.
- Paste a source: transcript, email, note, document, GitHub/product decision, web content, or strategy output.
- Ingest the source through a LangGraph workflow.
- Extract structured memory with an LLM when `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` is set.
- Fall back to deterministic local extraction when API keys are missing, so the demo still works.
- Store sources, memory, and agent runs in Supabase Postgres when `DATABASE_URL` is set.
- Fall back to an in-memory development repository when Supabase is not configured.
- Embed memory with OpenAI embeddings when `OPENAI_API_KEY` is set and retrieve with pgvector.
- Ask source-backed questions through vector + lexical retrieval and LLM synthesis.
- View dedicated pages for sources, memory, open loops, insights, workflows, settings, and agent runs.

The app intentionally supports two modes:

- `in_memory`: no database or model keys required; useful for local product demos.
- `supabase`: enabled automatically when `DATABASE_URL` is present; uses Drizzle, pgvector, and persisted agent logs.

## Local Setup

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

The root route redirects to `/brains`.

## Supabase Setup

1. Create a Supabase project.
2. In Supabase SQL Editor, enable pgvector:

```sql
create extension if not exists vector;
```

3. Copy the project Postgres connection string into `DATABASE_URL`. Use the pooled connection string from Supabase, or the direct connection string if you are running migrations from a trusted network.
4. Copy `.env.example` to `.env.local` and fill in:

- `DATABASE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`
- `OPENAI_EMBEDDING_MODEL`
- `DEFAULT_MODEL_PROVIDER`
- `DEFAULT_MODEL`

5. Run migrations:

```bash
pnpm db:migrate
```

6. With `DATABASE_URL` still set in `.env.local`, run the foundation verifier. It temporarily exercises in-memory mode, then confirms `DATABASE_URL` selects Supabase:

```bash
pnpm verify:foundation
```

7. Verify real Supabase persistence with `DATABASE_URL` enabled:

```bash
pnpm verify:supabase
```

The Supabase verifier creates a temporary Brain, ingests a source, checks `source_items`, `memory_objects`, `open_loops`, `workflows`, and `agent_runs` are persisted in Postgres, asks a source-backed follow-up question, closes an open loop with an outcome, confirms the outcome persisted, then removes the temporary Brain when cleanup is possible.

## AI Setup

Set at least one model key:

- `ANTHROPIC_API_KEY` enables Claude-backed ingestion, Q&A, daily briefs, and follow-up drafting.
- `OPENAI_API_KEY` enables OpenAI-backed generation and memory embeddings.
- `OPENAI_EMBEDDING_MODEL` defaults to `text-embedding-3-small`.

## Replit Deployment (Always-On Staging)

Replit is the supported way to host the first always-on Arvya OS deployment. You get a public HTTPS URL so Recall webhooks and calendar auto-join work without ngrok or PB's laptop. Supabase remains the source of truth; Replit only hosts the Next.js server and Inngest webhook endpoint.

### 1. Import the repo into Replit

1. In Replit, click "Create Repl" → "Import from GitHub".
2. Select the `arvya-os` repository.
3. Replit reads `.replit` and `replit.nix` from the repo root and provisions Node 22 + corepack automatically.
4. After import, open the Shell and run:

```bash
corepack enable
pnpm install --frozen-lockfile
```

### 2. Add Replit Secrets

Open the **Secrets** panel and paste in the values below (do **not** put real keys in `.env.local` on Replit).

Required for the app to boot and run notetaker ingestion:

```
DATABASE_URL
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY
OPENAI_API_KEY
OPENAI_EMBEDDING_MODEL
DEFAULT_MODEL_PROVIDER
DEFAULT_MODEL
RECALL_API_KEY
RECALL_BASE_URL
RECALL_WEBHOOK_SECRET
ARVYA_PUBLIC_BASE_URL
INNGEST_EVENT_KEY
INNGEST_SIGNING_KEY
```

Required for connectors:

```
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI
GOOGLE_CALENDAR_REDIRECT_URI
GOOGLE_TRANSCRIPTS_FOLDER_ID
MICROSOFT_CLIENT_ID
MICROSOFT_CLIENT_SECRET
MICROSOFT_TENANT_ID
MICROSOFT_REDIRECT_URI
MICROSOFT_CALENDAR_REDIRECT_URI
```

`ARVYA_PUBLIC_BASE_URL` should match the public URL Replit assigns the deployment (set after step 4 below). When the explicit `*_REDIRECT_URI` variables are not set, OAuth flows default to `${ARVYA_PUBLIC_BASE_URL}/...` for the calendar and email callbacks.

### 3. Run database migrations

Use the Replit Shell:

```bash
pnpm install
pnpm db:migrate
pnpm verify:supabase
```

Migrations target the same Supabase project the app reads from at runtime. Re-run `pnpm db:migrate` whenever new migrations land in `supabase/migrations`.

### 4. Deploy

In Replit:

1. Click **Deploy** → **Autoscale** (recommended) or **Reserved VM** (if you want to avoid cold starts during a live demo).
2. Replit reads the `[deployment]` block in `.replit`, runs `pnpm install --frozen-lockfile && pnpm build`, then starts the app with `pnpm --filter @arvya/web start`. The Next.js server binds to `0.0.0.0` and uses the `PORT` Replit assigns.
3. Wait for the build to finish. Replit will show a public URL such as `https://arvya-os.<your-replit-domain>`.
4. Copy that URL into the `ARVYA_PUBLIC_BASE_URL` secret and redeploy so Recall callbacks and OAuth flows pick it up.

### 5. Verify the deployment

From the Replit Shell after the deploy is live:

```bash
pnpm verify:deployment
```

This script checks that:

- All required Replit Secrets are present.
- Supabase Postgres is reachable and the required tables exist.
- An end-to-end source ingestion runs against the live database (the temp Brain it creates is deleted on success).
- `${ARVYA_PUBLIC_BASE_URL}/api/connectors/recall/webhook` is reachable from the public internet.
- `${ARVYA_PUBLIC_BASE_URL}/api/health` returns `status: "ok"`.

You can also hit `/api/health` directly:

```bash
curl https://your-replit-url/api/health | jq .
```

The response reports whether the app is up, whether Postgres responded, which env groups are missing, and the canonical Recall webhook URL — without exposing any secret values.

### 6. Configure the Recall webhook

In the Recall dashboard, set the webhook URL to:

```
${ARVYA_PUBLIC_BASE_URL}/api/connectors/recall/webhook
```

Set `RECALL_WEBHOOK_SECRET` in Recall and as a Replit Secret. The webhook handler verifies signatures with the same secret.

### 7. Add OAuth redirect URIs to Google and Microsoft

Add the following Replit URLs to Google Cloud → APIs & Services → Credentials and Azure Active Directory → App registrations → Authentication:

Google:

```
${ARVYA_PUBLIC_BASE_URL}/api/connectors/google-drive/auth/callback
${ARVYA_PUBLIC_BASE_URL}/api/connectors/gmail/auth/callback
${ARVYA_PUBLIC_BASE_URL}/api/notetaker/google-calendar/auth/callback
```

Microsoft:

```
${ARVYA_PUBLIC_BASE_URL}/api/connectors/outlook/auth/callback
${ARVYA_PUBLIC_BASE_URL}/api/notetaker/outlook-calendar/auth/callback
```

### Operational notes

- Replit Deployments auto-scale, so cold starts can drop in-memory caches. Always use Supabase as the source of truth — never use Replit as the database.
- Update `ARVYA_PUBLIC_BASE_URL` and the OAuth redirect URIs every time you swap deployments to a new Replit URL or a custom domain.
- For serious customer-facing production, plan to graduate to Vercel / Fly / Render / Azure. Replit is for fast Arvya internal staging.

## Important Files

- `VISION.md`: product and architecture north star.
- `apps/web/app/page.tsx`: redirects into the Brain workspace.
- `apps/web/app/brains/[brainId]/*`: dedicated Brain workspace routes.
- `apps/web/app/api/*`: ingestion, ask, daily brief, health, and connector API routes.
- `apps/web/app/api/health/route.ts`: deployment health check used by Replit and `pnpm verify:deployment`.
- `apps/web/scripts/verify-deployment.ts`: post-deploy smoke test against the live Replit URL.
- `.replit`, `replit.nix`: Replit deployment configuration.
- `apps/web/lib/brain/store.ts`: application facade over repository, retrieval, and workflows.
- `apps/web/lib/db/repository.ts`: repository contract with in-memory and Supabase implementations.
- `apps/web/lib/db/schema.ts`: Supabase Postgres and pgvector schema.
- `apps/web/lib/ai/provider.ts`: Anthropic/OpenAI provider abstraction and embeddings.
- `apps/web/lib/retrieval/index.ts`: vector + lexical retrieval.
- `packages/core/src`: shared Brain types, templates, and Zod schemas.
- `packages/agents/src`: ingestion, ask, daily brief, and follow-up agents.
- `packages/connectors/src`: placeholder connector modules for later integrations.
- `packages/prompts/src`: shared prompt contracts.
- `supabase/migrations`: database migrations.
