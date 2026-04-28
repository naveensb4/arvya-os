import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { createPrioritySchema, priorityStatusSchema } from "@arvya/core";
import {
  createBrainPriority,
  isBrainNotFoundError,
  listBrainPriorities,
} from "@/lib/brain/store";

export async function GET(
  request: Request,
  context: { params: Promise<{ brainId: string }> },
) {
  const { brainId } = await context.params;
  if (!brainId) {
    return NextResponse.json({ error: "brainId is required" }, { status: 400 });
  }

  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status");
  const status = statusParam ? priorityStatusSchema.safeParse(statusParam) : undefined;
  if (status && !status.success) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  try {
    const priorities = await listBrainPriorities(brainId, {
      status: status?.success ? status.data : undefined,
    });
    return NextResponse.json({ priorities });
  } catch (error) {
    if (isBrainNotFoundError(error)) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    const message = error instanceof Error ? error.message : "Failed to list priorities";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ brainId: string }> },
) {
  const { brainId } = await context.params;
  if (!brainId) {
    return NextResponse.json({ error: "brainId is required" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = createPrioritySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid priority payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const priority = await createBrainPriority(brainId, parsed.data);
    revalidatePath(`/brains/${brainId}/priorities`);
    revalidatePath(`/brains/${brainId}`);
    return NextResponse.json({ priority }, { status: 201 });
  } catch (error) {
    if (isBrainNotFoundError(error)) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    const message = error instanceof Error ? error.message : "Failed to create priority";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
