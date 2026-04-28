import { NextResponse } from "next/server";
import { getLatestDriftReview } from "@/lib/brain/store";

export async function GET(
  _request: Request,
  context: { params: Promise<{ brainId: string }> },
) {
  const { brainId } = await context.params;
  if (!brainId) {
    return NextResponse.json({ error: "brainId is required" }, { status: 400 });
  }

  try {
    const result = await getLatestDriftReview(brainId);
    if (!result) {
      return NextResponse.json({ review: null, agentRunId: null });
    }
    return NextResponse.json({
      review: result.review,
      agentRunId: result.agentRunId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch latest drift review";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
