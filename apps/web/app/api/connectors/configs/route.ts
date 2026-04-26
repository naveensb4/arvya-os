import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { CONNECTOR_TYPES, upsertConnectorConfig } from "@/lib/always-on/runtime";
import { selectedBrainOrDefault } from "@/lib/brain/store";
import type { ConnectorType } from "@/lib/db/repository";

export async function POST(request: Request) {
  const formData = await request.formData();
  const brainId = String(formData.get("brainId") ?? "").trim();
  const connectorType = String(formData.get("connectorType") ?? "").trim() as ConnectorType;
  const syncEnabled = formData.get("syncEnabled") === "on" || formData.get("syncEnabled") === "true";
  const maxItemTestMode = formData.get("maxItemTestMode") === "on" || formData.get("maxItemTestMode") === "true";
  const syncIntervalMinutes = Number(formData.get("syncIntervalMinutes") ?? 10);
  const folderIds = String(formData.get("folderIds") ?? "")
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const labelIds = String(formData.get("labelIds") ?? "")
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const outlookFolderIds = String(formData.get("outlookFolderIds") ?? "")
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const outlookCategoryNames = String(formData.get("outlookCategoryNames") ?? "")
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (!brainId) {
    return NextResponse.json({ error: "brainId is required" }, { status: 400 });
  }
  if (!CONNECTOR_TYPES.includes(connectorType)) {
    return NextResponse.json({ error: "Unsupported connectorType" }, { status: 400 });
  }
  if (!Number.isFinite(syncIntervalMinutes) || syncIntervalMinutes < 5) {
    return NextResponse.json({ error: "syncIntervalMinutes must be at least 5" }, { status: 400 });
  }
  const { selectedBrain } = await selectedBrainOrDefault(brainId);
  const selectedBrainId = selectedBrain.id;

  await upsertConnectorConfig({
    brainId: selectedBrainId,
    connectorType,
    syncEnabled,
    syncIntervalMinutes,
    config:
      connectorType === "google_drive" ? { folderIds } :
      connectorType === "gmail" ? { labelIds, maxItemTestMode } :
      connectorType === "outlook" ? { outlookFolderIds, outlookCategoryNames, maxItemTestMode } :
      undefined,
  });

  revalidatePath(`/brains/${selectedBrainId}`);
  revalidatePath(`/brains/${selectedBrainId}/connections`);
  return NextResponse.redirect(new URL(`/brains/${selectedBrainId}/connections`, request.url));
}
