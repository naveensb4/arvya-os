import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { syncConnectorNow } from "@/lib/always-on/runtime";
import { selectedBrainOrDefault } from "@/lib/brain/store";
import { getRepository } from "@/lib/db/repository";

export async function POST(request: Request) {
  const formData = await request.formData();
  const brainId = String(formData.get("brainId") ?? "").trim();
  let connectorConfigId = String(formData.get("connectorConfigId") ?? "").trim();
  if (!brainId) return NextResponse.json({ error: "brainId is required" }, { status: 400 });
  const { selectedBrain } = await selectedBrainOrDefault(brainId);
  const selectedBrainId = selectedBrain.id;
  if (!connectorConfigId) {
    connectorConfigId = (await getRepository().listConnectorConfigs(selectedBrainId)).find((item) => item.connectorType === "outlook")?.id ?? "";
  }
  if (!connectorConfigId) return NextResponse.json({ error: "Outlook connector config was not found" }, { status: 404 });

  await syncConnectorNow({ brainId: selectedBrainId, connectorConfigId });
  revalidatePath(`/brains/${selectedBrainId}`);
  revalidatePath(`/brains/${selectedBrainId}/connections`);
  return NextResponse.redirect(new URL(`/brains/${selectedBrainId}/connections`, request.url));
}
