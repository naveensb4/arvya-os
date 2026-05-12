import { getRepository } from "@/lib/db/repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const POLL_INTERVAL_MS = 2500;
const HEARTBEAT_INTERVAL_MS = 15000;
const MAX_STREAM_DURATION_MS = 5 * 60 * 1000;

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ brainId: string }> },
) {
  const { brainId } = await params;
  const repository = getRepository();
  const brain = await repository.getBrain(brainId);
  if (!brain) {
    return new Response(JSON.stringify({ error: "Brain not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      let prevCompleted = -1;
      let prevPeople = -1;
      let prevCompanies = -1;
      const seenEntityIds = new Set<string>();
      const startTime = Date.now();

      function enqueue(text: string) {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          closed = true;
        }
      }

      const heartbeat = setInterval(() => {
        enqueue(": heartbeat\n\n");
      }, HEARTBEAT_INTERVAL_MS);

      const poll = setInterval(async () => {
        if (closed) {
          clearInterval(poll);
          clearInterval(heartbeat);
          return;
        }

        if (Date.now() - startTime > MAX_STREAM_DURATION_MS) {
          enqueue(sseEvent("done", { reason: "timeout" }));
          closed = true;
          clearInterval(poll);
          clearInterval(heartbeat);
          controller.close();
          return;
        }

        try {
          const sourceItems = await repository.listSourceItems(brainId);
          const workflows = await repository.listWorkflows(brainId);
          const memoryObjects = await repository.listMemoryObjects(brainId, { limit: 20 });

          const total = sourceItems.length;
          const completed = workflows.filter(
            (w) => w.workflowType === "source_ingestion" && w.status === "completed",
          ).length;
          const failed = workflows.filter(
            (w) => w.workflowType === "source_ingestion" && w.status === "failed",
          ).length;
          const running = workflows.filter(
            (w) => w.workflowType === "source_ingestion" && w.status === "running",
          ).length;
          const people = memoryObjects.filter((m) => m.objectType === "person").length;
          const allMemory = await repository.listMemoryObjects(brainId);
          const totalPeople = allMemory.filter((m) => m.objectType === "person").length;
          const totalCompanies = allMemory.filter((m) => m.objectType === "company").length;

          if (completed !== prevCompleted || totalPeople !== prevPeople || totalCompanies !== prevCompanies) {
            enqueue(
              sseEvent("progress", {
                total,
                completed,
                failed,
                running,
                people: totalPeople,
                companies: totalCompanies,
              }),
            );
            prevCompleted = completed;
            prevPeople = totalPeople;
            prevCompanies = totalCompanies;
          }

          for (const entity of memoryObjects) {
            if (!seenEntityIds.has(entity.id)) {
              seenEntityIds.add(entity.id);
              const sourceItem = entity.sourceItemId
                ? sourceItems.find((s) => s.id === entity.sourceItemId)
                : null;
              enqueue(
                sseEvent("entity", {
                  id: entity.id,
                  objectType: entity.objectType,
                  name: entity.name,
                  description: entity.description,
                  sourceContext: sourceItem?.title ?? null,
                }),
              );
            }
          }

          if (total > 0 && completed >= total && running === 0) {
            enqueue(
              sseEvent("done", {
                total,
                completed,
                people: totalPeople,
                companies: totalCompanies,
              }),
            );
            closed = true;
            clearInterval(poll);
            clearInterval(heartbeat);
            controller.close();
          }
        } catch (err) {
          console.error("[ingestion-stream] poll error:", err instanceof Error ? err.message : err);
        }
      }, POLL_INTERVAL_MS);

      // Initial emit on connection
      (async () => {
        try {
          const sourceItems = await repository.listSourceItems(brainId);
          const workflows = await repository.listWorkflows(brainId);
          const allMemory = await repository.listMemoryObjects(brainId);
          const recentMemory = await repository.listMemoryObjects(brainId, { limit: 20 });

          const total = sourceItems.length;
          const completed = workflows.filter(
            (w) => w.workflowType === "source_ingestion" && w.status === "completed",
          ).length;
          const failed = workflows.filter(
            (w) => w.workflowType === "source_ingestion" && w.status === "failed",
          ).length;
          const running = workflows.filter(
            (w) => w.workflowType === "source_ingestion" && w.status === "running",
          ).length;
          const totalPeople = allMemory.filter((m) => m.objectType === "person").length;
          const totalCompanies = allMemory.filter((m) => m.objectType === "company").length;

          prevCompleted = completed;
          prevPeople = totalPeople;
          prevCompanies = totalCompanies;

          enqueue(
            sseEvent("progress", {
              total,
              completed,
              failed,
              running,
              people: totalPeople,
              companies: totalCompanies,
            }),
          );

          for (const entity of recentMemory) {
            seenEntityIds.add(entity.id);
            const sourceItem = entity.sourceItemId
              ? sourceItems.find((s) => s.id === entity.sourceItemId)
              : null;
            enqueue(
              sseEvent("entity", {
                id: entity.id,
                objectType: entity.objectType,
                name: entity.name,
                description: entity.description,
                sourceContext: sourceItem?.title ?? null,
              }),
            );
          }

          if (total > 0 && completed >= total && running === 0) {
            enqueue(sseEvent("done", { total, completed, people: totalPeople, companies: totalCompanies }));
            closed = true;
            clearInterval(poll);
            clearInterval(heartbeat);
            controller.close();
          }
        } catch (err) {
          console.error("[ingestion-stream] initial emit error:", err instanceof Error ? err.message : err);
        }
      })();
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
