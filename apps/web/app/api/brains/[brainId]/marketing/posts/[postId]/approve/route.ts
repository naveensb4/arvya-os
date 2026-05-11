import { NextResponse } from "next/server";
import { approveMarketingPostSchema } from "@arvya/core";
import { updateMarketingPost } from "@/lib/marketing/store";

type RouteContext = { params: Promise<{ brainId: string; postId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { postId } = await context.params;
  const body = await request.json().catch(() => ({}));
  const parsed = approveMarketingPostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid approval payload", issues: parsed.error.issues }, { status: 400 });
  }
  const post = await updateMarketingPost(postId, {
    bodyText: parsed.data.bodyText,
    status: "approved",
    approvedBy: parsed.data.approvedBy,
  });
  return NextResponse.json({ post });
}
