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

export const meetingTypeSchema = z.enum([
  "investor_call",
  "customer_call",
  "advisor_call",
  "internal_sync",
  "partner_call",
  "product_review",
  "other",
]);

export const sourceClassificationSchema = z.object({
  summary: z.string().min(1).max(2400),
  sourceCategory: z.string().min(1).max(80),
  confidence: z.number().min(0).max(1),
  meetingType: meetingTypeSchema.optional(),
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

export const marketingSourcePlatformSchema = z.enum([
  "google_drive",
  "manual",
  "slack",
  "gmail",
  "outlook",
  "voice",
  "blog",
]);

export const marketingSourceTypeSchema = z.enum([
  "google_drive_transcript",
  "manual_note",
  "voice_note",
  "slack_thread",
  "gmail_email",
  "outlook_email",
  "blog",
  "demo_form",
  "investor_question",
  "customer_objection",
  "product_update",
]);

export const marketingConfidentialitySchema = z.enum([
  "public",
  "internal",
  "customer_sensitive",
  "investor_sensitive",
  "confidential",
]);

export const marketingSensitivityLevelSchema = z.enum(["low", "medium", "high", "blocked"]);
export const marketingChannelSchema = z.enum(["linkedin_company", "x", "linkedin_founder", "linkedin_pb"]);
export const marketingPostStatusSchema = z.enum([
  "draft",
  "needs_revision",
  "approved",
  "scheduled",
  "published",
  "archived",
  "failed_schedule",
]);
export const marketingFormatTypeSchema = z.enum([
  "teardown",
  "founder_story",
  "list",
  "contrarian",
  "product_pov",
  "case_study",
  "memo",
  "other",
]);
export const marketingHookTypeSchema = z.enum(["pain", "insight", "mistake", "lesson", "workflow", "future_of_work", "other"]);
export const marketingTargetIcpSchema = z.enum(["ib", "pe", "hf", "investor", "founder", "operator", "other"]);
export const marketingFunnelStageSchema = z.enum(["awareness", "problem_aware", "solution_aware", "conversion"]);
export const marketingEventTypeSchema = z.enum(["demo", "dm", "reply", "qualified_lead", "website_visit", "manual_attribution"]);

export const createMarketingContentItemSchema = z.object({
  brainId: z.string().min(1),
  sourceItemId: z.string().min(1).optional(),
  sourcePlatform: marketingSourcePlatformSchema,
  sourceType: marketingSourceTypeSchema,
  sourceUrl: z.string().url().optional().or(z.literal("")).transform((value) => (value ? value : undefined)),
  sourceExternalId: z.string().max(240).optional(),
  sourceOwner: z.string().max(160).optional(),
  sourceDate: z.string().optional(),
  sourceConfidentiality: marketingConfidentialitySchema.default("internal"),
  rawText: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const updateMarketingPostSchema = z.object({
  bodyText: z.string().min(1).max(6000).optional(),
  plannedPostDate: z.string().optional().nullable(),
  postingWindow: z.string().max(120).optional().nullable(),
  campaignTag: z.string().max(120).optional().nullable(),
  pillar: z.string().max(120).optional().nullable(),
  formatType: marketingFormatTypeSchema.optional().nullable(),
  hookType: marketingHookTypeSchema.optional().nullable(),
  targetIcp: marketingTargetIcpSchema.optional().nullable(),
  funnelStage: marketingFunnelStageSchema.optional().nullable(),
});

export const approveMarketingPostSchema = z.object({
  approvedBy: z.string().min(1).max(120).default("naveen"),
  bodyText: z.string().min(1).max(6000).optional(),
});

export const scheduleMarketingPostSchema = z.object({
  scheduledAt: z.string().optional(),
  approvedBy: z.string().min(1).max(120).default("naveen"),
});

export const recordMarketingMetricsSchema = z.object({
  channelPostId: z.string().min(1),
  metricDate: z.string().min(1),
  impressions: z.number().int().min(0).default(0),
  reactions: z.number().int().min(0).default(0),
  comments: z.number().int().min(0).default(0),
  shares: z.number().int().min(0).default(0),
  clicks: z.number().int().min(0).default(0),
  saves: z.number().int().min(0).default(0),
  follows: z.number().int().min(0).default(0),
  rawMetrics: z.record(z.string(), z.unknown()).optional(),
});

export const recordMarketingEventSchema = z.object({
  channelPostId: z.string().min(1).optional().nullable(),
  eventType: marketingEventTypeSchema,
  eventSource: z.string().min(1).max(120),
  eventAt: z.string().optional(),
  description: z.string().min(1).max(1000),
  contactName: z.string().max(160).optional().nullable(),
  companyName: z.string().max(160).optional().nullable(),
  value: z.number().optional().nullable(),
  utmSource: z.string().max(120).optional().nullable(),
  utmMedium: z.string().max(120).optional().nullable(),
  utmCampaign: z.string().max(160).optional().nullable(),
  utmContent: z.string().max(160).optional().nullable(),
  attributionConfidence: z.enum(["direct", "assisted", "manual", "unknown"]).default("unknown"),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const marketingRedactionResultSchema = z.object({
  cleanedSummary: z.string().min(1).max(2400),
  contentSafeSummary: z.string().min(1).max(2400),
  sourceConfidentiality: marketingConfidentialitySchema,
  requiresRedaction: z.boolean(),
  approvedForContent: z.boolean(),
  insights: z
    .array(
      z.object({
        rawInsight: z.string().min(1).max(1000),
        contentSafeInsight: z.string().min(1).max(1000),
        sensitivityLevel: marketingSensitivityLevelSchema,
        suggestedPillar: z.string().max(120).optional(),
        suggestedChannels: z.array(marketingChannelSchema).max(4),
      }),
    )
    .max(8),
  redactionNotes: z.array(z.string().min(1).max(400)).max(12),
});

export const marketingDraftResultSchema = z.object({
  drafts: z
    .array(
      z.object({
        contentInsightId: z.string().min(1),
        channel: marketingChannelSchema,
        bodyText: z.string().min(1).max(6000),
        pillar: z.string().max(120).optional(),
        formatType: marketingFormatTypeSchema.optional(),
        hookType: marketingHookTypeSchema.optional(),
        targetIcp: marketingTargetIcpSchema.optional(),
        funnelStage: marketingFunnelStageSchema.optional(),
        campaignTag: z.string().max(120).optional(),
        rationale: z.string().min(1).max(500),
      }),
    )
    .max(12),
});

export const marketingSafetyCheckResultSchema = z.object({
  passed: z.boolean(),
  reason: z.string().min(1).max(1000),
  flags: z.array(z.string().min(1).max(120)).max(12),
});

export const marketingWeeklyAnalysisResultSchema = z.object({
  summary: z.string().min(1).max(1200),
  markdown: z.string().min(1).max(12000),
  recommendedExperiments: z
    .array(
      z.object({
        title: z.string().min(1).max(160),
        rationale: z.string().min(1).max(600),
        tag: z.string().max(120).optional(),
      }),
    )
    .min(1)
    .max(5),
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
export type CreateMarketingContentItemInput = z.infer<typeof createMarketingContentItemSchema>;
export type UpdateMarketingPostInput = z.infer<typeof updateMarketingPostSchema>;
export type ApproveMarketingPostInput = z.infer<typeof approveMarketingPostSchema>;
export type ScheduleMarketingPostInput = z.infer<typeof scheduleMarketingPostSchema>;
export type RecordMarketingMetricsInput = z.infer<typeof recordMarketingMetricsSchema>;
export type RecordMarketingEventInput = z.infer<typeof recordMarketingEventSchema>;
export type MarketingRedactionResultSchemaType = z.infer<typeof marketingRedactionResultSchema>;
export type MarketingDraftResultSchemaType = z.infer<typeof marketingDraftResultSchema>;
export type MarketingSafetyCheckResultSchemaType = z.infer<typeof marketingSafetyCheckResultSchema>;
export type MarketingWeeklyAnalysisResultSchemaType = z.infer<typeof marketingWeeklyAnalysisResultSchema>;

export const memoryKindSchema = memoryObjectTypeSchema;
export const memoryStatusSchema = memoryObjectStatusSchema;
export const extractedMemoryItemSchema = legacyExtractedMemoryItemSchema;

// Meeting Prep Brief schema
export const sourceRefSchema = z.object({
  kind: z.enum(["brain_source", "memory_object", "open_loop", "web_url", "linkedin_url"]),
  id_or_url: z.string().min(1),
  excerpt: z.string().max(400).optional(),
  fetched_at: z.string().optional(),
});

export const meetingPrepAttendeeSchema = z.object({
  name: z.string().min(1).max(160),
  email: z.string().max(240).optional(),
  company: z.string().max(160).optional(),
  role: z.string().max(160).optional(),
  linkedin_url: z.string().max(500).optional(),
  mini_dossier: z.object({
    recent_mentions: z.array(z.object({
      snippet: z.string().max(400),
      source_id: z.string(),
    })).max(5).default([]),
  }),
  confidence: z.number().min(0).max(1),
});

export const meetingPrepBriefSchema = z.object({
  meeting_id: z.string().min(1),
  generated_at: z.string().min(1),
  meeting_window: z.object({
    start: z.string().min(1),
    end: z.string().min(1),
    live_in_minutes: z.number(),
  }),
  attendees: z.array(meetingPrepAttendeeSchema).max(20).default([]),
  why_now: z.object({
    reason: z.string().min(1).max(800),
    sources: z.array(sourceRefSchema).max(8).default([]),
    confidence: z.number().min(0).max(1),
  }),
  tone_calibration: z.object({
    description: z.string().max(400).default(""),
    based_on_n_messages: z.number().default(0),
    confidence: z.number().min(0).max(1).default(0),
  }).default({ description: "", based_on_n_messages: 0, confidence: 0 }),
  things_to_know: z.array(z.object({
    point: z.string().min(1).max(600),
    sources: z.array(sourceRefSchema).max(8).default([]),
    origin: z.enum(["brain", "web", "linkedin"]),
    freshness_label: z.string().max(40).default(""),
    confidence: z.number().min(0).max(1),
  })).max(5).default([]),
  questions_to_ask: z.array(z.object({
    question: z.string().min(1).max(400),
    rationale: z.string().max(400).default(""),
    sources: z.array(sourceRefSchema).max(8).default([]),
    confidence: z.number().min(0).max(1),
  })).max(5).default([]),
  risks_to_dodge: z.array(z.object({
    risk: z.string().min(1).max(400),
    sources: z.array(sourceRefSchema).max(8).default([]),
    confidence: z.number().min(0).max(1),
    trust_label: z.enum(["fact", "inference", "judgment_call"]),
  })).max(5).default([]),
  open_loops_with_attendees: z.array(z.object({
    loop_id: z.string().min(1),
    title: z.string().min(1).max(240),
    due_date: z.string().optional(),
    overdue: z.boolean(),
  })).max(10).default([]),
  overall_confidence: z.number().min(0).max(1),
  uncertainty_notes: z.array(z.string().max(400)).max(10).default([]),
  source_count: z.number().default(0),
  slack_message_ts: z.string().optional(),
});

export type MeetingPrepBrief = z.infer<typeof meetingPrepBriefSchema>;
export type SourceRef = z.infer<typeof sourceRefSchema>;
export type MeetingPrepAttendee = z.infer<typeof meetingPrepAttendeeSchema>;
