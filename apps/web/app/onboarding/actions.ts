"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createBrain } from "@/lib/brain/store";
import type { BrainKind } from "@arvya/core";
import { getRepository } from "@/lib/db/repository";

export async function createOnboardingBrain(formData: FormData) {
  const { getAuthUser } = await import("@/lib/auth/session");
  const { getDb } = await import("@/lib/db/client");
  const { workspaces, workspaceMembers } = await import("@/lib/db/schema");

  const name = formData.get("name") as string;
  const kind = (formData.get("kind") as string) || "company";
  const thesis = (formData.get("thesis") as string) || "";

  if (!name?.trim()) throw new Error("Brain name is required");

  const session = await getAuthUser();
  let workspaceId: string | undefined;
  let userId: string | undefined;

  if (session) {
    userId = session.dbUser.id;
    const db = getDb();
    const [membership] = await db
      .select({ workspaceId: workspaceMembers.workspaceId })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, session.dbUser.id))
      .limit(1);

    if (membership) {
      workspaceId = membership.workspaceId;
    } else {
      const [ws] = await db
        .insert(workspaces)
        .values({ name: name.trim() })
        .returning();
      await db.insert(workspaceMembers).values({
        workspaceId: ws.id,
        userId: session.dbUser.id,
        role: "owner",
      });
      workspaceId = ws.id;
    }
  }

  const brain = await createBrain({
    name: name.trim(),
    kind: kind as BrainKind,
    thesis: thesis.trim() || `Company brain for ${name.trim()}`,
    workspaceId,
    createdByUserId: userId,
  });

  revalidatePath("/brains");
  return { brainId: brain.id };
}

export async function getOnboardingState() {
  const { getAuthUser } = await import("@/lib/auth/session");

  const session = await getAuthUser();
  if (!session) return { step: "auth" as const, brainId: null };

  const repository = getRepository();
  const brains = await repository.listBrains();

  if (brains.length === 0) return { step: "create" as const, brainId: null };

  const brain = brains[0];
  const configs = await repository.listConnectorConfigs(brain.id);
  const connectedCount = configs.filter(
    (c) => c.status === "connected" && (c.connectorType === "gmail" || c.connectorType === "google_drive" || c.connectorType === "slack"),
  ).length;

  if (connectedCount === 0) return { step: "connect" as const, brainId: brain.id };

  return { step: "progress" as const, brainId: brain.id };
}
