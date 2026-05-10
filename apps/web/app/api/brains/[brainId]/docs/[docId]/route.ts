import { NextResponse } from "next/server";
import { getRepository } from "@/lib/db/repository";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ brainId: string; docId: string }> },
) {
  const { docId } = await params;

  try {
    const repo = getRepository();
    const doc = await repo.getBrainDoc(docId);
    if (!doc) {
      return NextResponse.json(
        { error: "Doc not found", code: "DOC_NOT_FOUND" },
        { status: 404 },
      );
    }
    return NextResponse.json({ doc });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: message, code: "GET_DOC_FAILED" },
      { status: 500 },
    );
  }
}
