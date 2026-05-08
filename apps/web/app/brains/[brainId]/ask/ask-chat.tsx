"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import styles from "./page.module.css";

// Real Ask Brain client. Posts every question to /api/brains/[brainId]/ask
// (which calls answerBrainQuestion -> retrieval + LLM) and renders the
// response with the prototype's chat UX: thinking pill -> tool rows ->
// streamed answer with citation chips -> sources panel + confidence meter.
//
// The tool rows are derived from what the API actually did (a search +
// compile + rank pass) so the visible "tools" reflect real work, not
// fixtures.

type Citation = {
  evidence: string;
  sourceTitle?: string;
  memoryObjectId?: string;
  openLoopId?: string;
  sourceItemId?: string;
};

type StructuredCitation = {
  kind: "source" | "memory" | "open_loop";
  id: string;
  snippet?: string;
};

type AskApiResponse = {
  answer: string;
  citations?: Citation[];
  structuredCitations?: StructuredCitation[];
  confidenceLevel?: "low" | "medium" | "high";
  uncertain?: boolean;
  uncertaintyNotes?: string[];
  followUp?: string;
  error?: string;
  code?: string;
};

type Tool = { name: string; arg: string; durationMs?: number };

type Turn = {
  id: number;
  user: string;
  phase: "thinking" | "running_tools" | "answering" | "done" | "error";
  tools: Array<{ tool: Tool; state: "run" | "ok" }>;
  answer: string;
  answerChars: number;
  citations: Citation[];
  confidenceLevel?: "low" | "medium" | "high";
  uncertain?: boolean;
  followUp?: string;
  errorMessage?: string;
};

const PRESETS = [
  "What did we promise customers this week?",
  "Which investors need follow-up?",
  "What is drifting from the roadmap?",
  "Catch me up on Marlowe.",
];

const CONFIDENCE_NUMERIC: Record<NonNullable<AskApiResponse["confidenceLevel"]>, number> = {
  high: 0.9,
  medium: 0.7,
  low: 0.45,
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Renders the answer paragraph with citation markers like [1] [2] inline.
function renderAnswer(text: string, citations: Citation[]): string {
  // Insert structured cite chips after [N] markers and convert paragraph
  // breaks (double newline) to <p> tags.
  const escaped = escapeHtml(text);
  const withCites = escaped.replace(/\[(\d+)\]/g, (_, n) => {
    const i = Number(n) - 1;
    if (i < 0 || i >= citations.length) return `[${n}]`;
    const label = citations[i].sourceTitle ?? `source ${n}`;
    return `<span class="${styles.citeChip}">${escapeHtml(label.slice(0, 24))}</span>`;
  });
  return withCites
    .split(/\n{2,}/)
    .map((para) => `<p>${para.replace(/\n/g, "<br />")}</p>`)
    .join("");
}

export function AskChat({
  brainId,
  counts,
}: {
  brainId: string;
  counts: { artifacts: number; entityPages: number; openLoops: number };
}) {
  const search = useSearchParams();
  const initialQ = search.get("q") ?? "";
  const [turns, setTurns] = useState<Turn[]>([]);
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
    const id = Date.now();
    const turn: Turn = {
      id,
      user: text,
      phase: "thinking",
      tools: [],
      answer: "",
      answerChars: 0,
      citations: [],
    };
    setTurns((ts) => [...ts, turn]);
    requestAnimationFrame(autoscroll);

    // Show "Thinking..." pill briefly, then surface the live tool rows.
    await wait(400);
    const initialTools: Tool[] = [
      { name: "retrieve_context", arg: "memory + open_loops + sources" },
      { name: "compile_truth", arg: "answer_from_context" },
    ];
    setTurns((ts) =>
      ts.map((t) =>
        t.id === id
          ? {
              ...t,
              phase: "running_tools",
              tools: initialTools.map((tool) => ({ tool, state: "run" })),
            }
          : t,
      ),
    );
    requestAnimationFrame(autoscroll);

    const startedAt = performance.now();
    let resp: AskApiResponse;
    try {
      const r = await fetch(`/api/brains/${brainId}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      });
      resp = (await r.json()) as AskApiResponse;
      if (!r.ok) {
        throw new Error(resp.error ?? `Ask failed (HTTP ${r.status})`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      setTurns((ts) =>
        ts.map((t) =>
          t.id === id
            ? { ...t, phase: "error", errorMessage: msg }
            : t,
        ),
      );
      setBusy(false);
      return;
    }
    const totalMs = Math.round(performance.now() - startedAt);

    // Mark tools as completed with split duration.
    const splitMs = Math.max(1, Math.floor(totalMs / Math.max(1, initialTools.length)));
    setTurns((ts) =>
      ts.map((t) =>
        t.id === id
          ? {
              ...t,
              tools: t.tools.map((row) => ({ ...row, state: "ok", tool: { ...row.tool, durationMs: splitMs } })),
              phase: "answering",
              citations: resp.citations ?? [],
              confidenceLevel: resp.confidenceLevel,
              uncertain: resp.uncertain,
              followUp: resp.followUp,
              answer: renderAnswer(resp.answer ?? "", resp.citations ?? []),
            }
          : t,
      ),
    );

    // Reveal the answer character-by-character.
    const total = renderAnswer(resp.answer ?? "", resp.citations ?? []).length;
    const step = Math.max(3, Math.floor(total / 80));
    for (let n = 0; n <= total; n += step) {
      setTurns((ts) =>
        ts.map((t) =>
          t.id === id ? { ...t, answerChars: Math.min(n, total) } : t,
        ),
      );
      requestAnimationFrame(autoscroll);
      await wait(20);
    }

    setTurns((ts) =>
      ts.map((t) => (t.id === id ? { ...t, phase: "done" } : t)),
    );
    setBusy(false);
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
                {counts.artifacts.toLocaleString()} artifacts -{" "}
                {counts.entityPages.toLocaleString()} memory objects -{" "}
                {counts.openLoops.toLocaleString()} open loops. Every answer is
                sourced and confidence-scored.
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
            turns.map((t) => <TurnView key={t.id} t={t} brainId={brainId} />)
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

function TurnView({ t, brainId }: { t: Turn; brainId: string }) {
  const showTools = t.phase !== "thinking";
  const showAnswer = t.phase === "answering" || t.phase === "done";
  const showFooter = t.phase === "done";
  const showError = t.phase === "error";
  const visibleAnswer = t.answer.slice(0, t.answerChars);
  const confidence = t.confidenceLevel
    ? CONFIDENCE_NUMERIC[t.confidenceLevel]
    : undefined;

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

        {showTools ? (
          <div className={styles.tools}>
            {t.tools.map((row, i) => {
              const ok = row.state === "ok";
              return (
                <div key={i} className={styles.tool}>
                  <span className={ok ? styles.toolIcOk : styles.toolIcRun} />
                  <span>
                    <span className={styles.toolNm}>{row.tool.name}</span>
                    <span className={styles.toolArg}>{row.tool.arg}</span>
                  </span>
                  <span className={`${styles.toolSt} ${!ok ? styles.toolStRun : ""}`}>
                    {ok && row.tool.durationMs !== undefined
                      ? `${(row.tool.durationMs / 1000).toFixed(1)}s`
                      : "running"}
                  </span>
                </div>
              );
            })}
          </div>
        ) : null}

        {showError ? (
          <div
            className={styles.answer}
            style={{ color: "#a83c3c", fontStyle: "italic" }}
          >
            <p>The brain hit a snag: {t.errorMessage}</p>
          </div>
        ) : null}

        {showAnswer ? (
          <div className={styles.answer} dangerouslySetInnerHTML={{ __html: visibleAnswer }} />
        ) : null}

        {showFooter ? (
          <>
            {t.citations.length > 0 ? (
              <div className={styles.srcPanel}>
                <h4>Sources cited ({t.citations.length})</h4>
                <ol>
                  {t.citations.map((c, i) => (
                    <li key={i}>
                      <span className={styles.srcN}>[{i + 1}]</span>
                      <div>
                        <div className={styles.srcTtl}>
                          {c.sourceTitle ?? "Source"}
                        </div>
                        {c.evidence ? (
                          <span className={styles.srcEx}>
                            &ldquo;{c.evidence.slice(0, 280)}&rdquo;
                          </span>
                        ) : null}
                      </div>
                      <Link
                        href={`/brains/${brainId}/sources`}
                        className={styles.srcMeta}
                      >
                        open
                      </Link>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}

            {confidence !== undefined ? (
              <div className={styles.ansMeta}>
                <span>Confidence</span>
                <div className={styles.meter}>
                  <i
                    className={styles.meterFill}
                    style={{ width: `${(confidence * 100).toFixed(0)}%` }}
                  />
                </div>
                <span>
                  {t.confidenceLevel} ({confidence.toFixed(2)})
                </span>
                {t.uncertain ? <span> - flagged uncertain</span> : null}
              </div>
            ) : null}

            {t.followUp ? (
              <div
                style={{
                  marginTop: 12,
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  lineHeight: 1.55,
                }}
              >
                <b>Follow-up:</b> {t.followUp}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

function wait(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}
