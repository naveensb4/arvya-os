import { NextResponse } from "next/server";
import { selectedBrainOrDefault } from "@/lib/brain/store";
import { startSlackOAuth } from "@/lib/connectors/slack";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const brainId = url.searchParams.get("brainId")?.trim();
  if (!brainId) return NextResponse.json({ error: "brainId is required" }, { status: 400 });

  const returnUrl = url.searchParams.get("return")?.trim();
  const { selectedBrain } = await selectedBrainOrDefault(brainId);
  const host = request.headers.get("host") || "localhost:3000";
  const proto = request.headers.get("x-forwarded-proto") || "http";
  const redirectUri = new URL("/api/connectors/slack/auth/callback", `${proto}://${host}`).toString();

  const statePayload: Record<string, string> = { brainId: selectedBrain.id };
  if (returnUrl) statePayload.returnUrl = returnUrl;
  const state = Buffer.from(JSON.stringify(statePayload), "utf8").toString("base64url");
  const authUrl = await startSlackOAuth(redirectUri, state);

  return NextResponse.redirect(authUrl);
}
