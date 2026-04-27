import { NextResponse } from "next/server";
import { handleNotetakerWebhook, verifyRecallWebhookSignature } from "@/lib/notetaker/runtime";

export async function POST(request: Request) {
  const body = await request.text();
  const signature =
    request.headers.get("webhook-signature") ??
    request.headers.get("svix-signature") ??
    request.headers.get("recall-signature") ??
    request.headers.get("x-recall-signature");
  const webhookId =
    request.headers.get("webhook-id") ??
    request.headers.get("svix-id");
  const webhookTimestamp =
    request.headers.get("webhook-timestamp") ??
    request.headers.get("svix-timestamp");

  if (!verifyRecallWebhookSignature({ body, signature, webhookId, webhookTimestamp })) {
    return NextResponse.json({ error: "Invalid Recall webhook signature" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

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
