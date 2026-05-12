import { NextResponse, type NextRequest } from "next/server";
import crypto from "crypto";
import { getRepository } from "@/lib/db/repository";
import { runMeetingPrep } from "@/lib/agents/meeting-prep";

function verifySlackSignature(request: NextRequest, body: string): boolean {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) return false;

  const timestamp = request.headers.get("x-slack-request-timestamp");
  const signature = request.headers.get("x-slack-signature");
  if (!timestamp || !signature) return false;

  const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 60 * 5;
  if (parseInt(timestamp) < fiveMinutesAgo) return false;

  const sigBasestring = `v0:${timestamp}:${body}`;
  const mySignature = "v0=" + crypto
    .createHmac("sha256", signingSecret)
    .update(sigBasestring)
    .digest("hex");

  return crypto.timingSafeEqual(Buffer.from(mySignature), Buffer.from(signature));
}

function levenshteinDistance(a: string, b: string): number {
  const la = a.length;
  const lb = b.length;
  const dp: number[][] = Array.from({ length: la + 1 }, () => Array(lb + 1).fill(0));
  for (let i = 0; i <= la; i++) dp[i][0] = i;
  for (let j = 0; j <= lb; j++) dp[0][j] = j;
  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[la][lb];
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  if (!verifySlackSignature(request, rawBody)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const params = new URLSearchParams(rawBody);
  const command = params.get("command");
  const text = params.get("text")?.trim() ?? "";
  const teamId = params.get("team_id");
  const userId = params.get("user_id");
  const responseUrl = params.get("response_url");

  if (command !== "/meeting-prep") {
    return NextResponse.json({ text: "Unknown command" });
  }

  // Respond immediately (Slack requires response within 3s)
  // Then do the actual work asynchronously
  const asyncWork = async () => {
    try {
      const repository = getRepository();
      const configs = await repository.listConnectorConfigs();
      const slackConfig = configs.find(
        (c) => c.connectorType === "slack" && c.status === "connected" && (c.config as any)?.teamId === teamId,
      );

      if (!slackConfig) {
        await respondToSlack(responseUrl!, { text: "No Brain connected to this Slack workspace." });
        return;
      }

      const brainId = slackConfig.brainId;
      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(now);
      todayEnd.setHours(23, 59, 59, 999);

      const meetings = await repository.listNotetakerMeetings({
        brainId,
        from: todayStart.toISOString(),
        to: todayEnd.toISOString(),
      });

      if (meetings.length === 0) {
        await respondToSlack(responseUrl!, { text: "No meetings found for today." });
        return;
      }

      let targetMeeting = meetings[0];
      if (text) {
        const q = text.toLowerCase();
        const match = meetings.find((m) => m.title.toLowerCase().includes(q));
        if (match) {
          targetMeeting = match;
        } else {
          let best = meetings[0];
          let bestScore = Infinity;
          for (const m of meetings) {
            const dist = levenshteinDistance(q, m.title.toLowerCase());
            const norm = dist / Math.max(q.length, m.title.length);
            if (norm < bestScore) {
              bestScore = norm;
              best = m;
            }
          }
          if (bestScore < 0.4) {
            targetMeeting = best;
          } else {
            const titles = meetings.map((m) => `• ${m.title}`).join("\n");
            await respondToSlack(responseUrl!, {
              text: `Couldn't match "${text}" to a meeting. Today's meetings:\n${titles}`,
            });
            return;
          }
        }
      }

      await respondToSlack(responseUrl!, {
        text: `Preparing brief for *${targetMeeting.title}*...`,
      });

      const result = await runMeetingPrep(brainId, targetMeeting.id, { skipIdempotency: true });

      if (result.status === "succeeded_low_confidence") {
        await respondToSlack(responseUrl!, {
          text: `Brain isn't confident enough (${result.brief.overall_confidence.toFixed(2)}). Connect Gmail to grow context.`,
          replace_original: true,
        });
      } else {
        await respondToSlack(responseUrl!, {
          text: `Prep ready for *${targetMeeting.title}* (confidence: ${result.brief.overall_confidence.toFixed(2)}).`,
          replace_original: true,
        });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Prep failed";
      console.error("[slack-command] /meeting-prep error:", msg);
      if (responseUrl) {
        await respondToSlack(responseUrl, {
          text: `Meeting prep failed: ${msg}`,
          replace_original: true,
        });
      }
    }
  };

  asyncWork().catch(console.error);

  return NextResponse.json({
    response_type: "ephemeral",
    text: "Generating meeting prep...",
  });
}

async function respondToSlack(responseUrl: string, payload: Record<string, unknown>) {
  await fetch(responseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
