import type { MemoryObjectType, OpenLoopType, SourceItem } from "@arvya/core";

export type ClosedLoopExpectedMemory = {
  kind: MemoryObjectType;
  minCount: number;
  /**
   * Lowercase substrings or entity names that at least one memory of this kind
   * should mention (matched against name + description + sourceQuote).
   * The matcher requires that ALL entries in `entities` are mentioned by the
   * union of memories of this kind (not necessarily a single memory).
   */
  entities?: string[];
};

export type ClosedLoopExpectedOpenLoop = {
  kind?: OpenLoopType;
  /**
   * Lowercase substrings that at least one detected open loop should mention.
   */
  text: string;
};

export type ClosedLoopFixture = {
  id: string;
  title: string;
  classificationHint: SourceItem["type"];
  source: Pick<SourceItem, "title" | "type" | "content">;
  expected: {
    memories: ClosedLoopExpectedMemory[];
    openLoops: ClosedLoopExpectedOpenLoop[];
    /**
     * Question -> expected substring(s) that should appear in the answer once
     * the closed-loop verifier asks the brain about this fixture. Used by the
     * end-to-end verifier, not the eval runner.
     */
    askProbes?: Array<{ question: string; expectedSubstrings: string[] }>;
    /**
     * The fixture's "headline" open-loop title fragment to close in the
     * end-to-end verifier. Used to find the loop to close after ingestion.
     */
    closeableLoopTextFragment?: string;
    /**
     * Outcome text the verifier should attach when closing
     * `closeableLoopTextFragment`.
     */
    outcomeText?: string;
    /**
     * After closing the loop, what should appear in the brain's answer when
     * we re-ask a related question. Lowercase substrings.
     */
    postCloseExpectedSubstrings?: string[];
    /**
     * Question to re-ask after closing the loop, to demonstrate "learning".
     */
    postCloseQuestion?: string;
  };
};

export const closedLoopFixtures: ClosedLoopFixture[] = [
  {
    id: "investor-call-northstar",
    title: "Investor call (Northstar) with deck commitment + TAM objection",
    classificationHint: "transcript",
    source: {
      title: "Northstar Ventures intro call - April 24",
      type: "transcript",
      content: `Maya Chen (Northstar Ventures): I really like the Company Brain wedge for founder-led teams. The product feels different from generic CRMs.
Naveen: We're building Arvya so calls, emails, and decisions feed into one company memory and nothing falls through the cracks.
Maya Chen: My concern is TAM. Founder-led services firms feel narrow. How do you get to a billion-dollar outcome?
Liam Park (Northstar Ventures): I'd want to see the detailed market sizing before partner pitch.
Naveen: Fair pushback. We'll send the updated TAM-and-deck by Friday with the bottom-up numbers.
Liam Park: Great. Loop us in once that's ready.`,
    },
    expected: {
      memories: [
        { kind: "person", minCount: 2, entities: ["maya chen", "liam park"] },
        { kind: "company", minCount: 1, entities: ["northstar"] },
        { kind: "commitment", minCount: 1, entities: ["deck", "friday"] },
        { kind: "risk", minCount: 1, entities: ["tam"] },
      ],
      openLoops: [
        { text: "deck", kind: "investor_ask" },
        { text: "tam" },
      ],
      askProbes: [
        {
          question: "What did Maya Chen at Northstar Ventures say about TAM?",
          expectedSubstrings: ["tam", "northstar"],
        },
      ],
      closeableLoopTextFragment: "deck",
      outcomeText: "Sent updated TAM and deck to Maya and Liam at Northstar on April 28; bottom-up numbers attached.",
      postCloseQuestion:
        "Did we follow up with Northstar on the deck and TAM?",
      postCloseExpectedSubstrings: ["sent", "april 28"],
    },
  },
  {
    id: "customer-call-acme",
    title: "Customer discovery call (Acme) with product pains + pricing commit",
    classificationHint: "transcript",
    source: {
      title: "Acme Logistics discovery call - April 25",
      type: "transcript",
      content: `Priya Shah (Head of Ops, Acme Logistics): Today we lose context between our sales calls and the warehouse team - tickets get duplicated.
Marcus Vega (CTO, Acme Logistics): The other pain is that customer feedback dies in email threads; nobody sees the patterns.
Naveen: Arvya's company brain ingests calls, email, and tickets so context lives in one searchable layer.
Sara Liu (CFO, Acme Logistics): What does pricing look like for a 60-person team?
Naveen: I'll send a tailored pricing proposal for Acme by end of week.
Priya Shah: Perfect, we want to share it internally.`,
    },
    expected: {
      memories: [
        {
          kind: "person",
          minCount: 3,
          entities: ["priya shah", "marcus vega", "sara liu"],
        },
        { kind: "company", minCount: 1, entities: ["acme"] },
        {
          kind: "product_insight",
          minCount: 2,
          entities: ["context", "feedback"],
        },
        { kind: "commitment", minCount: 1, entities: ["pricing"] },
      ],
      openLoops: [
        { text: "pricing", kind: "customer_ask" },
      ],
      closeableLoopTextFragment: "pricing",
      outcomeText: "Sent tailored Acme pricing deck on April 28; Priya confirmed receipt.",
      postCloseQuestion: "Did we send Acme the pricing proposal?",
      postCloseExpectedSubstrings: ["pricing", "april 28"],
    },
  },
  {
    id: "advisor-email-castaway",
    title: "Advisor email with intro to make + design advice",
    classificationHint: "email",
    source: {
      title: "Advisor note from Elena Park - April 22",
      type: "email",
      content: `From: Elena Park <elena@castawaycap.com>
To: Naveen
Subject: Two thoughts after our call

Hey Naveen,

Two things from earlier:

1. Intro: I want to introduce you to David Kim at Atlas Founders - he's running the founder operations program and is exactly your ICP. I'll loop you in on email this week.

2. Advice: The strongest pitch is "founder operating memory" - keep it crisp. Don't try to be a project tracker too. Focus the demo on memory + ask-brain.

Excited to keep helping.

Elena`,
    },
    expected: {
      memories: [
        { kind: "person", minCount: 2, entities: ["elena park", "david kim"] },
        { kind: "advisor_feedback", minCount: 1, entities: ["founder"] },
      ],
      openLoops: [
        { text: "david kim", kind: "intro" },
      ],
    },
  },
  {
    id: "internal-strategy-note",
    title: "Internal strategy note from Naveen with priority + decision",
    classificationHint: "note",
    source: {
      title: "Naveen strategy note - April 27",
      type: "note",
      content: `Priority for this sprint: ship the closed-loop core (source -> memory -> open loops -> ask-brain -> outcome -> learning) before adding any new connectors.

Decision: We will NOT add Slack ingestion this sprint. Calls + email + manual notes is enough to prove the loop. Slack is post-pilot.

Open question: Do we need a separate "outcome" memory kind or just close the open loop with an outcome string? Leaning toward outcome-as-memory so it shows up in retrieval.`,
    },
    expected: {
      memories: [
        { kind: "decision", minCount: 1, entities: ["slack"] },
        { kind: "question", minCount: 1, entities: ["outcome"] },
      ],
      openLoops: [
        { text: "closed-loop", kind: "task" },
      ],
    },
  },
  {
    id: "outreach-reply-positive",
    title: "Outreach reply (positive) asking to schedule",
    classificationHint: "email",
    source: {
      title: "Reply from Jamie at Bluebird Foods",
      type: "email",
      content: `From: Jamie Ortega <jamie@bluebirdfoods.com>
To: Naveen
Subject: Re: Founder memory layer for ops teams

Hi Naveen,

This sounds genuinely useful. Our team at Bluebird Foods loses too much customer signal between calls and Slack.

Can we set up 30 minutes next week? Tuesday or Wednesday afternoon both work for me.

Thanks,
Jamie`,
    },
    expected: {
      memories: [
        { kind: "person", minCount: 1, entities: ["jamie"] },
        { kind: "company", minCount: 1, entities: ["bluebird"] },
      ],
      openLoops: [
        { text: "schedule", kind: "follow_up" },
      ],
    },
  },
];
