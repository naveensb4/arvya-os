import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { syncConnectorNow } from "@/lib/always-on/runtime";
import { selectedBrainOrDefault } from "@/lib/brain/store";
import { getRepository } from "@/lib/db/repository";

async function parseRequest(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await request.json() as { brainId?: string; connectorConfigId?: string };
    return {
      brainId: body.brainId?.trim() ?? "",
      connectorConfigId: body.connectorConfigId?.trim() ?? "",
    };
  }

  const formData = await request.formData();
  return {
    brainId: String(formData.get("brainId") ?? "").trim(),
    connectorConfigId: String(formData.get("connectorConfigId") ?? "").trim(),
  };
}

export async function POST(request: Request) {
  const { brainId, connectorConfigId } = await parseRequest(request);
  if (!brainId) {
    return NextResponse.json({ error: "brainId is required" }, { status: 400 });
  }
  const { selectedBrain } = await selectedBrainOrDefault(brainId);
  const selectedBrainId = selectedBrain.id;

  let id = connectorConfigId;
  if (!id) {
    const config = (await getRepository().listConnectorConfigs(selectedBrainId)).find((item) => item.connectorType === "google_drive");
    id = config?.id ?? "";
  }
  if (!id) {
    return NextResponse.json({ error: "Google Drive connector config was not found" }, { status: 404 });
  }

  const summary = await syncConnectorNow({ brainId: selectedBrainId, connectorConfigId: id });
  revalidatePath(`/brains/${selectedBrainId}`);
  revalidatePath(`/brains/${selectedBrainId}/connections`);

  if ((request.headers.get("accept") ?? "").includes("application/json")) {
    return NextResponse.json(summary);
  }
  return NextResponse.redirect(new URL(`/brains/${selectedBrainId}/connections`, request.url));
}
