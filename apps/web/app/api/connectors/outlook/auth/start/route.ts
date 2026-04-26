import { NextResponse } from "next/server";
import { ensureDefaultConnectorConfigs } from "@/lib/always-on/runtime";
import { selectedBrainOrDefault } from "@/lib/brain/store";
import { buildOutlookAuthUrl } from "@/lib/connectors/outlook";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const brainId = url.searchParams.get("brainId")?.trim();
  if (!brainId) return NextResponse.json({ error: "brainId is required" }, { status: 400 });

  const { selectedBrain } = await selectedBrainOrDefault(brainId);
  const selectedBrainId = selectedBrain.id;
  const config = (await ensureDefaultConnectorConfigs(selectedBrainId)).find((item) => item.connectorType === "outlook");
  if (!config) return NextResponse.json({ error: "Outlook connector config was not found" }, { status: 404 });

  return NextResponse.redirect(buildOutlookAuthUrl({ brainId: selectedBrainId, connectorConfigId: config.id }));
}
