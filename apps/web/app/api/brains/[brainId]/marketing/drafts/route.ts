import { NextResponse } from "next/server";
import { marketingChannelSchema, type MarketingChannel } from "@arvya/core";
import { generateMarketingDrafts } from "@/lib/marketing/store";

type RouteContext = { params: Promise<{ brainId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { brainId } = await context.params;
  const body = await request.json().catch(() => ({}));
  const channels: MarketingChannel[] | undefined = Array.isArray(body.channels)
    ? body.channels.flatMap((channel: unknown) => {
        const parsed = marketingChannelSchema.safeParse(channel);
        return parsed.success ? [parsed.data] : [];
      })
    : undefined;
  const posts = await generateMarketingDrafts(brainId, channels);
  return NextResponse.json({ posts });
}
