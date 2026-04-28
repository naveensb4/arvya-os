import { z } from "zod";

export const brainKindSchema = z.enum(["company", "sell_side", "buy_side"]);

export const sourceTypeSchema = z.enum([
  "transcript",
  "email",
  "note",
  "document",
  "github",
  "strategy_output",
  "web",
  "manual",
]);

export const memoryObjectTypeSchema = z.enum([
  "person",
  "company",
  "fact",
  "event",
  "decision",
  "insight",
  "risk",
  "question",
  "commitment",
  "task",
  "product_insight",
  "marketing_idea",
  "outcome",
  "investor_feedback",
  "customer_feedback",
  "advisor_feedback",
  "custom",
]);

export const memoryObjectStatusSchema = z.enum([
  "open",
  "in_progress",
  "waiting",
  "done",
  "closed",
  "snoozed",
]);

export const openLoopTypeSchema = z.enum([
  "follow_up",
  "intro",
  "product",
  "investor",
  "sales",
  "marketing",
  "engineering",
  "deal",
  "diligence",
  "crm",
  "scheduling",
  "task",
  "investor_ask",
  "customer_ask",
  "strategic_question",
  "other",
]);

export const openLoopStatusSchema = z.enum([
  "needs_review",
  "open",
  "in_progress",
  "waiting",
  "done",
  "dismissed",
  "closed",
]);

export const openLoopPrioritySchema = z.enum([
  "low",
  "medium",
  "high",
  "critical",
]);

export const prioritySetBySchema = z.enum(["naveen", "pb", "system"]);
export const priorityHorizonSchema = z.enum(["today", "week", "sprint", "quarter"]);
export const priorityStatusSchema = z.enum(["active", "achieved", "abandoned"]);

export const prioritySchema = z.object({
  id: z.string().min(1),
  brainId: z.string().min(1),
  statement: z.string().min(1).max(500),
  setAt: z.string().min(1),
  setBy: prioritySetBySchema,
  horizon: priorityHorizonSchema,
  status: priorityStatusSchema,
  sourceRefs: z.array(z.string()).optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().optional(),
});

export const createPrioritySchema = z.object({
  statement: z.string().min(1).max(500),
  setBy: prioritySetBySchema.default("naveen"),
  horizon: priorityHorizonSchema.default("week"),
  status: priorityStatusSchema.default("active"),
  setAt: z.string().optional(),
  sourceRefs: z.array(z.string()).optional(),
});

export const updatePriorityStatusSchema = z.object({
  status: priorityStatusSchema,
});

export const createBrainSchema = z.object({
  name: z.string().min(1).max(120),
  kind: brainKindSchema,
  thesis: z.string().min(1).max(2000),
});

export const ingestSourceSchema = z.object({
  brainId: z.string().min(1),
  title: z.string().min(1).max(200),
  type: sourceTypeSchema,
  content: z.string().min(1),
  externalUri: z.string().url().optional().or(z.literal("")).transform((value) => (value ? value : undefined)),
});

export const askBrainSchema = z.object({
  brainId: z.string().min(1),
  question: z.string().min(1).max(1000),
});

export const updateOpenLoopSchema = z.object({
  brainId: z.string().min(1),
  openLoopId: z.string().min(1),
  status: openLoopStatusSchema,
  outcome: z.string().max(2000).optional(),
});

export const dailyBriefSchema = z.object({
  brainId: z.string().min(1),
});

export const extractedMemoryObjectSchema = z.object({
  objectType: memoryObjectTypeSchema,
  name: z.string().min(1).max(160),
  description: z.string().min(1).max(800),
  sourceQuote: z.string().min(1).max(800).optional(),
  confidence: z.number().min(0).max(1),
  status: memoryObjectStatusSchema.optional(),
  entitiesMentioned: z.array(z.string().min(1).max(160)).max(16).optional(),
  ownerHint: z.string().max(160).optional(),
  dueHint: z.string().max(160).optional(),
  properties: z.record(z.string(), z.unknown()).optional(),
});

export const extractedOpenLoopSchema = z.object({
  title: z.string().min(1).max(160),
  description: z.string().min(1).max(1000),
  loopType: openLoopTypeSchema.default("other"),
  owner: z.string().max(120).optional(),
  ownerHint: z.string().max(120).optional(),
  status: openLoopStatusSchema.default("needs_review"),
  priority: openLoopPrioritySchema.default("medium"),
  dueDate: z.string().optional(),
  dueHint: z.string().max(160).optional(),
  suggestedAction: z.string().max(1000).optional(),
  suggestedFollowUpEmail: z
    .object({
      to: z.string().max(240).optional(),
      subject: z.string().max(240).optional(),
      body: z.string().min(1).max(2000),
    })
    .nullable()
    .optional(),
  requiresHumanApproval: z.boolean().default(false),
  sourceQuote: z.string().min(1).max(800).optional(),
  sourceRef: z.string().max(160).optional(),
  confidence: z.number().min(0).max(1).optional(),
  properties: z.record(z.string(), z.unknown()).optional(),
});

export const extractedRelationshipSchema = z.object({
  fromName: z.string().min(1).max(160),
  toName: z.string().min(1).max(160),
  relationshipType: z.string().min(1).max(120),
  sourceQuote: z.string().max(800).optional(),
  confidence: z.number().min(0).max(1).optional(),
  properties: z.record(z.string(), z.unknown()).optional(),
});

export const sourceClassificationSchema = z.object({
  summary: z.string().min(1).max(2400),
  sourceCategory: z.string().min(1).max(80),
  confidence: z.number().min(0).max(1),
});

export const extractedSuggestedActionSchema = z.object({
  openLoopTitle: z.string().min(1).max(160),
  suggestedAction: z.string().min(1).max(1000),
  suggestedFollowUpEmail: z
    .object({
      to: z.string().max(240).optional(),
      subject: z.string().max(240).optional(),
      body: z.string().min(1).max(2000),
    })
    .nullable()
    .optional(),
  requiresHumanApproval: z.boolean().default(false),
});

export const legacyExtractedMemoryItemSchema = z.object({
  kind: memoryObjectTypeSchema.or(z.literal("open_loop")).or(z.literal("suggested_action")),
  title: z.string().min(1).max(160),
  detail: z.string().min(1).max(800),
  evidence: z.string().min(1).max(800),
  confidence: z.number().min(0).max(1),
  status: memoryObjectStatusSchema.optional(),
  owner: z.string().max(120).optional(),
  dueAt: z.string().optional(),
});

export const ingestionResultSchema = z.object({
  summary: z.string().min(1).max(2400),
  classification: sourceClassificationSchema.optional(),
  memoryObjects: z.array(extractedMemoryObjectSchema).max(64).default([]),
  openLoops: z.array(extractedOpenLoopSchema).max(32).default([]),
  relationships: z.array(extractedRelationshipSchema).max(32).default([]),
  suggestedActions: z.array(extractedSuggestedActionSchema).max(32).default([]),
  memories: z.array(legacyExtractedMemoryItemSchema).max(64).optional(),
});

export const askCitationSchema = z
  .object({
    kind: z.enum(["source", "memory", "open_loop"]).optional(),
    memoryId: z.string().min(1).optional(),
    sourceItemId: z.string().min(1).optional(),
    openLoopId: z.string().min(1).optional(),
    id: z.string().min(1).optional(),
    snippet: z.string().min(1).max(400).optional(),
    evidence: z.string().min(1).max(400).optional(),
  })
  .refine(
    (citation) =>
      Boolean(
        citation.memoryId ||
          citation.sourceItemId ||
          citation.openLoopId ||
          citation.id,
      ),
    {
      message: "Citation must include memoryId, sourceItemId, openLoopId, or id.",
    },
  )
  .refine((citation) => Boolean(citation.snippet || citation.evidence), {
    message: "Citation must include a snippet or evidence string.",
  });

export const askAnswerSchema = z.object({
  answer: z.string().min(1).max(2000),
  uncertain: z.boolean().default(false),
  confidence: z.enum(["high", "medium", "low"]).optional(),
  uncertaintyNotes: z.array(z.string().min(1).max(400)).max(8).optional(),
  followUp: z.string().max(400).optional(),
  citations: z.array(askCitationSchema).max(12),
});

export const dailyBriefAnswerSchema = z.object({
  headline: z.string().min(1).max(160),
  summary: z.string().min(1).max(800),
  priorities: z
    .array(
      z.object({
        title: z.string().min(1).max(160),
        detail: z.string().min(1).max(400),
        memoryIds: z.array(z.string()).max(5).optional(),
      }),
    )
    .max(6),
});

export const structuredDailyBriefSchema = z.object({
  date: z.string().min(1),
  top_priorities_today: z
    .array(
      z.object({
        priority_id: z.string().optional(),
        statement: z.string().min(1).max(400),
        why_today: z.string().min(1).max(500),
      }),
    )
    .max(10),
  overdue_follow_ups: z
    .array(
      z.object({
        open_loop_id: z.string().min(1),
        title: z.string().min(1).max(240),
        owner: z.string().min(1).max(120),
        days_overdue: z.number().int().min(0).max(3650),
      }),
    )
    .max(20),
  due_soon: z
    .array(
      z.object({
        open_loop_id: z.string().min(1),
        title: z.string().min(1).max(240),
        due_in_days: z.number().int().min(0).max(60),
      }),
    )
    .max(20),
  high_intent_relationships: z
    .array(
      z.object({
        entity: z.string().min(1).max(160),
        kind: z.enum(["customer", "investor", "advisor", "prospect"]),
        signal: z.string().min(1).max(400),
        source_refs: z.array(z.string()).max(8),
      }),
    )
    .max(15),
  product_insights_to_act_on: z
    .array(
      z.object({
        insight: z.string().min(1).max(400),
        source_refs: z.array(z.string()).max(8),
        suggested_action: z.string().max(400).optional(),
      }),
    )
    .max(15),
  marketing_opportunities: z
    .array(
      z.object({
        idea: z.string().min(1).max(400),
        source_refs: z.array(z.string()).max(8),
      }),
    )
    .max(15),
  risks_and_dropped_balls: z
    .array(
      z.object({
        description: z.string().min(1).max(500),
        source_refs: z.array(z.string()).max(8),
        severity: z.enum(["high", "medium", "low"]),
      }),
    )
    .max(15),
  suggested_actions_naveen: z
    .array(
      z.object({
        action: z.string().min(1).max(400),
        source_refs: z.array(z.string()).max(8).optional(),
      }),
    )
    .max(10),
  suggested_actions_pb: z
    .array(
      z.object({
        action: z.string().min(1).max(400),
        source_refs: z.array(z.string()).max(8).optional(),
      }),
    )
    .max(10),
  questions_to_resolve: z
    .array(
      z.object({
        question: z.string().min(1).max(400),
        why_now: z.string().min(1).max(400),
      }),
    )
    .max(10),
  generated_at: z.string().min(1),
});

export const driftSignalTypeSchema = z.enum([
  "commitment_dropped",
  "insight_unaddressed",
  "objection_recurring",
  "priority_drifting",
  "owner_missing",
  "narrative_stale",
]);

export const driftReviewSchema = z.object({
  generated_at: z.string().min(1),
  overall_alignment: z.enum(["aligned", "minor_drift", "major_drift"]),
  signals: z
    .array(
      z.object({
        type: driftSignalTypeSchema,
        severity: z.enum(["high", "medium", "low"]),
        summary: z.string().min(1).max(280),
        detail: z.string().min(1).max(800),
        source_refs: z.array(z.string()).max(12),
        memory_refs: z.array(z.string()).max(12),
        priority_refs: z.array(z.string()).max(12).optional(),
        recommended_action: z.string().min(1).max(400),
        recommended_owner: z.enum(["naveen", "pb", "system"]).optional(),
      }),
    )
    .max(25),
  summary_for_founders: z.string().min(1).max(1200),
});

export const followUpDraftAnswerSchema = z.object({
  drafts: z
    .array(
      z.object({
        openLoopId: z.string().min(1),
        title: z.string().min(1).max(160),
        channel: z.enum(["email", "slack", "internal", "manual"]),
        owner: z.string().max(120).optional(),
        draft: z.string().min(1).max(1200),
        rationale: z.string().min(1).max(400),
      }),
    )
    .max(8),
});

export type CreateBrainInput = z.infer<typeof createBrainSchema>;
export type IngestSourceInput = z.infer<typeof ingestSourceSchema>;
export type AskBrainInput = z.infer<typeof askBrainSchema>;
export type UpdateOpenLoopInput = z.infer<typeof updateOpenLoopSchema>;
export type DailyBriefInput = z.infer<typeof dailyBriefSchema>;
export type ExtractedMemoryObject = z.infer<typeof extractedMemoryObjectSchema>;
export type ExtractedOpenLoop = z.infer<typeof extractedOpenLoopSchema>;
export type ExtractedRelationship = z.infer<typeof extractedRelationshipSchema>;
export type SourceClassification = z.infer<typeof sourceClassificationSchema>;
export type ExtractedSuggestedAction = z.infer<typeof extractedSuggestedActionSchema>;
export type IngestionResult = z.infer<typeof ingestionResultSchema>;
export type AskAnswer = z.infer<typeof askAnswerSchema>;
export type DailyBriefAnswer = z.infer<typeof dailyBriefAnswerSchema>;
export type FollowUpDraftAnswer = z.infer<typeof followUpDraftAnswerSchema>;
export type StructuredDailyBriefSchemaType = z.infer<typeof structuredDailyBriefSchema>;
export type DriftReviewSchemaType = z.infer<typeof driftReviewSchema>;
export type CreatePriorityInput = z.infer<typeof createPrioritySchema>;
export type UpdatePriorityStatusInput = z.infer<typeof updatePriorityStatusSchema>;
export type PrioritySchemaType = z.infer<typeof prioritySchema>;

export const memoryKindSchema = memoryObjectTypeSchema;
export const memoryStatusSchema = memoryObjectStatusSchema;
export const extractedMemoryItemSchema = legacyExtractedMemoryItemSchema;
