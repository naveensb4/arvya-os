import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function telemetryPath() {
  const cwd = process.cwd();
  const repoRoot = cwd.endsWith(path.join("apps", "web")) ? path.resolve(cwd, "../..") : cwd;
  return path.join(repoRoot, "test-results", "local-telemetry.jsonl");
}

export async function POST(request: Request) {
  if (process.env.ARVYA_LOCAL_TELEMETRY !== "1") {
    return new NextResponse(null, { status: 204 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const filePath = telemetryPath();
  await mkdir(path.dirname(filePath), { recursive: true });
  await appendFile(filePath, `${JSON.stringify(payload)}\n`, "utf8");
  return new NextResponse(null, { status: 204 });
}
