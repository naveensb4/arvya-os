import { NextResponse } from "next/server";
import { dailyBriefSchema } from "@arvya/core";
import { generateDailyFounderBrief } from "@/lib/brain/store";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = dailyBriefSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid daily brief payload", issues: parsed.error.issues }, { status: 400 });
  }

  const payload = parsed.data;
  const brief = await generateDailyFounderBrief(payload.brainId);
  return NextResponse.json({
    brief,
    structured: brief.structured ?? null,
  });
}
