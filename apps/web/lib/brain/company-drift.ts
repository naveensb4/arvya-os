import type { BrainAlertSeverity } from "@/lib/db/repository";
import type { MemoryObject, OpenLoop, SourceItem } from "@arvya/core";

export type CompanyDriftFinding = {
  id: string;
  alertType: string;
  title: string;
  description: string;
  severity: BrainAlertSeverity;
  suggestedAction: string;
  memoryObjectIds?: string[];
  openLoopIds?: string[];
  sourceItemIds?: string[];
};

export type CompanyDriftReview = {
  generatedAt: string;
  summary: string;
  findings: CompanyDriftFinding[];
  metrics: {
    operationalSourceCount: number;
    activeOpenLoopCount: number;
    reviewBacklogCount: number;
    overdueOpenLoopCount: number;
    ownerlessHighPriorityCount: number;
    outcomeMemoryCount: number;
  };
};

const terminalOpenLoopStatuses = new Set(["done", "dismissed", "closed"]);
const activeOpenLoopStatuses = new Set(["open", "in_progress", "waiting"]);
const strategyDomainTypes = new Set(["daily_brief", "weekly_learning_memo", "closed_loop_alignment_report", "company_drift_review"]);
const driftStopWords = new Set([
  "about",
  "after",
  "again",
  "arvya",
  "before",
  "brain",
  "build",
  "company",
  "could",
  "from",
  "have",
  "into",
  "more",
  "next",
  "naveen",
  "should",
  "that",
  "their",
  "there",
  "this",
  "with",
  "work",
  "would",
]);

export function createCompanyDriftReview(input: {
  memoryObjects: MemoryObject[];
  openLoops: OpenLoop[];
  sourceItems: SourceItem[];
  currentTime?: number;
}): CompanyDriftReview {
  const currentTime = input.currentTime ?? Date.now();
  const operationalSources = input.sourceItems.filter(isOperationalSource);
  const activeLoops = input.openLoops.filter(isActiveLoop);
  const reviewBacklog = input.openLoops.filter((loop) => loop.status === "needs_review");
  const overdueLoops = activeLoops.filter((loop) => isOverdueLoop(loop, currentTime));
  const ownerlessHighPriorityLoops = activeLoops.filter(
    (loop) => (loop.priority === "critical" || loop.priority === "high") && !loop.owner?.trim(),
  );

  const findings = [
    ...sourceFreshnessFindings(operationalSources, currentTime),
    ...overdueLoopFindings(overdueLoops),
    ...reviewBacklogFindings(reviewBacklog),
    ...ownerlessLoopFindings(ownerlessHighPriorityLoops),
    ...priorityDriftFindings(input.sourceItems, activeLoops),
    ...commitmentDriftFindings(input.memoryObjects, input.openLoops),
    ...productInsightDriftFindings(input.memoryObjects, input.openLoops),
    ...riskDriftFindings(input.memoryObjects, input.openLoops),
    ...missingOutcomeFindings(input.openLoops),
  ].slice(0, 24);

  const metrics = {
    operationalSourceCount: operationalSources.length,
    activeOpenLoopCount: activeLoops.length,
    reviewBacklogCount: reviewBacklog.length,
    overdueOpenLoopCount: overdueLoops.length,
    ownerlessHighPriorityCount: ownerlessHighPriorityLoops.length,
    outcomeMemoryCount: input.memoryObjects.filter((memory) => memory.properties?.memory_source === "open_loop_outcome").length,
  };

  return {
    generatedAt: new Date(currentTime).toISOString(),
    summary: summarizeFindings(findings, metrics),
    findings,
    metrics,
  };
}

export function companyDriftReportContent(input: {
  brainName: string;
  review: CompanyDriftReview;
}) {
  const { review } = input;
  return [
    `Company Drift Review - ${input.brainName}`,
    "",
    review.summary,
    "",
    "Metrics:",
    `- Operational sources: ${review.metrics.operationalSourceCount}`,
    `- Active open loops: ${review.metrics.activeOpenLoopCount}`,
    `- Loops needing review: ${review.metrics.reviewBacklogCount}`,
    `- Overdue open loops: ${review.metrics.overdueOpenLoopCount}`,
    `- Ownerless high-priority loops: ${review.metrics.ownerlessHighPriorityCount}`,
    `- Outcome memories: ${review.metrics.outcomeMemoryCount}`,
    "",
    "Findings:",
    ...(review.findings.length
      ? review.findings.map(
          (finding) => `- [${finding.severity}] ${finding.title}: ${finding.description} Next action: ${finding.suggestedAction}`,
        )
      : ["- No drift detected."]),
  ].join("\n");
}

function sourceFreshnessFindings(sources: SourceItem[], currentTime: number): CompanyDriftFinding[] {
  if (sources.length === 0) {
    return [
      {
        id: "source_freshness:none",
        alertType: "company_context_not_captured",
        title: "No operating sources have been captured",
        description: "Company Brain cannot run the company until real calls, emails, notes, docs, or product artifacts are being ingested.",
        severity: "warning",
        suggestedAction: "Add the latest founder call, customer conversation, investor email, or product note.",
      },
    ];
  }

  const latest = [...sources].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  const ageHours = (currentTime - new Date(latest.createdAt).getTime()) / (60 * 60 * 1000);
  if (ageHours <= 72) return [];

  return [
    {
      id: "source_freshness:stale",
      alertType: "company_context_stale",
      title: "Company Brain has stale operating context",
      description: `The newest operating source is ${Math.floor(ageHours)} hours old: ${latest.title}.`,
      severity: "warning",
      suggestedAction: "Ingest the latest company artifacts before trusting the operating read.",
      sourceItemIds: [latest.id],
    },
  ];
}

function overdueLoopFindings(overdueLoops: OpenLoop[]): CompanyDriftFinding[] {
  return overdueLoops.slice(0, 8).map((loop) => ({
    id: `overdue:${loop.id}`,
    alertType: "overdue_open_loop",
    title: `Overdue open loop: ${loop.title}`,
    description: loop.description,
    severity: loop.priority === "critical" ? "critical" : "warning",
    suggestedAction: loop.suggestedAction ?? "Update the owner, due date, or outcome so this loop does not silently drift.",
    openLoopIds: [loop.id],
    sourceItemIds: loop.sourceItemId ? [loop.sourceItemId] : undefined,
  }));
}

function reviewBacklogFindings(reviewBacklog: OpenLoop[]): CompanyDriftFinding[] {
  if (reviewBacklog.length === 0) return [];
  return [
    {
      id: "review_backlog",
      alertType: "loop_review_backlog",
      title: `${reviewBacklog.length} extracted loop${reviewBacklog.length === 1 ? "" : "s"} need review`,
      description: "Extracted loops are not committed work until a founder approves, edits, or dismisses them.",
      severity: reviewBacklog.length > 5 ? "warning" : "info",
      suggestedAction: "Review the loop backlog and approve only the loops that should become real operating commitments.",
      openLoopIds: reviewBacklog.slice(0, 10).map((loop) => loop.id),
    },
  ];
}

function ownerlessLoopFindings(loops: OpenLoop[]): CompanyDriftFinding[] {
  return loops.slice(0, 8).map((loop) => ({
    id: `ownerless:${loop.id}`,
    alertType: "ownerless_high_priority_loop",
    title: `High-priority loop has no owner: ${loop.title}`,
    description: loop.description,
    severity: loop.priority === "critical" ? "critical" : "warning",
    suggestedAction: "Assign an owner or explicitly dismiss it so the Brain is not tracking orphaned work.",
    openLoopIds: [loop.id],
    sourceItemIds: loop.sourceItemId ? [loop.sourceItemId] : undefined,
  }));
}

function priorityDriftFindings(sourceItems: SourceItem[], activeLoops: OpenLoop[]): CompanyDriftFinding[] {
  const latestDailyBrief = latestSourceByDomain(sourceItems, "daily_brief");
  const priorityTexts = extractPriorityTexts(latestDailyBrief);

  return priorityTexts
    .slice(0, 6)
    .filter((priorityText) => !hasRelatedActiveLoop(priorityText, activeLoops))
    .map((priorityText, index) => ({
      id: `priority_drift:${index}:${stableKey(priorityText)}`,
      alertType: "strategic_priority_drift",
      title: `Priority has no active loop: ${priorityText.split(":")[0].slice(0, 96)}`,
      description: `The latest daily brief names this priority, but no active open loop appears related: ${priorityText}`,
      severity: "warning",
      suggestedAction: "Create or attach an open loop so the priority has an owner and visible next step.",
      sourceItemIds: latestDailyBrief ? [latestDailyBrief.id] : undefined,
    }));
}

function commitmentDriftFindings(memoryObjects: MemoryObject[], openLoops: OpenLoop[]): CompanyDriftFinding[] {
  const trackedLoopTypes = new Set<OpenLoop["loopType"]>([
    "follow_up",
    "product",
    "sales",
    "investor",
    "engineering",
    "deal",
    "diligence",
    "crm",
    "other",
  ]);

  return memoryObjects
    .filter((memory) => memory.objectType === "commitment" && memory.status !== "done" && memory.status !== "closed")
    .slice(0, 8)
    .filter((memory) => !hasRelatedActiveLoop(memoryText(memory), openLoops, trackedLoopTypes))
    .map((memory) => ({
      id: `commitment:${memory.id}`,
      alertType: "commitment_without_active_loop",
      title: `Commitment lacks an active loop: ${memory.name.slice(0, 96)}`,
      description: memory.description,
      severity: "warning",
      suggestedAction: "Create an open loop or close the commitment with an outcome.",
      memoryObjectIds: [memory.id],
      sourceItemIds: memory.sourceItemId ? [memory.sourceItemId] : undefined,
    }));
}

function productInsightDriftFindings(memoryObjects: MemoryObject[], openLoops: OpenLoop[]): CompanyDriftFinding[] {
  const productLoopTypes = new Set<OpenLoop["loopType"]>(["product", "engineering", "marketing"]);
  return memoryObjects
    .filter(
      (memory) =>
        (memory.objectType === "product_insight" || memory.objectType === "insight") &&
        memory.properties?.memory_source !== "open_loop_outcome" &&
        memory.status !== "done" &&
        memory.status !== "closed",
    )
    .slice(0, 8)
    .filter((memory) => !hasRelatedActiveLoop(memoryText(memory), openLoops, productLoopTypes))
    .map((memory) => ({
      id: `insight:${memory.id}`,
      alertType: "insight_without_product_loop",
      title: `Insight has no product loop: ${memory.name.slice(0, 96)}`,
      description: memory.description,
      severity: "info",
      suggestedAction: "Turn the insight into a product, engineering, marketing, or validation loop.",
      memoryObjectIds: [memory.id],
      sourceItemIds: memory.sourceItemId ? [memory.sourceItemId] : undefined,
    }));
}

function riskDriftFindings(memoryObjects: MemoryObject[], openLoops: OpenLoop[]): CompanyDriftFinding[] {
  return memoryObjects
    .filter((memory) => memory.objectType === "risk" && memory.status !== "done" && memory.status !== "closed")
    .slice(0, 8)
    .filter((memory) => !hasRelatedActiveLoop(memoryText(memory), openLoops))
    .map((memory) => ({
      id: `risk:${memory.id}`,
      alertType: "risk_without_mitigation_loop",
      title: `Risk has no mitigation loop: ${memory.name.slice(0, 96)}`,
      description: memory.description,
      severity: "warning",
      suggestedAction: "Assign a mitigation loop or explicitly mark the risk as accepted/closed.",
      memoryObjectIds: [memory.id],
      sourceItemIds: memory.sourceItemId ? [memory.sourceItemId] : undefined,
    }));
}

function missingOutcomeFindings(openLoops: OpenLoop[]): CompanyDriftFinding[] {
  return openLoops
    .filter((loop) => terminalOpenLoopStatuses.has(loop.status) && !loop.outcome?.trim())
    .slice(0, 5)
    .map((loop) => ({
      id: `missing_outcome:${loop.id}`,
      alertType: "closed_loop_missing_outcome",
      title: `Closed loop is missing an outcome: ${loop.title.slice(0, 96)}`,
      description: "Terminal loops need an outcome so Arvya Company Brain can learn from what happened.",
      severity: "warning",
      suggestedAction: "Record the actual outcome, even if the loop was dismissed.",
      openLoopIds: [loop.id],
      sourceItemIds: loop.sourceItemId ? [loop.sourceItemId] : undefined,
    }));
}

function summarizeFindings(findings: CompanyDriftFinding[], metrics: CompanyDriftReview["metrics"]) {
  if (findings.length === 0) {
    return "No company drift detected from the current Brain context.";
  }
  const critical = findings.filter((finding) => finding.severity === "critical").length;
  const warnings = findings.filter((finding) => finding.severity === "warning").length;
  return `${findings.length} drift finding${findings.length === 1 ? "" : "s"} detected: ${critical} critical, ${warnings} warning, ${metrics.reviewBacklogCount} loop${metrics.reviewBacklogCount === 1 ? "" : "s"} awaiting review.`;
}

function isActiveLoop(loop: OpenLoop) {
  return activeOpenLoopStatuses.has(loop.status);
}

function isOperationalSource(source: SourceItem) {
  const domainType = source.metadata?.domain_type;
  return source.type !== "strategy_output" && (typeof domainType !== "string" || !strategyDomainTypes.has(domainType));
}

function isOverdueLoop(loop: OpenLoop, currentTime: number) {
  if (!loop.dueDate || !isActiveLoop(loop)) return false;
  return new Date(loop.dueDate).getTime() < currentTime;
}

function latestSourceByDomain(sources: SourceItem[], domainType: string) {
  return sources
    .filter((source) => source.metadata?.domain_type === domainType)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
}

function extractPriorityTexts(latestDailyBrief?: SourceItem) {
  if (!latestDailyBrief) return [];
  const structuredBrief = latestDailyBrief.metadata?.structured_brief as
    | { priorities?: Array<{ title?: unknown; detail?: unknown }> }
    | undefined;
  const structuredPriorities = structuredBrief?.priorities
    ?.map((priority) => [priority.title, priority.detail].filter((value): value is string => typeof value === "string").join(": "))
    .filter((priority) => priority.trim().length > 0);
  if (structuredPriorities?.length) return structuredPriorities;

  const prioritiesBlock = latestDailyBrief.content.split(/\n\nNew loops to review:/)[0]?.split(/\n\nPriorities:\n/)[1];
  return prioritiesBlock
    ? prioritiesBlock
        .split("\n")
        .map((line) => line.replace(/^-\s*/, "").trim())
        .filter(Boolean)
    : [];
}

function hasRelatedActiveLoop(text: string, loops: OpenLoop[], loopTypes?: Set<OpenLoop["loopType"]>) {
  return loops.some(
    (loop) =>
      isActiveLoop(loop) &&
      (!loopTypes || loopTypes.has(loop.loopType)) &&
      relatedEnough(text, openLoopText(loop)),
  );
}

function relatedEnough(target: string, candidate: string) {
  const targetTokens = textTokens(target);
  if (targetTokens.length === 0) return false;
  const candidateTokens = new Set(textTokens(candidate));
  const matches = targetTokens.filter((token) => candidateTokens.has(token)).length;
  return matches >= 2 || matches / Math.min(targetTokens.length, 6) >= 0.34;
}

function textTokens(value: string) {
  return Array.from(
    new Set(
      value
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, " ")
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length > 3 && !driftStopWords.has(token)),
    ),
  );
}

function openLoopText(loop: OpenLoop) {
  return [
    loop.title,
    loop.description,
    loop.suggestedAction,
    loop.owner,
    loop.sourceQuote,
    loop.outcome,
  ].filter(Boolean).join(" ");
}

function memoryText(memory: MemoryObject) {
  return [memory.name, memory.description, memory.sourceQuote].filter(Boolean).join(" ");
}

function stableKey(value: string) {
  return textTokens(value).slice(0, 5).join("-");
}
