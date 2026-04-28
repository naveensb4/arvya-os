# Workstream D — Connector Audit & Production-Quality Sprint

Owner: Workstream D (connectors).
Goal: bring the high-priority connectors (Gmail, Recall/notetaker, Google
Drive) to honest production quality so the Brain can ingest from real
sources, not just manual paste. Outlook is brought to parity with Gmail.
GitHub and Replit Outreach are explicitly downgraded to honest stubs.

All boundaries from `AGENTS.md` are respected: this sprint does **not**
modify `packages/agents/src/*`, `apps/web/lib/workflows/source-ingestion.ts`,
`apps/web/lib/retrieval`, `apps/web/lib/brain/store.ts`,
`apps/web/lib/brain/dashboard.ts`, `apps/web/lib/brain/memory-quality.ts`,
the daily brief, or drift detection. Connector code only *calls* into those
modules.

## Audit Matrix

| Connector | OAuth real? | Sync real? | Source normalization? | Ingestion handoff? | Idempotent? | Schedule? | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Gmail | yes (auth/start, callback, refresh) | yes (Gmail REST + label scoping + watermark) | yes (`createEmailSource` → `source-normalization`) | yes (`processSourceItemIntoBrain`) | yes (`gmail:<message_id>` + content fingerprint) | yes (`scheduledConnectorSync` Inngest cron, every 10 min) | GREEN |
| Recall (notetaker) | yes (Google + Outlook calendar OAuth, Recall API key for bots) | yes (calendar list + bot scheduling + transcript webhook ingest) | yes (`ingestNotetakerTranscript` → `source-normalization`) | yes (`processSourceItemIntoBrain`) | yes (`external_event_id`, `recall_transcript_id`, content fingerprint) | yes (`notetakerCalendarSync` Inngest cron, every 10 min) | GREEN |
| Google Drive | yes (auth/start, callback, refresh) | yes (Drive REST + folder scoping + watermark) | yes (custom `createSourceItem` + `source-normalization`) | yes (`processSourceItemIntoBrain`) | yes (`drive_file_id` + content fingerprint) | yes (`scheduledConnectorSync` Inngest cron, every 10 min) | GREEN |
| Outlook | yes (auth/start, callback, refresh) | yes (Microsoft Graph + folder/category scoping + watermark) | yes (`createEmailSource`) | yes (`processSourceItemIntoBrain`) | yes (`outlook:<message_id>` + content fingerprint) | yes (`scheduledConnectorSync` Inngest cron, every 10 min) | GREEN |
| GitHub | no | no (honest stub) | n/a | n/a | n/a | n/a | RED (intentional stub) |
| Replit Outreach | no | no (honest stub) | n/a | n/a | n/a | n/a | RED (intentional stub) |

### Gmail
- **What works.** OAuth start (`/api/connectors/gmail/auth/start`), callback
  (`/api/connectors/gmail/auth/callback`), and `refreshGmailCredentials`
  using `connectorCredentialStore`. `GmailRestClient` lists labels and
  messages against `https://gmail.googleapis.com`. `syncGmailConnector`
  refuses unscoped `INBOX` syncs unless `maxItemTestMode` is explicitly
  on, runs each message through `emailMatchesAryvaScope`, and routes the
  remainder through `createEmailSource → processSourceItemIntoBrain` so
  memory + open loops + agent runs all populate. Idempotency is enforced
  by `sourceFingerprint` (connector-scoped) and the `gmail:<message_id>`
  external id. The Inngest `scheduled-connector-sync` cron runs every 10
  minutes and dispatches eligible Gmail configs through
  `runScheduledConnectorSync`.
- **What was stubbed.** Sync was *not* incremental: the client always
  fetched the latest 50 messages and relied on post-fetch deduping. That
  worked but burned API budget and slowed down per-tick latency.
- **Top fixes (this sprint).** (1) Added a `since`-aware `listMessages`
  that maps to Gmail's `q=after:<unix>` query operator. (2) The connector
  now persists a `config.watermark` ISO timestamp set to the latest
  observed `internalDate` and uses it on the next run. (3) Mock verifier
  asserts the watermark advances and the second sync sends the watermark
  as `since`.

### Recall (Notetaker)
- **What works.** Google and Outlook calendar OAuth flows under
  `/api/notetaker/{google,outlook}-calendar/auth/*` with token refresh.
  Recall API key (`RECALL_API_KEY`) drives `RecallClient` for listing
  calendar events, scheduling bots, and downloading transcripts.
  `runNotetakerCalendarSync` filters events to a lookahead window, applies
  `shouldJoinMeeting` policy, idempotently creates/updates a
  `notetaker_meetings` row keyed by `external_event_id` /
  `recallCalendarEventId`, and avoids double-scheduling bots.
  Webhook delivery (`/api/connectors/recall/webhook`) verifies signatures
  via `verifyRecallWebhookSignature` (fails closed in production without
  `RECALL_WEBHOOK_SECRET`), maps the bot back to a Brain, and runs
  `ingestNotetakerTranscript` which normalizes the transcript text and
  routes it through the standard ingestion pipeline. Idempotency is
  guaranteed by `recall_transcript_id`, the meeting linkage, and a
  content fingerprint. The Inngest `notetaker-calendar-sync` cron runs
  every 10 minutes alongside `scheduled-connector-sync`.
- **What was stubbed.** The transcript ingestion is real and the
  webhook handler is real; the calendar sync is real. Earlier cycles
  worried about the mock client masking bugs, but we already keep a
  `MockRecallClient` strictly for verifier use.
- **Top fixes (this sprint).** (1) Verifier now explicitly asserts that
  re-running calendar sync does not double-schedule, and that
  `calendar.lastSyncAt` advances (the notetaker watermark equivalent).
  (2) Verifier emits ✅/❌ output per assertion. (3) `notConfiguredConnector`
  message updated for sibling stubs to point to this document so future
  attempts to use them fail with a clear path-to-real.

### Google Drive
- **What works.** OAuth start (`/api/connectors/google-drive/auth/start`),
  callback, and refresh under `connectorCredentialStore`.
  `GoogleDriveRestClient.listFiles` queries `'<folderId>' in parents and
  trashed = false` and the connector refuses to sync top-level/shared
  roots. Files become `transcript` source items via the trace metadata
  + dedupe-key + content-hash trio and are routed through
  `processSourceItemIntoBrain`. The cron above also dispatches Drive
  configs.
- **What was stubbed.** Same as Gmail: list-then-dedupe meant the cost
  was O(folder size) every tick.
- **Top fixes (this sprint).** (1) `listFiles` now appends a
  `modifiedTime > '<rfc3339>'` predicate when a watermark is present. (2)
  The connector tracks the highest observed `modifiedTime` and persists
  it back into `config.watermark` so the next run is delta-only. (3) Mock
  verifier asserts the full sequence: full sync → watermark stored →
  empty delta sync → newer file arrival → delta sync ingests only that
  file → watermark advances again.

### Outlook
- **What works.** Mirrors Gmail: OAuth flow, `OutlookGraphClient` over
  Microsoft Graph, folder + category scoping, `createEmailSource`
  ingestion, `outlook:<message_id>` idempotency. Same Inngest cron.
- **What was stubbed.** Same as Gmail (no incremental fetch).
- **Top fixes (this sprint).** (1) `listMessages` and
  `listMessagesByCategory` now compose a `receivedDateTime gt <iso>`
  filter clause. (2) Connector persists `config.watermark`. (3) Mock
  verifier extends the existing email verifier to cover the symmetric
  Outlook path.

### GitHub (honest stub)
- **Status.** Intentional `notConfiguredConnector` stub. Calling its
  `sync` throws an error referencing this document. Routes for GitHub do
  not exist under `apps/web/app/api/connectors/`.
- **Path to real.** Use a GitHub App (preferred over OAuth user tokens
  for org-wide repo access) with scopes `Contents: read`, `Issues: read`,
  `Pull requests: read`, `Metadata: read`. Webhook subscriptions for
  `issues`, `pull_request`, `pull_request_review`, `release`, and
  `push` (filtered to default branch) on the App side; periodic backfill
  via `GET /repos/{owner}/{repo}/issues?since=<watermark>` and
  `GET /repos/{owner}/{repo}/pulls?state=all&sort=updated&direction=desc`.
  Each event becomes a `github` source item with metadata
  `{ repo_full_name, event_type, github_id, sha?, pr_number?, issue_number? }`
  and routes through `processSourceItemIntoBrain` like the email
  connectors. Watermark = `max(updated_at)` per repo.

### Replit Outreach (honest stub)
- **Status.** Intentional `notConfiguredConnector` stub. Same throw path.
- **Path to real.** Replit Outreach exposes campaign reply data through
  the Replit Outreach API (the in-house outreach tool we use for cold
  outbound). Wire this connector to: (a) authenticate with a service
  token stored in `connectorCredentialStore`, (b) sync replies + reply
  classification + thread metadata, (c) emit per-reply source items of
  kind `note` with metadata `{ campaign_id, sequence_id, thread_id, reply_id, sentiment? }`,
  and (d) produce one `outreach_thread` source per converted thread so
  the Brain can compute "what outreach angles are working" per VISION.md
  §"What outreach angles are working?". Watermark = `max(reply.updated_at)`.

## Schedule

`apps/web/lib/inngest/functions/index.ts` already registers two crons that
back the runtime:

- `scheduled-connector-sync` runs `*/10 * * * *` and calls
  `runScheduledConnectorSync()`, which iterates over every eligible
  `connector_configs` row and dispatches by `connectorType` to the right
  sync function. Gmail, Outlook, and Drive all flow through this path.
- `notetaker-calendar-sync` runs `*/10 * * * *` and calls
  `runNotetakerCalendarSync()` to refresh calendar events and schedule
  Recall bots. Transcript ingestion happens on webhook delivery.

The verifier `pnpm verify:scheduler-mock` exercises the per-config
eligibility logic (`shouldRunConnector`).

## Idempotency

| Connector | Primary dedupe key | Secondary signal |
| --- | --- | --- |
| Gmail | `gmail:<message_id>` | content hash via `sourceFingerprint`, `gmail_thread_id` |
| Outlook | `outlook:<message_id>` | content hash via `sourceFingerprint`, `outlook_categories` |
| Google Drive | `drive_file_id` | `source_content_hash`, `dedupe_keys` |
| Recall meetings | `external_event_id` / `recallCalendarEventId` | bot id |
| Recall transcripts | `recall_transcript_id` | content hash via `transcriptFingerprint` |

All four high-priority connectors call `processSourceItemIntoBrain` which
in turn writes through `agent_runs` (auditable) and never bypasses the
shared ingestion contract.

## Watermarks

We persist a per-config string watermark on
`connector_configs.config.watermark`. The runtime
(`apps/web/lib/always-on/runtime.ts → syncConnectorConfig`) merges
`nextWatermark` from the connector return value back into the row on
every successful sync. Each connector's `nextWatermark` is the highest
ISO timestamp it *observed* during the run (not the run start time), so
we never skip past a message that arrived while we were paginating.

## Token storage

Tokens flow through `apps/web/lib/connectors/credential-store.ts` for
read/write/merge. Calendar credentials for the notetaker live on
`notetaker_calendars.config.credentials` and are fed through
`refreshGoogleCalendarCredentials` /
`refreshOutlookCalendarCredentials`.

The connector credential payload is currently stored at rest in the
`connector_configs.credentials` JSONB column without application-level
encryption; in Supabase deployments the volume is encrypted but the
plaintext is still legible to anyone with `service_role` access. This
sprint adds a security TODO note in `credential-store.ts` and stops
short of implementing envelope encryption — see "Production-readiness
sequence" below for the path to closing that gap.

## Health endpoint

`/api/health` now returns a `connectors` array summarizing per-type
state without exposing secrets:

```
connectors: [
  { connectorType: "gmail", configCount, withCredentials, lastSyncAt, lastSuccessAt, lastError, watermark },
  { connectorType: "google_drive", ... },
  { connectorType: "outlook", ... },
  { connectorType: "notetaker_calendar", ... }, // includes Google + Outlook calendars
]
```

`lastError` is sanitized (token-shaped substrings stripped, capped at
240 characters). The health response is unchanged otherwise.

## Mock verifiers

Three verifiers cover the end-to-end ingestion + watermark + idempotency
behavior in the in-memory repository, with stubbed provider clients that
honor the `since` watermark:

- `pnpm verify:email-connectors-mock` — Gmail + Outlook (23 checks).
- `pnpm verify:notetaker-mock` — Recall calendar + transcript
  webhook flow (15 checks).
- `pnpm verify:google-drive-mock` — Drive folder sync (11 checks).

Each verifier prints `✅`/`❌` per assertion and exits non-zero on any
failure.

## Production-readiness sequence

1. **Today, code-side, no infra needed.** Verify Gmail/Outlook/Drive
   OAuth in a real browser session, capture the connector ids, and
   confirm `/api/health` reports `withCredentials >= 1` and a
   `lastSyncAt` after the first cron tick.
2. **Add credentials encryption at rest.** Wrap the JSON payload in
   `credential-store.ts` with envelope encryption (KMS-wrapped DEK +
   AES-GCM). Migration backfills existing rows.
3. **Surface per-connector health in the dashboard.** The `connectors`
   field added to `/api/health` is now ready to feed a small "Connector
   health" card on the dashboard; cite this in the next dashboard
   sprint.
4. **Add Slack/Teams/Linear connectors next.** Per VISION.md sequencing:
   they reuse the contract and watermark pattern that Gmail/Outlook/Drive
   established this sprint.
5. **Promote GitHub from honest stub to real.** GitHub App, webhook
   subscription, backfill via REST, watermark by `updated_at`. Land a
   matching mock verifier that mirrors `verify-email-connectors-mock.ts`.
6. **Replit Outreach connector.** Wire the existing reply data into the
   `outreach_thread` source kind so the Brain can compute outreach-angle
   learning per VISION.md §"What outreach angles are working?".
7. **Live load test on Recall webhook flow.** Simulate concurrent
   webhook deliveries to confirm the `transcript_id` dedupe holds under
   retry.
