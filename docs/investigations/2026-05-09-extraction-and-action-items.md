# Investigation: dirty extraction, broken action items, missing person drawer

Date: 2026-05-09
Branch: os-redesign
Scope: People/Companies extraction quality, Action Items (open_loops) UX & schema, People detail drawer

---

## TL;DR

Three bugs, one shared root cause. **Gmail / Outlook sources are hard-wired to skip the LLM and run a regex-only deterministic extractor.** That extractor was designed as a fallback for "no API key" demos, not as the production path. With 14 of 23 sources being Gmail, almost all your people/companies/action-items in the DB came from regex.

- "Hi Sudi", "From", "Eastern Time", "PM", "AM" — regex matched any `[A-Z][a-z]+` pair as a person.
- "Subject: Great speaking — next steps & intro to Shumit" — regex took the email subject sentence and stuffed it into `open_loops.title`. Same email content was re-ingested 3-6 times across reply chains, producing duplicate loops.
- 0 of 131 open loops have a `due_date`. 6 have an "owner", and the owner is the literal word "We" (extracted from "We will send a calendar invite").

Clearing the database alone will NOT fix this. The deterministic-fallback fork at `source-ingestion.ts:46-50` will re-produce the same garbage on the next ingest. We need to fix the extraction path, the email preprocessing, and the UI separately.

The People drawer is a clean UI gap: rows say "Row click will open the person page" but have no link or `onClick`, and there's no `people/[id]` route. Companies has `[entityId]/page.tsx` to copy from.

---

## Phase 1: evidence

### Database state (queried just now)

**memory_objects** (read: extracted entities)

| object_type     | count |
|-----------------|------:|
| fact            |    90 |
| person          |    65 |
| product_insight |    63 |
| insight         |    22 |
| commitment      |    15 |
| company         |     8 |
| ...             |       |

Of 65 people, **58 are confidence < 0.7** (regex fallback) and only **7 are ≥ 0.9** (real LLM extractions from non-Gmail sources, e.g. "Izzy (AllDay Design)" 0.95, "Naveen Siva" 0.95, "Prashant Babu" 0.95).

A representative slice of dirty rows:

```
 AI                  | 0.61 | (regex matched [A-Z]{2,3})
 AM / PM / PT / PST  | 0.61 | timezone abbreviations
 Hi Sudi             | 0.61 | email greeting
 Hi Naveen / Hi Jay  | 0.61 | email greetings (8 like this)
 From                |      | header label, multi-line capture
 On Tue / On Wed     |      | email reply quote markers
 Eastern Time        | 0.61 | capitalized phrase
 Get Outlook         |      | Outlook signature
 Customer Engagement | 0.61 | random capitalized phrase from email
```

**open_loops** (read: action items)

```
total | has_owner | has_due_date | has_action
  131 |     6     |       0      |    131
```

All 131 have `properties.extractedBy = 'deterministic_fallback'`. Zero due dates. Six "owners", all the literal word "We". Heavy duplication:

```
 Please let me know what you prefer.                          | 6 copies
 As a next step, I'd like to introduce you to Sumit Roy ...   | 5 copies
 We will send over a calendar invite shortly.                 | 5 copies
 Would Monday or Tuesday next week work for you?              | 4 copies
 Subject: Great speaking — next steps & intro to Shumit       | 3 copies
```

**source_items**

```
 google_calendar |  4
 slack           |  3
 gmail           | 14   ← all forced through regex
 google_drive    |  2
```

### What an actual ingested email looks like

`apps/web/lib/connectors/gmail.ts:245-248` builds the source content as:

```
Subject: RE: Great speaking today - Arvya
From: Sumit Roy <roysumit@msn.com>
To: Prashanth Babu <prashanthbabu1329@gmail.com>, ...
Date: Wed, 6 May 2026 17:28:10 +0000

It was great to chat with you both – congratulations on a stellar idea ...
```

So the content fed to the extractor literally contains `From:` and `Subject:` headers and quoted reply lines (`>>>`, `On Wed,...`). When the regex extractor sees `From:\nSumit Roy`, it splits on the colon and captures `From` as a two-word person name across the line break.

---

## Phase 2: root causes

### Root cause #1 — Gmail/Outlook are hard-coded to use the regex fallback

`apps/web/lib/workflows/source-ingestion.ts:46-50`:

```ts
const shouldUseDeterministicExtraction =
  sourceItem.content.length > LIVE_EXTRACTION_MAX_CHARS ||
  connectorType === "gmail" ||
  connectorType === "outlook";
const extractionAi = shouldUseDeterministicExtraction ? undefined : ai;
```

The intent was probably cost control or token-limit safety on long email threads, but the side effect is that **every** Gmail message — short or long — bypasses the LLM. Passing `undefined` as `ai` makes `ingestion-agent.ts` fall through to `fallbackMemory` / `fallbackOpenLoops`, which is regex.

### Root cause #2 — the regex itself is too permissive

`packages/agents/src/ingestion-agent.ts:56`:

```ts
const personPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}|[A-Z]{2,3})\b/g;
```

That matches:
- Any two consecutive capitalized words → "Hi Sudi", "Eastern Time", "Customer Engagement", "Innovation Hub", "Get Outlook"
- Any 2-3 letter all-caps token → "AI", "AM", "PM", "PT", "PST", "GMT", "RE", "IB", "PE", "TMT"

The `stopNames` set on line 68 only blocks 8 hardcoded strings. There's no email-greeting filter, no timezone filter, no header-label filter. There's also no semantic check — these are extracted as `objectType: "person"` regardless.

### Root cause #3 — open_loops are sentence-based, not action-based

`packages/agents/src/ingestion-agent.ts:362-381` — `fallbackOpenLoops`:

```ts
return splitSentences(source.content)
  .filter(isFallbackOpenLoop)
  .map((sentence) => ({
    title: sentence.length > 80 ? `${sentence.slice(0, 77)}...` : sentence,
    description: truncate(sentence, 1000),
    ...
  }));
```

It splits the email into sentences, filters by trigger phrases ("send", "share", "follow up", "can we", "please"), and uses **the sentence itself as the title and description**. The result is exactly what you saw in the screenshots: "Subject: Great speaking...", "Would Monday or Tuesday next week work for you?", "We will send a calendar invite shortly."

There's also no due-date extraction beyond a tiny weekday/month regex (`extractDueDate` at line 185). And the email's own `Date:` header isn't propagated as a creation date.

### Root cause #4 — no email-thread deduplication

When Sumit replies to Prashanth, the reply contains the original quoted email. Gmail's API returns each thread message separately; the connector ingests each one as a fresh source. The content of message N+1 contains all of message N's body inside `>>>`-quoted lines. So every sentence gets re-extracted multiple times.

131 open_loops from 14 emails = ~9 loops per email, mostly duplicates.

### Root cause #5 — the Today and Action Items pages can only render what's there

`apps/web/app/brains/[brainId]/page.tsx:627`:

```tsx
{loop.title || loop.description || "Untitled action"}
```

The DB titles ARE the email sentences, so that's what shows.

`apps/web/app/brains/[brainId]/open-loops/page.tsx:142-147` has tab buttons:

```tsx
<button type="button" className={styles.segOn}>Board view</button>
<button type="button">List</button>
<button type="button">Timeline</button>
```

`List` and `Timeline` are unwired — clicks do nothing, the page always renders the kanban. With 130 cards in the PROMISED column, the column scrolls vertically forever; that's what felt "horrible to scroll".

### Root cause #6 — People rows aren't clickable

`apps/web/app/brains/[brainId]/people/page.tsx:402-406`:

```tsx
{total > 0 ? (
  <p className={styles.hint}>
    {total} {total === 1 ? "person" : "people"} extracted from your
    sources. Row click will open the person page.
  </p>
) : null}
```

…but the `<tr>` elements have no `href`, no `onClick`, and there's no route at `apps/web/app/brains/[brainId]/people/[id]/`. Companies has `[entityId]/page.tsx` and `tabs.tsx` — that's the pattern to copy.

---

## Phase 3: will clearing the DB and re-onboarding fix it?

**No, and partially.**

What re-onboarding will NOT fix:
- Gmail will still go through regex (RC #1)
- The regex will still match "Hi Sudi" (RC #2)
- Open loops will still be email sentences (RC #3)
- Reply chains will still produce duplicates (RC #4)

What re-onboarding alone WOULD fix (after we fix the extractor):
- Removes 131 stale loops and 65 dirty people, so you start clean

So clearing the DB is necessary but not sufficient. We need to fix the pipeline first, then clear and re-ingest.

---

## Fix plan

The fixes are independent and ship in three phases. Phase A is the unblocker; B and C can ship in parallel after A.

### Phase A — Extraction quality (the must-fix)

**A1. Stop forcing Gmail/Outlook through regex.** Remove the `connectorType === "gmail"` short-circuit in `source-ingestion.ts:46-50`. Keep the `LIVE_EXTRACTION_MAX_CHARS` guard, but bump it (current 20K is fine for most emails). Long threads can chunk or summarize, but they shouldn't fall back to a worse extractor.

**A2. Pre-clean email content before extraction.** In `gmail.ts`, before stuffing the content, strip:
- Quoted reply blocks (lines starting with `>`, `On <date>, ... wrote:` and everything after)
- Email signatures (after `--`, `Sent from my iPhone`, `Get Outlook for ...`)
- Forwarded message banners
- Stop including `Subject:/From:/To:/Date:` as part of the body — promote these to `metadata` fields instead. The LLM gets them as structured input, the regex never sees them.

**A3. Tighten the regex fallback (defensive, in case AI is ever unavailable).** Add stop-list entries for: greeting prefixes (`Hi`, `Hey`, `Hello`, `Dear`, `Thanks`, `Thx`, `Best`, `Regards`), timezone abbreviations, days-of-week, months, `Get Outlook`, header labels (`From`, `To`, `Subject`, `Date`, `RE`). Also reject any "person" name where the first token is a recognized non-name word. These are 30 lines of code.

**A4. Email-thread dedup.** When the connector creates a source for message N, hash the cleaned body and check if message N-1 in the same thread already has it as a quoted prefix. Or, simpler: only ingest the latest message in each thread, and store earlier ones as metadata. (This is the bigger architectural call — flag for your decision.)

**A5. After A1-A4 ship, clear the dirty data and re-ingest.** A SQL script that wipes `memory_objects`, `open_loops`, `relationships`, `source_embeddings` for the brain (keeping `source_items` so we don't re-pull from Gmail) and re-runs `processSourceItemIntoBrain` on each source. Idempotent, runnable from the operations sidebar.

### Phase B — Action items UX (the Notion-table view)

**B1. Implement the `List` tab on `open-loops/page.tsx`.** Server component reads the same data, renders a `<table>` with sortable columns: Title / Owner / Due / Priority / Source / Status / Age. Default sort: due date ascending, nulls last. Each row is dense — no card padding — so 130 rows fit on screen.

**B2. Implement the `Timeline` tab.** Group loops into Overdue / This week / Next week / Later / No due date buckets. Within each bucket, rows are sorted by date.

**B3. Auto-extract due dates and timeline.** Once Phase A makes Gmail use the LLM, the prompt already asks for `dueDate` (ISO) and `dueHint` (natural-language). We need to:
   - Parse `dueHint` strings like "by Friday" / "next week" into ISO dates relative to the source's `occurredAt` (the email Date: header). Use `chrono-node` or write a small parser.
   - Persist resolved date into `open_loops.due_date`.

**B4. Slack nudge agent (the future part).** A new Inngest function `nudge-stale-loops` that runs daily:
   - Find loops with `due_date` in the next 24h or already overdue, status `open`/`needs_review`
   - Post to Slack via the existing `slack-bot` lib: "Heads up: 'Send Sumit the deck' is due tomorrow"
   - Mark `properties.lastNudgedAt` to avoid spamming
   - Schema is already there. This is purely additive code.

**B5. Brain-ranked sort on the Today page.** Right now `topActions = openLoops.slice(0, 5)` — that's just the first 5 in whatever order the DB returns. Replace with a ranking: overdue first, then due-soon, then by priority, then by recency. ~10 lines.

### Phase C — People detail drawer

**C1. Copy the Companies pattern.** Create `apps/web/app/brains/[brainId]/people/[id]/page.tsx` and `tabs.tsx` from `companies/[entityId]/`. Drawer sections:
   - Header: name, email, role, company chip, heat
   - Timeline: every source (sorted desc) that mentions this person, with snippet + date
   - Open loops where this person is owner or mentioned
   - Memory objects associated (decisions, commitments, feedback) tied to them
   - "Owe a reply" callout if there's an open loop you owe them

**C2. Make rows clickable.** Wrap the People page `<tr>` in a `<Link>` (or use `useRouter` if a side drawer is preferred over full-page navigation).

**C3 (optional, later).** Side drawer instead of full-page route, using a slide-in panel. Same data, different chrome. The full-page route ships first; drawer is a polish pass.

---

## Open decisions you'll want to make

These shape the plan but aren't bug-fixes:

1. **Gmail thread dedup model**: ingest the whole thread as one source, or each message separately with parent-child links?
2. **Regex fallback in production**: keep it as a "no API key" demo path only, or delete it entirely and require an API key for any real ingestion?
3. **People detail: full page or side drawer?** Companies uses a full page. Drawer is more modern but more work.
4. **Should we preserve the existing 7 high-confidence people during the wipe**, or do a true clean slate?
5. **Customer ships May 5 (per memory).** Today is May 9 — that deadline already passed; are we still in a critical-bugfix window or post-ship cleanup?

---

## Phase 4 (this is the implementation order, written as a queue)

1. A1 + A2 + A3 — regex stop list + remove gmail short-circuit + email cleaning. ~2 hours.
2. A5 — wipe + re-ingest script. Verify dirty data is gone and new data is clean. ~30 min.
3. C1 + C2 — people detail page + clickable rows. Mirror companies/[entityId]. ~1 hour.
4. B1 — List view on open-loops. ~1 hour.
5. B2 + B3 — Timeline view + dueHint resolution. ~2 hours.
6. B5 — Today page brain-ranking. ~10 min.
7. A4 — thread dedup (decision-dependent). ~2-4 hours.
8. B4 — Slack nudge agent. ~2 hours.

Total scope estimate: ~10-12 focused hours. Order is structured so the user-visible improvement compounds: after step 2, the data looks sane; after step 4, the UX feels right; after step 6, action items rank correctly. B4 and A4 can wait.

---

## Status

**STATUS:** DONE — investigation complete, plan ready for review.
**REASON:** Three reported issues all trace back to the deterministic-fallback fork in `source-ingestion.ts:46-50`. Database confirms the hypothesis: 58 of 65 people are regex-extracted, all 131 open loops are regex-extracted, and the email content fed to the regex includes RFC822 headers and quoted replies. UI gaps (List/Timeline tabs, People drawer) are real but small.
**RECOMMENDATION:** Walk through the plan, decide on the four open questions above (especially #1 and #5), then ship Phase A first.
