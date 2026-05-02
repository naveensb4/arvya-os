import { NextResponse, type NextRequest } from "next/server";
import { getRepository } from "@/lib/db/repository";

type RouteContext = { params: Promise<{ brainId: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const { brainId } = await context.params;
  const repository = getRepository();

  const brain = await repository.getBrain(brainId);
  if (!brain) {
    return NextResponse.json({ error: "Brain not found" }, { status: 404 });
  }

  const [sources, memories, configs] = await Promise.all([
    repository.listSourceItems(brainId, { limit: 1000 }),
    repository.listMemoryObjects(brainId, { limit: 1000 }),
    repository.listConnectorConfigs(brainId),
  ]);

  const connectorsActive = configs.filter(
    (c) => c.status === "connected" && c.syncEnabled,
  ).length;

  return NextResponse.json({
    sourcesIngested: sources.length,
    memoriesExtracted: memories.length,
    connectorsActive,
  });
}
