import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { getAuthUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { openLoops as openLoopsTable } from "@/lib/db/schema";

// POST /api/loops/[loopId]/close-via-slack
// Body: { outcome?: string }
//
// Manual "I'll close this myself" path. Distinct from the Slack
// interaction handler (which closes via Block Kit button presses); this
// one is what the per-loop UI page will call when we add the Re-open /
// Close buttons there.

export async function POST(req: NextRequest, ctx: { params: Promise<{ loopId: string }> }) {
  const session = await getAuthUser();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { loopId } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const outcome = typeof (body as { outcome?: unknown }).outcome === "string"
    ? (body as { outcome: string }).outcome
    : "Closed manually.";

  const db = getDb();
  const [updated] = await db
    .update(openLoopsTable)
    .set({
      status: "closed",
      closedAt: new Date(),
      outcome,
      properties: sql`coalesce(${openLoopsTable.properties}, '{}'::jsonb)
        || jsonb_build_object(
          'closedBy', 'manual',
          'closedByUserId', ${session.dbUser.id}
        )`,
      updatedAt: new Date(),
    })
    .where(eq(openLoopsTable.id, loopId))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
