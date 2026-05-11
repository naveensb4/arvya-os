/**
 * Bulk dismiss stale open loops.
 *
 * Stale criteria:
 *   - created >14 days ago
 *   - status is needs_review or open
 *   - no linked resolution evidence (no loopOutcomeLog with decision=closed)
 *   - no user interaction since creation (updatedAt ≈ createdAt)
 *
 * Usage:
 *   pnpm tsx apps/web/scripts/bulk-dismiss-stale-loops.ts --brain-id=<uuid>
 *   pnpm tsx apps/web/scripts/bulk-dismiss-stale-loops.ts --brain-id=<uuid> --execute
 *
 * Without --execute, runs in dry-run mode (default) and only prints what
 * would be dismissed.
 */

import { getRepository } from "../lib/db/repository";
import { getDb } from "../lib/db/client";
import { loopOutcomeLog } from "../lib/db/schema";
import { eq } from "drizzle-orm";

const STALE_DAYS = 14;
const STALE_STATUSES = new Set(["needs_review", "open"]);
const UPDATE_TOLERANCE_MS = 60_000;

async function main() {
  const args = process.argv.slice(2);
  const brainIdArg = args.find((a) => a.startsWith("--brain-id="));
  const execute = args.includes("--execute");

  if (!brainIdArg) {
    console.error("Usage: bulk-dismiss-stale-loops.ts --brain-id=<uuid> [--execute]");
    process.exit(1);
  }

  const brainId = brainIdArg.split("=")[1];
  const repository = getRepository();

  const brain = await repository.getBrain(brainId);
  if (!brain) {
    console.error(`Brain not found: ${brainId}`);
    process.exit(1);
  }

  console.log(`Brain: ${brain.name} (${brain.id})`);
  console.log(`Mode: ${execute ? "EXECUTE" : "DRY-RUN"}`);
  console.log(`Stale threshold: ${STALE_DAYS} days`);
  console.log("");

  const allLoops = await repository.listOpenLoops(brainId);
  const now = Date.now();
  const staleThresholdMs = STALE_DAYS * 24 * 60 * 60 * 1000;

  const db = getDb();
  const outcomeRows = await db
    .select({ loopId: loopOutcomeLog.loopId, decision: loopOutcomeLog.decision })
    .from(loopOutcomeLog)
    .where(eq(loopOutcomeLog.brainId, brainId));

  const loopsWithEvidence = new Set(
    outcomeRows
      .filter((r) => r.decision === "closed" || r.decision === "advanced")
      .map((r) => r.loopId),
  );

  const staleLoops = allLoops.filter((loop) => {
    if (!STALE_STATUSES.has(loop.status)) return false;

    const createdMs = new Date(loop.createdAt).getTime();
    if (now - createdMs < staleThresholdMs) return false;

    if (loopsWithEvidence.has(loop.id)) return false;

    if (loop.updatedAt) {
      const updatedMs = new Date(loop.updatedAt).getTime();
      if (updatedMs - createdMs > UPDATE_TOLERANCE_MS) return false;
    }

    return true;
  });

  console.log(`Total open loops: ${allLoops.length}`);
  console.log(`Stale loops (would dismiss): ${staleLoops.length}`);
  console.log("");

  if (staleLoops.length === 0) {
    console.log("Nothing to dismiss.");
    return;
  }

  for (const loop of staleLoops) {
    const ageDays = Math.floor(
      (now - new Date(loop.createdAt).getTime()) / (24 * 60 * 60 * 1000),
    );
    console.log(
      `  ${execute ? "DISMISS" : "WOULD DISMISS"}: [${loop.status}] ${loop.title} (${ageDays}d old, type=${loop.loopType})`,
    );
  }

  if (!execute) {
    console.log("");
    console.log("Re-run with --execute to dismiss these loops.");
    return;
  }

  console.log("");
  console.log("Dismissing...");

  let dismissed = 0;
  for (const loop of staleLoops) {
    await repository.updateOpenLoop(loop.id, {
      status: "dismissed",
      properties: {
        ...(loop.properties ?? {}),
        bulkDismissedAt: new Date().toISOString(),
        bulkDismissReason: "stale_cleanup",
      },
    });
    dismissed++;
  }

  console.log(`Done. Dismissed ${dismissed} loops.`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
