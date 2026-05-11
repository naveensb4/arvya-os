import { NextResponse } from "next/server";
import { syncMarketingSchedulerStatus } from "@/lib/marketing/store";

type RouteContext = { params: Promise<{ brainId: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const { brainId } = await context.params;
  const result = await syncMarketingSchedulerStatus(brainId);
  return NextResponse.json(result);
}
