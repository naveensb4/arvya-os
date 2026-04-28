import assert from "node:assert/strict";
import { resetAiClientForTests } from "../lib/ai";
import { answerBrainQuestion, createBrain, generateDailyFounderBrief, getBrainSnapshot } from "../lib/brain/store";
import { getRepository, resetRepositoryForTests } from "../lib/db/repository";
import { syncConnectorConfig } from "../lib/always-on/runtime";
import type { GmailClient } from "../lib/connectors/gmail";
import type { OutlookClient } from "../lib/connectors/outlook";

const gmailClient: GmailClient = {
  async listLabels() {
    return [{ id: "Label_ArvyaBrain", name: "Arvya Brain" }];
  },
  async listMessages(labelId: string) {
    assert.equal(labelId, "Label_ArvyaBrain");
    return [
      { id: "gmail-investor-follow-up", threadId: "gmail-thread-1" },
      { id: "gmail-random-receipt", threadId: "gmail-thread-2" },
    ];
  },
  async getMessage(messageId: string) {
    if (messageId === "gmail-random-receipt") {
      return {
        id: messageId,
        threadId: "gmail-thread-2",
        labelIds: ["Label_ArvyaBrain"],
        internalDate: String(Date.parse("2026-04-25T19:00:00.000Z")),
        payload: {
          mimeType: "text/plain",
          headers: [
            { name: "Subject", value: "Dinner receipt" },
            { name: "From", value: "Receipts <receipts@example.com>" },
            { name: "To", value: "Naveen <naveen@example.com>" },
            { name: "Date", value: "Sat, 25 Apr 2026 19:00:00 -0700" },
          ],
          body: {
            data: Buffer.from("Thanks for dining with us. Your receipt is attached.", "utf8").toString("base64url"),
          },
        },
      };
    }
    assert.equal(messageId, "gmail-investor-follow-up");
    return {
      id: messageId,
      threadId: "gmail-thread-1",
      labelIds: ["Label_ArvyaBrain"],
      internalDate: String(Date.parse("2026-04-25T18:00:00.000Z")),
      payload: {
        mimeType: "text/plain",
        headers: [
          { name: "Subject", value: "Investor follow-up" },
          { name: "From", value: "Annie <annie@example.com>" },
          { name: "To", value: "Naveen <naveen@arvya.ai>" },
          { name: "Date", value: "Sat, 25 Apr 2026 18:00:00 -0700" },
        ],
        body: {
          data: Buffer.from("Send the updated deck by Friday and follow up with the demo link next week.", "utf8").toString("base64url"),
        },
      },
    };
  },
};

const outlookClient: OutlookClient = {
  async listMailFolders() {
    return [{ id: "arvya-brain-folder", displayName: "Arvya Brain" }];
  },
  async listMessages(folderId: string) {
    assert.equal(folderId, "arvya-brain-folder");
    return [
      {
        id: "outlook-customer-follow-up",
        subject: "Customer workflow follow-up",
        from: { emailAddress: { name: "Maya", address: "maya@example.com" } },
        toRecipients: [{ emailAddress: { name: "Naveen", address: "naveen@arvya.ai" } }],
        categories: ["Arvya Brain"],
        receivedDateTime: "2026-04-26T18:00:00.000Z",
        webLink: "https://outlook.office.com/mail/id/outlook-customer-follow-up",
        body: {
          contentType: "text",
          content: "Share the pilot workspace notes with Maya tomorrow. Schedule another call next week.",
        },
      },
      {
        id: "outlook-newsletter",
        subject: "Weekly cooking tips",
        from: { emailAddress: { name: "Newsletter", address: "news@example.com" } },
        toRecipients: [{ emailAddress: { name: "Naveen", address: "naveen@example.com" } }],
        categories: ["Arvya Brain"],
        receivedDateTime: "2026-04-26T19:00:00.000Z",
        webLink: "https://outlook.office.com/mail/id/outlook-newsletter",
        body: {
          contentType: "text",
          content: "Five ways to improve your weeknight pasta.",
        },
      },
    ];
  },
};

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
    const brain = await createBrain({
      name: "Email Connector Mock Verification Brain",
      kind: "company",
      thesis: "Verify Gmail and Outlook selected-container sync into source-backed memory and open loops.",
    });

    const gmailConfig = await repository.createConnectorConfig({
      brainId: brain.id,
      connectorType: "gmail",
      status: "connected",
      syncEnabled: true,
      syncIntervalMinutes: 10,
      config: { labelIds: ["Arvya Brain"] },
      credentials: { access_token: "mock-gmail-token" },
    });
    const outlookConfig = await repository.createConnectorConfig({
      brainId: brain.id,
      connectorType: "outlook",
      status: "connected",
      syncEnabled: true,
      syncIntervalMinutes: 10,
      config: { outlookFolderIds: ["Arvya Brain"] },
      credentials: { access_token: "mock-outlook-token" },
    });

    const gmailFirst = await syncConnectorConfig(gmailConfig, { gmailClient });
    const outlookFirst = await syncConnectorConfig(outlookConfig, { outlookClient });
    assert.equal(gmailFirst.itemsIngested, 1);
    assert.equal(gmailFirst.itemsFound, 2);
    assert.equal(gmailFirst.itemsSkipped, 1);
    assert.equal(outlookFirst.itemsIngested, 1);
    assert.equal(outlookFirst.itemsFound, 2);
    assert.equal(outlookFirst.itemsSkipped, 1);

    const snapshot = await getBrainSnapshot(brain.id);
    const gmailSourceItems = snapshot.sourceItems.filter((source) => source.metadata?.connector_type === "gmail");
    const outlookSourceItems = snapshot.sourceItems.filter((source) => source.metadata?.connector_type === "outlook");
    assert.equal(gmailSourceItems.length, 1);
    assert.equal(outlookSourceItems.length, 1);
    assert.equal(gmailSourceItems[0]?.metadata?.gmail_label_name, "Arvya Brain");
    assert.equal(outlookSourceItems[0]?.metadata?.outlook_folder_name, "Arvya Brain");
    assert.equal(gmailSourceItems[0]?.metadata?.source_system, "gmail");
    assert.equal(outlookSourceItems[0]?.metadata?.source_system, "outlook");
    assert.equal((gmailSourceItems[0]?.metadata?.aryva_relevance as Record<string, unknown> | undefined)?.reason, "matched_aryva_scope");
    assert.equal((outlookSourceItems[0]?.metadata?.aryva_relevance as Record<string, unknown> | undefined)?.reason, "matched_aryva_scope");
    assert.equal((gmailSourceItems[0]?.metadata?.source_trace as Record<string, unknown> | undefined)?.external_id, "gmail:gmail-investor-follow-up");
    assert.ok(Array.isArray(gmailSourceItems[0]?.metadata?.dedupe_keys));
    assert.ok(String(gmailSourceItems[0]?.metadata?.content_hash ?? "").length >= 32);
    assert.ok(snapshot.memoryObjects.some((memory) => memory.sourceItemId === gmailSourceItems[0]?.id));
    assert.ok(snapshot.memoryObjects.some((memory) => memory.sourceItemId === outlookSourceItems[0]?.id));
    assert.ok(snapshot.openLoops.some((loop) => loop.sourceItemId === gmailSourceItems[0]?.id));
    assert.ok(snapshot.openLoops.some((loop) => loop.sourceItemId === outlookSourceItems[0]?.id));
    assert.ok(snapshot.openLoops.some((loop) => /deck|demo link|pilot workspace|another call/i.test(`${loop.title} ${loop.description}`)));
    assert.ok(snapshot.agentRuns.some((run) => run.name === "source_ingestion"));

    const answer = await answerBrainQuestion(brain.id, "What follow-ups do we owe from email?");
    const citedSourceIds = new Set(answer.citations.map((citation) => citation.sourceItemId));
    assert.ok(gmailSourceItems.some((source) => citedSourceIds.has(source.id)));
    assert.ok(outlookSourceItems.some((source) => citedSourceIds.has(source.id)));

    const brief = await generateDailyFounderBrief(brain.id);
    const briefSourceIds = new Set([
      ...brief.priorities.flatMap((priority) => priority.sourceItemIds ?? []),
      ...brief.actions.map((loop) => loop.sourceItemId).filter((id): id is string => Boolean(id)),
      ...brief.openLoops.map((loop) => loop.sourceItemId).filter((id): id is string => Boolean(id)),
      ...brief.loopsToReview.map((loop) => loop.sourceItemId).filter((id): id is string => Boolean(id)),
    ]);
    assert.ok([...gmailSourceItems, ...outlookSourceItems].some((source) => briefSourceIds.has(source.id)));

    const gmailSecond = await syncConnectorConfig(gmailConfig, { gmailClient });
    const outlookSecond = await syncConnectorConfig(outlookConfig, { outlookClient });
    assert.equal(gmailSecond.itemsSkipped, 2);
    assert.equal(outlookSecond.itemsSkipped, 2);
    assert.equal((await repository.listSourceItems(brain.id)).filter((source) => ["gmail", "outlook"].includes(String(source.metadata?.connector_type))).length, 2);

    console.log("Email connector mock verification passed.");
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
