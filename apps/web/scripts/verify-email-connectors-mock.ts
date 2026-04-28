import assert from "node:assert/strict";
import { resetAiClientForTests } from "../lib/ai";
import { answerBrainQuestion, createBrain, generateDailyFounderBrief, getBrainSnapshot } from "../lib/brain/store";
import { getRepository, resetRepositoryForTests } from "../lib/db/repository";
import { syncConnectorConfig } from "../lib/always-on/runtime";
import type { GmailClient, GmailMessage, GmailMessageListItem } from "../lib/connectors/gmail";
import type { OutlookClient, OutlookMessage } from "../lib/connectors/outlook";

let pass = 0;
let fail = 0;
function check(label: string, fn: () => void) {
  try {
    fn();
    pass += 1;
    console.log(`✅ ${label}`);
  } catch (error) {
    fail += 1;
    console.log(`❌ ${label}`);
    console.log(`   ${(error as Error).message}`);
  }
}

type GmailFixture = {
  list: GmailMessageListItem;
  message: GmailMessage;
};

const gmailMessages: GmailFixture[] = [
  {
    list: { id: "gmail-investor-follow-up", threadId: "gmail-thread-1" },
    message: {
      id: "gmail-investor-follow-up",
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
    },
  },
  {
    list: { id: "gmail-random-receipt", threadId: "gmail-thread-2" },
    message: {
      id: "gmail-random-receipt",
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
    },
  },
];

const gmailNewArrival: GmailFixture = {
  list: { id: "gmail-customer-discovery", threadId: "gmail-thread-3" },
  message: {
    id: "gmail-customer-discovery",
    threadId: "gmail-thread-3",
    labelIds: ["Label_ArvyaBrain"],
    internalDate: String(Date.parse("2026-04-26T14:00:00.000Z")),
    payload: {
      mimeType: "text/plain",
      headers: [
        { name: "Subject", value: "Arvya pilot follow-up" },
        { name: "From", value: "Maya <maya@example.com>" },
        { name: "To", value: "Naveen <naveen@arvya.ai>" },
        { name: "Date", value: "Sun, 26 Apr 2026 07:00:00 -0700" },
      ],
      body: {
        data: Buffer.from("Schedule another call with Naveen next week to confirm the Arvya pilot scope.", "utf8").toString("base64url"),
      },
    },
  },
};

class StatefulGmailClient implements GmailClient {
  store: GmailFixture[];
  lastListSince: string | undefined;
  constructor(initial: GmailFixture[]) {
    this.store = [...initial];
    this.lastListSince = undefined;
  }
  async listLabels() {
    return [{ id: "Label_ArvyaBrain", name: "Arvya Brain" }];
  }
  async listMessages(labelId: string, options?: { since?: string }) {
    assert.equal(labelId, "Label_ArvyaBrain");
    this.lastListSince = options?.since;
    if (!options?.since) return this.store.map((fixture) => fixture.list);
    const sinceMs = Date.parse(options.since);
    return this.store
      .filter((fixture) => Number(fixture.message.internalDate) > sinceMs)
      .map((fixture) => fixture.list);
  }
  async getMessage(messageId: string) {
    const found = this.store.find((fixture) => fixture.message.id === messageId);
    if (!found) throw new Error(`Missing mock Gmail message: ${messageId}`);
    return found.message;
  }
}

const outlookMessagesA: OutlookMessage[] = [
  {
    id: "outlook-customer-follow-up",
    subject: "Customer workflow follow-up",
    from: { emailAddress: { name: "Maya", address: "maya@example.com" } },
    toRecipients: [{ emailAddress: { name: "Naveen", address: "naveen@arvya.ai" } }],
    categories: ["Arvya Brain"],
    receivedDateTime: "2026-04-26T18:00:00.000Z",
    webLink: "https://outlook.office.com/mail/id/outlook-customer-follow-up",
    body: { contentType: "text", content: "Share the pilot workspace notes with Maya tomorrow. Schedule another call next week." },
  },
  {
    id: "outlook-newsletter",
    subject: "Weekly cooking tips",
    from: { emailAddress: { name: "Newsletter", address: "news@example.com" } },
    toRecipients: [{ emailAddress: { name: "Naveen", address: "naveen@example.com" } }],
    categories: ["Arvya Brain"],
    receivedDateTime: "2026-04-26T19:00:00.000Z",
    webLink: "https://outlook.office.com/mail/id/outlook-newsletter",
    body: { contentType: "text", content: "Five ways to improve your weeknight pasta." },
  },
];

const outlookNewArrival: OutlookMessage = {
  id: "outlook-customer-pricing",
  subject: "Arvya pricing follow-up",
  from: { emailAddress: { name: "Maya", address: "maya@example.com" } },
  toRecipients: [{ emailAddress: { name: "Naveen", address: "naveen@arvya.ai" } }],
  categories: ["Arvya Brain"],
  receivedDateTime: "2026-04-27T18:00:00.000Z",
  webLink: "https://outlook.office.com/mail/id/outlook-customer-pricing",
  body: { contentType: "text", content: "Send Maya the Arvya pricing one-pager and follow up with the contract draft." },
};

class StatefulOutlookClient implements OutlookClient {
  store: OutlookMessage[];
  lastListSince: string | undefined;
  constructor(initial: OutlookMessage[]) {
    this.store = [...initial];
    this.lastListSince = undefined;
  }
  async listMailFolders() {
    return [{ id: "arvya-brain-folder", displayName: "Arvya Brain" }];
  }
  async listMessages(folderId: string, options?: { since?: string }) {
    assert.equal(folderId, "arvya-brain-folder");
    this.lastListSince = options?.since;
    if (!options?.since) return this.store;
    const sinceMs = Date.parse(options.since);
    return this.store.filter((message) => {
      const ts = Date.parse(message.receivedDateTime ?? "");
      return Number.isFinite(ts) ? ts > sinceMs : true;
    });
  }
}

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

    const gmailClient = new StatefulGmailClient(gmailMessages);
    const outlookClient = new StatefulOutlookClient(outlookMessagesA);

    const gmailFirst = await syncConnectorConfig(gmailConfig, { gmailClient });
    const outlookFirst = await syncConnectorConfig(outlookConfig, { outlookClient });
    check("gmail first sync ingests one Aryva-relevant message", () => {
      assert.equal(gmailFirst.itemsIngested, 1);
      assert.equal(gmailFirst.itemsFound, 2);
      assert.equal(gmailFirst.itemsSkipped, 1);
    });
    check("outlook first sync ingests one Aryva-relevant message", () => {
      assert.equal(outlookFirst.itemsIngested, 1);
      assert.equal(outlookFirst.itemsFound, 2);
      assert.equal(outlookFirst.itemsSkipped, 1);
    });
    check("gmail first sync sent no since-watermark", () => assert.equal(gmailClient.lastListSince, undefined));
    check("outlook first sync sent no since-watermark", () => assert.equal(outlookClient.lastListSince, undefined));

    const snapshot = await getBrainSnapshot(brain.id);
    const gmailSourceItems = snapshot.sourceItems.filter((source) => source.metadata?.connector_type === "gmail");
    const outlookSourceItems = snapshot.sourceItems.filter((source) => source.metadata?.connector_type === "outlook");
    check("gmail produced exactly one source_item", () => assert.equal(gmailSourceItems.length, 1));
    check("outlook produced exactly one source_item", () => assert.equal(outlookSourceItems.length, 1));
    check("gmail source carries label + scope reason", () => {
      assert.equal(gmailSourceItems[0]?.metadata?.gmail_label_name, "Arvya Brain");
      assert.equal((gmailSourceItems[0]?.metadata?.aryva_relevance as Record<string, unknown> | undefined)?.reason, "matched_aryva_scope");
    });
    check("outlook source carries folder + scope reason", () => {
      assert.equal(outlookSourceItems[0]?.metadata?.outlook_folder_name, "Arvya Brain");
      assert.equal((outlookSourceItems[0]?.metadata?.aryva_relevance as Record<string, unknown> | undefined)?.reason, "matched_aryva_scope");
    });
    check("gmail source has dedupe keys + content hash", () => {
      assert.equal((gmailSourceItems[0]?.metadata?.source_trace as Record<string, unknown> | undefined)?.external_id, "gmail:gmail-investor-follow-up");
      assert.ok(Array.isArray(gmailSourceItems[0]?.metadata?.dedupe_keys));
      assert.ok(String(gmailSourceItems[0]?.metadata?.content_hash ?? "").length >= 32);
    });
    check("memory + open loops + agent_runs created from email ingestion", () => {
      assert.ok(snapshot.memoryObjects.some((memory) => memory.sourceItemId === gmailSourceItems[0]?.id));
      assert.ok(snapshot.memoryObjects.some((memory) => memory.sourceItemId === outlookSourceItems[0]?.id));
      assert.ok(snapshot.openLoops.some((loop) => loop.sourceItemId === gmailSourceItems[0]?.id));
      assert.ok(snapshot.openLoops.some((loop) => loop.sourceItemId === outlookSourceItems[0]?.id));
      assert.ok(snapshot.openLoops.some((loop) => /deck|demo link|pilot workspace|another call/i.test(`${loop.title} ${loop.description}`)));
      assert.ok(snapshot.agentRuns.some((run) => run.name === "source_ingestion"));
    });

    const answer = await answerBrainQuestion(brain.id, "What follow-ups do we owe from email?");
    const citedSourceIds = new Set(answer.citations.map((citation) => citation.sourceItemId));
    check("ask brain cites both email connectors", () => {
      assert.ok(gmailSourceItems.some((source) => citedSourceIds.has(source.id)));
      assert.ok(outlookSourceItems.some((source) => citedSourceIds.has(source.id)));
    });

    const brief = await generateDailyFounderBrief(brain.id);
    const briefSourceIds = new Set([
      ...brief.priorities.flatMap((priority) => priority.sourceItemIds ?? []),
      ...brief.actions.map((loop) => loop.sourceItemId).filter((id): id is string => Boolean(id)),
      ...brief.openLoops.map((loop) => loop.sourceItemId).filter((id): id is string => Boolean(id)),
      ...brief.loopsToReview.map((loop) => loop.sourceItemId).filter((id): id is string => Boolean(id)),
    ]);
    check("daily brief surfaces email source(s)", () => {
      assert.ok([...gmailSourceItems, ...outlookSourceItems].some((source) => briefSourceIds.has(source.id)));
    });

    const refreshedGmail = await getConfig(gmailConfig.id);
    const refreshedOutlook = await getConfig(outlookConfig.id);
    check("gmail config persisted next watermark from latest message internalDate", () => {
      const watermark = String(refreshedGmail.config.watermark ?? "");
      assert.equal(watermark, "2026-04-25T19:00:00.000Z");
    });
    check("outlook config persisted next watermark from latest receivedDateTime", () => {
      const watermark = String(refreshedOutlook.config.watermark ?? "");
      assert.equal(watermark, "2026-04-26T19:00:00.000Z");
    });

    const gmailSecond = await syncConnectorConfig(refreshedGmail, { gmailClient });
    const outlookSecond = await syncConnectorConfig(refreshedOutlook, { outlookClient });
    check("gmail second sync passes since= last watermark", () => assert.equal(gmailClient.lastListSince, "2026-04-25T19:00:00.000Z"));
    check("outlook second sync passes since= last watermark", () => assert.equal(outlookClient.lastListSince, "2026-04-26T19:00:00.000Z"));
    check("gmail second sync finds no newer items", () => {
      assert.equal(gmailSecond.itemsFound, 0);
      assert.equal(gmailSecond.itemsIngested, 0);
    });
    check("outlook second sync finds no newer items", () => {
      assert.equal(outlookSecond.itemsFound, 0);
      assert.equal(outlookSecond.itemsIngested, 0);
    });

    gmailClient.store.push(gmailNewArrival);
    outlookClient.store.push(outlookNewArrival);

    const refreshedGmail2 = await getConfig(gmailConfig.id);
    const refreshedOutlook2 = await getConfig(outlookConfig.id);
    const gmailThird = await syncConnectorConfig(refreshedGmail2, { gmailClient });
    const outlookThird = await syncConnectorConfig(refreshedOutlook2, { outlookClient });
    check("gmail third sync ingests the newly arrived message", () => {
      assert.equal(gmailThird.itemsFound, 1);
      assert.equal(gmailThird.itemsIngested, 1);
    });
    check("outlook third sync ingests the newly arrived message", () => {
      assert.equal(outlookThird.itemsFound, 1);
      assert.equal(outlookThird.itemsIngested, 1);
    });

    const refreshedGmail3 = await getConfig(gmailConfig.id);
    const refreshedOutlook3 = await getConfig(outlookConfig.id);
    check("gmail watermark advanced after newer message ingest", () => {
      assert.equal(String(refreshedGmail3.config.watermark ?? ""), "2026-04-26T14:00:00.000Z");
    });
    check("outlook watermark advanced after newer message ingest", () => {
      assert.equal(String(refreshedOutlook3.config.watermark ?? ""), "2026-04-27T18:00:00.000Z");
    });

    const finalSourceCount = (await repository.listSourceItems(brain.id))
      .filter((source) => ["gmail", "outlook"].includes(String(source.metadata?.connector_type)))
      .length;
    check("idempotency: only one source_item per provider message id", () => assert.equal(finalSourceCount, 4));

    if (fail > 0) {
      console.log(`\nEmail connector mock verification: ${pass} passed, ${fail} failed`);
      process.exit(1);
    }
    console.log(`\nEmail connector mock verification passed: ${pass}/${pass} checks`);
  } finally {
    if (originalDatabaseUrl) process.env.DATABASE_URL = originalDatabaseUrl;
    if (originalAnthropicApiKey) process.env.ANTHROPIC_API_KEY = originalAnthropicApiKey;
    if (originalOpenaiApiKey) process.env.OPENAI_API_KEY = originalOpenaiApiKey;
    resetRepositoryForTests();
    resetAiClientForTests();
  }
}

async function getConfig(id: string) {
  const repository = getRepository();
  const configs = await repository.listConnectorConfigs();
  const found = configs.find((item) => item.id === id);
  if (!found) throw new Error(`Connector config not found: ${id}`);
  return found;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
