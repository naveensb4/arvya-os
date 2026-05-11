import { NextResponse } from "next/server";
import { handleSlackMarketingEvent, verifySlackRequest } from "@/lib/marketing/slack";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const verified = verifySlackRequest({
    rawBody,
    timestamp: request.headers.get("x-slack-request-timestamp"),
    signature: request.headers.get("x-slack-signature"),
  });
  if (!verified) {
    return NextResponse.json({ error: "Invalid Slack signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid Slack payload" }, { status: 400 });
  }

  const result = await handleSlackMarketingEvent(payload as Parameters<typeof handleSlackMarketingEvent>[0]);
  if (result.type === "challenge") {
    return NextResponse.json({ challenge: result.challenge });
  }
  return NextResponse.json(result);
}
