# Slack connector + connector buttons — fix plan

## DEBUG REPORT

**Symptom**
- User says Slack connector previously worked; now appears missing.
- New Connectors page (PR #6) renders 7 visual cards but has no Connect / Sync-now / Reauth buttons.
- On any of the `claude/frontend-*` branches, `lib/connectors/slack.ts`, `app/api/connectors/slack/*`, and `lib/slack-bot/` do not exist.

**Root cause**
`claude/prep-frontend-rewrite` (the branch every `claude/frontend-*` branch is based on) was cut from `main` at `ce20a0f` (Notetaker work) on 2026-05-08 and is **4 commits behind main**:

| commit | title | what it added |
|---|---|---|
| `ea78bf2` | Monday customer sprint | onboarding wizard, unified Google OAuth, **Slack Q&A bot** |
| `cc5929b` | OAuth return URLs, auth middleware | login page for onboarding flow |
| `a0a05f4` | Connector sync fixes | Gmail INBOX, Drive Google Docs, **Slack history** sync |
| `81f9341` | chore | gstack skill routing rules in CLAUDE.md |

**Files missing on `claude/prep-frontend-rewrite` (present on main):**
- `apps/web/lib/connectors/slack.ts` (105 lines, full OAuth)
- `apps/web/lib/slack-bot/handler.ts` (Slack Q&A bot)
- `apps/web/app/api/connectors/slack/auth/start/route.ts`
- `apps/web/app/api/connectors/slack/auth/callback/route.ts`
- `apps/web/app/api/connectors/slack/events/route.ts`
- `apps/web/app/api/connectors/google/auth/start/route.ts`
- `apps/web/app/api/connectors/google/auth/callback/route.ts`
- `apps/web/app/api/brains/[brainId]/stats/route.ts`

**Files modified differently on main** (will surface as merge updates, not conflicts since my PRs do not touch them):
- `apps/web/lib/always-on/runtime.ts` (registers `slack` in `CONNECTOR_TYPES`)
- `apps/web/lib/connectors/gmail.ts`
- `apps/web/lib/connectors/google-drive.ts`
- `apps/web/lib/db/{schema.ts, repository.ts, in-memory-repository.ts, supabase-repository.ts}`
- `apps/web/lib/notetaker/runtime.ts`

**Why each PR (3-17) still merges cleanly to main**
My page-rewrite PRs only touch `apps/web/app/brains/[brainId]/{page}/page.tsx` plus new files (CSS modules, client components, public images). None of them edit `lib/connectors/`, `lib/db/`, `lib/always-on/`, `lib/slack-bot/`, or `app/api/connectors/`. So when Naveen merges any PR into main, the Slack code stays in place. **After merge, Slack works.**

**The visible UX gap that remains after merge**
The new `apps/web/app/brains/[brainId]/connections/page.tsx` (PR #6) renders pretty cards from `placeholderConnectors` and has no buttons. The `Live` / `Reauth` pills are decorative. To actually let the user authenticate Slack (or any of the four real OAuth connectors) the page needs the Connect / Reconnect / Sync-now / Disconnect buttons re-attached, wired to the existing routes that live on main.

## SCOPE

Two follow-up PRs.

### PR A — sync prep with main

**Branch:** `claude/prep-frontend-rewrite` (in place; updates PR #2 in the wash)

**Action:** `git checkout claude/prep-frontend-rewrite && git merge main`. Push to fork.

**Effect:** PR #2 picks up main's 4 missing commits. Every child branch (#3-17) inherits the merge content automatically because each PR's diff is computed against `main`, not against its base branch. The local-dev experience for any reviewer running `claude/frontend-*` becomes correct: Slack code present, OAuth routes present, `lib/connectors/slack.ts` importable.

**Risk:** none for the page PRs (no overlap with the merged files). PR #2's diff grows. Acceptable.

### PR B — re-attach Connector buttons against the new card layout

**Branch:** `claude/connector-buttons` off updated `claude/prep-frontend-rewrite` (after PR A).

**Goal:** the new Connectors page UI (the seven Octolane cards from PR #6) now drives real OAuth flows.

**Changes:**
1. Replace `placeholderConnectors` in `apps/web/app/brains/[brainId]/connections/page.tsx` with a real fetch via `ensureDefaultConnectorConfigs(brainId)` and `repository.listConnectorSyncRuns`.
2. Map each `ConnectorConfig` row to a card. Card pill becomes `Live` / `Reauth` from `config.status`, no longer hardcoded.
3. Add a `<a href="/api/connectors/{type}/auth/start?brainId=...">Connect</a>` per OAuth-capable card (`gmail`, `google_drive`, `outlook`, `slack`). Button label switches between `Connect` and `Reconnect` based on status.
4. Add a `Sync now` form per card that POSTs to `/api/connectors/{type}/sync` (or `/sync-now` for Slack/Recall) with `brainId` + `connectorConfigId`.
5. Arvya Notetaker card stays branded; `Sync now` button uses the generic `/sync-now` route.
6. HubSpot / Notion cards stay decorative until those connectors land.
7. Preserve the privacy section + 4-toggle client component from PR #6.

**Test plan:**
- `pnpm lint app/brains/[brainId]/connections/`
- `pnpm typecheck` — must not introduce new errors referencing `connections/`
- Visual: open `/brains/{id}/connections`, click `Connect Slack`, confirm redirect to `slack.com/oauth/v2/authorize`. After consent, return to `/brains/{id}/connections` with a `Live` pill.

## EXECUTION ORDER

1. **PR A** (merge main into prep) — lands first, fixes the local-branch base.
2. **PR B** (Connector buttons) — opens after A, since it depends on the OAuth routes existing in the working tree on the branch base.
3. (Optional) Browser-driven QA via `/browse` after both lands, to confirm visual parity with prototypes and click through the Slack OAuth flow.

## STATUS
Investigation: **DONE** — root cause confirmed via `git diff main..claude/prep-frontend-rewrite`, `git log` showing the 4 missing commits, and inspection of `lib/connectors/slack.ts` + `runtime.ts` on main showing healthy code.

Implementation: **DONE** — PR A merged main into prep (pushed; updates PR #2). PR B opened as PR #18.
