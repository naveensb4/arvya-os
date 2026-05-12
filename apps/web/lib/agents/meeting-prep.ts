import type { MeetingPrepBrief, SourceRef } from "@arvya/core";
import { meetingPrepBriefSchema } from "@arvya/core";
import { meetingPrepSystemPrompt, buildMeetingPrepPrompt } from "@arvya/prompts/meeting-prep";
import {
  createRetrieveBrainContextTool,
  type BrainContextResult,
} from "@arvya/agents/tools/retrieve-brain-context";
import { linkedinEnrich } from "@arvya/agents/tools/linkedin-enrich";
import { analyzeTone } from "@arvya/agents/tools/tone-analyze";
import { getAiClient } from "@/lib/ai";
import { getRepository, type NotetakerMeeting } from "@/lib/db/repository";
import { retrieveRelevantContext } from "@/lib/retrieval";
import { openSlackDm, postSlackMessage } from "@/lib/connectors/slack";
import { formatPrepBrief, formatPrepFirstTimeTip, formatLowConfidenceMessage } from "@/lib/slack-bot/format-prep";

const CONFIDENCE_FLOOR = 0.4;
const IDEMPOTENCY_HOURS = 20;
const AGENT_TIMEOUT_MS = 90_000;

export class MeetingNotFoundError extends Error {
  constructor(meetingId: string) {
    super(`Meeting not found: ${meetingId}`);
    this.name = "MeetingNotFoundError";
  }
}

export class IdempotencyHitError extends Error {
  constructor(meetingId: string) {
    super(`Meeting ${meetingId} was already prepped recently`);
    this.name = "IdempotencyHitError";
  }
}

export class AgentRunnerTimeoutError extends Error {
  constructor() {
    super("Meeting prep agent timed out after 90s");
    this.name = "AgentRunnerTimeoutError";
  }
}

export async function wasMeetingPreppedRecently(
  meetingId: string,
  withinHours = IDEMPOTENCY_HOURS,
): Promise<boolean> {
  const repository = getRepository();
  const cutoff = new Date(Date.now() - withinHours * 60 * 60 * 1000).toISOString();
  const brains = await repository.listBrains();
  for (const brain of brains) {
    const docs = await repository.listBrainDocs(brain.id, {
      meetingId,
      docType: "meeting_prep",
      limit: 1,
    });
    if (docs.length > 0 && docs[0].createdAt > cutoff) return true;
  }
  return false;
}

export async function wasMeetingPreppedForBrain(
  brainId: string,
  meetingId: string,
  withinHours = IDEMPOTENCY_HOURS,
): Promise<boolean> {
  const repository = getRepository();
  const cutoff = new Date(Date.now() - withinHours * 60 * 60 * 1000).toISOString();
  const docs = await repository.listBrainDocs(brainId, {
    meetingId,
    docType: "meeting_prep",
    limit: 1,
  });
  return docs.length > 0 && docs[0].createdAt > cutoff;
}

export function getRegenCount(_brainId: string, meetingId: string, runs: Array<{ name: string; rawInput?: Record<string, unknown>; rawOutput?: Record<string, unknown> }>): number {
  const prepRuns = runs.filter(
    (r) =>
      r.name === "meeting_prep" &&
      (r.rawInput as Record<string, unknown>)?.meeting_id === meetingId,
  );
  if (prepRuns.length === 0) return 0;
  const latest = prepRuns[0];
  return ((latest?.rawOutput as Record<string, unknown>)?.regen_count as number) ?? prepRuns.length - 1;
}

function extractCompany(title: string): string | undefined {
  const separators = [" <> ", " / ", " - ", " — ", " – ", " x ", " X "];
  for (const sep of separators) {
    if (title.includes(sep)) {
      const parts = title.split(sep);
      const candidate = parts[0]?.trim();
      if (candidate && candidate.toLowerCase() !== "arvya") return candidate;
      if (parts[1]) return parts[1].trim();
    }
  }
  return undefined;
}

function extractAttendeesFromMeeting(
  meeting: NotetakerMeeting,
): Array<{ name: string; email?: string; company?: string }> {
  const participants = meeting.participants as Array<Record<string, unknown>> | undefined;
  if (!participants || participants.length === 0) return [];

  return participants
    .filter((p) => p && typeof p === "object")
    .map((p) => ({
      name: (p.name as string) ?? (p.displayName as string) ?? (p.email as string) ?? "Unknown",
      email: (p.email as string) ?? undefined,
      company: (p.company as string) ?? (p.organization as string) ?? undefined,
    }))
    .filter((a) => a.name !== "Unknown");
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new AgentRunnerTimeoutError()), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

export function verifyCitations(
  brief: MeetingPrepBrief,
  validBrainIds: Set<string>,
): MeetingPrepBrief {
  const result = { ...brief };
  let droppedCount = 0;
  const uncertaintyNotes = [...(brief.uncertainty_notes || [])];

  function filterSources(sources: SourceRef[]): SourceRef[] {
    return sources.filter((source) => {
      if (source.kind === "web_url" || source.kind === "linkedin_url") return true;
      if (!validBrainIds.has(source.id_or_url)) {
        droppedCount++;
        return false;
      }
      return true;
    });
  }

  function adjustConfidence(original: number, dropped: number): number {
    return Math.max(0.2, original - dropped * 0.1);
  }

  let sectionDrops: number;

  sectionDrops = 0;
  const whyNowSources = filterSources(result.why_now.sources);
  sectionDrops = result.why_now.sources.length - whyNowSources.length;
  result.why_now = {
    ...result.why_now,
    sources: whyNowSources,
    confidence: adjustConfidence(result.why_now.confidence, sectionDrops),
  };

  result.things_to_know = result.things_to_know.map((item) => {
    const filtered = filterSources(item.sources);
    const drops = item.sources.length - filtered.length;
    return {
      ...item,
      sources: filtered,
      confidence: adjustConfidence(item.confidence, drops),
    };
  });

  result.questions_to_ask = result.questions_to_ask.map((item) => {
    const filtered = filterSources(item.sources);
    const drops = item.sources.length - filtered.length;
    return {
      ...item,
      sources: filtered,
      confidence: adjustConfidence(item.confidence, drops),
    };
  });

  result.risks_to_dodge = result.risks_to_dodge.map((item) => {
    const filtered = filterSources(item.sources);
    const drops = item.sources.length - filtered.length;
    return {
      ...item,
      sources: filtered,
      confidence: adjustConfidence(item.confidence, drops),
    };
  });

  if (droppedCount > 0) {
    uncertaintyNotes.push(`dropped ${droppedCount} hallucinated citation(s)`);
  }

  const sectionConfidences = [
    result.why_now.confidence,
    ...result.things_to_know.map((t) => t.confidence),
    ...result.questions_to_ask.map((q) => q.confidence),
    ...result.risks_to_dodge.map((r) => r.confidence),
  ].filter((c) => c > 0);

  result.overall_confidence =
    sectionConfidences.length > 0 ? Math.min(...sectionConfidences) : 0.3;
  result.uncertainty_notes = uncertaintyNotes;

  return result;
}

export type RunMeetingPrepResult = {
  brief: MeetingPrepBrief;
  agentRunId: string;
  slackDelivered: boolean;
  status: "succeeded" | "succeeded_low_confidence" | "failed";
};

export async function runMeetingPrep(
  brainId: string,
  meetingId: string,
  options?: {
    skipIdempotency?: boolean;
    isFirstPrep?: boolean;
    existingSlackTs?: string;
    regenCount?: number;
  },
): Promise<RunMeetingPrepResult> {
  const repository = getRepository();
  const ai = getAiClient();

  const brain = await repository.getBrain(brainId);
  if (!brain) throw new Error(`Brain not found: ${brainId}`);

  if (!options?.skipIdempotency) {
    const alreadyPrepped = await wasMeetingPreppedForBrain(brainId, meetingId);
    if (alreadyPrepped) throw new IdempotencyHitError(meetingId);
  }

  const meetings = await repository.listNotetakerMeetings({ brainId });
  const meeting = meetings.find((m) => m.id === meetingId);
  if (!meeting) throw new MeetingNotFoundError(meetingId);

  const brainConfig = (brain.metadata ?? {}) as Record<string, unknown>;
  const linkedinEnabled = brainConfig.linkedin_enrichment_enabled === true;
  const webSearchEnabled = brainConfig.web_search_enabled !== false;

  const run = await repository.createAgentRun({
    brainId,
    name: "meeting_prep",
    stepName: "meeting_prep",
    modelProvider: ai.preferredProvider,
    inputSummary: `Meeting prep for: ${meeting.title}`,
    rawInput: { meeting_id: meetingId, meeting_title: meeting.title },
  });

  try {
    const attendees = extractAttendeesFromMeeting(meeting);
    const company = extractCompany(meeting.title);

    const retrieveTool = createRetrieveBrainContextTool({
      brainId,
      retrieveFn: async (input: { brainId: string; question: string; limit?: number }) => {
        return retrieveRelevantContext({
          brainId: input.brainId,
          question: input.question,
          repository,
          ai,
          limit: input.limit,
        });
      },
    });

    const queries = [
      meeting.title,
      ...attendees.map((a) => `${a.name}${a.company ? ` ${a.company}` : ""}`),
      ...(company ? [company] : []),
    ];
    const contextResults: BrainContextResult[] = [];
    for (const query of queries.slice(0, 5)) {
      const result = await retrieveTool(query);
      contextResults.push(result);
    }

    const allMemoryObjects = new Map<string, (typeof contextResults)[0]["memoryObjects"][0]>();
    const allOpenLoops = new Map<string, (typeof contextResults)[0]["openLoops"][0]>();
    const allSourceItems = new Map<string, (typeof contextResults)[0]["sourceItems"][0]>();

    for (const ctx of contextResults) {
      for (const mo of ctx.memoryObjects) allMemoryObjects.set(mo.id, mo);
      for (const ol of ctx.openLoops) allOpenLoops.set(ol.id, ol);
      for (const si of ctx.sourceItems) allSourceItems.set(si.id, si);
    }

    const linkedinResults = new Map<string, Awaited<ReturnType<typeof linkedinEnrich>>>();
    if (linkedinEnabled) {
      for (const attendee of attendees.slice(0, 5)) {
        const profile = await linkedinEnrich({
          name: attendee.name,
          company: attendee.company,
          email: attendee.email,
        });
        if (profile) linkedinResults.set(attendee.name, profile);
      }
    }

    const sourceItemsList = [...allSourceItems.values()];
    const toneResults = new Map<string, Awaited<ReturnType<typeof analyzeTone>>>();
    for (const attendee of attendees.slice(0, 3)) {
      if (attendee.email) {
        const tone = await analyzeTone({
          attendeeEmail: attendee.email,
          attendeeName: attendee.name,
          sourceItems: sourceItemsList,
          ai,
        });
        if (tone.based_on_n_messages > 0) {
          toneResults.set(attendee.name, tone);
        }
      }
    }

    const prepPrompt = buildMeetingPrepPrompt({
      meetingTitle: meeting.title,
      meetingStart: meeting.startTime,
      meetingEnd: meeting.endTime,
      meetingId: meeting.id,
      attendees,
      brainName: brain.name,
      brainThesis: brain.thesis,
      linkedinEnabled,
      webSearchEnabled,
    });

    const memoryObjectsList = [...allMemoryObjects.values()];
    const openLoopsList = [...allOpenLoops.values()];

    const brainContext = [
      ...memoryObjectsList.map((mo) => `[Memory: ${mo.objectType}] ${mo.name}: ${mo.description}`),
      ...openLoopsList.map((ol) => `[Open Loop: ${ol.loopType}] ${ol.title}: ${ol.description}${ol.dueDate ? ` (due: ${ol.dueDate})` : ""}`),
      ...sourceItemsList.slice(0, 5).map((si) => `[Source: ${si.type}] ${si.title}: ${si.content.slice(0, 300)}`),
    ].join("\n\n");

    const linkedinContext = [...linkedinResults.entries()]
      .map(([name, profile]) => {
        if (!profile) return "";
        return `[LinkedIn: ${name}] ${profile.headline} at ${profile.experiences[0]?.company ?? ""}. ${profile.summary.slice(0, 200)}`;
      })
      .filter(Boolean)
      .join("\n\n");

    const attendeeOpenLoops = openLoopsList.filter((loop) => {
      const loopText = `${loop.title} ${loop.description} ${loop.owner ?? ""}`.toLowerCase();
      return attendees.some(
        (a) =>
          loopText.includes(a.name.toLowerCase()) ||
          (a.email && loopText.includes(a.email.toLowerCase())),
      );
    });

    const enrichedPrompt = `${prepPrompt}\n\n--- BRAIN CONTEXT ---\n${brainContext || "No Brain context found for these attendees."}\n\n${linkedinContext ? `--- LINKEDIN ---\n${linkedinContext}\n\n` : ""}--- OPEN LOOPS WITH ATTENDEES ---\n${attendeeOpenLoops.length > 0 ? attendeeOpenLoops.map((ol) => `• ${ol.title}${ol.dueDate ? ` (due: ${ol.dueDate})` : ""} [${ol.status}]`).join("\n") : "No open loops linked to attendees."}`;

    const briefResult = await withTimeout(
      ai.completeStructured<MeetingPrepBrief>({
        system: meetingPrepSystemPrompt,
        prompt: enrichedPrompt,
        schema: meetingPrepBriefSchema,
        schemaName: "meeting_prep_brief",
        schemaDescription: "A structured meeting prep brief with confidence scores and source citations",
        maxTokens: 4000,
        temperature: 0.2,
      }),
      AGENT_TIMEOUT_MS,
    );

    let brief = briefResult.data;

    for (const attendee of brief.attendees) {
      const profile = linkedinResults.get(attendee.name);
      if (profile?.public_identifier) {
        attendee.linkedin_url = `https://linkedin.com/in/${profile.public_identifier}`;
      }
    }

    const primaryTone = [...toneResults.values()][0];
    if (primaryTone && primaryTone.based_on_n_messages > 0) {
      brief.tone_calibration = {
        description: primaryTone.description,
        based_on_n_messages: primaryTone.based_on_n_messages,
        confidence: primaryTone.confidence,
      };
    }

    brief.meeting_id = meetingId;
    brief.generated_at = new Date().toISOString();
    brief.meeting_window = {
      start: meeting.startTime,
      end: meeting.endTime,
      live_in_minutes: Math.max(0, Math.round((new Date(meeting.startTime).getTime() - Date.now()) / 60000)),
    };

    const validIds = new Set([
      ...memoryObjectsList.map((mo) => mo.id),
      ...openLoopsList.map((ol) => ol.id),
      ...sourceItemsList.map((si) => si.id),
    ]);
    brief = verifyCitations(brief, validIds);
    brief.source_count = validIds.size;

    const isLowConfidence = brief.overall_confidence < CONFIDENCE_FLOOR;
    const status = isLowConfidence ? "succeeded_low_confidence" : "succeeded";

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const dashboardUrl = `${baseUrl}/brains/${brainId}/meetings/${meetingId}/prep`;
    const { text: slackText } = formatPrepBrief(brief, dashboardUrl);

    const toolCalls = queries.map((q) => ({
      tool: "retrieve_brain_context",
      input: q.slice(0, 100),
    }));
    if (linkedinEnabled) {
      toolCalls.push(
        ...attendees.map((a) => ({
          tool: "linkedin_enrich",
          input: a.name.slice(0, 100),
        })),
      );
    }

    await repository.updateAgentRun(run.id, {
      status: isLowConfidence ? "succeeded" : "succeeded",
      outputSummary: `Meeting prep: ${meeting.title} (confidence: ${brief.overall_confidence.toFixed(2)})`,
      rawOutput: {
        structured: brief,
        formatted_slack_text: slackText,
        tool_calls: toolCalls,
        regen_count: options?.regenCount ?? 0,
        status_detail: status,
      },
    });

    try {
      await repository.createBrainDoc({
        brainId,
        docType: "meeting_prep",
        title: `Meeting Prep: ${meeting.title}`,
        content: brief as unknown as Record<string, unknown>,
        contentText: slackText,
        agentRunId: run.id,
        externalEventId: meeting.externalEventId ?? undefined,
        meetingId: meeting.id,
      });
    } catch (docError) {
      console.error("[meeting-prep] brain_doc write failed (agent_run persisted):", docError instanceof Error ? docError.message : docError);
    }

    let slackDelivered = false;

    if (!isLowConfidence) {
      const connectorConfigs = await repository.listConnectorConfigs(brainId);
      const slackConfig = connectorConfigs.find(
        (c) => c.connectorType === "slack" && c.status === "connected",
      );

      if (slackConfig?.credentials) {
        const botToken = (slackConfig.credentials as Record<string, unknown>).botToken as string;
        const installerUserId = ((slackConfig.config as Record<string, unknown>)?.installerUserId ??
          (slackConfig.credentials as Record<string, unknown>).installerUserId) as string | undefined;

        if (botToken && installerUserId) {
          try {
            const dmChannel = await openSlackDm(botToken, installerUserId);
            if (dmChannel) {
              let messageText = slackText;
              if (options?.isFirstPrep) {
                messageText += "\n" + formatPrepFirstTimeTip();
              }

              const result = await postSlackMessage(botToken, dmChannel, messageText);
              if (result?.ts) {
                brief.slack_message_ts = result.ts;
                await repository.updateAgentRun(run.id, {
                  status: "succeeded",
                  rawOutput: {
                    structured: brief,
                    formatted_slack_text: slackText,
                    tool_calls: toolCalls,
                    regen_count: options?.regenCount ?? 0,
                    status_detail: status,
                    slack_message_ts: result.ts,
                  },
                });
                slackDelivered = true;
              }
            }
          } catch (error) {
            console.error("[meeting-prep] Slack DM delivery failed:", error instanceof Error ? error.message : error);
          }
        }
      }
    }

    return { brief, agentRunId: run.id, slackDelivered, status };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown meeting prep error";
    await repository.updateAgentRun(run.id, {
      status: "failed",
      outputSummary: message,
      error: message,
      rawOutput: { error: message },
    });
    throw error;
  }
}

export async function getLatestMeetingPrep(
  brainId: string,
  meetingId: string,
): Promise<{ brief: MeetingPrepBrief; agentRunId: string; docId?: string } | null> {
  const repository = getRepository();

  const docs = await repository.listBrainDocs(brainId, {
    meetingId,
    docType: "meeting_prep",
    limit: 1,
  });
  if (docs.length > 0) {
    const doc = docs[0];
    const brief = doc.content as unknown as MeetingPrepBrief;
    if (brief) {
      return { brief, agentRunId: doc.agentRunId ?? "", docId: doc.id };
    }
  }

  const runs = await repository.listAgentRuns(brainId, 200);
  const prepRun = runs.find(
    (r) =>
      r.name === "meeting_prep" &&
      (r.rawInput as Record<string, unknown>)?.meeting_id === meetingId &&
      r.status === "succeeded" &&
      r.rawOutput,
  );
  if (!prepRun) return null;
  const raw = prepRun.rawOutput as Record<string, unknown>;
  const brief = raw.structured as MeetingPrepBrief | undefined;
  if (!brief) return null;

  try {
    const doc = await repository.createBrainDoc({
      brainId,
      docType: "meeting_prep",
      title: `Meeting Prep: ${(prepRun.rawInput as Record<string, unknown>)?.meeting_title ?? "Unknown"}`,
      content: brief as unknown as Record<string, unknown>,
      contentText: (raw.formatted_slack_text as string) ?? undefined,
      agentRunId: prepRun.id,
      meetingId,
    });
    return { brief, agentRunId: prepRun.id, docId: doc.id };
  } catch {
    return { brief, agentRunId: prepRun.id };
  }
}
