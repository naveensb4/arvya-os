import assert from "node:assert/strict";
import { resetAiClientForTests } from "../lib/ai";
import { addSourceAndIngest, createBrain } from "../lib/brain/store";
import { getRepository, resetRepositoryForTests } from "../lib/db/repository";
import {
  buildDedupeKeys,
  buildSourceTraceMetadata,
  hashNormalizedSourceContent,
  normalizeSourceContent,
  sourceFingerprint,
  sourceMatchesFingerprint,
} from "../lib/workflows/source-normalization";

async function main() {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalAnthropicApiKey = process.env.ANTHROPIC_API_KEY;
  const originalOpenaiApiKey = process.env.OPENAI_API_KEY;

  delete process.env.DATABASE_URL;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  resetRepositoryForTests();
  resetAiClientForTests();

  try {
    const repository = getRepository();
    assert.equal(repository.mode, "in_memory");

    const rawTranscript = [
      "\uFEFFNaveen:\u00A0Arvya needs every source traceable to the original email or transcript.\r\n",
      "PB: Deduplicate the same call even if the filename changes.\r\n\r\n\r\n\r\n",
      "Action: test Recall, Gmail, and Outlook ingestion this week.\u200B",
    ].join("");
    const normalizedTranscript = normalizeSourceContent(rawTranscript);
    assert.equal(normalizedTranscript, [
      "Naveen: Arvya needs every source traceable to the original email or transcript.",
      "PB: Deduplicate the same call even if the filename changes.",
      "",
      "",
      "Action: test Recall, Gmail, and Outlook ingestion this week.",
    ].join("\n"));
    assert.equal(hashNormalizedSourceContent(rawTranscript), hashNormalizedSourceContent(normalizedTranscript));

    const traceMetadata = buildSourceTraceMetadata({
      sourceKind: "transcript",
      sourceSystem: "batch_upload",
      externalId: "batch:2026-04-25-investor",
      originalTitle: "2026-04-25__Investor__DormRoomFund-Annie__Intro-Call.txt",
      occurredAt: "2026-04-25",
    });
    const renamedFingerprint = sourceFingerprint({
      title: "Renamed intro call with Annie",
      content: normalizedTranscript,
      metadata: {
        ...traceMetadata,
        originalFilename: "2026-04-25__Investor__DormRoomFund-Annie__Renamed-Intro-Call.txt",
      },
    });
    const originalSource = {
      id: "source-original",
      brainId: "brain",
      title: "Intro Call with DormRoomFund-Annie",
      type: "transcript" as const,
      content: normalizedTranscript,
      metadata: {
        ...traceMetadata,
        originalFilename: "2026-04-25__Investor__DormRoomFund-Annie__Intro-Call.txt",
        dedupe_keys: buildDedupeKeys(renamedFingerprint),
      },
      createdAt: new Date().toISOString(),
    };
    assert.equal(sourceMatchesFingerprint(originalSource, renamedFingerprint), true);

    const gmailFingerprint = sourceFingerprint({
      title: "Investor follow-up",
      content: "Subject: Investor follow-up\nFrom: Annie <annie@example.com>\nTo: Naveen <naveen@arvya.ai>\n\nSend the deck Friday.",
      metadata: buildSourceTraceMetadata({
        sourceKind: "email",
        sourceSystem: "gmail",
        connectorType: "gmail",
        connectorConfigId: "gmail-config",
        externalId: "gmail:gmail-investor-follow-up",
        originalTitle: "Investor follow-up",
      }),
    });
    const outlookSource = {
      id: "source-outlook",
      brainId: "brain",
      title: "Investor follow-up",
      type: "email" as const,
      content: "Subject: Investor follow-up\nFrom: Annie <annie@example.com>\nTo: Naveen <naveen@arvya.ai>\n\nSend the deck Friday.",
      metadata: {
        ...buildSourceTraceMetadata({
          sourceKind: "email",
          sourceSystem: "outlook",
          connectorType: "outlook",
          connectorConfigId: "outlook-config",
          externalId: "outlook:investor-follow-up",
          originalTitle: "Investor follow-up",
        }),
        dedupe_keys: buildDedupeKeys(gmailFingerprint),
      },
      createdAt: new Date().toISOString(),
    };
    assert.equal(sourceMatchesFingerprint(outlookSource, gmailFingerprint), true, "global dedupe can match identical content");
    assert.equal(sourceMatchesFingerprint(outlookSource, gmailFingerprint, { connectorScoped: true }), false, "connector sync dedupe must not cross providers");

    const brain = await createBrain({
      name: "Source Normalization Verification Brain",
      kind: "company",
      thesis: "Verify manual Arvya sources are normalized, traceable, and deduplicated.",
    });
    const source = await addSourceAndIngest({
      brainId: brain.id,
      title: "Manual Arvya ingestion audit note",
      type: "note",
      content: "Arvya ingestion audit: normalize source content, preserve source_trace metadata, and deduplicate exact repeats.",
    });
    assert.equal(source.metadata?.source_system, "manual_ingest");
    assert.equal(source.metadata?.source_kind, "note");
    assert.equal((source.metadata?.source_trace as Record<string, unknown> | undefined)?.original_title, "Manual Arvya ingestion audit note");
    assert.ok(Array.isArray(source.metadata?.dedupe_keys));

    await addSourceAndIngest({
      brainId: brain.id,
      title: "Manual Arvya ingestion audit note duplicate",
      type: "note",
      content: "\nArvya ingestion audit: normalize source content, preserve source_trace metadata, and deduplicate exact repeats.\n",
    });
    const createdSources = (await repository.listSourceItems(brain.id))
      .filter((item) => item.metadata?.source_system === "manual_ingest");
    assert.equal(createdSources.length, 1, "expected manual duplicate to reuse the original source");

    console.log("Source normalization verification passed.");
  } finally {
    if (originalDatabaseUrl) process.env.DATABASE_URL = originalDatabaseUrl;
    if (originalAnthropicApiKey) process.env.ANTHROPIC_API_KEY = originalAnthropicApiKey;
    if (originalOpenaiApiKey) process.env.OPENAI_API_KEY = originalOpenaiApiKey;
    resetRepositoryForTests();
    resetAiClientForTests();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
