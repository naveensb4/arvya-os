"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  addSourceAndIngest,
  bulkUpdateOpenLoops,
  createBrain,
  updateOpenLoopReview,
  updateOpenLoopStatus,
} from "@/lib/brain/store";
import type { BrainKind, OpenLoopPriority, OpenLoopStatus, SourceType } from "@arvya/core";

function requiredString(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${key} is required`);
  }
  return value.trim();
}

function optionalString(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function optionalNullableString(formData: FormData, key: string) {
  return optionalString(formData, key) ?? null;
}

export async function createBrainAction(formData: FormData) {
  const brain = await createBrain({
    name: requiredString(formData, "name"),
    kind: requiredString(formData, "kind") as BrainKind,
    thesis: requiredString(formData, "thesis"),
  });

  revalidatePath("/brains");
  redirect(`/brains/${brain.id}`);
}

export async function addSourceAction(formData: FormData) {
  const brainId = requiredString(formData, "brainId");
  await addSourceAndIngest({
    brainId,
    title: requiredString(formData, "title"),
    type: requiredString(formData, "type") as SourceType,
    content: requiredString(formData, "content"),
    externalUri: formData.get("externalUri")?.toString().trim() || undefined,
  });

  revalidatePath("/");
  revalidatePath(`/brains/${brainId}`);
  revalidatePath(`/brains/${brainId}/sources`);
  revalidatePath(`/brains/${brainId}/open-loops`);
  redirect(`/brains/${brainId}/sources?ingested=1`);
}

export async function updateOpenLoopStatusAction(formData: FormData) {
  const brainId = requiredString(formData, "brainId");
  await updateOpenLoopStatus(
    brainId,
    requiredString(formData, "openLoopId"),
    requiredString(formData, "status") as OpenLoopStatus,
    formData.get("outcome")?.toString().trim() || undefined,
  );

  revalidatePath(`/brains/${brainId}/open-loops`);
}

export async function reviewOpenLoopAction(formData: FormData) {
  const brainId = requiredString(formData, "brainId");
  const openLoopId = requiredString(formData, "openLoopId");
  const action = requiredString(formData, "reviewAction");
  const now = new Date().toISOString();

  if (action === "approve") {
    await updateOpenLoopReview(brainId, openLoopId, {
      status: "open",
      approvedAt: now,
      closedAt: null,
    });
  } else if (action === "done") {
    await updateOpenLoopReview(brainId, openLoopId, {
      status: "done",
      outcome: optionalNullableString(formData, "outcome"),
      closedAt: now,
    });
  } else if (action === "dismiss") {
    await updateOpenLoopReview(brainId, openLoopId, {
      status: "dismissed",
      outcome: optionalString(formData, "outcome") ?? "Dismissed as noise.",
      closedAt: now,
    });
  } else if (action === "edit") {
    const status = requiredString(formData, "status") as OpenLoopStatus;
    await updateOpenLoopReview(brainId, openLoopId, {
      title: requiredString(formData, "title"),
      description: requiredString(formData, "description"),
      owner: optionalNullableString(formData, "owner"),
      status,
      priority: requiredString(formData, "priority") as OpenLoopPriority,
      dueDate: optionalNullableString(formData, "dueDate"),
      outcome: optionalNullableString(formData, "outcome"),
      approvedAt: status === "needs_review" ? null : optionalString(formData, "approvedAt") ?? now,
      closedAt: status === "done" || status === "dismissed" || status === "closed" ? now : null,
    });
  } else {
    throw new Error(`Unknown open loop review action: ${action}`);
  }

  revalidatePath(`/brains/${brainId}`);
  revalidatePath(`/brains/${brainId}/open-loops`);
}

export async function bulkReviewOpenLoopsAction(formData: FormData) {
  const brainId = requiredString(formData, "brainId");
  const action = requiredString(formData, "bulkAction");
  const ids = formData
    .getAll("openLoopIds")
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  const now = new Date().toISOString();

  if (ids.length === 0) {
    revalidatePath(`/brains/${brainId}/open-loops`);
    return;
  }

  if (action === "approve") {
    await bulkUpdateOpenLoops(brainId, ids, { status: "open", approvedAt: now, closedAt: null });
  } else if (action === "dismiss") {
    await bulkUpdateOpenLoops(brainId, ids, {
      status: "dismissed",
      closedAt: now,
    });
  } else if (action === "assign") {
    await bulkUpdateOpenLoops(brainId, ids, {
      owner: requiredString(formData, "bulkOwner"),
    });
  } else if (action === "priority") {
    await bulkUpdateOpenLoops(brainId, ids, {
      priority: requiredString(formData, "bulkPriority") as OpenLoopPriority,
    });
  } else {
    throw new Error(`Unknown bulk open loop action: ${action}`);
  }

  revalidatePath(`/brains/${brainId}`);
  revalidatePath(`/brains/${brainId}/open-loops`);
}
