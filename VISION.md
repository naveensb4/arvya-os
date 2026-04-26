# Arvya OS Vision

Arvya OS is the internal AI operating system for Arvya.

The immediate goal is to help Arvya run as an AI-native, closed-loop company. It should make our company queryable, keep Naveen and PB synchronized, capture every important source, track every open loop, and turn our conversations, product work, outreach, and strategy into compounding company memory.

This repo is being built for Arvya first.

The broader product vision is that the same architecture can later power Arvya’s customer-facing Deal Brain for investment banks and private equity firms. But the first priority is not to build a generic banking product. The first priority is to build an internal system that works extremely well for Arvya.

## Core Thesis

Arvya should use its own product philosophy to run itself.

Sources feed the Brain.  
The Brain creates structured memory.  
Agents act from the Brain.  
Open loops stay tracked until closed.  
Every important answer is source-backed.  
Every workflow produces an outcome.  
Every outcome feeds learning back into the Brain.

The Brain is the operating layer for the company.

It should answer questions like:

- What did we learn from recent customer calls?
- Which investors, advisors, or prospects need follow-up?
- What did we promise someone?
- What product insights keep coming up?
- What should Naveen and PB do today?
- What outreach angles are working?
- What marketing content should we create from real conversations?
- What product decisions are supported by actual evidence?
- What are we forgetting or dropping?

## What Arvya OS Is

Arvya OS is not a generic notes app, CRM, or chatbot.

It should feel like:

- NotebookLM for source-grounded intelligence
- A lightweight CRM for people, companies, investors, customers, advisors, and prospects
- A workflow command center for follow-ups and open loops
- An AI agent control room for ingestion, daily briefs, search, product insights, and outreach learning

The system should help Arvya capture, understand, and act on everything important happening across the company.

## First Brain: Arvya Company Brain

The first Brain is Arvya Company Brain.

It should ingest and understand:

- Call transcripts from investors, customers, advisors, VCs, product experts, and supporters
- Gmail and Outlook email threads that Naveen/PB select
- Google Drive files and notes
- Product strategy notes
- Outreach replies
- Claude and ChatGPT outputs
- GitHub/product decisions
- Website/blog drafts
- LinkedIn drafts
- Manual notes

The Brain should turn these sources into:

- People
- Companies
- Relationships
- Facts
- Decisions
- Product insights
- Investor/customer/advisor feedback
- Risks
- Open questions
- Commitments
- Follow-ups
- Suggested actions
- Source-backed answers

## Core Product Loop

The first version must prove this loop:

Source → Memory → Open Loops → Ask Brain → Suggested Action → Outcome

Example:

A transcript is uploaded.  
The system classifies it as an investor, customer, advisor, or product conversation.  
It summarizes the conversation.  
It extracts people, companies, key facts, decisions, insights, risks, commitments, and follow-ups.  
It creates open loops.  
It drafts a suggested follow-up.  
It makes the information searchable.  
It updates the daily brief.  
The outcome of the follow-up feeds back into the Brain.

That is the core loop.

## MVP Requirements

The MVP must work end-to-end for Arvya Company Brain.

1. Create or select Arvya Company Brain.
2. Add a source by pasting or uploading transcript, email, note, or document text.
3. Ingest the source through a LangGraph workflow.
4. Classify the source and infer the business context.
5. Extract structured memory: people, companies, facts, decisions, insights, risks, open questions, commitments, open loops, and suggested actions.
6. Save the source, extracted memory, relationships, open loops, and agent run logs.
7. Ask the Brain questions and receive source-backed answers.
8. Show source references for important claims.
9. Show open loops and follow-ups.
10. Generate a daily founder brief for Naveen and PB.
11. Show agent runs and workflow logs.
12. Keep the core primitives flexible enough to support future Deal Brain use cases, but do not prioritize customer-facing banking modules before the internal Arvya OS works.

## First Workflows

### 1. Source Ingestion

A user uploads or pastes a source. The system classifies it, summarizes it, extracts memory, identifies people and companies, detects open loops, suggests actions, and saves everything to the Brain.

### 2. Ask Brain

A user asks a question. The Brain retrieves relevant sources and memory, answers with citations, flags uncertainty, and recommends next actions when useful.

### 3. Open Loop Tracking

The system tracks unresolved follow-ups, intros, product tasks, investor asks, customer asks, marketing tasks, engineering tasks, and strategic questions until they are closed.

### 4. Daily Founder Brief

The system generates a daily founder brief showing:

- Top priorities today
- Overdue follow-ups
- Follow-ups due soon
- High-intent customers, investors, advisors, or prospects
- Product insights to act on
- Marketing/content opportunities
- Risks and dropped balls
- Suggested actions for Naveen
- Suggested actions for PB
- Questions the founders should resolve today

### 5. Follow-Up Drafting

After calls or important emails, the system should draft a follow-up, connect it to the source, and create an open loop. No external email should be sent without human approval.

## Internal Loops Arvya OS Should Support

### Customer / Prospect Loop

Call or email → pain points → product insights → follow-up → next meeting → outcome → Brain update

### Investor Loop

Investor call → concerns → follow-up → investor status → FAQ/narrative update → Brain update

### Advisor Loop

Advisor conversation → advice → intro opportunities → tasks → follow-up → Brain update

### Outreach Loop

Cold email → reply/no reply → classification → follow-up → meeting booked/not booked → messaging learning → Brain update

### Product Loop

Customer/advisor feedback → product insight → roadmap evidence → spec/GitHub issue → shipped feature → validation → Brain update

### Marketing Loop

Customer pain or market insight → LinkedIn/blog/outbound idea → draft → human approval → publish → performance learning → Brain update

### Founder Strategy Loop

Claude/ChatGPT output or founder note → strategy memory → decision/open loop → daily brief → execution → Brain update

## Architecture Direction

- Frontend portal: Next.js App Router, TypeScript, Tailwind
- Database: Supabase Postgres
- ORM: Drizzle
- Storage: Supabase Storage, with Google Drive references and sync later
- Vector search: pgvector
- Workflow orchestration: LangGraph
- Agent workers: Claude Agent SDK or Anthropic API first, with OpenAI support behind a provider abstraction
- Auth: Supabase Auth
- Deployment: Vercel
- Background jobs later: Inngest or Trigger.dev
- Observability: log every model and agent call in `agent_runs`

The system should be model-agnostic. Claude, GPT, and future models should sit behind a provider abstraction. Arvya OS should not depend on one model provider.

## Data Model Philosophy

Use flexible primitives instead of rigid hardcoded workflows.

Core primitives:

- Brain
- Source
- Memory Object
- Relationship
- Open Loop
- Workflow
- Agent Run
- Source Citation
- Outcome

For Arvya Company Brain:

- Sources include transcripts, emails, notes, strategy docs, outreach replies, GitHub decisions, and Claude/ChatGPT outputs.
- Memory objects include people, companies, investors, customers, advisors, product insights, decisions, risks, commitments, and marketing ideas.
- Open loops include follow-ups, intros, product tasks, investor asks, customer asks, marketing tasks, and engineering tasks.

These primitives should be designed so that they can later support customer-facing Deal Brain, but the current implementation should optimize for Arvya’s internal use case.

## Sequencing

Manual ingestion comes first.

Gmail, Outlook, Google Drive, GitHub, Slack, Teams, Recall, Replit campaign, CRM, and future Deal Brain connectors should plug into the same Source abstraction later.

Build order:

1. Arvya Company Brain template
2. Manual source ingestion
3. LangGraph source ingestion workflow
4. Structured memory extraction
5. Open loop creation
6. Ask Brain with source-backed answers
7. Daily founder brief
8. Agent run logging
9. Google Drive transcript ingestion
10. Gmail and Outlook selective ingestion
11. Outreach learning loop
12. Product roadmap loop
13. Marketing loop
14. Recall/calendar automation
15. Deal Brain productization later

## Quality Bar

Arvya OS should be trustworthy before it is fully autonomous.

The system should:

- Show sources
- Flag uncertainty
- Avoid hallucinating
- Ask for human approval before external actions
- Allow humans to edit extracted memory
- Track agent runs
- Track open loops until closed
- Preserve source history
- Support flexible workflows
- Keep Naveen and PB aligned

A Brain that is uncertain but source-backed is useful.  
A Brain that sounds confident without evidence is dangerous.

## Long-Term Product Context

The broader Arvya product vision is to bring this same architecture to investment banking and private equity teams as a living Deal Brain.

For customers, the Brain will eventually understand emails, calls, files, buyer trackers, CRM updates, VDR activity, diligence questions, management meetings, and process updates.

But that is not the first build target in this repo.

The first build target is Arvya Company Brain.

If we can make Arvya run in a source-backed, closed-loop, AI-native way, then we will have both:

1. A better operating system for ourselves
2. A stronger foundation for the customer-facing Deal Brain product

The Brain is the product.  
Sources are how the Brain learns.  
Agents are how the Brain acts.  
Open loops are how the Brain keeps work moving.  
Outcomes are how the Brain improves.