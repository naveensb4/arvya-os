import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { updatePriorityStatusSchema } from "@arvya/core";
import { updateBrainPriorityStatus } from "@/lib/brain/store";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ brainId: string; priorityId: string }> },
) {
  const { brainId, priorityId } = await context.params;
  if (!brainId || !priorityId) {
    return NextResponse.json(
      { error: "brainId and priorityId are required" },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = updatePriorityStatusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid priority update payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const priority = await updateBrainPriorityStatus(brainId, priorityId, parsed.data.status);
    revalidatePath(`/brains/${brainId}/priorities`);
    revalidatePath(`/brains/${brainId}`);
    return NextResponse.json({ priority });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update priority";
    const status = message.toLowerCase().includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
