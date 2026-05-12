import { NextResponse } from "next/server";
import { answerBrainQuestion } from "@/lib/brain/store";

// POST /api/brains/[brainId]/ask
// Body: { question: string }
// Returns: { answer, citations, structuredCitations, confidenceLevel,
//   uncertain, uncertaintyNotes, followUp } - the full result of
// answerBrainQuestion / answerFromContext.
//
// Auth is enforced by middleware. Errors return { error, code } for the
// client to display.

export async function POST(
  request: Request,
  { params }: { params: Promise<{ brainId: string }> },
) {
  const { brainId } = await params;
  let body: { question?: string };
  try {
    body = (await request.json()) as { question?: string };
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body", code: "BAD_REQUEST" },
      { status: 400 },
    );
  }
  const question = body.question?.trim();
  if (!question) {
    return NextResponse.json(
      { error: "question is required", code: "MISSING_QUESTION" },
      { status: 400 },
    );
  }
  try {
    const answer = await answerBrainQuestion(brainId, question);
    return NextResponse.json(answer);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.toLowerCase().includes("not found")) {
      return NextResponse.json(
        { error: message, code: "BRAIN_NOT_FOUND" },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { error: message, code: "ASK_FAILED" },
      { status: 500 },
    );
  }
}
