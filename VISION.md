# Arvya OS Vision

Arvya OS is the AI operating system for Arvya.

The goal is not a better notes app, CRM, dashboard, or deal tracker. The goal is for Arvya Company Brain to run the entire company: every important artifact captured, every decision source-backed, every open loop monitored, every workflow executable by agents, and every outcome fed back into company memory.

Arvya should become a closed-loop company by default.

Every meeting, email, call, ticket, document, repo change, customer interaction, investor conversation, outreach reply, marketing idea, and strategy note should become legible to an intelligence layer that can reason across all of it. The Brain should know what happened, what was promised, what changed, what is blocked, what should happen next, and whether the company is drifting from its stated priorities.

This repo is being built for Arvya first. Deal Brain is a future vertical product powered by the same architecture. It is not the primary product target until Arvya Company Brain works extremely well.

## Core Thesis

The best AI-native companies make themselves queryable.

Arvya OS should make the company queryable and executable:

Sources feed the Brain.  
The Brain creates structured memory.  
Memory creates open loops, workflows, risks, decisions, and suggested actions.  
Agents act from the Brain.  
Every important answer is source-backed.  
Every workflow produces an outcome.  
Every outcome feeds learning back into the Brain.

The Brain is the operating layer for the company. It should close the loop between what Arvya says it is doing, what is actually happening, and what should happen next.

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

- NotebookLM for source-grounded company intelligence
- A living CRM for people, companies, investors, customers, advisors, and prospects
- A command center for follow-ups, risks, decisions, tasks, and open loops
- An AI agent control room for ingestion, briefs, search, product insights, outreach learning, and execution
- A company memory layer that gets smarter every time Arvya acts

The system should help Arvya capture, understand, monitor, and act on everything important happening across the company.

## First Brain: Arvya Company Brain

The first Brain is Arvya Company Brain.

It should ingest and understand:

- Call transcripts from investors, customers, advisors, VCs, product experts, and supporters
- Gmail and Outlook email threads that Naveen/PB select
- Google Drive files and notes
- Slack, Teams, Linear, GitHub, Notion, and other operating artifacts as connectors come online
- Product strategy notes
- Outreach replies
- Claude and ChatGPT outputs
- GitHub/product decisions
- Website/blog drafts
- LinkedIn drafts
- Manual notes
- Customer support, sales, product, engineering, and marketing artifacts

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

The bar is not "can answer questions about uploaded notes." The bar is "can operate from the full company context and notice when reality diverges from the plan."

## Company-Wide Source Coverage

Arvya Company Brain should eventually see every durable artifact that matters:

- Meetings and calls: Recall transcripts, calendar context, attendees, topics, commitments, and follow-ups
- Email: Gmail and Outlook threads, replies, investor/customer/advisor context, and promised next steps
- Chat: Slack and Teams channels, decisions, blockers, async asks, and dropped balls
- Work tracking: Linear or equivalent tickets, specs, owners, status changes, and shipped outcomes
- Code and product: GitHub issues, PRs, commits, product decisions, regressions, and technical risks
- Docs and knowledge: Google Drive, Notion, PDFs, memos, pitch drafts, strategy docs, and research
- GTM: CRM records, outreach campaigns, replies, meetings booked, objections, and messaging performance
- AI work: Claude, ChatGPT, Cursor, agent transcripts, generated specs, and decisions made with AI assistance

Every connector should normalize into the same source abstraction so the Brain can reason across systems instead of trapping context inside tool silos.

## Closed-Loop Operating System

Arvya OS must be a closed-loop system, not a passive archive.

An open-loop company makes a decision, works for a while, and later hopes someone checks whether the outcome happened.

A closed-loop company continuously:

1. Captures what happened.
2. Compares it to what should be happening.
3. Detects gaps, risks, contradictions, and missed commitments.
4. Recommends or drafts the next action.
5. Tracks whether the action happened.
6. Feeds the outcome back into memory.

The Brain should proactively flag things like:

- We promised a customer a follow-up and nobody owns it.
- A product insight has appeared in four calls but is not on the roadmap.
- An investor objection keeps recurring and the narrative has not changed.
- A GitHub issue shipped but the originating customer was never told.
- Outreach replies are strongest for one angle, but the current campaign is using another.
- A strategic priority was stated last week, but current work is drifting away from it.
- A meeting created three tasks, but only one became an open loop.

## Core Product Loop

The first version must prove this loop:

Source → Memory → Open Loops → Ask Brain → Suggested Action → Outcome → Learning

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

The product is not done until that loop works reliably on real Arvya operating data.

## MVP Requirements

The MVP must work end-to-end for Arvya Company Brain. It should be judged by whether Naveen and PB can use it to run the company, not by whether the demo looks good.

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
12. Review company drift: compare current activity against active priorities, customer commitments, roadmap, investor narrative, and unresolved risks.
13. Close loops with outcomes, learn from the outcome, and update memory.
14. Keep the core primitives flexible enough to support future Deal Brain use cases, but do not prioritize customer-facing banking modules before the internal Arvya OS works.

## Definition of 100% Working

Arvya Company Brain works when it can be trusted as the company operating layer.

Minimum bar:

- Capture: important company context can enter the Brain from manual sources and the highest-value connectors.
- Normalize: all sources become searchable, citeable, typed company memory.
- Retrieve: answers use the best available evidence, cite sources, and admit uncertainty.
- Monitor: open loops, risks, promises, tasks, and decisions remain visible until resolved.
- Act: the system can draft briefs, follow-ups, specs, issues, and next actions for human approval.
- Learn: outcomes update memory and future recommendations.
- Align: Naveen and PB can ask "what should we do today?" and get a source-backed operating answer.
- Audit: every meaningful agent action is logged with inputs, outputs, model, source references, and status.
- Correct: humans can edit memory, close loops, override suggestions, and see what changed.

If any of these fail, the system is not yet the AI operating system. It is still a prototype.

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

### 6. Company Drift Review

The system compares current activity against stated priorities, roadmap, investor narrative, customer commitments, and open risks. It should surface contradictions, stale priorities, missing owners, and work that no longer matches the company plan.

### 7. Spec and Issue Generation

When product insights or customer asks become clear, the Brain should generate source-backed specs, GitHub or Linear issues, acceptance criteria, and owner recommendations. Product work should stay connected to the original customer evidence.

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

### Engineering Loop

Product insight or bug → source-backed spec → issue/PR → shipped change → customer/advisor notified → validation → Brain update

### Company Alignment Loop

Weekly priorities → active work → drift detection → brief → decision → owner/action → outcome → Brain update

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

The architecture should support a universal Source abstraction:

- Every connector writes durable source records.
- Every source can be chunked, embedded, cited, and reprocessed.
- Every extracted memory object links back to source evidence.
- Every workflow and agent run records the sources it used.
- Every outcome updates the relevant memory objects, open loops, and relationships.

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
- Priority
- Task
- Artifact
- Integration Account

For Arvya Company Brain:

- Sources include transcripts, emails, notes, strategy docs, outreach replies, chat messages, work tickets, docs, GitHub decisions, and Claude/ChatGPT outputs.
- Memory objects include people, companies, investors, customers, advisors, product insights, decisions, risks, commitments, and marketing ideas.
- Open loops include follow-ups, intros, product tasks, investor asks, customer asks, marketing tasks, engineering tasks, and unresolved strategic questions.
- Artifacts include briefs, specs, memos, emails, issues, PR summaries, call summaries, campaign learnings, roadmap evidence, and decision records.

These primitives should be designed so that they can later support customer-facing Deal Brain, but the current implementation should optimize for Arvya’s internal use case.

## Sequencing

Manual ingestion comes first.

Then the company surface area should come online in priority order. Gmail, Outlook, Recall/calendar, Google Drive, GitHub, Slack, Teams, Linear, Notion, Replit campaign data, CRM, and future Deal Brain connectors should all plug into the same Source abstraction.

Build order:

1. Arvya Company Brain template
2. Manual source ingestion
3. LangGraph source ingestion workflow
4. Structured memory extraction
5. Open loop creation
6. Ask Brain with source-backed answers
7. Daily founder brief
8. Agent run logging
9. Outcome capture and loop closing
10. Company drift review
11. Recall/calendar automation
12. Gmail and Outlook selective ingestion
13. Google Drive ingestion
14. GitHub/product loop
15. Outreach learning loop
16. Product roadmap loop
17. Marketing loop
18. Slack/Teams operating context
19. Linear/Notion/CRM connectors
20. Deal Brain productization later

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
- Detect drift between company priorities and actual work
- Explain why it recommends an action
- Separate facts, inferences, and suggestions
- Never hide unresolved commitments

A Brain that is uncertain but source-backed is useful.  
A Brain that sounds confident without evidence is dangerous.

## Product Judgment

The correct product instinct is to make Arvya Company Brain brutally useful internally before widening the customer product.

Do not build broad "AI OS" theater. Build the concrete operating system that makes Arvya harder to drop, forget, misalign, or slow down.

The daily question the system should answer is:

What does Arvya know, what is unresolved, what is drifting, and what should happen next?

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