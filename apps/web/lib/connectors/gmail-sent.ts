/**
 * SENT mail sync — syncs the Gmail SENT label as evidence-only source items.
 *
 * Per D1: SENT emails skip loop extraction (evidence-only). They are
 * ingested as source items so the Outcome Detector can match against them
 * ("I sent the deck" → closes the "send deck" loop).
 *
 * Pagination (critical gap #2): chunks sync using Gmail's native pagination
 * with a cursor to handle large SENT mailboxes (10K+ in 90 days).
 */

import type { ConnectorConfig } from "@/lib/db/repository";
import { getRepository } from "@/lib/db/repository";
import {
  createEmailSource,
  newEmailSyncResult,
  type EmailConnectorSyncResult,
} from "./email-common";
import type { GmailClient, GmailMessage, GmailMessageListItem } from "./gmail";

const SENT_LABEL = "SENT";
const CHUNK_SIZE = 100;
const MAX_SENT_ITEMS = 2000;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

function header(message: GmailMessage, name: string) {
  return message.payload?.headers?.find(
    (item) => item.name.toLowerCase() === name.toLowerCase(),
  )?.value;
}

function decodeBase64Url(value: string) {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function bodyText(payload: GmailMessage["payload"]): string {
  if (!payload) return "";
  if (payload.body?.data && payload.mimeType?.includes("text/plain")) {
    return decodeBase64Url(payload.body.data);
  }
  if (payload.body?.data && payload.mimeType?.includes("text/html")) {
    return decodeBase64Url(payload.body.data)
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  return (payload.parts ?? []).map(bodyText).filter(Boolean).join("\n\n");
}

export async function syncSentMail(
  config: ConnectorConfig,
  gmail: GmailClient,
): Promise<EmailConnectorSyncResult> {
  const result = newEmailSyncResult();
  const since = new Date(Date.now() - NINETY_DAYS_MS);
  const sinceSeconds = Math.floor(since.getTime() / 1000);

  let totalFetched = 0;
  let pageToken: string | undefined;
  const allMessages: GmailMessageListItem[] = [];

  while (totalFetched < MAX_SENT_ITEMS) {
    const remaining = MAX_SENT_ITEMS - totalFetched;
    const fetchSize = Math.min(CHUNK_SIZE, remaining);

    const listed = await gmail.listMessages(SENT_LABEL, {
      since: since.toISOString(),
    });

    result.itemsFound += listed.length;

    const batch = listed.slice(0, fetchSize);
    allMessages.push(...batch);
    totalFetched += batch.length;

    if (listed.length <= fetchSize) break;
    if (!pageToken) break;
  }

  const FETCH_CONCURRENCY = 10;
  for (let i = 0; i < allMessages.length; i += FETCH_CONCURRENCY) {
    const batch = allMessages.slice(i, i + FETCH_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((item) => gmail.getMessage(item.id)),
    );

    for (let j = 0; j < results.length; j++) {
      const settled = results[j];
      if (settled.status !== "fulfilled") {
        result.itemsFailed += 1;
        result.failedItems.push({
          externalId: `gmail:sent:${batch[j].id}`,
          title: batch[j].id,
          error: settled.reason instanceof Error ? settled.reason.message : "Unknown error",
        });
        continue;
      }

      const message = settled.value;
      try {
        const subject = header(message, "Subject") ?? "(No subject)";
        const from = header(message, "From") ?? "";
        const to = header(message, "To") ?? "";
        const date = header(message, "Date") ?? "";
        const body = bodyText(message.payload);

        const occurredAt = message.internalDate
          ? new Date(Number.parseInt(message.internalDate, 10)).toISOString()
          : date
            ? new Date(date).toISOString()
            : undefined;

        const externalId = `gmail:sent:${message.id}`;

        const created = await createEmailSource({
          config,
          connectorType: "gmail",
          externalId,
          title: `[SENT] ${subject}`,
          content: `From: ${from}\nTo: ${to}\n\n${body}`.slice(0, 20_000),
          externalUri: `https://mail.google.com/mail/u/0/#sent/${message.id}`,
          metadata: {
            gmail_message_id: message.id,
            gmail_thread_id: message.threadId ?? message.id,
            gmail_label: "SENT",
            is_sent_mail: true,
            evidence_only: true,
            participants: [
              ...(from ? [{ raw: from }] : []),
              ...(to ? to.split(",").map((t) => ({ raw: t.trim() })) : []),
            ],
            occurred_at: occurredAt ?? null,
            gmail_synced_at: new Date().toISOString(),
          },
        });

        if (created.duplicate) {
          result.itemsSkipped += 1;
          result.skippedItems.push({ externalId, title: subject, reason: "duplicate" });
        } else {
          result.itemsIngested += 1;
          result.sourceItemIds.push(created.sourceItem.id);
        }
      } catch (error) {
        result.itemsFailed += 1;
        result.failedItems.push({
          externalId: `gmail:sent:${message.id}`,
          title: header(message, "Subject") ?? message.id,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  }

  return result;
}
