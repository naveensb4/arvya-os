# Company Brain, Closed-Loop AI OS Research

Date: 2026-05-10
Scope: Research synthesis for Arvya Company Brain and Arvya OS.

## Executive Takeaway

The market is converging on the same thesis Arvya already has: the winning enterprise AI product is not a chatbot, not search, and not a CRM wrapper. It is an operating layer that captures company context, resolves it into structured memory, lets agents act from that memory, tracks outcomes, and feeds the outcomes back into the system.

The important distinction:

- "Company brain" is the memory and context layer.
- "AI operating system" is the memory layer plus tools, workflow execution, permissions, observability, approvals, and learning loops.
- "Closed loop" is the core product behavior: source -> memory -> action -> outcome -> learning.

Arvya should keep building toward the line already in `VISION.md`: "make the company queryable and executable." The system becomes valuable when it notices dropped balls and reality drift before humans do.

## Market Landscape

### 1. Enterprise Search Plus Knowledge Graph

Companies like Glean and Notion AI are turning scattered workplace content into semantic search and source-backed answers.

Useful lessons:

- Connectors are table stakes: Slack, Drive, Gmail/Outlook, GitHub, Notion, CRM, calendar.
- Permission mirroring is non-negotiable. The AI must never reveal more than the user could access directly.
- Source citations create trust.
- Personalization matters: the assistant should know the employee, collaborators, habits, and context.
- The frontier is moving from search to "agentic search": answers that become actions.

References:

- Glean Enterprise Graph: https://www.glean.com/product/knowledge-graph
- Glean AI agents and assistant: https://www.glean.com/
- Notion Enterprise Search: https://www.notion.com/feature/enterprise-search
- Notion Agents: https://www.notion.so/product/agents

### 2. Agentic Knowledge Work Platforms

Dust, Sana, Hebbia, and Writer are not just answering questions. They let teams build custom agents over company knowledge and tools.

Useful lessons:

- Dust's "spaces" model is a clean pattern for scoped data access and agent access.
- Sana emphasizes no-code team agents connected to company knowledge and workflows.
- Hebbia's Matrix shows the value of multi-agent workflows for complex research, finance, legal, and diligence work.
- Writer shows that enterprises care about repeatable playbooks, brand/process governance, knowledge graphs, and controls.

References:

- Dust Enterprise: https://dust.tt/home/enterprise
- Dust access controls: https://docs.dust.tt/docs/access-controls-and-permissions
- Sana Agents: https://www.sanalabs.com/products/sana/ai-agents
- Hebbia Matrix: https://www.hebbia.com/product
- Hebbia multi-agent redesign: https://www.hebbia.com/blog/divide-and-conquer-hebbias-multi-agent-redesign
- Writer Agent: https://writer.com/blog/writer-agent/
- Writer Knowledge Graph: https://writer.mintlify.app/home/kg-chat

### 3. Ontology-Driven Operating Systems

Palantir AIP is the strongest reference for "AI operating system" as an enterprise control plane. The heart of the system is the ontology: nouns, verbs, permissions, workflows, lineage, and operational semantics.

Useful lessons:

- The ontology is not just a graph. It is how the system knows what business objects exist and what actions are allowed.
- "Nouns" are operational entities: people, companies, meetings, loops, deals, products, documents, tasks, decisions.
- "Verbs" are actions: draft follow-up, create issue, close loop, update CRM, notify founder, request approval.
- Every action needs lineage, access control, and auditability.

References:

- Palantir architecture overview: https://www.palantir.com/docs/foundry/architecture-center/overview
- Palantir AIP overview: https://www.palantir.com/docs/foundry/aip/overview
- Palantir Ontology system: https://palantir.com/docs/foundry/architecture-center/ontology-system/

### 4. Company Brain Startups

Newer tools are explicitly using "company brain" and "institutional brain" language: Connectry, SynOS, Cortex, SynkrAI, and iKawn.

Useful lessons:

- These products position memory as infrastructure for agents.
- The strongest claims center on cross-session memory, entity resolution, self-learning from execution traces, and multi-agent coordination.
- The pattern is "agents need a shared substrate." The substrate is more important than the model.

References:

- Connectry: https://connectry.io/
- SynOS: https://www.synos.in/
- Cortex: https://cortex.eco/
- SynkrAI Company Brain: https://www.synkrai.com/products/company-brain
- iKawn Intelligence OS: https://ikawn.com/intelligence-os/

## Technical Research

### 1. Closed-Loop Agent Architecture

A production agent loop generally looks like:

1. Perceive: ingest source or event.
2. Retrieve: collect relevant memory, policies, state, and tool context.
3. Reason: classify, plan, compare, or decide.
4. Act: write memory, draft response, call tool, create task, notify human.
5. Observe: track outcome, error, user response, or external state change.
6. Learn: update memory, preferences, workflows, and future recommendations.

This maps almost exactly to Arvya's desired loop:

Source -> Memory -> Open Loops -> Ask Brain -> Suggested Action -> Outcome -> Learning

References:

- Oracle AI agent loop: https://blogs.oracle.com/developers/what-is-the-ai-agent-loop-the-core-architecture-behind-autonomous-ai-systems
- Tredence agent loop: https://www.tredence.com/blog/ai-agent-loop
- Production agent architecture: https://conductor-oss.github.io/conductor/devguide/ai/production-agent-architecture.html

### 2. Memory Architecture

The strongest technical pattern is layered memory:

- Working memory: current run state, retrieved snippets, intermediate reasoning state.
- Episodic memory: events, meetings, past interactions, outcomes, execution traces.
- Semantic memory: durable facts, entities, decisions, relationships, source-backed claims.
- Procedural memory: workflows, playbooks, prompts, policies, preferences, "how we do things."
- Reflective memory: summaries, patterns, lessons, drift signals, recurring objections.

For Arvya, this should map to concrete tables and artifacts:

- `source_items`: raw evidence.
- `memory_objects`: typed claims and extracted objects.
- `canonical_entities`: resolved people/companies/projects.
- `entity_mentions`: evidence that an entity appeared in a source.
- `relationships`: typed edges between entities and memory objects.
- `open_loops`: unresolved commitments, asks, tasks, questions, and risks.
- `loop_outcome_log`: how loops advanced, resolved, contradicted, or stayed open.
- `agent_runs`: execution trace, prompt/model/tool/input/output/error/cost.
- `priorities`: stated company intent used for drift detection.
- `workflows`: durable state machines.

References:

- MemGPT: https://arxiv.org/abs/2310.08560v2
- MemGPT project: https://sky.cs.berkeley.edu/project/memgpt/
- LangGraph memory concepts: https://docs.langchain.com/
- Long-term LangGraph memory guide: https://atlan.com/know/long-term-memory-langchain-agents/

### 3. Beyond RAG: GraphRAG and Reasoning Graphs

Basic RAG is not enough for Arvya. It answers questions from documents, but closed-loop company operation requires entity resolution, relationship reasoning, priorities, workflows, and outcomes.

Arvya needs hybrid retrieval:

- Lexical search for exact names, emails, quotes, commit IDs, titles, and dates.
- Vector search for semantic similarity.
- Graph traversal for people, companies, relationships, source chains, and loop history.
- Structured filters for brain, permissions, source type, recency, status, owner, priority.
- Summaries and rollups for high-level questions.

GraphRAG is especially useful for "global" questions:

- What patterns keep appearing across customer calls?
- Which investor objections repeat?
- Which product insights recur but lack roadmap action?
- What changed in the company narrative over the last month?

References:

- Microsoft GraphRAG: https://www.microsoft.com/en-us/research/project/graphrag/
- GraphRAG blog: https://www.microsoft.com/en-us/research/blog/graphrag-new-tool-for-complex-data-discovery-now-on-github/
- GraphRAG GitHub: https://github.com/microsoft/graphrag

### 4. Context Engineering

The market has moved from "prompt engineering" to "context engineering." Most agent failures are not model failures. They are failures to provide the right context, in the right structure, at the right time, under the right permissions.

Arvya context packs should be explicit:

- User context: who is asking, role, permissions, preferences.
- Brain context: thesis, current priorities, active workflows.
- Source context: relevant source chunks and citations.
- Entity context: resolved people/companies and aliases.
- Loop context: active open loops and due dates.
- Outcome context: prior attempts and what happened.
- Policy context: allowed tools, approval requirements, risk tier.
- Output contract: required schema, citation rules, uncertainty behavior.

References:

- Mem0 context engineering: https://mem0.ai/blog/context-engineering-ai-agents-guide
- Weaviate context engineering: https://weaviate.io/blog/context-engineering
- Context graphs: https://www.ema.ai/blog/engineering-in-ai/context-graphs-building-persistent-memory-for-the-agentic-enterprise

### 5. Tool Layer and MCP

MCP is becoming the standard interface for agents to access tools and data. It matters because Arvya should not hardcode every integration directly into every agent.

Arvya should think in three integration categories:

- Connectors: ingest source data into the Brain.
- Tools: let agents perform actions in external systems.
- MCP servers: standardize tool discovery, auth, and execution.

Arvya's internal tools should eventually be exposed as tools too:

- `retrieve_brain_context`
- `create_open_loop`
- `close_open_loop`
- `draft_follow_up`
- `notify_slack`
- `create_linear_issue`
- `record_outcome`
- `update_entity`
- `run_drift_review`

References:

- MCP enterprise guide: https://the-ai-alliance.github.io/enterprise-MCP/
- Microsoft MCP for Copilot Studio: https://www.microsoft.com/en-us/microsoft-copilot/blog/copilot-studio/introducing-model-context-protocol-mcp-in-copilot-studio-simplified-integration-with-ai-apps-and-agents/
- Microsoft Graph MCP server: https://learn.microsoft.com/en-us/graph/mcp-server/overview

### 6. Evals, Observability, and Governance

Production AI operating systems need traces and evals before more autonomy.

Arvya should track:

- Retrieval quality: did the answer use the right sources?
- Citation quality: are important claims backed by source quotes?
- Extraction quality: did we identify the right people, companies, loops, and decisions?
- Entity resolution quality: did aliases merge correctly?
- Loop quality: did the system create the right open loops?
- Outcome quality: did the matcher close loops correctly?
- Action quality: did suggested actions help or annoy?
- Drift quality: did drift findings reflect reality?
- Cost and latency per workflow.
- Human override rate.

References:

- LangSmith: https://www.langchain.com/langsmith-platform
- W&B Weave agents: https://wandb.ai/site/agents
- Azure Foundry Control Plane: https://azure.microsoft.com/en-gb/products/ai-foundry/control-plane
- IBM watsonx Orchestrate observability: https://www.ibm.com/new/announcements/revolutionizing-ai-agent-management-with-ibm-watsonx-orchestrate-new-observability-and-governance-capabilities

### 7. Human-in-the-Loop Controls

Autonomy should be risk-tiered:

- Low risk: retrieve, summarize, classify, create draft, update internal metadata.
- Medium risk: create suggested open loop, mark "needs review", draft Slack nudge, draft follow-up.
- High risk: send external email, modify CRM, delete data, close high-value loop, notify customer/investor, change roadmap/source of truth.

For high-risk actions, the system should require approval with:

- What the agent wants to do.
- Why it wants to do it.
- Source evidence.
- Expected side effects.
- Alternatives.
- Approve/edit/reject controls.
- Audit trail binding approval to execution.

References:

- Human-in-the-loop controls: https://prefactor.tech/learn/enforcing-human-in-the-loop-controls
- Oracle runtime governance: https://blogs.oracle.com/ai-and-datascience/runtime-governance-enterprise-agentic-ai
- Agno HITL production controls: https://www.agno.com/blog/how-to-add-human-in-the-loop-controls-to-ai-agents-that-actually-run-in-production
- Particula approval guide: https://particula.tech/blog/human-in-the-loop-ai-agent-approval

## What Arvya Should Build

### Product Principle 1: Source-Backed or It Does Not Count

Every important answer, open loop, memory object, drift signal, and suggested action should trace back to source evidence. If the system cannot cite the source, it should mark the claim as uncertain or inferred.

### Product Principle 2: The Brain Should Notice, Not Just Answer

The killer behavior is proactive detection:

- "This promise has no owner."
- "This loop appears resolved by yesterday's email."
- "This customer asked for the same thing three times."
- "This priority is not reflected in this week's work."
- "This investor objection is recurring."
- "This source contradicts our current assumption."

### Product Principle 3: Memory Is Structured, Editable, and Audited

The Brain should not be a pile of embeddings. It should maintain typed, editable memory:

- People
- Companies
- Meetings
- Sources
- Decisions
- Claims
- Loops
- Outcomes
- Priorities
- Relationships
- Workflows

Users must be able to correct memory, and corrections should become training signal for future runs.

### Product Principle 4: The Unit of Value Is a Closed Loop

The best metric is not "number of sources ingested." It is "number of important loops detected, advanced, resolved, or prevented from dropping."

Core metrics:

- Open loops created per source.
- Loops closed with evidence.
- Average loop age.
- Overdue loop count.
- Dropped-ball saves.
- Human approval rate.
- False positive loop rate.
- Outcome match accuracy.

### Product Principle 5: Agents Should Use the Brain Before Acting

Every action agent should first retrieve:

- Source evidence.
- Relevant people and companies.
- Active loops.
- Prior outcomes.
- Current priorities.
- User permissions.
- Applicable workflow policy.

No agent should act from a raw prompt alone.

## Recommended Arvya Architecture

### 1. Source Ingestion Layer

Inputs:

- Manual paste/upload.
- Recall transcripts.
- Gmail/Outlook.
- Calendar.
- Slack/Teams.
- Google Drive/Notion.
- GitHub/Linear.
- AI transcripts from Cursor, Claude, ChatGPT.

Responsibilities:

- Normalize into `source_items`.
- Preserve raw evidence.
- Chunk and embed where useful.
- Extract metadata.
- Trigger ingestion workflow.

### 2. Memory Compiler

Responsibilities:

- Classify source.
- Extract typed memory.
- Resolve entities.
- Write mentions and relationships.
- Create open loops.
- Create suggested actions.
- Attach source quotes.
- Log agent run.

This is the heart of the Company Brain.

### 3. Entity and Relationship Graph

Responsibilities:

- Canonicalize people and companies.
- Maintain aliases.
- Store source-backed evidence.
- Track relationships.
- Enable graph retrieval.

The active `closed-loop-core.md` plan is directionally right: deterministic fast path, vector candidate retrieval, LLM reconciliation, evidence-backed merge, and review queue for uncertainty.

### 4. Open Loop Engine

Responsibilities:

- Create loops from sources.
- Deduplicate similar loops.
- Assign owner/priority/due date.
- Nudge before overdue.
- Detect loop advancement/resolution from later sources.
- Record outcomes.
- Escalate contradictions.

This should become the first "wow" system.

### 5. Ask Brain

Responsibilities:

- Answer questions with hybrid retrieval.
- Cite sources.
- Show uncertainty.
- Suggest next actions when relevant.
- Let users turn an answer into a loop, note, issue, or follow-up.

### 6. Daily Founder Brief

Responsibilities:

- Top priorities.
- New signals.
- Overdue loops.
- Follow-ups due.
- Important people/companies.
- Product/customer/investor patterns.
- Drift from stated priorities.
- Suggested actions for Naveen and PB.

The brief should be generated from memory plus open loops, not from raw source summaries alone.

### 7. Agent Control Room

Responsibilities:

- Show every agent run.
- Show inputs, outputs, source refs, model, cost, latency, status.
- Retry failed runs.
- Approve high-risk actions.
- Edit/correct memory.
- Track eval scores.

This is what turns the product from a demo into an operating system.

## Roadmap Recommendation

### Phase 1: Trustworthy Closed Loop

Goal: prove Arvya can run the company from the Brain.

Build:

- Entity resolver.
- Closed-loop matcher.
- Loop outcome log.
- Slack nudger.
- Source-backed loop detail history.
- Human review for uncertain closes.
- Basic evals for extraction, entity resolution, and loop matching.

Success metric:

- Naveen and PB trust the Brain to tell them what is open, what closed, what is overdue, and what changed.

### Phase 2: Company Graph and Drift

Goal: make company reality visible.

Build:

- Graph page that is actually useful: people, companies, sources, loops, decisions, relationships.
- Priority model.
- Drift review that compares current work and sources against priorities.
- Pattern detection across customer/investor/advisor conversations.
- Correction workflow that improves future extraction.

Success metric:

- The Brain can answer "what are we learning?" and "where are we drifting?" with evidence.

### Phase 3: Agent Actions

Goal: move from monitoring to execution.

Build:

- Draft follow-up from loop context.
- Create Linear/GitHub issue from product insight.
- Post Slack nudge and accept button responses.
- Update CRM/contact record.
- Schedule or prepare meeting.
- Approval gates by risk tier.

Success metric:

- The Brain reliably drafts or performs next actions from source-backed context.

### Phase 4: Arvya OS as Platform

Goal: generalize from Arvya Company Brain to future Deal Brain/customer brains.

Build:

- Brain templates.
- Connector marketplace.
- Workflow builder.
- MCP tool interface.
- Permission model per workspace/brain/source/tool.
- Eval dashboards.
- Reusable ontology for verticals.

Success metric:

- A new brain can be configured with domain-specific sources, memory types, workflows, and agents without rewriting the core.

## Strategic Warnings

### Do Not Build a Generic Chatbot

Generic chat is already commoditized. Arvya wins by remembering, monitoring, and closing loops.

### Do Not Treat Embeddings as the Brain

Embeddings are retrieval infrastructure. The Brain is structured, source-backed, editable operational memory.

### Do Not Delay Evals

Without evals, the team will not know whether the Brain is becoming more reliable or just more impressive in demos.

### Do Not Over-Autonomize Early

The first autonomy should be low-risk: draft, detect, nudge, suggest, and require approval. Let the system earn trust before it sends external messages or updates external systems.

### Do Not Let Connectors Become the Product

Connectors are necessary, but the differentiated product is what Arvya does after ingesting: resolve, remember, detect, act, and learn.

## Bottom Line

The research validates Arvya's thesis. The best version of Arvya OS is:

1. A source-grounded company memory layer.
2. A structured ontology of people, companies, decisions, commitments, loops, priorities, and outcomes.
3. A closed-loop engine that detects what changed and what needs action.
4. A workflow and agent runtime that can act with human approval.
5. An observability/evals layer that makes the system trustworthy.

The highest-leverage next step is not broad AI OS platform work. It is making the closed-loop core undeniable for Arvya's real operating data.
