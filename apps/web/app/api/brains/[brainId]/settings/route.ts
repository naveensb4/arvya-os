import { NextResponse, type NextRequest } from "next/server";
import { getRepository } from "@/lib/db/repository";

type RouteContext = {
  params: Promise<{ brainId: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { brainId } = await context.params;
  const repository = getRepository();
  const brain = await repository.getBrain(brainId);
  if (!brain) {
    return NextResponse.json({ error: "Brain not found" }, { status: 404 });
  }

  const body = await request.json();
  const newMetadata = { ...(brain.metadata ?? {}), ...(body.metadata ?? {}) };

  const updated = await repository.updateBrain(brainId, { metadata: newMetadata });
  if (!updated) {
    return NextResponse.json({ error: "Failed to update brain" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, metadata: updated.metadata });
}
