import type { BrainKind, SourceType } from "./types";

export type BrainTemplate = {
  kind: BrainKind;
  name: string;
  description: string;
  thesisStarter: string;
  defaultSourceTypes: SourceType[];
  defaultWorkflows: WorkflowDefinition[];
  memoryLensOrder: string[];
};

export type WorkflowDefinition = {
  slug: string;
  label: string;
  description: string;
  trigger: "manual" | "on_source" | "scheduled";
  status: "live" | "planned";
};

const sharedWorkflows: WorkflowDefinition[] = [
  {
    slug: "source_ingestion",
    label: "Source Ingestion",
    description:
      "Classify, summarize, and extract people, companies, decisions, insights, open loops, and suggested actions from a new source.",
    trigger: "on_source",
    status: "live",
  },
  {
    slug: "ask_brain",
    label: "Ask Brain",
    description:
      "Retrieve relevant memory and answer the question with source citations and uncertainty flagged.",
    trigger: "manual",
    status: "live",
  },
];

export const brainTemplates: BrainTemplate[] = [
  {
    kind: "company",
    name: "Arvya Company Brain",
    description:
      "Internal operating brain that compounds investor, customer, advisor, product, marketing, and engineering context.",
    thesisStarter:
      "A living operating brain for Arvya that compounds every investor, customer, advisor, product, and engineering signal into a single source-backed memory.",
    defaultSourceTypes: [
      "transcript",
      "email",
      "note",
      "document",
      "github",
      "strategy_output",
      "web",
      "manual",
    ],
    defaultWorkflows: [
      ...sharedWorkflows,
      {
        slug: "daily_founder_brief",
        label: "Daily Founder Brief",
        description:
          "Generate a daily brief for Naveen and PB with priorities, overdue follow-ups, high-intent signals, product insights, and risks.",
        trigger: "scheduled",
        status: "live",
      },
      {
        slug: "follow_up_drafts",
        label: "Follow-up Drafting",
        description:
          "Draft follow-up messages for open loops; nothing leaves the system without human approval.",
        trigger: "manual",
        status: "live",
      },
    ],
    memoryLensOrder: [
      "decision",
      "open_loop",
      "suggested_action",
      "product_insight",
      "insight",
      "person",
      "company",
      "fact",
    ],
  },
  {
    kind: "sell_side",
    name: "Sell-Side Deal Brain",
    description:
      "Living brain for an investment banking sell-side process: buyers, diligence, trackers, management meetings, and process risks.",
    thesisStarter:
      "Living brain for this sell-side process. Track buyers, diligence questions, management meetings, process letters, and commitments. Keep every banker action source-backed.",
    defaultSourceTypes: ["transcript", "email", "document", "note", "manual"],
    defaultWorkflows: [
      ...sharedWorkflows,
      {
        slug: "buyer_follow_up",
        label: "Buyer Follow-up",
        description:
          "After buyer calls or emails, surface diligence asks, draft replies, and track commitments.",
        trigger: "on_source",
        status: "planned",
      },
      {
        slug: "process_brief",
        label: "Daily Process Brief",
        description:
          "Daily status brief: buyer follow-ups, diligence questions, upcoming meetings, process risks, and recommended banker actions.",
        trigger: "scheduled",
        status: "planned",
      },
    ],
    memoryLensOrder: [
      "open_loop",
      "decision",
      "suggested_action",
      "person",
      "company",
      "insight",
      "fact",
      "product_insight",
    ],
  },
  {
    kind: "buy_side",
    name: "Buy-Side / PE Deal Brain",
    description:
      "Living brain for sponsor diligence, thesis tracking, IC prep, and portfolio monitoring.",
    thesisStarter:
      "Living brain for this investment thesis. Track diligence findings, expert calls, financial signals, risks, and IC questions. Keep every conviction source-backed.",
    defaultSourceTypes: ["transcript", "email", "document", "note", "manual"],
    defaultWorkflows: [
      ...sharedWorkflows,
      {
        slug: "diligence_open_loops",
        label: "Diligence Open Loops",
        description:
          "Track open diligence questions, owners, and source evidence until each is resolved.",
        trigger: "on_source",
        status: "planned",
      },
      {
        slug: "ic_brief",
        label: "IC Brief",
        description:
          "Generate the IC brief with thesis, evidence, risks, and outstanding questions.",
        trigger: "manual",
        status: "planned",
      },
    ],
    memoryLensOrder: [
      "decision",
      "open_loop",
      "insight",
      "suggested_action",
      "company",
      "person",
      "fact",
      "product_insight",
    ],
  },
];

export function getBrainTemplate(kind: BrainKind): BrainTemplate {
  return brainTemplates.find((template) => template.kind === kind) ?? brainTemplates[0];
}
