import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { getAuthUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { openLoops as openLoopsTable } from "@/lib/db/schema";

// POST /api/loops/[loopId]/snooze
// Body: { days?: number }    // defaults to 3
//
// Bumps the loop's due_date forward by N days and stamps the snooze on
// properties so the nudger knows not to immediately re-fire.

export async function POST(req: NextRequest, ctx: { params: Promise<{ loopId: string }> }) {
  const session = await getAuthUser();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const { loopId } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const days = Number((body as { days?: unknown }).days);
  const snoozeDays = Number.isFinite(days) && days > 0 && days <= 60 ? Math.floor(days) : 3;

  const db = getDb();
  const newDue = new Date(Date.now() + snoozeDays * 24 * 60 * 60 * 1000);
  const [updated] = await db
    .update(openLoopsTable)
    .set({
      dueDate: newDue,
      properties: sql`coalesce(${openLoopsTable.properties}, '{}'::jsonb)
        || jsonb_build_object(
          'snoozedAt', ${new Date().toISOString()},
          'snoozedByUserId', ${session.dbUser.id},
          'snoozedDays', ${snoozeDays}
        )`,
      updatedAt: new Date(),
    })
    .where(eq(openLoopsTable.id, loopId))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, dueDate: updated.dueDate });
}
