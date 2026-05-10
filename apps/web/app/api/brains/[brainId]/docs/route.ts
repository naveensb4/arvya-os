import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db/repository";
import type { BrainDocType } from "@arvya/core";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ brainId: string }> },
) {
  const { brainId } = await params;
  const url = new URL(request.url);
  const meetingId = url.searchParams.get("meetingId") ?? undefined;
  const docType = (url.searchParams.get("docType") as BrainDocType) ?? undefined;

  try {
    const repo = getRepository();
    const docs = await repo.listBrainDocs(brainId, { meetingId, docType });
    return NextResponse.json({ docs });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: message, code: "LIST_DOCS_FAILED" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ brainId: string }> },
) {
  const { brainId } = await params;
  let body: {
    docType?: string;
    title?: string;
    content?: Record<string, unknown>;
    contentText?: string;
    agentRunId?: string;
    externalEventId?: string;
    meetingId?: string;
    metadata?: Record<string, unknown>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body", code: "BAD_REQUEST" },
      { status: 400 },
    );
  }

  if (!body.docType || !body.title || !body.content) {
    return NextResponse.json(
      { error: "docType, title, and content are required", code: "MISSING_FIELDS" },
      { status: 400 },
    );
  }

  try {
    const repo = getRepository();
    const doc = await repo.createBrainDoc({
      brainId,
      docType: body.docType as BrainDocType,
      title: body.title,
      content: body.content,
      contentText: body.contentText,
      agentRunId: body.agentRunId,
      externalEventId: body.externalEventId,
      meetingId: body.meetingId,
      metadata: body.metadata,
    });
    return NextResponse.json({ doc }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: message, code: "CREATE_DOC_FAILED" },
      { status: 500 },
    );
  }
}
