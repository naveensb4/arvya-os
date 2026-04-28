import { config } from "dotenv";
import { resetAiClientForTests } from "../lib/ai";
import { addSourceAndIngest, createBrain } from "../lib/brain/store";
import { closeDbForTests } from "../lib/db/client";
import { getRepository, resetRepositoryForTests } from "../lib/db/repository";
import type { BrainKind } from "@arvya/core";

config({ path: ".env.local", override: false, quiet: true });
config({ path: ".env", override: false, quiet: true });

function requireDatabaseUrl() {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error(
      "DATABASE_URL is required. Set it in .env.local before running pnpm seed:deal-brain.",
    );
  }
}

const sources: Array<{ title: string; content: string; type: "transcript" | "email" | "note" | "document" }> = [
  {
    title: "Acme Capital management meeting transcript",
    type: "transcript",
    content: `Date: 2026-04-23
Attendees: Maya Chen (Acme Capital), James Park (Acme Capital), PB (banker), Naveen (banker), Daniel Reyes (CEO, target company NorthBeam Industrial)

Maya Chen: Thanks for hosting management. Two things we still need: the diligence tracker by Friday, and the updated quality of earnings memo from your accountants.
PB: We can get the diligence tracker out by EOD Thursday. The QoE memo is being finalized by Bain - should be Tuesday next week.
James Park: We're going to want to dig into customer churn. The cohort table you sent has gaps for FY24 Q3.
Daniel Reyes: I can have the head of customer success on a follow-up call.
Maya Chen: Great. Also, please clarify the working capital adjustment formula in section 3.2 of the LOI draft - the current language is ambiguous.
Naveen: Noted. We'll send a redline by Wednesday.
Maya Chen: One more - we'd like a side letter on the management retention pool. Our IC is meeting Thursday.
Daniel Reyes: Understood, we'll prepare options.
PB: Our next process step is the second round bid by May 14. We have four other buyers in this round.
James Park: Acknowledged. We will have a decision by May 9 on whether to advance.`,
  },
  {
    title: "Process letter draft to bidders",
    type: "document",
    content: `NorthBeam Industrial - Round Two Process Letter (Draft)

Bidders: Acme Capital, Vector Partners, Highmark Industrial, Crane Holdings.

Round Two timeline:
- Diligence data room access: continues through May 12.
- Final management calls: scheduled May 5-9.
- Best and final bids due: May 14, 5pm ET.
- Sponsor IC presentations expected week of May 18.

Open items requiring banker action:
1. PB to send diligence tracker to all four bidders by Friday.
2. Naveen to coordinate working capital walk with Bain by Tuesday next week.
3. Naveen to circulate side letter on management retention to all bidders Friday.
4. Customer reference calls to be scheduled for Acme and Vector first; Highmark and Crane to follow.

Process risks: Highmark indicated they may drop given valuation gap. Crane has not engaged with the data room since April 18.`,
  },
  {
    title: "Email from Vector Partners - diligence questions",
    type: "email",
    content: `From: Sara Lin <slin@vectorpartners.com>
To: PB <pb@arvya.com>
Cc: Naveen <naveen@arvya.com>
Date: 2026-04-25
Subject: NorthBeam Round 2 - outstanding diligence

PB,

Three items we still need before we finalize our bid model:
1) Updated customer concentration table by NAICS code and contract length.
2) Confirmation of the contingent earn-out cap in the working capital adjustment.
3) An MNDA with Vector's commercial diligence vendor (Alpha Insights) so we can share the cohort data.

We're targeting close on May 14 but we need these to land by May 5 to keep IC on track.

Sara Lin
Vector Partners`,
  },
  {
    title: "Internal banker note - process risk review",
    type: "note",
    content: `Process risk snapshot - 2026-04-26

Decision: Continue running a four-bidder competitive process; do not narrow before May 9.
Key risks:
- Highmark: valuation gap is wide. Likely to drop. Naveen to call Mark Sullivan at Highmark this week to confirm intent.
- Crane: data room engagement has dropped. PB to follow up with Crane's deal lead.
- Acme: most engaged. They asked for the diligence tracker by Friday and a side letter on management retention.
- Vector: solid second-place. Need MNDA with Alpha Insights and the customer concentration table by May 5.

Open loops:
- Naveen owes diligence tracker by Friday.
- Bain owes quality of earnings memo Tuesday next week.
- Naveen owes working capital adjustment redline by Wednesday.
- Naveen owes management retention side letter to bidders Friday.
- PB owes Crane follow-up call.
- Naveen owes Highmark intent call.
- Vector needs MNDA with Alpha Insights.

Buyer next steps will be confirmed at the Monday IC prep with Daniel Reyes.`,
  },
];

async function main() {
  requireDatabaseUrl();
  resetRepositoryForTests();
  resetAiClientForTests();

  const repository = getRepository();
  if (repository.mode !== "supabase") {
    throw new Error(`Expected supabase repository, got ${repository.mode}`);
  }

  const kind: BrainKind = (process.argv[2] as BrainKind | undefined) ?? "sell_side";
  const name =
    process.argv[3] ??
    (kind === "sell_side"
      ? "NorthBeam Sell-Side Deal Brain"
      : kind === "buy_side"
      ? "NorthBeam Buy-Side Deal Brain"
      : "Deal Brain");

  console.log(`Seeding ${name} (${kind}) into live Supabase...`);

  const brain = await createBrain({
    name,
    kind,
    thesis:
      kind === "sell_side"
        ? "Sell-side process for NorthBeam Industrial. Track buyers, diligence, process letters, management meetings, and commitments. Every banker action is source-backed."
        : "Buy-side thesis for NorthBeam Industrial. Track diligence questions, expert calls, financial signals, risks, and IC questions. Every conviction is source-backed.",
  });

  console.log(`Created brain ${brain.id} - ${brain.name}`);

  for (const source of sources) {
    const t0 = Date.now();
    const sourceItem = await addSourceAndIngest({
      brainId: brain.id,
      title: source.title,
      type: source.type,
      content: source.content,
    });
    console.log(`  + ingested "${source.title}" (${source.type}) -> ${sourceItem.id} in ${(Date.now() - t0) / 1000}s`);
  }

  const [memoryObjects, openLoops, sourceItems, agentRuns] = await Promise.all([
    repository.listMemoryObjects(brain.id),
    repository.listOpenLoops(brain.id),
    repository.listSourceItems(brain.id),
    repository.listAgentRuns(brain.id),
  ]);

  console.log("");
  console.log("Seeded Deal Brain summary:");
  console.log(`  brainId       : ${brain.id}`);
  console.log(`  name          : ${brain.name}`);
  console.log(`  kind          : ${brain.kind}`);
  console.log(`  sourceItems   : ${sourceItems.length}`);
  console.log(`  memoryObjects : ${memoryObjects.length}`);
  console.log(`  openLoops     : ${openLoops.length}`);
  console.log(`  agentRuns     : ${agentRuns.length}`);
  console.log("");
  console.log(`Open at: http://localhost:3000/brains/${brain.id}`);
  console.log(`Open loops: http://localhost:3000/brains/${brain.id}/open-loops`);
  console.log(`Memory: http://localhost:3000/brains/${brain.id}/memory`);
  console.log(`Ask: http://localhost:3000/brains/${brain.id}/ask`);
}

main()
  .then(async () => {
    resetRepositoryForTests();
    resetAiClientForTests();
    await closeDbForTests();
  })
  .catch(async (error) => {
    console.error(error);
    try {
      await closeDbForTests();
    } catch {}
    process.exit(1);
  });
