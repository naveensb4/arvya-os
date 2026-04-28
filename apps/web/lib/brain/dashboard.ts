import type { BrainSnapshot, MemoryObject, OpenLoop, SourceItem } from "@arvya/core";
import type { ConnectorConfig, ConnectorSyncRun } from "@/lib/db/repository";

const strategyDomainTypes = new Set(["daily_brief", "weekly_learning_memo"]);
const closedLoopStatuses = new Set(["done", "dismissed", "closed"]);
const priorityRank = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
} satisfies Record<OpenLoop["priority"], number>;

export type DashboardModel = {
  latestDailyBrief?: SourceItem;
  operationalSources: SourceItem[];
  latestOperationalSource?: SourceItem;
  newOperationalSources24h: number;
  overdueLoops: OpenLoop[];
  reviewBacklog: OpenLoop[];
  dueSoonLoops: OpenLoop[];
  actionQueue: OpenLoop[];
  naveenActions: OpenLoop[];
  pbActions: OpenLoop[];
  suggestedActions: OpenLoop[];
  risks: MemoryObject[];
  questions: MemoryObject[];
  productInsights: MemoryObject[];
  outcomeLearnings: MemoryObject[];
  investorLoops: OpenLoop[];
  customerLoops: OpenLoop[];
  commandSummary: string;
  failedSyncs: number;
  enabledConnectors: ConnectorConfig[];
  failingConnectors: ConnectorConfig[];
  connectorHealth: string;
  brainHealth: "Healthy" | "Warning";
};

export function buildDashboardModel({
  snapshot,
  syncRuns,
  connectorConfigs,
  currentTime = Date.now(),
}: {
  snapshot: BrainSnapshot;
  syncRuns: ConnectorSyncRun[];
  connectorConfigs: ConnectorConfig[];
  currentTime?: number;
}): DashboardModel {
  const latestDailyBrief = snapshot.sourceItems.find(isDailyBriefSource);
  const operationalSources = snapshot.sourceItems.filter(isOperationalSource);
  const overdueLoops = snapshot.openLoops.filter((loop) => isOverdueLoop(loop, currentTime));
  const reviewBacklog = snapshot.openLoops.filter((loop) => loop.status === "needs_review");
  const dueSoonLoops = snapshot.openLoops.filter((loop) => isDueSoonLoop(loop, currentTime));
  const actionQueue = [...snapshot.openLoops].sort((a, b) => compareOpenLoopsForActionQueue(a, b, currentTime));
  const approvedActionQueue = actionQueue.filter((loop) => loop.status !== "needs_review");
  const naveenActions = approvedActionQueue.filter((loop) => ownedBy(loop, "Naveen")).slice(0, 5);
  const pbActions = approvedActionQueue.filter((loop) => ownedBy(loop, "PB")).slice(0, 5);
  const suggestedActions = approvedActionQueue.filter((loop) => loop.suggestedAction).slice(0, 5);
  const risks = snapshot.memoryObjects.filter((memory) => memory.objectType === "risk").slice(0, 5);
  const questions = snapshot.memoryObjects.filter((memory) => memory.objectType === "question").slice(0, 5);
  const productInsights = snapshot.memoryObjects
    .filter((memory) => memory.objectType === "product_insight" || memory.objectType === "insight")
    .slice(0, 5);
  const outcomeLearnings = snapshot.memoryObjects
    .filter((memory) => memory.properties?.memory_source === "open_loop_outcome")
    .slice(0, 5);
  const investorLoops = approvedActionQueue.filter((loop) => loop.loopType === "investor").slice(0, 5);
  const customerLoops = approvedActionQueue
    .filter((loop) => loop.loopType === "sales" || loop.loopType === "product")
    .slice(0, 5);
  const failedSyncs = syncRuns.filter((run) => run.status === "failed").length;
  const enabledConnectors = connectorConfigs.filter((config) => config.syncEnabled);
  const failingConnectors = connectorConfigs.filter((config) => config.status === "error");

  return {
    latestDailyBrief,
    operationalSources,
    latestOperationalSource: operationalSources[0],
    newOperationalSources24h: operationalSources.filter(
      (source) => currentTime - new Date(source.createdAt).getTime() < 24 * 60 * 60 * 1000,
    ).length,
    overdueLoops,
    reviewBacklog,
    dueSoonLoops,
    actionQueue,
    naveenActions,
    pbActions,
    suggestedActions,
    risks,
    questions,
    productInsights,
    outcomeLearnings,
    investorLoops,
    customerLoops,
    commandSummary: buildCommandSummary({
      overdueCount: overdueLoops.length,
      reviewCount: reviewBacklog.length,
      dueSoonCount: dueSoonLoops.length,
      sourceCount: operationalSources.length,
    }),
    failedSyncs,
    enabledConnectors,
    failingConnectors,
    connectorHealth: failingConnectors.length > 0
      ? `${failingConnectors.length} failing`
      : `${enabledConnectors.length} always-on`,
    brainHealth: failedSyncs > 0 || overdueLoops.length > 0 || failingConnectors.length > 0 ? "Warning" : "Healthy",
  };
}

export function isOperationalSource(source: SourceItem) {
  const domainType = source.metadata?.domain_type;
  return source.type !== "strategy_output" && (typeof domainType !== "string" || !strategyDomainTypes.has(domainType));
}

export function isDailyBriefSource(source: SourceItem) {
  return source.metadata?.domain_type === "daily_brief";
}

export function isOverdueLoop(loop: OpenLoop, currentTime = Date.now()) {
  if (!loop.dueDate || closedLoopStatuses.has(loop.status)) return false;
  return new Date(loop.dueDate).getTime() < currentTime;
}

export function isDueSoonLoop(loop: OpenLoop, currentTime = Date.now()) {
  if (!loop.dueDate || closedLoopStatuses.has(loop.status) || isOverdueLoop(loop, currentTime)) return false;
  const dueTime = new Date(loop.dueDate).getTime();
  return dueTime - currentTime <= 7 * 24 * 60 * 60 * 1000;
}

export function compareOpenLoopsForActionQueue(a: OpenLoop, b: OpenLoop, currentTime = Date.now()) {
  const aOverdue = isOverdueLoop(a, currentTime) ? 0 : 1;
  const bOverdue = isOverdueLoop(b, currentTime) ? 0 : 1;
  if (aOverdue !== bOverdue) return aOverdue - bOverdue;

  const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
  const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
  if (aDue !== bDue) return aDue - bDue;

  const priorityDelta = priorityRank[a.priority] - priorityRank[b.priority];
  if (priorityDelta !== 0) return priorityDelta;

  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

function ownedBy(loop: OpenLoop, owner: string) {
  return loop.owner?.trim().toLowerCase() === owner.toLowerCase();
}

function buildCommandSummary({
  overdueCount,
  reviewCount,
  dueSoonCount,
  sourceCount,
}: {
  overdueCount: number;
  reviewCount: number;
  dueSoonCount: number;
  sourceCount: number;
}) {
  if (overdueCount > 0) {
    return `${overdueCount} overdue action loop${overdueCount === 1 ? "" : "s"} need attention before anything else.`;
  }
  if (reviewCount > 0) {
    return `${reviewCount} extracted loop${reviewCount === 1 ? "" : "s"} need founder review before becoming real work.`;
  }
  if (dueSoonCount > 0) {
    return `${dueSoonCount} action loop${dueSoonCount === 1 ? "" : "s"} due in the next 7 days.`;
  }
  if (sourceCount === 0) {
    return "No user sources have been ingested yet. Add a transcript, email, note, or document to start the loop.";
  }
  return "No urgent loops. Keep adding source material so the Brain can surface the next useful action.";
}
