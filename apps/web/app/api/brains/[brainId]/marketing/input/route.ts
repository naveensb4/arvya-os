import { NextResponse } from "next/server";
import { createMarketingContentItemSchema } from "@arvya/core";
import { submitMarketingInput } from "@/lib/marketing/store";

type RouteContext = { params: Promise<{ brainId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { brainId } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = createMarketingContentItemSchema.safeParse({ ...(body as object), brainId });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid marketing input payload", issues: parsed.error.issues }, { status: 400 });
  }

  const result = await submitMarketingInput(parsed.data);
  return NextResponse.json(result);
}
