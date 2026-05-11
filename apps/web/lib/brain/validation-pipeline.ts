import type { ExtractedOpenLoop, SourceItem } from "@arvya/core";
import type { BrainRepository } from "@/lib/db/repository";

export type GateEvidence = {
  type: "calendar_match" | "sent_email_match" | "duplicate_match";
  sourceId: string | null;
  quote: string;
  confidence: number;
};

export type GateResult = {
  pass: boolean;
  reason: string;
  gate: string;
  evidence?: GateEvidence;
};

export type ValidationGate<T> = {
  name: string;
  run(item: T, context: ValidationContext): Promise<GateResult>;
};

export type ValidationContext = {
  brainId: string;
  source: SourceItem;
  repository: BrainRepository;
  sentSources?: SourceItem[];
};

export type ValidationResult<T> = {
  item: T;
  passed: boolean;
  results: GateResult[];
  rejectedBy?: string;
};

export class ValidationPipeline<T> {
  private gates: ValidationGate<T>[] = [];

  addGate(gate: ValidationGate<T>): this {
    this.gates.push(gate);
    return this;
  }

  async validate(item: T, context: ValidationContext): Promise<ValidationResult<T>> {
    const results: GateResult[] = [];

    for (const gate of this.gates) {
      try {
        const result = await gate.run(item, context);
        results.push(result);
        if (!result.pass) {
          return { item, passed: false, results, rejectedBy: gate.name };
        }
      } catch {
        results.push({ pass: true, reason: "gate error — pass-through", gate: gate.name });
      }
    }

    return { item, passed: true, results };
  }

  async validateBatch(items: T[], context: ValidationContext): Promise<{
    passed: ValidationResult<T>[];
    rejected: ValidationResult<T>[];
  }> {
    const passed: ValidationResult<T>[] = [];
    const rejected: ValidationResult<T>[] = [];

    for (const item of items) {
      const result = await this.validate(item, context);
      if (result.passed) {
        passed.push(result);
      } else {
        rejected.push(result);
      }
    }

    return { passed, rejected };
  }
}

export function buildOpenLoopValidationPipeline(): ValidationPipeline<ExtractedOpenLoop> {
  return new ValidationPipeline<ExtractedOpenLoop>()
    .addGate(typeGate)
    .addGate(calendarGate)
    .addGate(duplicateGate)
    .addGate(temporalGate);
}

const CALENDAR_INVITATION_PATTERNS = [
  /^(?:invitation|invite)\s*:/i,
  /^accepted?\s*:/i,
  /^declined?\s*:/i,
  /^tentative(?:ly)?\s*:/i,
  /^updated?\s+invitation?\s*:/i,
  /^canceled?\s+event\s*:/i,
  /^cancelled?\s+event\s*:/i,
  /you have been invited to/i,
  /has accepted this invitation/i,
  /rsvp/i,
  /calendar notification/i,
  /event reminder/i,
];

const GREETING_ONLY_PATTERNS = [
  /^(?:hi|hey|hello|dear|good (?:morning|afternoon|evening))\s+[a-z]+[,!.]?\s*$/i,
  /^(?:thanks|thank you|thx|cheers|best|regards|sincerely|yours)[,!.]?\s*$/i,
  /^(?:happy (?:birthday|holidays|new year|thanksgiving))/i,
];

const RECURRING_OBLIGATION_PATTERNS = [
  /\b(?:every|each)\s+(?:week|month|day|morning|monday|tuesday|wednesday|thursday|friday)\b/i,
  /\b(?:weekly|daily|monthly|bi-?weekly|recurring)\s+(?:standup|meeting|sync|check-in|review|call)\b/i,
  /\bstanding\s+(?:meeting|call|sync)\b/i,
];

export const typeGate: ValidationGate<ExtractedOpenLoop> = {
  name: "type",
  async run(item) {
    const text = `${item.title} ${item.description ?? ""} ${item.sourceQuote ?? ""}`;

    for (const pattern of CALENDAR_INVITATION_PATTERNS) {
      if (pattern.test(text)) {
        return { pass: false, reason: "calendar invitation pattern", gate: "type" };
      }
    }

    for (const pattern of GREETING_ONLY_PATTERNS) {
      if (pattern.test(item.title)) {
        return { pass: false, reason: "greeting-only content", gate: "type" };
      }
    }

    for (const pattern of RECURRING_OBLIGATION_PATTERNS) {
      if (pattern.test(text)) {
        return { pass: false, reason: "recurring obligation", gate: "type" };
      }
    }

    if (item.title.length < 8 && !item.description?.trim()) {
      return { pass: false, reason: "content too short to be actionable", gate: "type" };
    }

    return { pass: true, reason: "valid type", gate: "type" };
  },
};

export const calendarGate: ValidationGate<ExtractedOpenLoop> = {
  name: "calendar",
  async run(item, context) {
    const SCHEDULING_TYPES = new Set(["scheduling", "follow_up"]);
    const text = `${item.title} ${item.description ?? ""}`.toLowerCase();
    const isSchedulingLoop =
      SCHEDULING_TYPES.has(item.loopType) ||
      /\b(?:schedule|set up|book|arrange)\s+(?:a\s+)?(?:call|meeting|sync|chat|session)\b/.test(text) ||
      /\b(?:meet(?:ing)?|call)\s+with\b/.test(text);

    if (!isSchedulingLoop) {
      return { pass: true, reason: "not a scheduling loop — calendar gate skipped", gate: "calendar" };
    }

    try {
      const events = await context.repository.listCalendarEvents({
        brainId: context.brainId,
        limit: 500,
      });

      if (events.length === 0) {
        return { pass: true, reason: "no calendar data available", gate: "calendar" };
      }

      const sourceOccurredAt = readOccurredAt(context.source);
      const loopParticipants = extractParticipantNames(item);

      for (const event of events) {
        if (event.eventStatus === "cancelled" || event.eventStatus === "deleted") {
          const eventParticipants = extractEventParticipants(event);
          if (hasParticipantOverlap(loopParticipants, eventParticipants) &&
              hasContentOverlap(item, event)) {
            return {
              pass: true,
              reason: `meeting cancelled — loop stays open (reschedule needed): ${event.title}`,
              gate: "calendar",
            };
          }
          continue;
        }

        const eventEnd = new Date(event.endTime).getTime();
        if (eventEnd > Date.now()) continue;

        const eventParticipants = extractEventParticipants(event);
        if (!hasParticipantOverlap(loopParticipants, eventParticipants) &&
            !hasContentOverlap(item, event)) {
          continue;
        }

        if (eventEnd > sourceOccurredAt.getTime() - 7 * 24 * 60 * 60 * 1000) {
          return {
            pass: false,
            reason: `meeting already happened: "${event.title}" on ${new Date(event.startTime).toISOString().slice(0, 10)}`,
            gate: "calendar",
            evidence: {
              type: "calendar_match",
              sourceId: (event as Record<string, unknown>).sourceItemId as string | null ?? null,
              quote: `Meeting "${event.title}" completed on ${new Date(event.startTime).toISOString().slice(0, 10)}`,
              confidence: 0.9,
            },
          };
        }
      }

      return { pass: true, reason: "no matching completed calendar event", gate: "calendar" };
    } catch {
      return { pass: true, reason: "calendar gate error — pass-through", gate: "calendar" };
    }
  },
};

export const duplicateGate: ValidationGate<ExtractedOpenLoop> = {
  name: "duplicate",
  async run(item, context) {
    try {
      const existingLoops = await context.repository.listOpenLoops(context.brainId);
      const activeLoops = existingLoops.filter(
        (l) => !["closed", "done", "dismissed"].includes(l.status),
      );

      const normalizedTitle = normalize(item.title);
      for (const existing of activeLoops) {
        if (normalize(existing.title) === normalizedTitle) {
          return {
            pass: false,
            reason: `duplicate of existing loop: "${existing.title}"`,
            gate: "duplicate",
          };
        }

        if (item.sourceQuote && existing.sourceQuote) {
          const sim = jaccardSimilarity(
            tokenize(item.sourceQuote),
            tokenize(existing.sourceQuote),
          );
          if (sim > 0.7) {
            return {
              pass: false,
              reason: `high similarity (${(sim * 100).toFixed(0)}%) with: "${existing.title}"`,
              gate: "duplicate",
            };
          }
        }
      }

      return { pass: true, reason: "no duplicate found", gate: "duplicate" };
    } catch {
      return { pass: true, reason: "duplicate gate error — pass-through", gate: "duplicate" };
    }
  },
};

const STALE_DAYS = 30;

export const temporalGate: ValidationGate<ExtractedOpenLoop> = {
  name: "temporal",
  async run(item, context) {
    const sourceOccurredAt = readOccurredAt(context.source);
    const ageMs = Date.now() - sourceOccurredAt.getTime();
    const ageDays = ageMs / (24 * 60 * 60 * 1000);

    if (ageDays <= STALE_DAYS) {
      return { pass: true, reason: `source is ${Math.floor(ageDays)}d old (under ${STALE_DAYS}d threshold)`, gate: "temporal" };
    }

    if (item.dueDate) {
      const dueMs = Date.parse(item.dueDate);
      if (Number.isFinite(dueMs) && dueMs > Date.now()) {
        return { pass: true, reason: "has future due date", gate: "temporal" };
      }
    }

    const text = `${item.title} ${item.description ?? ""}`;
    if (/\b(?:next\s+(?:week|month|quarter)|upcoming|soon|later)\b/i.test(text)) {
      return { pass: true, reason: "contains future-facing language", gate: "temporal" };
    }

    try {
      const events = await context.repository.listCalendarEvents({
        brainId: context.brainId,
        from: new Date().toISOString(),
        limit: 200,
      });

      const loopParticipants = extractParticipantNames(item);
      for (const event of events) {
        if (event.eventStatus === "cancelled") continue;
        const eventParticipants = extractEventParticipants(event);
        if (hasParticipantOverlap(loopParticipants, eventParticipants) ||
            hasContentOverlap(item, event)) {
          return {
            pass: true,
            reason: `future calendar event correlates: "${event.title}"`,
            gate: "temporal",
          };
        }
      }
    } catch {
      // Calendar unavailable — fall through to SENT check then rejection
    }

    if (context.sentSources && context.sentSources.length > 0) {
      const loopTokens = tokenize(`${item.title} ${item.description ?? ""}`);
      for (const sent of context.sentSources) {
        const sentTokens = tokenize(sent.title);
        if (sentTokens.size === 0) continue;
        const sim = jaccardSimilarity(loopTokens, sentTokens);
        if (sim >= 0.15) {
          return {
            pass: false,
            reason: `source is ${Math.floor(ageDays)}d old, SENT evidence found: "${sent.title}" (Jaccard ${(sim * 100).toFixed(0)}%)`,
            gate: "temporal",
            evidence: {
              type: "sent_email_match",
              sourceId: sent.id,
              quote: `SENT email matches: "${sent.title}"`,
              confidence: 0.7,
            },
          };
        }
      }
    }

    return {
      pass: false,
      reason: `source is ${Math.floor(ageDays)}d old with no future date and no calendar correlation`,
      gate: "temporal",
    };
  },
};

function readOccurredAt(source: SourceItem): Date {
  const metadata = (source.metadata ?? {}) as Record<string, unknown>;
  const occurredAt = metadata.occurred_at;
  if (typeof occurredAt === "string") {
    const ms = Date.parse(occurredAt);
    if (Number.isFinite(ms)) return new Date(ms);
  }
  return new Date(source.createdAt);
}

export function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

export function tokenize(value: string): Set<string> {
  return new Set(
    normalize(value).split(" ").filter((w) => w.length >= 3),
  );
}

export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function extractParticipantNames(item: ExtractedOpenLoop): Set<string> {
  const names = new Set<string>();
  const text = `${item.title} ${item.description ?? ""} ${item.owner ?? ""} ${item.sourceQuote ?? ""}`;
  const personPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/g;
  for (const match of text.matchAll(personPattern)) {
    const name = match[1].toLowerCase();
    if (name.length >= 3) names.add(name);
  }
  if (item.owner) names.add(item.owner.toLowerCase());
  return names;
}

function extractEventParticipants(event: { participants: unknown; title: string }): Set<string> {
  const names = new Set<string>();
  const participants = event.participants;
  if (Array.isArray(participants)) {
    for (const p of participants) {
      if (!p || typeof p !== "object") continue;
      const obj = p as Record<string, unknown>;
      if (typeof obj.email === "string") names.add(obj.email.toLowerCase());
      if (typeof obj.name === "string") names.add(obj.name.toLowerCase());
      if (typeof obj.displayName === "string") names.add(obj.displayName.toLowerCase());
    }
  }
  return names;
}

function hasParticipantOverlap(a: Set<string>, b: Set<string>): boolean {
  for (const name of a) {
    if (name.length < 3) continue;
    for (const other of b) {
      if (other.includes(name) || name.includes(other)) return true;
    }
  }
  return false;
}

function hasContentOverlap(
  item: ExtractedOpenLoop,
  event: { title: string },
): boolean {
  const loopTokens = tokenize(`${item.title} ${item.description ?? ""}`);
  const eventTokens = tokenize(event.title);
  let overlap = 0;
  for (const t of loopTokens) {
    if (t.length >= 4 && eventTokens.has(t)) overlap++;
  }
  return overlap >= 2;
}
