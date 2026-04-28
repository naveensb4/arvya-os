import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import {
  generateDriftReview,
  isBrainNotFoundError,
} from "@/lib/brain/store";

export async function POST(
  _request: Request,
  context: { params: Promise<{ brainId: string }> },
) {
  const { brainId } = await context.params;
  if (!brainId) {
    return NextResponse.json({ error: "brainId is required" }, { status: 400 });
  }

  try {
    const result = await generateDriftReview(brainId);
    revalidatePath(`/brains/${brainId}/drift`);
    revalidatePath(`/brains/${brainId}`);
    return NextResponse.json({
      review: result.review,
      agentRunId: result.agentRunId,
    });
  } catch (error) {
    if (isBrainNotFoundError(error)) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    const message = error instanceof Error ? error.message : "Failed to generate drift review";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
