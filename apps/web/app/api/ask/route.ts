import { NextResponse } from "next/server";
import { askBrainSchema } from "@arvya/core";
import { answerBrainQuestion } from "@/lib/brain/store";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = askBrainSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid ask payload", issues: parsed.error.issues }, { status: 400 });
  }

  const payload = parsed.data;
  const answer = await answerBrainQuestion(payload.brainId, payload.question);
  return NextResponse.json(answer);
}
