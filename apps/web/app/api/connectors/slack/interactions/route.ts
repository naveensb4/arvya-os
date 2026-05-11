import { NextResponse } from "next/server";
import { handleSlackMarketingInteraction, verifySlackRequest } from "@/lib/marketing/slack";

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
  const payloadText = params.get("payload");
  if (!payloadText) {
    return NextResponse.json({ response_type: "ephemeral", text: "Missing Slack interaction payload." }, { status: 400 });
  }

  const result = await handleSlackMarketingInteraction(JSON.parse(payloadText));
  return NextResponse.json({
    response_type: "ephemeral",
    replace_original: false,
    text: result.message,
  });
}
