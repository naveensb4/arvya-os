import { NextResponse } from "next/server";
import { handleNotetakerWebhook, verifyRecallWebhookSignature } from "@/lib/notetaker/runtime";

export async function POST(request: Request) {
  const body = await request.text();
  const signature =
    request.headers.get("recall-signature") ??
    request.headers.get("x-recall-signature") ??
    request.headers.get("x-webhook-signature");
  if (!verifyRecallWebhookSignature({ body, signature })) {
    return NextResponse.json({ error: "Invalid Recall webhook signature" }, { status: 401 });
  }

  const payload = JSON.parse(body) as Record<string, unknown>;
  const result = await handleNotetakerWebhook(payload);
  const sourceItemId = typeof result.result === "object" && result.result && "sourceItem" in result.result
    ? (result.result.sourceItem as { id?: string }).id
    : undefined;

  return NextResponse.json({
    ok: true,
    duplicate: result.duplicate,
    notetakerEventId: result.event.id,
    sourceItemId,
  });
}
