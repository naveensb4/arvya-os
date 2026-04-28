import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { closeOpenLoop } from "@/lib/brain/store";

const closeOpenLoopBodySchema = z.object({
  result: z.string().min(1).max(2000),
  evidence_source_ids: z.array(z.string().min(1)).max(32).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ brainId: string; loopId: string }> },
) {
  const { brainId, loopId } = await context.params;
  if (!brainId || !loopId) {
    return NextResponse.json(
      { error: "brainId and loopId are required" },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = closeOpenLoopBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid close-open-loop payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const result = await closeOpenLoop(brainId, loopId, {
      result: parsed.data.result,
      evidence_source_ids: parsed.data.evidence_source_ids,
    });
    revalidatePath(`/brains/${brainId}/open-loops`);
    revalidatePath(`/brains/${brainId}`);
    return NextResponse.json({
      loop: result.loop,
      outcomeMemoryId: result.outcomeMemoryId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to close open loop";
    const status = message.toLowerCase().includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
