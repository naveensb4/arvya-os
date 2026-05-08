"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import styles from "./page.module.css";

// TODO: this client renders the prototype's Claude-chat experience using
// fixture scenarios that match the prototype output 1:1 (promise/investor/
// drift/marlowe/default). When the existing /api/brains/[brainId]/ask route
// supports server-streamed reasoning + tool calls, replace `runScenario`
// with a fetch + reader. The visible UX (thinking pill, reasoning trace,
// tool rows transitioning run -> ok, word-by-word answer streaming, sources
// panel, confidence meter, followups) stays exactly the same.

type Tool = { name: string; arg: string; t: number };
type Source = { n: string; ttl: string; ex: string; meta: string };
type Scenario = {
  match: RegExp;
  reasoning: string;
  tools: Tool[];
  answer: string;
  followups: string[];
  confidence: number;
  sources: Source[];
};

const SCENARIOS: Record<string, Scenario> = {
  promise: {
    match: /promise|customer|week|commit/i,
    reasoning:
      "Searching call transcripts and email drafts from the last 7 days for kind:commitment, then cross-referencing Linear and open loops.",
    tools: [
      { name: "search_memory", arg: "kind:commitment audience:customer 7d", t: 1.4 },
      { name: "compile_truth", arg: "view:customer-promises 7d", t: 2.1 },
      { name: "check_actions", arg: "audience:customer status:open", t: 0.6 },
    ],
    answer:
      "<p>This week you made <b>4 commitments</b> to customers, <b>2 are still open</b>:</p>" +
      "<p><b>1. Marlowe</b> we will send a graph spec by Thu, promised Mon on the BlackRock call. <span class='cite'>call - BlackRock</span> 3 days, no draft yet.</p>" +
      "<p><b>2. Caffeinated</b> Slack connector live for your pilot. Maya asked Wed; engineering started but not shipped. <span class='cite'>DM - Maya - Wed</span> <span class='cite'>Linear #340</span></p>" +
      "<p><b>3. Marlowe bug fix</b> shipped Fri (PR #482), they don't know yet. 1-liner drafted.</p>" +
      "<p><b>4. Nimbus reference call</b> scheduled for Thu 11:00.</p>",
    followups: ["Send the Marlowe spec", "Draft Caffeinated update", "Tell Marlowe about the bug fix"],
    confidence: 0.92,
    sources: [
      {
        n: "[1]",
        ttl: "Call - BlackRock diligence - Mon 14:02",
        ex: "We will send a graph spec by Thursday so legal can look at it.",
        meta: "transcript - 1.00",
      },
      {
        n: "[2]",
        ttl: "DM - Maya Chen to Naveen - Wed 18:14",
        ex: "Need Slack connector live for our pilot kickoff next week, can we count on it?",
        meta: "slack - 1.00",
      },
      {
        n: "[3]",
        ttl: "Linear #340 - Slack connector",
        ex: "Status: in progress. PR open. Last update Mon.",
        meta: "linear - 1.00",
      },
    ],
  },
  investor: {
    match: /investor|sequoia|usv|blackrock|founders|term|roelof/i,
    reasoning:
      "Pulling open investor conversations, ranking by patience window, then checking each contact's behavioral model for context.",
    tools: [
      { name: "search_memory", arg: "audience:investor status:awaiting-reply", t: 1.1 },
      { name: "rank_actions", arg: "category:investor", t: 0.7 },
      { name: "fetch_behavioral", arg: "roelof, jon, andy", t: 1.3 },
    ],
    answer:
      "<p><b>3 investors waiting on you</b>, ordered by typical patience window:</p>" +
      "<p><b>1. Sequoia (Roelof)</b> 3 questions sent 06:04 today. Avg reply window 9h, you have <b>about 3h left</b> before you feel slow. <span class='cite'>email - 6:04</span> <span class='cite'>Roelof - model</span></p>" +
      "<p><b>2. BlackRock (Jon)</b> graph spec by Thu promised Mon. <b>3 days drift.</b> Jon usually nudges before complaining. <span class='cite'>call - Mon</span></p>" +
      "<p><b>3. USV (Andy)</b> partner intro pending. Soft. Can wait until Wed.</p>" +
      "<p>Brain has draft replies ready for 1 and 2.</p>",
    followups: ["Open Sequoia draft", "Open BlackRock draft", "Show all in loops"],
    confidence: 0.88,
    sources: [
      {
        n: "[1]",
        ttl: "Email - Roelof to Naveen - 06:04",
        ex: "Three things before partnership: SOC 2 timing, Anthropic lock-in, customer relationship in vertical templates.",
        meta: "gmail - 1.00",
      },
      {
        n: "[2]",
        ttl: "Behavioral model - Roelof - n=23 emails over 18mo",
        ex: "Median reply window: 9h. Decision-mode: short paragraphs plus numbered list.",
        meta: "compiled - 0.78",
      },
    ],
  },
  drift: {
    match: /drift|roadmap|narrative|ship/i,
    reasoning:
      "Listing active drift signals, validating each against current roadmap and recent activity, ranking by impact times age.",
    tools: [
      { name: "list_drift", arg: "severity:>=0.5", t: 0.9 },
      { name: "verify_drift", arg: "3 candidates", t: 1.6 },
    ],
    answer:
      "<p><b>3 drifts active</b> right now:</p>" +
      "<p><b>1. Sales narrative.</b> Investor deck still says Brain for consulting, but 4 of last 6 customer calls were VC firms, and 2 cited Deal Brain as their reason. <span class='cite'>deck - v3</span> <span class='cite'>4 calls - 14d</span></p>" +
      "<p><b>2. Outlook connector.</b> Promised Q1, no commits, no designs, no standup mentions for <b>21 days</b>. <span class='cite'>Linear #220</span></p>" +
      "<p><b>3. Where does data live?</b> 3rd time across VC, customer, partner. Currently answered three different ways. Not in the FAQ.</p>",
    followups: ["Open drift review", "Update deck narrative", "Draft FAQ entry"],
    confidence: 0.84,
    sources: [
      {
        n: "[1]",
        ttl: "Investor deck v3 - slide 4 Who it's for",
        ex: "Built for boutique consulting firms with 50 to 200 knowledge workers.",
        meta: "notion - 0.95",
      },
    ],
  },
  marlowe: {
    match: /marlowe|catch.?me.?up/i,
    reasoning:
      "Pulling the Marlowe entity page, all interactions in last 30 days, the open commitment, and any related promises.",
    tools: [
      { name: "fetch_entity", arg: "company/marlowe", t: 0.5 },
      { name: "compile_history", arg: "marlowe 30d", t: 1.7 },
      { name: "check_promises", arg: "company:marlowe", t: 0.6 },
    ],
    answer:
      "<p><b>Marlowe in last 30 days, in one breath:</b></p>" +
      "<p>Status: pilot signed 12 Apr, 2 active users, weekly check-ins on Wed.</p>" +
      "<p>Open promise: bug they reported Oct 14 shipped Fri (PR #482), they don't know yet. 1-liner drafted.</p>" +
      "<p>Last touch: Tue 8d ago. Eli (PM) sent diligence notes, asked for our data residency answer. You replied with the generic FAQ. He hasn't responded. <span class='cite'>email - Eli - Tue</span></p>" +
      "<p>Behavioral note: Eli replies in long bursts (avg 180w). Reply length dropped 40 percent over last 3 messages, usually means decision is close.</p>",
    followups: ["Tell them the fix shipped", "Open Marlowe page", "Schedule sync"],
    confidence: 0.84,
    sources: [
      {
        n: "[1]",
        ttl: "Marlowe entity page - compiled",
        ex: "2 active users, weekly check-ins, $42k ARR.",
        meta: "compiled - 0.92",
      },
    ],
  },
  default: {
    match: /.*/,
    reasoning: "Open question. Searching memory, compiling, ranking by recency times confidence.",
    tools: [
      { name: "search_memory", arg: "semantic - top-12", t: 1.4 },
      { name: "compile_truth", arg: "aggregate", t: 2.0 },
    ],
    answer:
      "<p>Searched <b>1,284 memory objects</b> across all sources. The brain has indexed everything you mentioned plus 8 related sources.</p>" +
      "<p>Top signal: <b>this came up 3 times in 14 days</b> across calls, email, and the standup, strong pattern. <span class='cite'>3 sources</span></p>",
    followups: ["Open in graph", "Show evidence", "Draft response"],
    confidence: 0.71,
    sources: [
      {
        n: "[1]",
        ttl: "Memory store - semantic top-12",
        ex: "12 candidate memories matched, top 3 used.",
        meta: "compiled - 0.71",
      },
    ],
  },
};

function pickScenario(q: string): Scenario {
  for (const k of ["promise", "investor", "drift", "marlowe"]) {
    if (SCENARIOS[k].match.test(q)) return SCENARIOS[k];
  }
  return SCENARIOS.default;
}

type RenderedTurn = {
  id: number;
  user: string;
  phase: "thinking" | "reasoning" | "tools" | "answering" | "done";
  scenario: Scenario;
  toolStates: Array<"run" | "ok">;
  toolDurations: Array<number>;
  reasoningChars: number;
  answerChars: number;
};

const PRESETS = [
  "What did we promise customers this week?",
  "Which investors need follow-up?",
  "What is drifting from the roadmap?",
  "Catch me up on Marlowe.",
];

export function AskChat() {
  const search = useSearchParams();
  const initialQ = search.get("q") ?? "";
  const [turns, setTurns] = useState<RenderedTurn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeChip, setActiveChip] = useState("all");
  const streamRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (initialQ) submit(initialQ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function autoscroll() {
    const el = streamRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }

  async function submit(q: string) {
    const text = q.trim();
    if (!text || busy) return;
    setBusy(true);
    setInput("");
    const scenario = pickScenario(text);
    const id = Date.now();
    const turn: RenderedTurn = {
      id,
      user: text,
      phase: "thinking",
      scenario,
      toolStates: scenario.tools.map(() => "run"),
      toolDurations: scenario.tools.map(() => 0),
      reasoningChars: 0,
      answerChars: 0,
    };
    setTurns((ts) => [...ts, turn]);

    requestAnimationFrame(autoscroll);
    await wait(700);

    setTurns((ts) =>
      ts.map((t) => (t.id === id ? { ...t, phase: "reasoning" } : t)),
    );
    await streamReasoning(id, scenario.reasoning.length);

    setTurns((ts) => ts.map((t) => (t.id === id ? { ...t, phase: "tools" } : t)));
    for (let i = 0; i < scenario.tools.length; i++) {
      const tool = scenario.tools[i];
      await wait(400 + tool.t * 250);
      setTurns((ts) =>
        ts.map((t) => {
          if (t.id !== id) return t;
          const next = [...t.toolStates];
          next[i] = "ok";
          const dur = [...t.toolDurations];
          dur[i] = tool.t;
          return { ...t, toolStates: next, toolDurations: dur };
        }),
      );
      requestAnimationFrame(autoscroll);
    }

    setTurns((ts) => ts.map((t) => (t.id === id ? { ...t, phase: "answering" } : t)));
    await streamAnswer(id, scenario.answer.length);

    setTurns((ts) => ts.map((t) => (t.id === id ? { ...t, phase: "done" } : t)));
    setBusy(false);
  }

  async function streamReasoning(id: number, total: number) {
    const step = Math.max(2, Math.floor(total / 40));
    for (let n = 0; n <= total; n += step) {
      setTurns((ts) =>
        ts.map((t) => (t.id === id ? { ...t, reasoningChars: Math.min(n, total) } : t)),
      );
      requestAnimationFrame(autoscroll);
      await wait(35);
    }
  }

  async function streamAnswer(id: number, total: number) {
    const step = Math.max(3, Math.floor(total / 80));
    for (let n = 0; n <= total; n += step) {
      setTurns((ts) =>
        ts.map((t) => (t.id === id ? { ...t, answerChars: Math.min(n, total) } : t)),
      );
      requestAnimationFrame(autoscroll);
      await wait(25);
    }
  }

  function onPreset(q: string) {
    setInput(q);
    submit(q);
  }

  function onComposerKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit(input);
    }
  }

  return (
    <div className={styles.shell}>
      <div className={styles.stream} ref={streamRef}>
        <div className={styles.inner}>
          {turns.length === 0 ? (
            <div className={styles.empty}>
              <div className={styles.mark}>
                <svg
                  width="26"
                  height="26"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#BC8530"
                  strokeWidth="1.6"
                  aria-hidden
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </div>
              <h1>Ask the brain anything.</h1>
              <p className={styles.emptySub}>
                1,284 artifacts - 38 entity pages - 12 graph chains. Every
                answer is sourced and confidence-scored.
              </p>
              <div className={styles.emptyPrompts}>
                {PRESETS.map((q, i) => (
                  <button
                    key={q}
                    type="button"
                    className={styles.q}
                    onClick={() => onPreset(q)}
                  >
                    <span className={styles.qNum}>{String(i + 1).padStart(2, "0")}</span>
                    <span>{q}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            turns.map((t) => <Turn key={t.id} t={t} />)
          )}
        </div>
      </div>

      <div className={styles.composerWrap}>
        <div className={styles.composer}>
          <textarea
            value={input}
            placeholder="Ask anything - a person, a company, a decision, a number, a promise"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onComposerKey}
            rows={1}
          />
          <div className={styles.composerRow}>
            {[
              { id: "all", label: "All sources" },
              { id: "email", label: "Email" },
              { id: "calls", label: "Calls" },
              { id: "docs", label: "Docs" },
              { id: "30d", label: "Last 30d" },
            ].map((c) => (
              <button
                key={c.id}
                type="button"
                className={`${styles.chip} ${activeChip === c.id ? "on" : ""}`}
                onClick={() => setActiveChip(c.id)}
              >
                {c.label}
              </button>
            ))}
            <button
              type="button"
              className={styles.send}
              onClick={() => submit(input)}
              disabled={!input.trim() || busy}
              aria-label="Send"
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                aria-hidden
              >
                <path d="M12 19V5" />
                <polyline points="6 11 12 5 18 11" />
              </svg>
            </button>
          </div>
        </div>
        <div className={styles.composerHint}>
          Brain searches every answer. Press Enter or click send.
        </div>
      </div>
    </div>
  );
}

function Turn({ t }: { t: RenderedTurn }) {
  const showReasoning = t.phase !== "thinking";
  const showTools = t.phase === "tools" || t.phase === "answering" || t.phase === "done";
  const showAnswer = t.phase === "answering" || t.phase === "done";
  const showFooter = t.phase === "done";
  const reasoningText = t.scenario.reasoning.slice(0, t.reasoningChars);
  const answerText = t.scenario.answer.slice(0, t.answerChars);

  return (
    <div className={styles.turn}>
      <div className={styles.user}>{t.user}</div>
      <div className={styles.brain}>
        {t.phase === "thinking" ? (
          <div className={styles.think}>
            <span className={styles.thinkDot} />
            Thinking
          </div>
        ) : null}

        {showReasoning ? (
          <div className={styles.reasoning}>
            {reasoningText}
            {t.phase === "reasoning" ? <span className={styles.cursor} /> : null}
          </div>
        ) : null}

        {showTools ? (
          <div className={styles.tools}>
            {t.scenario.tools.map((tool, i) => {
              const ok = t.toolStates[i] === "ok";
              return (
                <div key={i} className={styles.tool}>
                  <span className={ok ? styles.toolIcOk : styles.toolIcRun} />
                  <span>
                    <span className={styles.toolNm}>{tool.name}</span>
                    <span className={styles.toolArg}>{tool.arg}</span>
                  </span>
                  <span className={`${styles.toolSt} ${!ok ? styles.toolStRun : ""}`}>
                    {ok ? `${t.toolDurations[i].toFixed(1)}s` : "running"}
                  </span>
                </div>
              );
            })}
          </div>
        ) : null}

        {showAnswer ? (
          <>
            <div className={styles.answer} dangerouslySetInnerHTML={{ __html: answerText }} />
            {t.phase === "answering" ? <span className={styles.cursor} /> : null}
          </>
        ) : null}

        {showFooter ? (
          <>
            <div className={styles.srcPanel}>
              <h4>Sources cited ({t.scenario.sources.length})</h4>
              <ol>
                {t.scenario.sources.map((s) => (
                  <li key={s.n}>
                    <span className={styles.srcN}>{s.n}</span>
                    <div>
                      <div className={styles.srcTtl}>{s.ttl}</div>
                      <span className={styles.srcEx}>&ldquo;{s.ex}&rdquo;</span>
                    </div>
                    <span className={styles.srcMeta}>{s.meta}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className={styles.ansMeta}>
              <span>Confidence</span>
              <div className={styles.meter}>
                <i
                  className={styles.meterFill}
                  style={{ width: `${(t.scenario.confidence * 100).toFixed(0)}%` }}
                />
              </div>
              <span>{t.scenario.confidence.toFixed(2)}</span>
            </div>

            <div className={styles.followups}>
              {t.scenario.followups.map((f) => (
                <span key={f} className={styles.followup}>
                  {f}
                </span>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function wait(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}
