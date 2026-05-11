import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { bulkUpdateOpenLoops } from "@/lib/brain/store";

const bulkDismissSchema = z.object({
  loopIds: z.array(z.string().min(1)).min(1).max(500),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ brainId: string }> },
) {
  const { brainId } = await context.params;
  if (!brainId) {
    return NextResponse.json({ error: "brainId is required" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = bulkDismissSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid bulk dismiss payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const updated = await bulkUpdateOpenLoops(brainId, parsed.data.loopIds, {
      status: "dismissed",
      closedAt: new Date().toISOString(),
    });

    revalidatePath(`/brains/${brainId}/open-loops`);
    revalidatePath(`/brains/${brainId}`);

    return NextResponse.json({
      dismissed: updated.filter(Boolean).length,
      loopIds: parsed.data.loopIds,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to bulk dismiss";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
