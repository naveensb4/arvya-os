import { NextResponse } from "next/server";
import { ingestSourceSchema } from "@arvya/core";
import { addSourceAndIngest } from "@/lib/brain/store";

export async function POST(request: Request) {
  const payload = ingestSourceSchema.parse(await request.json());
  const source = await addSourceAndIngest(payload);
  return NextResponse.json({ source });
}
