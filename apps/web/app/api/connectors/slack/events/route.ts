import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { handleSlackMention } from "@/lib/slack-bot/handler";

function verifySlackSignature(req: NextRequest, body: string): boolean {
  const timestamp = req.headers.get("x-slack-request-timestamp");
  const signature = req.headers.get("x-slack-signature");
  if (!timestamp || !signature) return false;

  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) return false;

  const baseString = `v0:${timestamp}:${body}`;
  const hmac = crypto.createHmac("sha256", signingSecret).update(baseString).digest("hex");
  const expected = `v0=${hmac}`;

  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export async function POST(req: NextRequest) {
  const body = await req.text();

  if (!verifySlackSignature(req, body)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload = JSON.parse(body);

  if (payload.type === "url_verification") {
    return NextResponse.json({ challenge: payload.challenge });
  }

  if (payload.type === "event_callback") {
    const eventType = payload.event?.type;

    if (eventType === "app_mention" || (eventType === "message" && payload.event?.channel_type === "im")) {
      if (payload.event?.bot_id) {
        return NextResponse.json({ ok: true });
      }
      handleSlackMention(payload).catch((err) =>
        console.error("[slack-events] Q&A handler error:", err),
      );
    }
  }

  return NextResponse.json({ ok: true });
}
