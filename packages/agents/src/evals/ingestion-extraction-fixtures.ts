import type { SourceItem } from "@arvya/core";

type ExpectedMemory = {
  objectType: string;
  text: string;
};

type ExpectedLoop = {
  text: string;
  loopType?: string;
  requiresHumanApproval?: boolean;
};

type ExpectedRelationship = {
  fromName: string;
  toName: string;
};

export type IngestionExtractionFixture = {
  id: string;
  title: string;
  source: Pick<SourceItem, "title" | "type" | "content">;
  expected: {
    memories: ExpectedMemory[];
    openLoops: ExpectedLoop[];
    relationships: ExpectedRelationship[];
  };
};

export const ingestionExtractionFixtures: IngestionExtractionFixture[] = [
  {
    id: "company-brain-product-investor-call",
    title: "Investor/product call with commitments and risks",
    source: {
      title: "Northstar / Bluebird Company Brain call",
      type: "transcript",
      content: `Maya Chen at Northstar Ventures: Arvya should not position as a generic CRM; the wedge is the Company Brain that remembers calls, emails, and decisions.
Naveen: We decided to prioritize call and email ingestion before dashboards.
Samir Patel from Bluebird Foods said their sales team loses context when customer feedback is buried in calls.
Priya Iyer committed to send Maya the SOC 2 timeline by Friday.
Maya flagged a risk: security review will block expansion if audit logs are not visible.
Open loop: Naveen will introduce Maya to PB next week.`,
    },
    expected: {
      memories: [
        { objectType: "person", text: "Maya Chen" },
        { objectType: "company", text: "Northstar Ventures" },
        { objectType: "decision", text: "prioritize call and email ingestion" },
        { objectType: "commitment", text: "send Maya the SOC 2 timeline" },
        { objectType: "risk", text: "security review will block expansion" },
        { objectType: "product_insight", text: "loses context when customer feedback is buried" },
      ],
      openLoops: [
        { text: "send Maya the SOC 2 timeline", loopType: "follow_up", requiresHumanApproval: true },
        { text: "introduce Maya to PB", loopType: "intro", requiresHumanApproval: true },
      ],
      relationships: [
        { fromName: "Maya Chen", toName: "Northstar Ventures" },
        { fromName: "Samir Patel", toName: "Bluebird Foods" },
      ],
    },
  },
  {
    id: "advisor-customer-email",
    title: "Advisor/customer email with product request and open loop",
    source: {
      title: "Pilot follow-up from Harbor Bank Advisors",
      type: "email",
      content: `From: Jordan Lee, Harbor Bank Advisors
To: Naveen
Subject: Orion pilot notes

Jordan Lee from Harbor Bank Advisors: Customer Orion Health wants the onboarding checklist inside Arvya, not in a spreadsheet.
We approved using the investor update as the weekly Company Brain digest.
Can you send the revised pilot plan to Orion Health by Tuesday?
Advisor Elena Park warned that the ICP is too broad unless we focus on founder-led services firms.`,
    },
    expected: {
      memories: [
        { objectType: "person", text: "Jordan Lee" },
        { objectType: "company", text: "Harbor Bank Advisors" },
        { objectType: "company", text: "Orion Health" },
        { objectType: "product_insight", text: "onboarding checklist inside Arvya" },
        { objectType: "decision", text: "weekly Company Brain digest" },
        { objectType: "insight", text: "ICP is too broad" },
      ],
      openLoops: [
        { text: "send the revised pilot plan", loopType: "sales", requiresHumanApproval: true },
      ],
      relationships: [{ fromName: "Jordan Lee", toName: "Harbor Bank Advisors" }],
    },
  },
];
