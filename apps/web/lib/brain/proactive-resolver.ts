/**
 * Proactive Calendar Resolver — runs on open-loops page visit.
 *
 * Checks all open meeting-related loops against calendar events (from
 * notetaker_meetings table, no Google API calls). Auto-closes any where
 * the event already happened.
 *
 * 5-minute staleness window: don't re-resolve if checked <5 min ago.
 * Uses DB-only data from notetaker_calendar_events (already synced).
 */

import type { OpenLoop } from "@arvya/core";
import type { BrainRepository, CalendarEvent } from "@/lib/db/repository";
import { getDb } from "@/lib/db/client";
import { loopOutcomeLog } from "@/lib/db/schema";

const STALENESS_WINDOW_MS = 5 * 60 * 1000;
const SCHEDULING_TYPES = new Set(["scheduling", "follow_up"]);
const SCHEDULING_KEYWORDS = /\b(?:schedule|call|meeting|sync|chat|session|meet)\b/i;
const ACTIVE_STATUSES = new Set(["open", "in_progress", "needs_review", "waiting"]);

export type ProactiveResolverResult = {
  checked: number;
  resolved: number;
  skippedStale: number;
};

function isMeetingRelated(loop: OpenLoop): boolean {
  if (SCHEDULING_TYPES.has(loop.loopType)) return true;
  const text = `${loop.title} ${loop.description ?? ""}`;
  return SCHEDULING_KEYWORDS.test(text);
}

function wasRecentlyChecked(loop: OpenLoop): boolean {
  const props = (loop.properties ?? {}) as Record<string, unknown>;
  const lastCheck = props.proactive_resolver_at;
  if (typeof lastCheck !== "string") return false;
  const ms = Date.parse(lastCheck);
  return Number.isFinite(ms) && Date.now() - ms < STALENESS_WINDOW_MS;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

function tokenize(s: string): Set<string> {
  return new Set(normalize(s).split(" ").filter((w) => w.length >= 3));
}

function extractNames(loop: OpenLoop): Set<string> {
  const names = new Set<string>();
  const text = `${loop.title} ${loop.description ?? ""} ${loop.owner ?? ""}`;
  const pattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/g;
  for (const m of text.matchAll(pattern)) {
    names.add(m[1].toLowerCase());
  }
  if (loop.owner) names.add(loop.owner.toLowerCase());
  return names;
}

function eventParticipants(event: CalendarEvent): Set<string> {
  const names = new Set<string>();
  if (Array.isArray(event.participants)) {
    for (const p of event.participants as Array<Record<string, unknown>>) {
      if (typeof p.email === "string") names.add(p.email.toLowerCase());
      if (typeof p.name === "string") names.add(p.name.toLowerCase());
      if (typeof p.displayName === "string") names.add(p.displayName.toLowerCase());
    }
  }
  return names;
}

function matches(loop: OpenLoop, event: CalendarEvent): boolean {
  const loopNames = extractNames(loop);
  const evNames = eventParticipants(event);
  let nameOverlap = false;
  for (const n of loopNames) {
    if (n.length < 3) continue;
    for (const e of evNames) {
      if (e.includes(n) || n.includes(e)) { nameOverlap = true; break; }
    }
    if (nameOverlap) break;
  }

  const loopTokens = tokenize(`${loop.title} ${loop.description ?? ""}`);
  const eventTokens = tokenize(event.title);
  let tokenOverlap = 0;
  for (const t of loopTokens) {
    if (t.length >= 4 && eventTokens.has(t)) tokenOverlap++;
  }

  return nameOverlap || tokenOverlap >= 2;
}

export async function runProactiveResolver(input: {
  brainId: string;
  repository: BrainRepository;
}): Promise<ProactiveResolverResult> {
  const { brainId, repository } = input;
  const result: ProactiveResolverResult = { checked: 0, resolved: 0, skippedStale: 0 };

  const allLoops = await repository.listOpenLoops(brainId);
  const meetingLoops = allLoops.filter(
    (l) => ACTIVE_STATUSES.has(l.status) && isMeetingRelated(l),
  );

  if (meetingLoops.length === 0) return result;

  const staleCheckLoops = meetingLoops.filter((l) => !wasRecentlyChecked(l));
  result.skippedStale = meetingLoops.length - staleCheckLoops.length;

  if (staleCheckLoops.length === 0) return result;

  const now = Date.now();
  const events = await repository.listCalendarEvents({
    brainId,
    limit: 1000,
  });
  const pastEvents = events.filter(
    (e) => e.eventStatus === "active" && new Date(e.endTime).getTime() < now,
  );

  for (const loop of staleCheckLoops) {
    result.checked++;

    let matchedEvent: CalendarEvent | null = null;
    for (const event of pastEvents) {
      if (matches(loop, event)) {
        matchedEvent = event;
        break;
      }
    }

    if (matchedEvent) {
      const eventDate = new Date(matchedEvent.startTime).toISOString().slice(0, 10);
      const outcomeText = `Meeting already happened: "${matchedEvent.title}" on ${eventDate}`;

      await repository.updateOpenLoop(loop.id, {
        status: "closed",
        outcome: outcomeText,
        closedAt: new Date().toISOString(),
        properties: {
          ...(loop.properties ?? {}),
          closedBy: "proactive_resolver",
          closedFromEventId: matchedEvent.id,
          proactive_resolver_at: new Date().toISOString(),
        },
      });

      // KG write-back: update memory_object with outcome evidence
      if (loop.sourceItemId) {
        await repository.createMemoryObjects([{
          brainId,
          sourceItemId: loop.sourceItemId,
          objectType: "outcome",
          name: `Outcome: ${loop.title}`.slice(0, 120),
          description: outcomeText.slice(0, 800),
          confidence: 0.9,
          properties: {
            memory_source: "open_loop_outcome",
            open_loop_id: loop.id,
            detected_by: "proactive_resolver",
            outcome: {
              status: "closed",
              evidence_source_id: matchedEvent.sourceItemId ?? null,
              resolved_at: new Date().toISOString(),
            },
          },
        }]);
      }

      const db = getDb();
      await db.insert(loopOutcomeLog).values({
        brainId,
        loopId: loop.id,
        sourceItemId: matchedEvent.sourceItemId ?? null,
        decision: "closed",
        confidence: "0.90",
        evidenceQuote: `Calendar event: "${matchedEvent.title}" (${eventDate})`,
        properties: {
          applied: true,
          modelDecision: "closed",
          detectedBy: "proactive_resolver",
          calendarEventId: matchedEvent.id,
        },
      });

      result.resolved++;
    } else {
      await repository.updateOpenLoop(loop.id, {
        properties: {
          ...(loop.properties ?? {}),
          proactive_resolver_at: new Date().toISOString(),
        },
      });
    }
  }

  return result;
}
