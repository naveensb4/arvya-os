"use server";

import { revalidatePath } from "next/cache";
import {
  generateMarketingDrafts,
  generateMarketingWeeklyReport,
  recordMarketingEvent,
  recordMarketingMetric,
  scheduleMarketingPost,
  submitMarketingInput,
  syncMarketingDriveTranscripts,
  updateMarketingPost,
} from "@/lib/marketing/store";
import type { MarketingPostStatus, MarketingSourcePlatform, MarketingSourceType } from "@arvya/core";

function requiredString(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${key} is required`);
  return value.trim();
}

function optionalString(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

function optionalNumber(formData: FormData, key: string) {
  const value = optionalString(formData, key);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function revalidateMarketing(brainId: string) {
  revalidatePath(`/brains/${brainId}/internal/marketing`);
}

export async function submitMarketingInputAction(formData: FormData) {
  const brainId = requiredString(formData, "brainId");
  await submitMarketingInput({
    brainId,
    sourcePlatform: requiredString(formData, "sourcePlatform") as MarketingSourcePlatform,
    sourceType: requiredString(formData, "sourceType") as MarketingSourceType,
    rawText: requiredString(formData, "rawText"),
    sourceUrl: optionalString(formData, "sourceUrl"),
    sourceOwner: optionalString(formData, "sourceOwner"),
    metadata: { submittedVia: "internal_marketing_ui" },
  });
  revalidateMarketing(brainId);
}

export async function generateMarketingDraftsAction(formData: FormData) {
  const brainId = requiredString(formData, "brainId");
  await generateMarketingDrafts(brainId);
  revalidateMarketing(brainId);
}

export async function syncMarketingDriveTranscriptsAction(formData: FormData) {
  const brainId = requiredString(formData, "brainId");
  await syncMarketingDriveTranscripts(brainId);
  revalidateMarketing(brainId);
}

export async function updateMarketingPostAction(formData: FormData) {
  const brainId = requiredString(formData, "brainId");
  await updateMarketingPost(requiredString(formData, "postId"), {
    bodyText: optionalString(formData, "bodyText"),
    status: requiredString(formData, "status") as MarketingPostStatus,
    revisionReason: optionalString(formData, "revisionReason") ?? null,
    approvedBy: optionalString(formData, "approvedBy") ?? "naveen",
  });
  revalidateMarketing(brainId);
}

export async function scheduleMarketingPostAction(formData: FormData) {
  const brainId = requiredString(formData, "brainId");
  await scheduleMarketingPost(requiredString(formData, "postId"), {
    scheduledAt: optionalString(formData, "scheduledAt"),
    approvedBy: optionalString(formData, "approvedBy") ?? "naveen",
  });
  revalidateMarketing(brainId);
}

export async function recordMarketingMetricAction(formData: FormData) {
  const brainId = requiredString(formData, "brainId");
  await recordMarketingMetric(brainId, {
    channelPostId: requiredString(formData, "postId"),
    metricDate: optionalString(formData, "metricDate"),
    impressions: optionalNumber(formData, "impressions"),
    reactions: optionalNumber(formData, "reactions"),
    comments: optionalNumber(formData, "comments"),
    shares: optionalNumber(formData, "shares"),
    clicks: optionalNumber(formData, "clicks"),
    saves: optionalNumber(formData, "saves"),
    follows: optionalNumber(formData, "follows"),
  });
  revalidateMarketing(brainId);
}

export async function recordMarketingEventAction(formData: FormData) {
  const brainId = requiredString(formData, "brainId");
  await recordMarketingEvent(brainId, {
    channelPostId: optionalString(formData, "postId") ?? null,
    eventType: requiredString(formData, "eventType") as "demo" | "dm" | "reply" | "qualified_lead" | "website_visit" | "manual_attribution",
    eventSource: optionalString(formData, "eventSource") ?? "manual",
    description: requiredString(formData, "description"),
    attributionConfidence: "manual",
  });
  revalidateMarketing(brainId);
}

export async function generateMarketingWeeklyReportAction(formData: FormData) {
  const brainId = requiredString(formData, "brainId");
  await generateMarketingWeeklyReport(brainId);
  revalidateMarketing(brainId);
}
