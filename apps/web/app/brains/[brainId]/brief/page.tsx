import Link from "next/link";
import styles from "./page.module.css";

// TODO: wire to GET /api/brains/[brainId]/briefs/latest (Phase 3.4 endpoint).
// Until that endpoint is built, the page renders the prototype's editorial
// content so designers and stakeholders can review layout and tone without
// a backing brief generator. The shape of `placeholderBrief` mirrors the
// DailyBrief type the API will return: swapping in real data is a one-line
// change in `getLatestBrief()`.

type Cite = { label: string; href?: string };

type BriefCard = {
  title: string;
  pill?: { variant: "gold" | "warn" | "ok" | "default"; text: string };
  paragraphs: Array<string | { quote: string; who: string } | { cites: Cite[] }>;
  accent?: boolean;
  sources: Cite[];
};

type ActionItem = {
  text: string;
  cites?: Cite[];
};

type ActionPerson = {
  initial: string;
  name: string;
  variant?: "gold" | "dark";
  items: ActionItem[];
};

type BriefPromise = {
  what: string;
  to: string;
  who: string;
  due: string;
  due_late?: boolean;
  status: { variant: "default" | "gold" | "warn" | "ok"; text: string };
};

type Question = {
  text: string;
  cites: string[];
};

type DailyBrief = {
  brief_number: number;
  delivered_to: string[];
  delivered_at_label: string;
  reading_time_min: number;
  signal: number;
  date_label: string;
  compiled_label: string;
  headline: string;
  lede: Array<string | { strong: string }>;
  overnight_intro: { eyebrow: string; title: string };
  overnight_cards: BriefCard[];
  today_intro: { eyebrow: string; title: string };
  today: ActionPerson[];
  promises_intro: { eyebrow: string; title: string; copy: string };
  promises: BriefPromise[];
  questions_intro: { eyebrow: string; title: string; copy: string };
  questions_inner_title: string;
  questions_inner_intro: string;
  questions: Question[];
};

const placeholderBrief: DailyBrief = {
  brief_number: 142,
  delivered_to: ["Naveen", "PB"],
  delivered_at_label: "7:30 by email plus Slack DM",
  reading_time_min: 4,
  signal: 0.87,
  date_label: "Tue, 7 May 2026",
  compiled_label: "07:28",
  headline: "A quiet morning, three loud signals.",
  lede: [
    "Overnight: 142 artifacts, 28 entity pages recompiled, 12 new graph edges, 0 failed runs. ",
    { strong: "The brain wants you to know three things" },
    " — Sequoia is moving faster than the term sheet implies, Marlowe's bug shipped Friday and they still haven't been told, and the pitch about consulting is no longer matching who actually buys.",
  ],
  overnight_intro: { eyebrow: "01 Overnight", title: "What happened while you slept." },
  overnight_cards: [
    {
      title: "Sequoia replied to the deck.",
      pill: { variant: "gold", text: "Move fast" },
      accent: true,
      paragraphs: [
        "Roelof responded at 06:04 BST with three specific objections: SOC 2 timing, model lock-in, and ownership of the customer relationship. The brain matched the tone (terse, bulleted, no preamble) against his behavioral model and concluded he is signaling 'answer these and we move to partnership', not 'we're stalling'.",
        {
          quote: "Three things before we go to partnership: when does SOC 2 land, how locked in are you to Anthropic, and who owns the customer relationship if a brain template ships per-vertical.",
          who: "Roelof, 06:04 - email - re: Arvya OS deck",
        },
        "PB has full draft answers ready in Gmail Drafts. Brain confidence on each:",
        { cites: [
          { label: "SOC 2 - 0.94" },
          { label: "model - 0.81" },
          { label: "ownership - 0.62 - needs Naveen" },
        ] },
      ],
      sources: [
        { label: "email - roelof@sequoia - 06:04" },
        { label: "behavioral model - Roelof" },
        { label: "loop - sequoia-tsq" },
      ],
    },
    {
      title: "BlackRock asked again about the graph spec.",
      pill: { variant: "warn", text: "3d late" },
      paragraphs: [
        "Jon emailed at 07:14, second mention of the graph spec we promised on Monday. He is not visibly annoyed. Tone analysis vs his last 14 emails shows no escalation language. But this is now a 3-day-old open promise to a paying customer.",
        "Brain has drafted v0 of the spec using the canonical 43 edge types and the dream-cycle pseudocode from `apps/web/lib/brain/dream-cycle.ts`. Estimated review time: 18 minutes.",
      ],
      sources: [
        { label: "email - jon@blackrock - 07:14" },
        { label: "call - BlackRock - Mon" },
        { label: "draft - graph-spec.md" },
      ],
    },
    {
      title: "The 'consulting brain' pitch is no longer matching reality.",
      pill: { variant: "default", text: "Drift signal" },
      paragraphs: [
        "Pattern detected by the dream cycle. Of the last 6 meaningful customer conversations, 4 were VC firms, and 2 cited 'Deal Brain' by name as the reason they took the call. The pitch deck currently leads with consulting.",
        "This is not yet a recommendation to repivot, but it is a recommendation to update the deck before today's 14:00 with Insight Partners.",
      ],
      sources: [
        { label: "6 calls" },
        { label: "drift report - narrative" },
      ],
    },
  ],
  today_intro: { eyebrow: "02 Today", title: "What should happen." },
  today: [
    {
      initial: "N",
      name: "For Naveen.",
      variant: "gold",
      items: [
        { text: "Send graph spec to BlackRock by 11:00. Draft v0 ready. Jon explicitly mentioned it twice. Loop opened Monday.", cites: [{ label: "draft" }, { label: "Mon call" }] },
        { text: "Decide: Slack or Drive next. Both promised, both blocked on you. PB is waiting. Brief is at trade-off doc." },
        { text: "Add ownership clause to Sequoia reply. 0.62 confidence answer, your judgment, not the brain's.", cites: [{ label: "Roelof email" }] },
        { text: "Walk into Insight Partners (14:00) prepped. Brain assembled prep doc, Maya has talked to two Insight LPs, attendees include Lonne (cares about retention), brief is here." },
      ],
    },
    {
      initial: "P",
      name: "For PB.",
      variant: "dark",
      items: [
        { text: "Tell Marlowe their bug shipped. 4-day-old gap. PR #482 closed Friday. One-liner is drafted.", cites: [{ label: "GH #482" }, { label: "Marlowe ticket" }] },
        { text: "Send Sequoia reply once Naveen edits it. Three answers, one question outstanding. Send by 12:00, Roelof reads email at lunch." },
        { text: "Schedule Q3 advisor sync. 12 days stale. Two advisors haven't heard from us since the seed close.", cites: [{ label: "loop" }] },
        { text: "Add the 'where does the data live' answer to the FAQ. Three customers asked the same question this week. Brain drafted the entry.", cites: [{ label: "pattern" }] },
      ],
    },
  ],
  promises_intro: {
    eyebrow: "03 Promises",
    title: "What we owe people.",
    copy: "Every promise the brain has heard you make in the last 30 days, with current status. Three are overdue. None have been silently dropped.",
  },
  promises: [
    { what: "Send graph spec v0", to: "BlackRock - Jon", who: "NA", due: "Mon - 3d late", due_late: true, status: { variant: "warn", text: "Drafted" } },
    { what: "Reply to term-sheet questions", to: "Sequoia - Roelof", who: "NA - PB", due: "Today - 12:00", due_late: false, status: { variant: "gold", text: "Drafted" } },
    { what: "Tell Marlowe bug #482 shipped", to: "Marlowe - support", who: "PB", due: "Fri - 4d late", due_late: true, status: { variant: "default", text: "1-liner ready" } },
    { what: "Q3 advisor sync", to: "Three advisors", who: "PB", due: "Apr 25 - 12d late", due_late: true, status: { variant: "warn", text: "Unscheduled" } },
    { what: "Intro Maya to Joel", to: "Caffeinated, Verdant", who: "NA", due: "Today", due_late: false, status: { variant: "default", text: "Double-opt drafted" } },
    { what: "Slack connector beta", to: "2 customer pilots", who: "PB - eng", due: "Fri", due_late: false, status: { variant: "ok", text: "On track" } },
    { what: "Investor update for April", to: "22 angels", who: "NA", due: "May 10", due_late: false, status: { variant: "default", text: "Outline drafted" } },
  ],
  questions_intro: {
    eyebrow: "04 Questions for you",
    title: "Things only you can decide.",
    copy: "The brain has source-backed evidence on each, but these are judgment calls. Your answer feeds back into memory.",
  },
  questions_inner_title: "Resolve before Friday.",
  questions_inner_intro: "Open strategic questions, ranked by impact times age",
  questions: [
    { text: "Slack connector or Drive ingestion first?", cites: ["standup - Mon", "#341"] },
    { text: "Are we still pitching to consulting firms first?", cites: ["6 calls"] },
    { text: "Who owns the customer relationship in vertical templates?", cites: ["Sequoia email"] },
    { text: "Should we accept the BlackRock referral to Google?", cites: ["chain - Jon to Google"] },
  ],
};

async function getLatestBrief(brainId: string): Promise<DailyBrief> {
  // TODO: fetch from `/api/brains/${brainId}/briefs/latest` once Phase 3.4
  // lands. brainId is captured here so the swap is a one-liner. While we
  // ship the static placeholder, this `void` reference satisfies the
  // unused-vars lint without dropping the future-facing parameter.
  void brainId;
  return placeholderBrief;
}

function pillClass(variant: "gold" | "warn" | "ok" | "default") {
  if (variant === "gold") return `${styles.pill} ${styles.pillGold}`;
  if (variant === "warn") return `${styles.pill} ${styles.pillWarn}`;
  if (variant === "ok") return `${styles.pill} ${styles.pillOk}`;
  return styles.pill;
}

type PageProps = {
  params: Promise<{ brainId: string }>;
};

export default async function BriefPage({ params }: PageProps) {
  const { brainId } = await params;
  const brief = await getLatestBrief(brainId);

  return (
    <div className={styles.wrap}>
      <div className={styles.deliveryNote}>
        <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.7" aria-hidden>
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        <span>
          This brief was delivered to{" "}
          {brief.delivered_to.map((name, i) => (
            <span key={name}>
              {i > 0 ? " and " : ""}
              <b>{name}</b>
            </span>
          ))}{" "}
          at {brief.delivered_at_label}. Reading time: <b>{brief.reading_time_min} min</b>. Signal-to-noise score: <b>{brief.signal.toFixed(2)}</b>.{" "}
          <Link href={`/brains/${brainId}/settings`}>Settings</Link>
        </span>
      </div>

      <div className={styles.meta}>
        <span>The Founder Brief - No. {brief.brief_number}</span>
        <div className={styles.metaRight}>
          <span>{brief.date_label}</span>
          <span>
            Compiled <b>{brief.compiled_label}</b>
          </span>
          <span>
            Signal <b>{brief.signal.toFixed(2)}</b>
          </span>
        </div>
      </div>

      <h1 className={styles.h1}>{brief.headline}</h1>
      <p className={styles.lede}>
        {brief.lede.map((part, i) =>
          typeof part === "string" ? (
            <span key={i}>{part}</span>
          ) : (
            <b key={i}>{part.strong}</b>
          ),
        )}
      </p>

      <nav className={styles.toc}>
        <a href="#overnight">
          <span className={styles.tocNo}>01</span>
          <span className={styles.tocNm}>Overnight</span>
        </a>
        <a href="#priorities">
          <span className={styles.tocNo}>02</span>
          <span className={styles.tocNm}>Today</span>
        </a>
        <a href="#promises">
          <span className={styles.tocNo}>03</span>
          <span className={styles.tocNm}>Promises</span>
        </a>
        <a href="#questions">
          <span className={styles.tocNo}>04</span>
          <span className={styles.tocNm}>Questions for you</span>
        </a>
      </nav>

      <section className={styles.section} id="overnight">
        <div className={styles.sectionHead}>
          <span className={`${styles.no}`}>{brief.overnight_intro.eyebrow}</span>
          <h2>{brief.overnight_intro.title}</h2>
          <span className={styles.rule} />
        </div>

        {brief.overnight_cards.map((card, i) => (
          <div
            key={i}
            className={`${styles.card} ${card.accent ? styles.cardAccent : ""}`}
          >
            <div className={styles.cardHead}>
              <h3>{card.title}</h3>
              {card.pill && (
                <span className={pillClass(card.pill.variant)}>
                  <span className="dot" />
                  {card.pill.text}
                </span>
              )}
            </div>
            <div className={styles.cardBody}>
              {card.paragraphs.map((para, j) => {
                if (typeof para === "string") return <p key={j}>{para}</p>;
                if ("quote" in para) {
                  return (
                    <div key={j} className={styles.quote}>
                      {para.quote}
                      <span className={styles.quoteWho}>{para.who}</span>
                    </div>
                  );
                }
                return (
                  <p key={j}>
                    {para.cites.map((c, k) => (
                      <span key={k} className={styles.cite}>
                        {c.label}
                      </span>
                    ))}
                  </p>
                );
              })}
            </div>
            <div className={styles.srcRow}>
              {card.sources.map((s, j) => (
                <span key={j} className={styles.cite}>
                  {s.label}
                </span>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className={styles.section} id="priorities">
        <div className={styles.sectionHead}>
          <span className={styles.no}>{brief.today_intro.eyebrow}</span>
          <h2>{brief.today_intro.title}</h2>
          <span className={styles.rule} />
        </div>

        <div className={styles.actionsGrid}>
          {brief.today.map((person, i) => (
            <div key={i} className={styles.person}>
              <h4>
                <span
                  className={`${styles.av} ${person.variant === "gold" ? styles.avGold : ""}`}
                >
                  {person.initial}
                </span>
                {person.name}
              </h4>
              <ol>
                {person.items.map((item, j) => (
                  <li key={j}>
                    <span className={styles.actionN}>
                      {String(j + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <b>{item.text}</b>
                      {item.cites && (
                        <div className={styles.actionSrc}>
                          {item.cites.map((c, k) => (
                            <span key={k} className={styles.cite}>
                              {c.label}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section} id="promises">
        <div className={styles.sectionHead}>
          <span className={styles.no}>{brief.promises_intro.eyebrow}</span>
          <h2>{brief.promises_intro.title}</h2>
          <span className={styles.rule} />
        </div>

        <p className={styles.sectionIntro}>{brief.promises_intro.copy}</p>

        <table className={styles.promiseTable}>
          <thead>
            <tr>
              <th>Promise</th>
              <th>To</th>
              <th>Owner</th>
              <th>Due</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {brief.promises.map((p, i) => (
              <tr key={i}>
                <td className={styles.tdWhat}>{p.what}</td>
                <td>{p.to}</td>
                <td className={styles.tdWho}>{p.who}</td>
                <td className={`${styles.tdDue} ${p.due_late ? styles.tdDueLate : ""}`}>
                  {p.due}
                </td>
                <td>
                  <span className={pillClass(p.status.variant)}>
                    <span className="dot" />
                    {p.status.text}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={styles.section} id="questions">
        <div className={styles.sectionHead}>
          <span className={styles.no}>{brief.questions_intro.eyebrow}</span>
          <h2>{brief.questions_intro.title}</h2>
          <span className={styles.rule} />
        </div>

        <p className={styles.sectionIntro}>{brief.questions_intro.copy}</p>

        <div className={styles.questions}>
          <h2>{brief.questions_inner_title}</h2>
          <p className={styles.questionsIntro}>{brief.questions_inner_intro}</p>
          <ol>
            {brief.questions.map((q, i) => (
              <li key={i}>
                <div>
                  <b>{q.text}</b>
                  <div className={styles.questionCtx}>
                    {q.cites.map((c, j) => (
                      <span key={j} className={styles.citeDark}>
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <div className={styles.footer}>
        <span>Compiled by Arvya - 142 sources - 38 entity pages</span>
        <div className={styles.footerLinks}>
          <a href="#" aria-label="Print brief">
            Print
          </a>
          <a href="#" aria-label="Email a copy of this brief">
            Email a copy
          </a>
          <Link href={`/brains/${brainId}/settings`}>Tune signal</Link>
        </div>
      </div>
    </div>
  );
}
