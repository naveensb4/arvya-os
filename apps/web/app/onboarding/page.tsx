import styles from "./page.module.css";

// TODO: this onboarding flow currently renders only Step 3 of 5 (the
// connector picker) per the prototype handoff. Steps 1, 2, 4, 5 will be
// added as their own routes/pages or via a single-route stepper. The data
// shape (steps, connectors, defaults) is intentionally typed so that
// stepping through them is straightforward when the wider flow lands.

type StepStatus = "done" | "on" | "pending";
type Step = {
  num: number;
  label: string;
  desc: string;
  status: StepStatus;
};

type Connector = {
  id: string;
  name: string;
  desc: string;
  on: boolean;
  beta?: boolean;
  initial: string;
  variant:
    | "gmail"
    | "cal"
    | "zoom"
    | "gh"
    | "notion"
    | "slack";
};

type DefaultRule = {
  id: string;
  title: string;
  body: string;
  on: boolean;
  icon: React.ReactNode;
};

type SamplePrompt = {
  question: string;
  body: string;
  meta: string;
};

const placeholderSteps: Step[] = [
  {
    num: 1,
    label: "Who you are",
    desc: "NAVEEN - ARVYA CO.",
    status: "done",
  },
  {
    num: 2,
    label: "What this brain is for",
    desc: "FOUNDER / CEO BRAIN",
    status: "done",
  },
  {
    num: 3,
    label: "Connect your sources",
    desc: "3 OF 6 PICKED",
    status: "on",
  },
  {
    num: 4,
    label: "Set boundaries",
    desc: "PRIVATE LABELS - SCOPES",
    status: "pending",
  },
  {
    num: 5,
    label: "First brief",
    desc: "ARVYA READS - YOU REVIEW",
    status: "pending",
  },
];

const placeholderConnectors: Connector[] = [
  { id: "gmail", name: "Gmail", desc: "last 90 days - 840 emails", on: true, initial: "@", variant: "gmail" },
  { id: "gcal", name: "Google Calendar", desc: "142 mtgs - 90 days back", on: true, initial: "C", variant: "cal" },
  { id: "zoom", name: "Zoom transcripts", desc: "87 calls - auto transcribe", on: true, initial: "Z", variant: "zoom" },
  { id: "github", name: "GitHub", desc: "PR + issue text - never code", on: false, initial: "GH", variant: "gh" },
  { id: "notion", name: "Notion", desc: "pick top-level pages", on: false, initial: "N", variant: "notion" },
  { id: "slack", name: "Slack", desc: "3 channels max - DMs off", on: false, beta: true, initial: "#", variant: "slack" },
];

const placeholderDefaults: DefaultRule[] = [
  {
    id: "personal_label",
    title: "Honor the personal label",
    body: "Anything labelled personal in Gmail or marked private in Calendar is invisible to the brain. Even you cannot search through Arvya for it.",
    on: true,
    icon: (
      <svg
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        aria-hidden
      >
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
  },
  {
    id: "read_only",
    title: "Read-only by default",
    body: "Arvya can compose drafts and surface answers, but never sends, schedules, or edits without your explicit approval. Each connector has its own write toggle.",
    on: true,
    icon: (
      <svg
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        aria-hidden
      >
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    id: "forget_on_disconnect",
    title: "Forget on disconnect (30 day grace)",
    body: "Disconnect a source - Gmail, Slack, anything - and every memory derived from it expires within 30 days. Force purge anytime in Connectors.",
    on: true,
    icon: (
      <svg
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        aria-hidden
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
      </svg>
    ),
  },
];

const placeholderSamples: SamplePrompt[] = [
  {
    question: "What did Roelof actually want last time?",
    body: "Searches every email plus transcript with him. Cites the exact sentence, reads context.",
    meta: "answer in under 2s - 23 sources",
  },
  {
    question: "Who do we owe a reply to this week?",
    body: "Walks open loops, ranks by behavioral signal plus age, drafts replies.",
    meta: "answer in under 2s - 14 loops",
  },
  {
    question: "What did I promise the board?",
    body: "Pulls every commitment from the last 4 board updates. Marks late ones.",
    meta: "answer in under 2s - 4 docs",
  },
  {
    question: "Have we drifted from strategy?",
    body: "Compares stated priorities to actual time. Surfaces patterns weekly.",
    meta: "answer Sunday morning",
  },
];

const variantClass = (v: Connector["variant"]) => {
  if (v === "gmail") return styles.lgGmail;
  if (v === "cal") return styles.lgCal;
  if (v === "zoom") return styles.lgZoom;
  if (v === "gh") return styles.lgGh;
  if (v === "notion") return styles.lgNotion;
  return styles.lgSlack;
};

const stepClass = (s: StepStatus) => {
  if (s === "done") return `${styles.step} ${styles.stepDone}`;
  if (s === "on") return `${styles.step} ${styles.stepOn}`;
  return styles.step;
};

export default function OnboardingPage() {
  const connectedCount = placeholderConnectors.filter((c) => c.on).length;

  return (
    <div className={styles.stage}>
      <aside className={styles.rail}>
        <div className={styles.brand}>
          <span className={styles.brandMk}>A</span>
          <span className={styles.brandWord}>ARVYA</span>
        </div>
        <h1>Let&apos;s give your brain something to remember.</h1>
        <p className={styles.lede}>
          4 minutes. You will point Arvya at a few sources, set a couple of
          boundaries, and watch it start composing what it knows.
        </p>

        {placeholderSteps.map((s) => (
          <div key={s.num} className={stepClass(s.status)}>
            <span className={styles.stepN}>
              {s.status === "done" ? "✓" : s.num}
            </span>
            <div>
              <div
                className={`${styles.stepTtl} ${s.status === "pending" ? styles.stepTtlDim : ""}`}
              >
                {s.label}
              </div>
              <div className={styles.stepDesc}>{s.desc}</div>
            </div>
          </div>
        ))}

        <div className={styles.railFoot}>
          SOC 2 TYPE II - IN PROGRESS - NO TRAINING ON YOUR DATA
        </div>
      </aside>

      <div className={styles.screen}>
        <div className={styles.eyebrow}>STEP 3 / 5 - The capture layer</div>
        <h2>Pick the sources Arvya can read.</h2>
        <p className={styles.lede}>
          A brain is only as smart as what it sees. Connect anything that
          holds memory worth keeping - work email, calendar, calls, code,
          docs. The more you connect, the better your brain composes.{" "}
          <b>Disconnect any time and it forgets within 30 days.</b>
        </p>

        <div className={styles.brainStat}>
          <div>
            <div className={styles.brainStatTtl}>Your brain is forming.</div>
            <div className={styles.brainStatStats}>
              <span>
                <b>{connectedCount} sources</b> connected -{" "}
                <b>1,240 sources</b> queued - est. <b>4 min</b> to first brief
              </span>
              <br />
              <span>
                <b>0 entities</b> resolved yet - waiting for first ingest
              </span>
            </div>
            <div className={styles.progress}>
              <div className={styles.progressFill} />
            </div>
          </div>
          <div className={styles.ring}>
            <span>76%</span>
          </div>
        </div>

        <div className={styles.connGrid}>
          {placeholderConnectors.map((c) => (
            <div
              key={c.id}
              className={`${styles.conn} ${c.on ? styles.connOn : ""}`}
            >
              <div className={`${styles.connLg} ${variantClass(c.variant)}`}>
                {c.initial}
              </div>
              <div>
                <div className={styles.connNm}>
                  {c.name}
                  {c.beta && <span className={styles.connBeta}>BETA</span>}
                </div>
                <div className={styles.connDesc}>{c.desc}</div>
              </div>
              <div className={styles.check}>{c.on ? "✓" : ""}</div>
            </div>
          ))}
        </div>

        <div className={styles.skipRow}>
          {[
            "+ Linear",
            "+ Drive",
            "+ Stripe",
            "+ Vanta",
            "+ Voice memos - iOS",
            "+ Custom webhook",
            "+ 12 more",
          ].map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>

        <div className={styles.privacyNote}>
          <span className={styles.privacyNoteIc}>!</span>
          <div>
            <b>What Arvya never reads, even if you give scope.</b>
            <br />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "11.5px", letterSpacing: "0.04em" }}>
              Source code (GitHub) - email/calendar marked personal - Slack DMs unless you opt in - anything in a Vanta-restricted folder - the body of files in disconnected sources after 30 days.
            </span>
          </div>
        </div>

        <div className={styles.askBox}>
          <h4>Defaults Arvya will apply</h4>
          {placeholderDefaults.map((rule) => (
            <div key={rule.id} className={styles.toggleRule}>
              <div className={styles.icBox}>{rule.icon}</div>
              <div>
                <h5>{rule.title}</h5>
                <p>{rule.body}</p>
              </div>
              <div
                className={`${styles.toggle} ${rule.on ? styles.toggleOn : ""}`}
                aria-label={`${rule.title}: on`}
              />
            </div>
          ))}
        </div>

        <div style={{ marginTop: 32 }}>
          <h4 className={styles.upcomingHead}>
            Once you connect, you can ask the brain things like
          </h4>
          <div className={styles.preCards}>
            {placeholderSamples.map((s) => (
              <div key={s.question} className={styles.preCard}>
                <h5>&ldquo;{s.question}&rdquo;</h5>
                <p>{s.body}</p>
                <div className={styles.meta}>{s.meta}</div>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.ctas}>
          <button type="button" className={`${styles.btn} ${styles.btnGhost}`}>
            Back
          </button>
          <button type="button" className={`${styles.btn} ${styles.btnGold}`}>
            Continue - {connectedCount} connected
          </button>
          <button type="button" className={`${styles.btn} ${styles.btnGhost}`}>
            Skip - I will connect later
          </button>
          <span className={styles.stepLab}>STEP 3 OF 5</span>
        </div>
      </div>
    </div>
  );
}
