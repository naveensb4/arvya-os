// Smart Nudger — finds open loops worth pinging the founders about and
// posts to the auto-created #arvya-brain Slack channel with interactive
// Block Kit buttons (Mark done / Snooze / Open in Arvya).
//
// Three kinds:
//   - pre_deadline      : due_date in next 24h, status active
//   - stale             : no source-evidence in 5+ days, status active
//   - outcome_uncertain : matcher returned 0.5–0.85 close confidence
//
// Throttle (we never want to spam):
//   - per-loop: max 1 of any kind per 24h
//   - global: if more than 5 nudges fire in one run, post a digest instead
//
// Audit: every nudge writes a row into public.nudges so we can see when
// we sent it, on which channel, with what slack_ts (to link future
// follow-up replies), and whether the user acted on it.

import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import type { OpenLoop } from "@arvya/core";
import { getDb } from "@/lib/db/client";
import { brains as brainsTable, nudges as nudgesTable, openLoops as openLoopsTable } from "@/lib/db/schema";
import { postSlackMessage } from "@/lib/connectors/slack";
import { ensureArvyaBrainChannel } from "./channel-bootstrap";

type NudgeKind = "pre_deadline" | "stale" | "outcome_uncertain" | "digest";

const ACTIVE_STATUSES = ["open", "in_progress", "needs_review", "waiting"] as const;
const PRE_DEADLINE_HOURS = 24;
const STALE_DAYS = 5;
const NUDGE_DEDUPE_HOURS = 24;
const DIGEST_THRESHOLD = 5;

function hoursUntil(iso: string): number {
  return (new Date(iso).getTime() - Date.now()) / (60 * 60 * 1000);
}

function daysSince(iso: string | undefined | null): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  return (Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000);
}

function brainPath(brainId: string, loopId: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? "https://app.arvya.ai";
  return `${baseUrl}/brains/${brainId}/open-loops/${loopId}`;
}

async function loopWasNudgedRecently(loopId: string, kind: NudgeKind): Promise<boolean> {
  const db = getDb();
  const cutoff = new Date(Date.now() - NUDGE_DEDUPE_HOURS * 60 * 60 * 1000);
  const [recent] = await db
    .select({ id: nudgesTable.id })
    .from(nudgesTable)
    .where(
      and(
        eq(nudgesTable.relatedOpenLoopId, loopId),
        eq(nudgesTable.nudgeType, kind),
        gte(nudgesTable.createdAt, cutoff),
      ),
    )
    .limit(1);
  return Boolean(recent);
}

type NudgeCandidate = {
  loop: OpenLoop;
  kind: NudgeKind;
  reason: string;
};

function buildNudgeBlocks(input: {
  candidate: NudgeCandidate;
  detailUrl: string;
}): unknown[] {
  const loop = input.candidate.loop;
  const headline =
    input.candidate.kind === "pre_deadline"
      ? loop.dueDate
        ? `*${loop.title}* is due ${formatDueRelative(loop.dueDate)}`
        : `*${loop.title}* is due soon`
      : input.candidate.kind === "stale"
        ? `*${loop.title}* has been quiet for ${Math.floor(daysSince(loop.updatedAt ?? loop.createdAt))} days`
        : input.candidate.kind === "outcome_uncertain"
          ? `Did *${loop.title}* close? The brain thinks it might have.`
          : `*${loop.title}*`;

  const contextLines: string[] = [];
  if (loop.owner) contextLines.push(`*Owner:* ${loop.owner}`);
  if (loop.priority) contextLines.push(`*Priority:* ${loop.priority}`);
  contextLines.push(`*Loop type:* ${loop.loopType.replace(/_/g, " ")}`);
  if (input.candidate.reason) contextLines.push(`_${input.candidate.reason}_`);

  return [
    {
      type: "section",
      text: { type: "mrkdwn", text: headline },
    },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: contextLines.join("  •  ") }],
    },
    {
      type: "actions",
      block_id: `loop_actions_${loop.id}`,
      elements: [
        {
          type: "button",
          action_id: "loop_mark_done",
          text: { type: "plain_text", text: "Mark done" },
          style: "primary",
          value: loop.id,
        },
        {
          type: "button",
          action_id: "loop_snooze_3d",
          text: { type: "plain_text", text: "Snooze 3 days" },
          value: loop.id,
        },
        {
          type: "button",
          action_id: "loop_open_in_arvya",
          text: { type: "plain_text", text: "Open in Arvya" },
          url: input.detailUrl,
          value: loop.id,
        },
      ],
    },
  ];
}

function formatDueRelative(iso: string): string {
  const hours = hoursUntil(iso);
  if (hours < 0) return `${Math.floor(-hours)}h overdue`;
  if (hours < 24) return `in ${Math.max(1, Math.floor(hours))}h`;
  if (hours < 48) return "tomorrow";
  return `in ${Math.floor(hours / 24)} days`;
}

function buildNudgeFallbackText(c: NudgeCandidate): string {
  if (c.kind === "pre_deadline" && c.loop.dueDate) {
    return `Heads up: "${c.loop.title}" is due ${formatDueRelative(c.loop.dueDate)}`;
  }
  if (c.kind === "stale") {
    return `Stale loop: "${c.loop.title}" hasn't moved in ${Math.floor(daysSince(c.loop.updatedAt ?? c.loop.createdAt))} days`;
  }
  if (c.kind === "outcome_uncertain") {
    return `Did "${c.loop.title}" close? The brain thinks it might have.`;
  }
  return `Loop update: "${c.loop.title}"`;
}

async function findNudgeCandidates(brainId: string): Promise<NudgeCandidate[]> {
  const db = getDb();
  const now = new Date();
  const preDeadlineCutoff = new Date(now.getTime() + PRE_DEADLINE_HOURS * 60 * 60 * 1000);
  const staleCutoff = new Date(now.getTime() - STALE_DAYS * 24 * 60 * 60 * 1000);

  // Pre-deadline: status active AND due_date between now and now+24h
  const preDeadlineRows = await db
    .select()
    .from(openLoopsTable)
    .where(
      and(
        eq(openLoopsTable.brainId, brainId),
        sql`${openLoopsTable.status} = ANY(ARRAY[${sql.join(ACTIVE_STATUSES.map((s) => sql`${s}::open_loop_status`), sql`, `)}])`,
        sql`${openLoopsTable.dueDate} IS NOT NULL`,
        sql`${openLoopsTable.dueDate} <= ${preDeadlineCutoff.toISOString()}::timestamptz`,
        sql`${openLoopsTable.dueDate} >= ${new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString()}::timestamptz`,
      ),
    );

  // Stale: status active AND updated_at older than 5 days AND has no due_date (or due_date isn't imminent)
  const staleRows = await db
    .select()
    .from(openLoopsTable)
    .where(
      and(
        eq(openLoopsTable.brainId, brainId),
        sql`${openLoopsTable.status} = ANY(ARRAY[${sql.join(ACTIVE_STATUSES.map((s) => sql`${s}::open_loop_status`), sql`, `)}])`,
        lt(openLoopsTable.updatedAt, staleCutoff),
      ),
    );

  // Outcome-uncertain: properties.outcomeUncertainAt is set in the last 48h and we haven't acted
  const uncertainRows = await db
    .select()
    .from(openLoopsTable)
    .where(
      and(
        eq(openLoopsTable.brainId, brainId),
        sql`${openLoopsTable.properties}->>'outcomeUncertainAt' IS NOT NULL`,
        sql`(${openLoopsTable.properties}->>'outcomeUncertainAt')::timestamptz >= ${new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString()}::timestamptz`,
      ),
    );

  const candidates: NudgeCandidate[] = [];
  for (const row of preDeadlineRows) {
    candidates.push({
      loop: rowToOpenLoop(row),
      kind: "pre_deadline",
      reason: row.dueDate ? `Due ${formatDueRelative(row.dueDate.toISOString())}.` : "Due soon.",
    });
  }
  for (const row of staleRows) {
    // Skip if it's already in pre_deadline (the more-urgent kind wins).
    if (candidates.some((c) => c.loop.id === row.id)) continue;
    candidates.push({
      loop: rowToOpenLoop(row),
      kind: "stale",
      reason: `No update in ${Math.floor(daysSince(row.updatedAt?.toISOString() ?? row.createdAt.toISOString()))} days.`,
    });
  }
  for (const row of uncertainRows) {
    if (candidates.some((c) => c.loop.id === row.id)) continue;
    const props = (row.properties ?? {}) as Record<string, unknown>;
    const evidenceQuote = typeof props.outcomeUncertainEvidenceQuote === "string"
      ? props.outcomeUncertainEvidenceQuote
      : null;
    candidates.push({
      loop: rowToOpenLoop(row),
      kind: "outcome_uncertain",
      reason: evidenceQuote ? `Possible closure: "${evidenceQuote.slice(0, 120)}"` : "Possible auto-closure flagged for review.",
    });
  }

  return candidates;
}

function rowToOpenLoop(row: typeof openLoopsTable.$inferSelect): OpenLoop {
  return {
    id: row.id,
    brainId: row.brainId,
    sourceItemId: row.sourceItemId ?? undefined,
    title: row.title,
    description: row.description,
    loopType: row.loopType,
    owner: row.owner ?? undefined,
    status: row.status,
    priority: row.priority,
    dueDate: row.dueDate?.toISOString(),
    suggestedAction: row.suggestedAction ?? undefined,
    suggestedFollowUpEmail: (row.suggestedFollowUpEmail ?? null) as OpenLoop["suggestedFollowUpEmail"],
    requiresHumanApproval: row.requiresHumanApproval,
    approvedAt: row.approvedAt?.toISOString(),
    outcome: row.outcome ?? undefined,
    sourceQuote: row.sourceQuote ?? undefined,
    confidence: row.confidence ? Number(row.confidence) : undefined,
    properties: (row.properties ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt?.toISOString(),
    closedAt: row.closedAt?.toISOString(),
  };
}

async function recordNudge(input: {
  brainId: string;
  loop: OpenLoop;
  kind: NudgeKind;
  channelId: string;
  slackTs: string | null;
  reason: string;
}): Promise<void> {
  const db = getDb();
  const title =
    input.kind === "pre_deadline"
      ? `Heads up: ${input.loop.title}`
      : input.kind === "stale"
        ? `Stale: ${input.loop.title}`
        : input.kind === "outcome_uncertain"
          ? `Possibly closed: ${input.loop.title}`
          : input.loop.title;

  await db.insert(nudgesTable).values({
    brainId: input.brainId,
    nudgeType: input.kind,
    title: title.slice(0, 200),
    description: input.reason.slice(0, 500),
    severity: input.kind === "pre_deadline" ? "warning" : "info",
    relatedOpenLoopId: input.loop.id,
    deliveryChannels: ["slack:#arvya-brain"],
    deliveredAt: input.slackTs
      ? { slack: { channel: input.channelId, ts: input.slackTs, at: new Date().toISOString() } }
      : {},
  });

  // Also stamp the loop so the matcher knows we already nudged on this.
  await db
    .update(openLoopsTable)
    .set({
      properties: sql`coalesce(${openLoopsTable.properties}, '{}'::jsonb) || jsonb_build_object('lastNudgedAt', ${new Date().toISOString()}, 'lastNudgeKind', ${input.kind})`,
      updatedAt: new Date(),
    })
    .where(eq(openLoopsTable.id, input.loop.id));
}

async function listAllBrainIds(): Promise<string[]> {
  const db = getDb();
  const rows = await db.select({ id: brainsTable.id }).from(brainsTable);
  return rows.map((r) => r.id);
}

export type DeadlineNudgerResult = {
  brainsScanned: number;
  candidates: number;
  posted: number;
  skippedDeduped: number;
  skippedNoSlack: number;
  digestsPosted: number;
  failures: number;
};

export async function runDeadlineNudgerForAllBrains(): Promise<DeadlineNudgerResult> {
  const result: DeadlineNudgerResult = {
    brainsScanned: 0,
    candidates: 0,
    posted: 0,
    skippedDeduped: 0,
    skippedNoSlack: 0,
    digestsPosted: 0,
    failures: 0,
  };
  const brainIds = await listAllBrainIds();
  for (const brainId of brainIds) {
    try {
      const perBrain = await runDeadlineNudgerForBrain(brainId);
      result.brainsScanned += 1;
      result.candidates += perBrain.candidates;
      result.posted += perBrain.posted;
      result.skippedDeduped += perBrain.skippedDeduped;
      result.skippedNoSlack += perBrain.skippedNoSlack;
      result.digestsPosted += perBrain.digestsPosted;
      result.failures += perBrain.failures;
    } catch (error) {
      console.error(`[deadline-nudger] brain ${brainId} failed:`, error);
      result.failures += 1;
    }
  }
  return result;
}

export async function runDeadlineNudgerForBrain(brainId: string): Promise<DeadlineNudgerResult> {
  const result: DeadlineNudgerResult = {
    brainsScanned: 1,
    candidates: 0,
    posted: 0,
    skippedDeduped: 0,
    skippedNoSlack: 0,
    digestsPosted: 0,
    failures: 0,
  };

  const candidates = await findNudgeCandidates(brainId);
  result.candidates = candidates.length;
  if (candidates.length === 0) return result;

  // Filter out anything we already nudged in the dedupe window.
  const fresh: NudgeCandidate[] = [];
  for (const c of candidates) {
    if (await loopWasNudgedRecently(c.loop.id, c.kind)) {
      result.skippedDeduped += 1;
      continue;
    }
    fresh.push(c);
  }
  if (fresh.length === 0) return result;

  const channel = await ensureArvyaBrainChannel(brainId);
  if (!channel) {
    result.skippedNoSlack += fresh.length;
    return result;
  }

  // If too many at once, post a single digest message instead of N pings.
  if (fresh.length > DIGEST_THRESHOLD) {
    const digestText = `${fresh.length} loops need attention this morning.`;
    const lines = fresh.slice(0, 12).map((c) => `• *${c.loop.title}* — ${c.reason}`).join("\n");
    const blocks = [
      { type: "section", text: { type: "mrkdwn", text: `*${digestText}*` } },
      { type: "section", text: { type: "mrkdwn", text: lines } },
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: `Open the dashboard: ${process.env.NEXT_PUBLIC_APP_URL ?? "https://app.arvya.ai"}/brains/${brainId}/open-loops` }],
      },
    ];
    try {
      const post = await postSlackMessage(channel.botToken, channel.channelId, digestText, blocks);
      const db = getDb();
      await db.insert(nudgesTable).values({
        brainId,
        nudgeType: "digest",
        title: digestText,
        description: lines.slice(0, 500),
        severity: "info",
        relatedOpenLoopId: null,
        deliveryChannels: ["slack:#arvya-brain"],
        deliveredAt: post?.ts
          ? { slack: { channel: channel.channelId, ts: post.ts, at: new Date().toISOString() } }
          : {},
      });
      result.digestsPosted += 1;
    } catch (error) {
      console.error("[deadline-nudger] digest post failed:", error);
      result.failures += 1;
    }
    return result;
  }

  for (const c of fresh) {
    try {
      const detailUrl = brainPath(brainId, c.loop.id);
      const blocks = buildNudgeBlocks({ candidate: c, detailUrl });
      const fallback = buildNudgeFallbackText(c);
      const post = await postSlackMessage(channel.botToken, channel.channelId, fallback, blocks);
      await recordNudge({
        brainId,
        loop: c.loop,
        kind: c.kind,
        channelId: channel.channelId,
        slackTs: post?.ts ?? null,
        reason: c.reason,
      });
      result.posted += 1;
    } catch (error) {
      console.error(`[deadline-nudger] failed for loop ${c.loop.id}:`, error);
      result.failures += 1;
    }
  }

  return result;
}
