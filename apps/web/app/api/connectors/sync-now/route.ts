import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { syncConnectorNow } from "@/lib/always-on/runtime";
import { selectedBrainOrDefault } from "@/lib/brain/store";

export async function POST(request: Request) {
  const formData = await request.formData();
  const brainId = String(formData.get("brainId") ?? "").trim();
  const connectorConfigId = String(formData.get("connectorConfigId") ?? "").trim();

  if (!brainId || !connectorConfigId) {
    return NextResponse.json({ error: "brainId and connectorConfigId are required" }, { status: 400 });
  }

  const { selectedBrain } = await selectedBrainOrDefault(brainId);
  const selectedBrainId = selectedBrain.id;
  await syncConnectorNow({ brainId: selectedBrainId, connectorConfigId });

  revalidatePath(`/brains/${selectedBrainId}`);
  revalidatePath(`/brains/${selectedBrainId}/connections`);
  return NextResponse.redirect(new URL(`/brains/${selectedBrainId}/connections`, request.url));
}
