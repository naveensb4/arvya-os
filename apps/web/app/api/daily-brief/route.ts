import { NextResponse } from "next/server";
import { dailyBriefSchema } from "@arvya/core";
import { generateDailyFounderBrief } from "@/lib/brain/store";

export async function POST(request: Request) {
  const payload = dailyBriefSchema.parse(await request.json());
  return NextResponse.json(await generateDailyFounderBrief(payload.brainId));
}
