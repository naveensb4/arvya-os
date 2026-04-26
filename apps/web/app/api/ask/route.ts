import { NextResponse } from "next/server";
import { askBrainSchema } from "@arvya/core";
import { answerBrainQuestion } from "@/lib/brain/store";

export async function POST(request: Request) {
  const payload = askBrainSchema.parse(await request.json());
  const answer = await answerBrainQuestion(payload.brainId, payload.question);
  return NextResponse.json(answer);
}
