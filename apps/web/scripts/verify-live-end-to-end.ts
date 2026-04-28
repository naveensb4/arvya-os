/**
 * Live end-to-end verification against real Supabase + real LLM.
 * No mocks. No in-memory fallback.
 *
 * Drives the full closed loop:
 *   1. Create a brain
 *   2. Set a priority
 *   3. Ingest a meeting transcript (real Anthropic call)
 *   4. Verify memory + open loops landed in Supabase
 *   5. Ask Brain a question (real Anthropic call)
 *   6. Close an open loop with an outcome
 *   7. Verify the outcome memory + agent_run landed
 *   8. Generate the daily founder brief (real Anthropic call)
 *   9. Run the company drift review (real Anthropic call)
 */

import "dotenv/config";
import {
  createBrain,
  addSourceAndIngest,
  closeOpenLoop,
  createBrainPriority,
  generateDriftReview,
  generateDailyFounderBrief,
  answerBrainQuestion,
} from "../lib/brain/store";
import { getRepository } from "../lib/db/repository";

const repository = getRepository();

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, extra = "") {
  if (ok) {
    pass += 1;
    console.log(`✅ ${name}${extra ? ` — ${extra}` : ""}`);
  } else {
    fail += 1;
    console.error(`❌ ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

async function main() {
  if (!process.env.DATABASE_URL || !process.env.ANTHROPIC_API_KEY) {
    throw new Error("DATABASE_URL and ANTHROPIC_API_KEY must be set");
  }
  if (process.env.ARVYA_REPOSITORY_MODE === "in-memory") {
    throw new Error("This verifier requires real Supabase, not in-memory");
  }

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const brainName = `Arvya Live E2E ${ts}`;

  console.log(`\n=== Live end-to-end verification (${ts}) ===\n`);

  // 1. Brain
  console.log("[1] Creating brain in Supabase...");
  const brain = await createBrain({
    name: brainName,
    kind: "company",
    thesis:
      "Live test brain for end-to-end closed-loop verification against real Supabase and real LLM.",
  });
  check("Brain created", typeof brain.id === "string" && brain.id.length > 0, brain.id);

  // 2. Priority
  console.log("\n[2] Setting a priority...");
  const priority = await createBrainPriority(brain.id, {
    statement:
      "Close the Series A round by EOQ with at least 2 lead-quality term sheets.",
    setBy: "naveen",
    horizon: "quarter",
    status: "active",
  });
  check("Priority created", typeof priority.id === "string", priority.statement);

  // 3. Ingest a real source (real LLM)
  console.log("\n[3] Ingesting a meeting transcript via real LLM (this can take ~30s)...");
  const transcript = `Investor call — Sequoia, partner: Pat Grady — 2026-04-26

Naveen: Walked Pat through Arvya Brain OS architecture. Pat seemed engaged on the closed-loop angle.

Pat: Two things I want to dig into. First, how does this differ from Glean / Notion AI / Gong / NotebookLM? The collapse of "company knowledge" into a single AI surface feels crowded.

Second, your moat. Is it the data network effect from connectors, or is it the workflow orchestration layer?

Naveen: The wedge is connecting calls + Drive + email + tickets into structured memory with provenance, then closing the loop with agent action. We will commit to a written follow-up explaining why we win on closed-loop and provenance versus the others.

Pat: Send that to me by Tuesday. Also share your latest pricing model — what's the per-seat anchor?

Naveen: We're piloting at $99/seat with founder-led design partners. Will revisit.

Pat: I want to see two more design partner reference calls before we move to a term sheet. Naveen, can you intro me to Replit and Cursor's IT leads in the next week? That's the gate.

Action items:
- Naveen sends Pat written follow-up explaining moat (closed-loop + provenance) by Tuesday Apr 28.
- Naveen sends pricing model details with $99/seat anchor.
- Naveen intros Pat to Replit and Cursor IT leads within one week (by May 3).
- Pat will share Sequoia internal customer-research checklist.
`;

  const sourceItem = await addSourceAndIngest({
    brainId: brain.id,
    title: "Sequoia investor call — Pat Grady — 2026-04-26",
    type: "transcript",
    content: transcript,
  });
  check(
    "Source ingested + LLM ran",
    typeof sourceItem.id === "string" && sourceItem.id.length > 0,
    sourceItem.id,
  );

  // 4. Verify memory + loops in Supabase
  console.log("\n[4] Reading back memory + loops from Supabase...");
  await new Promise((r) => setTimeout(r, 500));

  const memories = await repository.listMemoryObjects(brain.id);
  const loops = await repository.listOpenLoops(brain.id);
  const runs = await repository.listAgentRuns(brain.id, 50);

  check(
    "Memories created in Supabase",
    memories.length > 0,
    `count=${memories.length}, types=${[...new Set(memories.map((m) => m.objectType))].join(", ")}`,
  );
  check(
    "Open loops created in Supabase",
    loops.length > 0,
    `count=${loops.length}, types=${[...new Set(loops.map((l) => l.loopType))].join(", ")}`,
  );
  check(
    "Agent runs logged",
    runs.length >= 4,
    `count=${runs.length}, names=${[...new Set(runs.map((r) => r.name))].slice(0, 6).join(", ")}`,
  );

  const personOrCompany = memories.some(
    (m) => m.objectType === "person" || m.objectType === "company",
  );
  check("Extracted at least one person or company entity", personOrCompany);

  const commitmentMem = memories.some(
    (m) => m.objectType === "commitment" || m.objectType === "decision",
  );
  check("Extracted at least one commitment or decision", commitmentMem);

  const followUpLoop = loops.find(
    (l) =>
      /follow|written|intro|pricing|sequoia|pat|moat/i.test(l.title) ||
      /follow|written|intro|pricing|sequoia|pat|moat/i.test(l.description ?? ""),
  );
  check(
    "Open loop captures a real follow-up from the call",
    Boolean(followUpLoop),
    followUpLoop ? `loop="${followUpLoop.title}" type=${followUpLoop.loopType}` : "",
  );

  // 5. Ask Brain — real LLM
  console.log("\n[5] Asking Brain a question (real LLM call)...");
  const ask = await answerBrainQuestion(
    brain.id,
    "What did Pat Grady from Sequoia ask Naveen to send him by Tuesday?",
  );
  check("Ask Brain returned an answer", ask.answer.length > 50, `${ask.answer.length} chars`);
  check(
    "Answer mentions the written follow-up",
    /written|follow.?up|moat|closed.?loop|provenance/i.test(ask.answer),
    ask.answer.slice(0, 140) + "…",
  );
  check(
    "Answer has structured citations",
    Array.isArray(ask.citations) && ask.citations.length > 0,
    `citations=${ask.citations.length}`,
  );
  if (ask.citations.length > 0) {
    const memoryIds = new Set(memories.map((m) => m.id));
    const someCitationGrounded = ask.citations.some(
      (c) =>
        c.sourceItemId === sourceItem.id ||
        (c.memoryObjectId && memoryIds.has(c.memoryObjectId)),
    );
    check(
      "At least one citation references the real ingested source or memory",
      someCitationGrounded,
      `citations: ${ask.citations.map((c) => c.sourceItemId).slice(0, 3).join(", ")}`,
    );
  }

  // 6. Close an open loop with an outcome
  console.log("\n[6] Closing an open loop with an outcome...");
  const targetLoop = followUpLoop ?? loops[0];
  if (!targetLoop) {
    throw new Error("No open loop to close");
  }
  const outcomeText =
    "Sent Pat a 2-page follow-up on Apr 28 detailing the closed-loop + provenance moat plus our $99/seat pricing anchor. Pat replied 'thanks, sharing internally' and confirmed Replit/Cursor intros by May 3.";
  const closed = await closeOpenLoop(brain.id, targetLoop.id, {
    result: outcomeText,
  });
  check("closeOpenLoop returned the loop", Boolean(closed?.loop));
  check(
    "Loop is now closed",
    closed?.loop.status === "closed",
    `status=${closed?.loop.status}`,
  );
  check("Outcome text persisted", closed?.loop.outcome === outcomeText);
  check("closedAt set", typeof closed?.loop.closedAt === "string");
  check("Outcome memory id returned", typeof closed?.outcomeMemoryId === "string");

  const memoriesAfter = await repository.listMemoryObjects(brain.id);
  const outcomeMem = memoriesAfter.find((m) => m.id === closed?.outcomeMemoryId);
  check(
    "Outcome memory persisted in Supabase",
    Boolean(outcomeMem) && outcomeMem?.objectType === "outcome",
    outcomeMem
      ? `type=${outcomeMem.objectType}, link=${outcomeMem.properties?.openLoopId}`
      : "",
  );

  const runsAfter = await repository.listAgentRuns(brain.id, 50);
  check(
    "Agent run logged for close_open_loop",
    runsAfter.some((r) => r.name === "close_open_loop"),
  );

  // 7. Daily founder brief — real LLM
  console.log("\n[7] Generating daily founder brief with real LLM...");
  const brief = await generateDailyFounderBrief(brain.id);
  check("Daily brief returned", Boolean(brief), JSON.stringify(brief).slice(0, 80) + "…");

  // 8. Drift review — real LLM
  console.log("\n[8] Running company drift review with real LLM...");
  const drift = await generateDriftReview(brain.id);
  check("Drift review returned", Boolean(drift?.review));
  check(
    "Drift review has overall_alignment",
    typeof drift?.review.overall_alignment === "string",
    drift.review.overall_alignment,
  );
  check(
    "Drift review has summary_for_founders",
    typeof drift?.review.summary_for_founders === "string",
  );
  check(
    "Drift review has signals (array, may be empty for fresh brain)",
    Array.isArray(drift?.review.signals),
    `signals=${drift?.review.signals.length ?? 0}`,
  );
  check("Drift review persisted as agent run", typeof drift?.agentRunId === "string");

  console.log(`\n=== Result: ${pass} passed, ${fail} failed ===`);
  console.log(`Brain id: ${brain.id}`);
  console.log(
    `Open the dev server: ${process.env.ARVYA_PUBLIC_BASE_URL || "http://localhost:3030"}/brains/${brain.id}\n`,
  );

  if (fail > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("\n💥 Verifier crashed:");
  console.error(err);
  process.exit(1);
});
