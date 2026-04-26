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
  properties: z.record(z.string(), z.unknown()).optional(),
});

export const extractedOpenLoopSchema = z.object({
  title: z.string().min(1).max(160),
  description: z.string().min(1).max(1000),
  loopType: openLoopTypeSchema.default("other"),
  owner: z.string().max(120).optional(),
  status: openLoopStatusSchema.default("needs_review"),
  priority: openLoopPrioritySchema.default("medium"),
  dueDate: z.string().optional(),
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

export const askAnswerSchema = z.object({
  answer: z.string().min(1).max(2000),
  uncertain: z.boolean().default(false),
  followUp: z.string().max(400).optional(),
  citations: z
    .array(
      z.object({
        memoryId: z.string().min(1).optional(),
        sourceItemId: z.string().min(1).optional(),
        evidence: z.string().min(1).max(400),
      }).refine((citation) => citation.memoryId || citation.sourceItemId, {
        message: "Citation must include memoryId or sourceItemId.",
      }),
    )
    .max(8),
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

export const memoryKindSchema = memoryObjectTypeSchema;
export const memoryStatusSchema = memoryObjectStatusSchema;
export const extractedMemoryItemSchema = legacyExtractedMemoryItemSchema;
