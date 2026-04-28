import { config } from "dotenv";
import { closedLoopFixtures } from "@arvya/agents/evals/closed-loop-fixtures";
import { resetAiClientForTests } from "../lib/ai";

config({ path: ".env.local", override: false, quiet: true });
config({ path: ".env", override: false, quiet: true });
import { getRepository, resetRepositoryForTests } from "../lib/db/repository";
import {
  addSourceAndIngest,
  answerBrainQuestion,
  closeOpenLoop,
  createBrain,
  getBrainSnapshot,
} from "../lib/brain/store";
import { retrieveRelevantContext } from "../lib/retrieval";
import { getAiClient } from "../lib/ai";

type CheckOutcome = { ok: true } | { ok: false; reason: string };

let failures = 0;
let total = 0;

function record(name: string, outcome: CheckOutcome) {
  total += 1;
  if (outcome.ok) {
    console.log(`✅ ${name}`);
  } else {
    failures += 1;
    console.log(`❌ ${name}: ${outcome.reason}`);
  }
}

function check(name: string, condition: boolean, reason = "condition was false") {
  record(name, condition ? { ok: true } : { ok: false, reason });
}

async function main() {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalAnthropicApiKey = process.env.ANTHROPIC_API_KEY;
  const originalOpenAiApiKey = process.env.OPENAI_API_KEY;
  const originalDefaultModelProvider = process.env.DEFAULT_MODEL_PROVIDER;
  const originalDefaultModel = process.env.DEFAULT_MODEL;
  delete process.env.DATABASE_URL;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  process.env.DEFAULT_MODEL_PROVIDER = "local";
  delete process.env.DEFAULT_MODEL;
  resetRepositoryForTests();
  resetAiClientForTests();

  const repository = getRepository();
  check("Repository runs in in-memory mode", repository.mode === "in_memory");

  // (a) Create a brain (Arvya Company Brain template)
  const brain = await createBrain({
    name: "Arvya Closed-Loop Smoke Brain",
    kind: "company",
    thesis:
      "Verify closed-loop core: ingestion, memory, open loops, ask-brain, outcome capture, learning.",
  });
  check("Created Arvya company brain", Boolean(brain?.id));

  // Pick the customer call fixture (rich set of memories + closeable loop)
  const fixture =
    closedLoopFixtures.find((item) => item.id === "customer-call-acme") ??
    closedLoopFixtures[0];
  check("Picked closed-loop fixture", Boolean(fixture));

  // (b) Ingest a fixture transcript
  const source = await addSourceAndIngest({
    brainId: brain.id,
    title: fixture.source.title,
    type: fixture.classificationHint,
    content: fixture.source.content,
  });
  check("Persisted source item", Boolean(source?.id));

  // (c) Assert: source persisted, memories of expected kinds, open loops, agent_runs
  const snapshot = await getBrainSnapshot(brain.id);
  check("Source item is in snapshot", snapshot.sourceItems.some((item) => item.id === source.id));
  check(
    "Memory objects were created",
    snapshot.memoryObjects.length > 0,
    `expected >0 memories, got ${snapshot.memoryObjects.length}`,
  );

  const expectedKinds = fixture.expected.memories.map((memory) => memory.kind);
  const extractedKindSet = new Set(
    snapshot.memoryObjects.map((memory) => memory.objectType),
  );
  for (const kind of new Set(expectedKinds)) {
    check(
      `Memory kind detected: ${kind}`,
      extractedKindSet.has(kind),
      `kind ${kind} not present (got: ${[...extractedKindSet].join(", ")})`,
    );
  }

  check(
    "Open loops were created",
    snapshot.openLoops.length > 0,
    `expected >0 open loops, got ${snapshot.openLoops.length}`,
  );

  const closeFragment = (
    fixture.expected.closeableLoopTextFragment ?? "pricing"
  ).toLowerCase();
  const candidateLoops = snapshot.openLoops.filter((loop) =>
    `${loop.title}\n${loop.description}\n${loop.sourceQuote ?? ""}`
      .toLowerCase()
      .includes(closeFragment),
  );
  check(
    `Found a closeable open loop matching "${closeFragment}"`,
    candidateLoops.length > 0,
    `no loop matched fragment "${closeFragment}"`,
  );

  const agentRunsAfterIngest = await repository.listAgentRuns(brain.id);
  for (const stepName of [
    "classify_source",
    "extract_memory",
    "detect_open_loops",
    "save_results",
  ]) {
    check(
      `Agent run logged: ${stepName}`,
      agentRunsAfterIngest.some((run) => run.stepName === stepName),
    );
  }

  // (Bonus) Quick sanity check on hybrid retrieval — make sure lexical fallback
  // returns something for an explicit question even without embeddings.
  const ai = getAiClient();
  const retrieved = await retrieveRelevantContext({
    brainId: brain.id,
    question: "What pains did Acme Logistics mention about customer feedback?",
    repository,
    ai,
    limit: 8,
  });
  check(
    "Hybrid retrieval returned context (lexical fallback OK)",
    retrieved.length > 0,
    "retrieveRelevantContext returned 0 items in in-memory mode",
  );

  // (d) Ask a question that the source answers — assert citation references the source_id.
  const initialAnswer = await answerBrainQuestion(
    brain.id,
    "What product pains did Acme Logistics mention?",
  );
  check(
    "Initial ask returned a non-empty answer",
    Boolean(initialAnswer.answer && initialAnswer.answer.length > 0),
  );
  check(
    "Initial ask citations reference the persisted source",
    initialAnswer.citations.some((citation) => citation.sourceItemId === source.id),
    `no citation pointed at source ${source.id}`,
  );
  if (initialAnswer.structuredCitations) {
    check(
      "Initial ask returned structured citations",
      initialAnswer.structuredCitations.length > 0,
      "structuredCitations was empty",
    );
  }

  // (e) Close one open loop with an outcome.
  const loopToClose = candidateLoops[0]!;
  const outcomeText =
    fixture.expected.outcomeText ??
    "Sent pricing deck on April 28; team is reviewing internally.";
  const closeResult = await closeOpenLoop(brain.id, loopToClose.id, {
    result: outcomeText,
    evidence_source_ids: source.id ? [source.id] : undefined,
  });
  check("closeOpenLoop returned the updated loop", Boolean(closeResult.loop));
  check(
    "Closed loop status is 'closed'",
    closeResult.loop.status === "closed",
    `loop status=${closeResult.loop.status}`,
  );
  check(
    "Closed loop persisted outcome text",
    (closeResult.loop.outcome ?? "").includes(outcomeText.slice(0, 30)),
    `outcome stored: ${closeResult.loop.outcome}`,
  );
  check(
    "Closed loop has a closedAt timestamp",
    Boolean(closeResult.loop.closedAt),
  );

  const memoryAfterClose = await repository.listMemoryObjects(brain.id);
  const outcomeMemory = memoryAfterClose.find(
    (memory) =>
      memory.properties?.memory_source === "open_loop_outcome" &&
      memory.properties?.openLoopId === loopToClose.id,
  );
  check(
    "Outcome memory was created (kind=outcome, linked to loop)",
    Boolean(outcomeMemory) && outcomeMemory!.objectType === "outcome",
    `outcome memory present=${Boolean(outcomeMemory)} kind=${outcomeMemory?.objectType}`,
  );
  check(
    "Outcome memory mentions the outcome text",
    Boolean(outcomeMemory) &&
      outcomeMemory!.description.toLowerCase().includes(outcomeText.slice(0, 20).toLowerCase()),
  );

  const agentRunsAfterClose = await repository.listAgentRuns(brain.id);
  check(
    "Agent run logged for close_open_loop",
    agentRunsAfterClose.some((run) => run.name === "close_open_loop" && run.status === "succeeded"),
  );

  // (f) Re-ask a related question — outcome should appear (proving learning).
  const followUpQuestion =
    fixture.expected.postCloseQuestion ?? "Did we send Acme the pricing proposal?";
  const followUpAnswer = await answerBrainQuestion(brain.id, followUpQuestion);
  const expectedSubs = (fixture.expected.postCloseExpectedSubstrings ?? [
    "pricing",
    "april 28",
  ]).map((s) => s.toLowerCase());
  const haystack = `${followUpAnswer.answer} ${followUpAnswer.citations
    .map((c) => c.evidence)
    .join(" ")}`.toLowerCase();
  for (const expected of expectedSubs) {
    check(
      `Follow-up answer mentions "${expected}" (learning closed the loop)`,
      haystack.includes(expected),
      `not present in answer or citations`,
    );
  }
  check(
    "Follow-up answer cites the outcome memory",
    Boolean(outcomeMemory) &&
      followUpAnswer.citations.some((c) => c.memoryObjectId === outcomeMemory!.id),
    "outcome memory was not cited",
  );

  // (g) Cleanup
  if (originalDatabaseUrl) {
    process.env.DATABASE_URL = originalDatabaseUrl;
  } else {
    delete process.env.DATABASE_URL;
  }
  if (originalAnthropicApiKey) {
    process.env.ANTHROPIC_API_KEY = originalAnthropicApiKey;
  } else {
    delete process.env.ANTHROPIC_API_KEY;
  }
  if (originalOpenAiApiKey) {
    process.env.OPENAI_API_KEY = originalOpenAiApiKey;
  } else {
    delete process.env.OPENAI_API_KEY;
  }
  if (originalDefaultModelProvider) {
    process.env.DEFAULT_MODEL_PROVIDER = originalDefaultModelProvider;
  } else {
    delete process.env.DEFAULT_MODEL_PROVIDER;
  }
  if (originalDefaultModel) {
    process.env.DEFAULT_MODEL = originalDefaultModel;
  } else {
    delete process.env.DEFAULT_MODEL;
  }
  resetRepositoryForTests();
  resetAiClientForTests();

  console.log("");
  console.log(`Closed-loop verifier: ${total - failures}/${total} checks passed.`);
  if (failures > 0) {
    console.log(`❌ ${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("✅ Closed-loop verifier passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
