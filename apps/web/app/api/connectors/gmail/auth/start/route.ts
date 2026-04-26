import { NextResponse } from "next/server";
import { ensureDefaultConnectorConfigs } from "@/lib/always-on/runtime";
import { selectedBrainOrDefault } from "@/lib/brain/store";
import { buildGmailAuthUrl } from "@/lib/connectors/gmail";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const brainId = url.searchParams.get("brainId")?.trim();
  if (!brainId) return NextResponse.json({ error: "brainId is required" }, { status: 400 });

  const { selectedBrain } = await selectedBrainOrDefault(brainId);
  const selectedBrainId = selectedBrain.id;
  const config = (await ensureDefaultConnectorConfigs(selectedBrainId)).find((item) => item.connectorType === "gmail");
  if (!config) return NextResponse.json({ error: "Gmail connector config was not found" }, { status: 404 });

  return NextResponse.redirect(buildGmailAuthUrl({ brainId: selectedBrainId, connectorConfigId: config.id }));
}
