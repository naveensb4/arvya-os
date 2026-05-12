import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db/repository";
import type { BrainDocFeedback } from "@arvya/core";

const VALID_FEEDBACK = new Set<BrainDocFeedback>(["useful", "not_useful"]);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ brainId: string; docId: string }> },
) {
  const { docId } = await params;
  let body: { feedback?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body", code: "BAD_REQUEST" },
      { status: 400 },
    );
  }

  if (!body.feedback || !VALID_FEEDBACK.has(body.feedback as BrainDocFeedback)) {
    return NextResponse.json(
      { error: "feedback must be 'useful' or 'not_useful'", code: "INVALID_FEEDBACK" },
      { status: 400 },
    );
  }

  try {
    const repo = getRepository();
    const doc = await repo.updateBrainDocFeedback(docId, {
      feedback: body.feedback as BrainDocFeedback,
    });
    if (!doc) {
      return NextResponse.json(
        { error: "Doc not found", code: "DOC_NOT_FOUND" },
        { status: 404 },
      );
    }
    return NextResponse.json({ doc });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: message, code: "FEEDBACK_FAILED" },
      { status: 500 },
    );
  }
}
