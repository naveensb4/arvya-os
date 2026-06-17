import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { updateOpenLoopReview } from "@/lib/brain/store";

const updateLoopSchema = z.object({
  status: z.enum(["needs_review", "open", "in_progress", "waiting", "done", "dismissed", "closed"]).optional(),
  outcome: z.string().max(2000).optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  owner: z.string().max(200).nullable().optional(),
  dueDate: z.string().nullable().optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ brainId: string; loopId: string }> },
) {
  const { brainId, loopId } = await context.params;
  if (!brainId || !loopId) {
    return NextResponse.json({ error: "brainId and loopId are required" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = updateLoopSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid update payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const update: Record<string, unknown> = {};
    if (parsed.data.status) update.status = parsed.data.status;
    if (parsed.data.outcome !== undefined) update.outcome = parsed.data.outcome;
    if (parsed.data.priority) update.priority = parsed.data.priority;
    if (parsed.data.owner !== undefined) update.owner = parsed.data.owner;
    if (parsed.data.dueDate !== undefined) update.dueDate = parsed.data.dueDate;

    if (parsed.data.status === "done" || parsed.data.status === "dismissed" || parsed.data.status === "closed") {
      update.closedAt = new Date().toISOString();
    }

    const updated = await updateOpenLoopReview(brainId, loopId, update);
    revalidatePath(`/brains/${brainId}/open-loops`);
    revalidatePath(`/brains/${brainId}`);
    return NextResponse.json({ loop: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update loop";
    const status = message.toLowerCase().includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
