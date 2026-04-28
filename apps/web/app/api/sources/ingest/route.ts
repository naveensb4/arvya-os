import { NextResponse } from "next/server";
import { ingestSourceSchema } from "@arvya/core";
import { addSourceAndIngest } from "@/lib/brain/store";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = ingestSourceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid source ingest payload", issues: parsed.error.issues }, { status: 400 });
  }

  const payload = parsed.data;
  const source = await addSourceAndIngest(payload);
  return NextResponse.json({ source });
}
