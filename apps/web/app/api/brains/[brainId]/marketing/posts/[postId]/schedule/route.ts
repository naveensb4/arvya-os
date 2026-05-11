import { NextResponse } from "next/server";
import { scheduleMarketingPostSchema } from "@arvya/core";
import { scheduleMarketingPost } from "@/lib/marketing/store";

type RouteContext = { params: Promise<{ brainId: string; postId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { postId } = await context.params;
  const body = await request.json().catch(() => ({}));
  const parsed = scheduleMarketingPostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid schedule payload", issues: parsed.error.issues }, { status: 400 });
  }
  const result = await scheduleMarketingPost(postId, parsed.data);
  return NextResponse.json(result);
}
