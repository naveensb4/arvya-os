import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { ingestTranscriptBatch } from "@/lib/workflows/batch-ingestion";

export async function POST(request: Request) {
  const formData = await request.formData();
  const brainId = formData.get("brainId");
  const files = formData.getAll("files");

  if (typeof brainId !== "string" || !brainId.trim()) {
    return NextResponse.json({ error: "brainId is required" }, { status: 400 });
  }

  const transcriptFiles = await Promise.all(
    files.flatMap((entry) => {
      if (!(entry instanceof File)) return [];
      return [fileToTranscript(entry)];
    }),
  );

  if (transcriptFiles.length === 0) {
    return NextResponse.json({ error: "At least one transcript file is required" }, { status: 400 });
  }

  const results = await ingestTranscriptBatch({
    brainId: brainId.trim(),
    files: transcriptFiles,
    sourceType: "transcript",
  });

  revalidatePath(`/brains/${brainId}/sources`);
  revalidatePath(`/brains/${brainId}/sources/batch-upload`);
  revalidatePath(`/brains/${brainId}`);

  return NextResponse.json({ results });
}

async function fileToTranscript(file: File) {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  return {
    fileName: file.name,
    contentType: file.type || "text/plain; charset=utf-8",
    content: new TextDecoder().decode(bytes),
    bytes,
  };
}
