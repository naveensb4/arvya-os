import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { nudges as nudgesTable, openLoops as openLoopsTable } from "@/lib/db/schema";

// Slack Block Kit interactivity endpoint. Receives button presses from
// the deadline nudger's "Mark done" / "Snooze 3 days" / "Open in Arvya"
// buttons and applies them to the underlying open_loop.
//
// Slack sends interactive payloads as application/x-www-form-urlencoded
// with a "payload" field containing JSON. We verify the request signature
// using SLACK_SIGNING_SECRET (same pattern as /api/connectors/slack/events).

function verifySlackSignature(req: NextRequest, body: string): boolean {
  const timestamp = req.headers.get("x-slack-request-timestamp");
  const signature = req.headers.get("x-slack-signature");
  if (!timestamp || !signature) return false;
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) return false;
  // Reject requests older than 5 minutes (replay protection).
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 60 * 5) return false;
  const baseString = `v0:${timestamp}:${body}`;
  const hmac = crypto.createHmac("sha256", signingSecret).update(baseString).digest("hex");
  const expected = `v0=${hmac}`;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

type SlackAction = {
  action_id: string;
  block_id?: string;
  value?: string;
};

type SlackInteractionPayload = {
  type: string;
  user?: { id: string; name?: string };
  message?: { ts: string };
  channel?: { id: string };
  actions?: SlackAction[];
  response_url?: string;
};

async function markLoopDone(loopId: string, actorUserId: string | undefined): Promise<void> {
  const db = getDb();
  await db
    .update(openLoopsTable)
    .set({
      status: "closed",
      closedAt: new Date(),
      outcome: "Closed via Slack nudge button.",
      properties: sql`coalesce(${openLoopsTable.properties}, '{}'::jsonb)
        || jsonb_build_object(
          'closedBy', 'slack_nudge_button',
          'closedBySlackUserId', ${actorUserId ?? null}
        )`,
      updatedAt: new Date(),
    })
    .where(eq(openLoopsTable.id, loopId));
}

async function snoozeLoop(loopId: string, days: number, actorUserId: string | undefined): Promise<void> {
  const db = getDb();
  const newDue = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  await db
    .update(openLoopsTable)
    .set({
      dueDate: newDue,
      properties: sql`coalesce(${openLoopsTable.properties}, '{}'::jsonb)
        || jsonb_build_object(
          'snoozedAt', ${new Date().toISOString()},
          'snoozedBySlackUserId', ${actorUserId ?? null},
          'snoozedDays', ${days}
        )`,
      updatedAt: new Date(),
    })
    .where(eq(openLoopsTable.id, loopId));
}

async function recordNudgeAction(input: {
  channelId: string | undefined;
  slackTs: string | undefined;
  actionId: string;
}): Promise<void> {
  if (!input.channelId || !input.slackTs) return;
  const db = getDb();
  await db
    .update(nudgesTable)
    .set({
      acknowledgedAt: new Date(),
      // The schema doesn't have an actionTaken column on nudges; stash in
      // deliveredAt jsonb so it shows up in /open-loops/[loopId] history.
      deliveredAt: sql`coalesce(${nudgesTable.deliveredAt}, '{}'::jsonb)
        || jsonb_build_object(
          'actionTaken', ${input.actionId},
          'actedAt', ${new Date().toISOString()}
        )`,
      updatedAt: new Date(),
    })
    .where(
      sql`(${nudgesTable.deliveredAt}->'slack'->>'channel') = ${input.channelId}
          AND (${nudgesTable.deliveredAt}->'slack'->>'ts') = ${input.slackTs}`,
    );
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  if (!verifySlackSignature(req, body)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  // Slack form-encodes the payload field. Parse it.
  const params = new URLSearchParams(body);
  const raw = params.get("payload");
  if (!raw) return NextResponse.json({ ok: true });

  let payload: SlackInteractionPayload;
  try {
    payload = JSON.parse(raw) as SlackInteractionPayload;
  } catch {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  if (payload.type !== "block_actions" || !payload.actions || payload.actions.length === 0) {
    return NextResponse.json({ ok: true });
  }

  const action = payload.actions[0];
  const loopId = action.value;
  const userId = payload.user?.id;
  if (!loopId) return NextResponse.json({ ok: true });

  try {
    if (action.action_id === "loop_mark_done") {
      await markLoopDone(loopId, userId);
      await recordNudgeAction({
        channelId: payload.channel?.id,
        slackTs: payload.message?.ts,
        actionId: "marked_done",
      });
    } else if (action.action_id === "loop_snooze_3d") {
      await snoozeLoop(loopId, 3, userId);
      await recordNudgeAction({
        channelId: payload.channel?.id,
        slackTs: payload.message?.ts,
        actionId: "snoozed_3d",
      });
    } else if (action.action_id === "loop_open_in_arvya") {
      // Just an audit log — Slack's URL button handles the navigation
      // client-side; we don't need to do anything in our DB.
      await recordNudgeAction({
        channelId: payload.channel?.id,
        slackTs: payload.message?.ts,
        actionId: "opened_in_arvya",
      });
    }
  } catch (error) {
    console.error("[slack-interactions] action handler failed:", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
