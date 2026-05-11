import { NextResponse } from "next/server";
import { handleSlackGrowthCommand, verifySlackRequest } from "@/lib/marketing/slack";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const verified = verifySlackRequest({
    rawBody,
    timestamp: request.headers.get("x-slack-request-timestamp"),
    signature: request.headers.get("x-slack-signature"),
  });
  if (!verified) {
    return NextResponse.json({ response_type: "ephemeral", text: "Invalid Slack signature." }, { status: 401 });
  }

  const params = new URLSearchParams(rawBody);
  const result = await handleSlackGrowthCommand({
    text: params.get("text") ?? "",
    userId: params.get("user_id") ?? undefined,
    channelId: params.get("channel_id") ?? undefined,
    responseUrl: params.get("response_url") ?? undefined,
  });

  return NextResponse.json({
    response_type: "ephemeral",
    text: result.message,
    blocks: result.ok ? result.blocks : undefined,
  });
}
