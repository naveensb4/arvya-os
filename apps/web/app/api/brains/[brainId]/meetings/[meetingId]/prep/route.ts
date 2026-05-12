import { NextResponse, type NextRequest } from "next/server";
import { runMeetingPrep, getLatestMeetingPrep } from "@/lib/agents/meeting-prep";

type RouteContext = {
  params: Promise<{ brainId: string; meetingId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { brainId, meetingId } = await context.params;

  if (!brainId || !meetingId) {
    return NextResponse.json({ error: "Missing brainId or meetingId" }, { status: 400 });
  }

  try {
    const result = await runMeetingPrep(brainId, meetingId, { skipIdempotency: true });
    return NextResponse.json({
      brief: result.brief,
      agentRunId: result.agentRunId,
      slackDelivered: result.slackDelivered,
      status: result.status,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Meeting prep failed";
    console.error("[api/prep] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { brainId, meetingId } = await context.params;

  if (!brainId || !meetingId) {
    return NextResponse.json({ error: "Missing brainId or meetingId" }, { status: 400 });
  }

  try {
    const result = await getLatestMeetingPrep(brainId, meetingId);
    if (!result) {
      return NextResponse.json({ error: "No prep found for this meeting" }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch prep";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
