import Link from "next/link";
import { getRepository } from "@/lib/db/repository";
import { generateDailyFounderBrief, getBrainSnapshot } from "@/lib/brain/store";
import type {
  AgentRun,
  StructuredDailyBrief,
  StructuredDailyBriefAction,
  StructuredDailyBriefInsight,
  StructuredDailyBriefOverdueFollowUp,
  StructuredDailyBriefPriority,
  StructuredDailyBriefRelationship,
  StructuredDailyBriefRisk,
  StructuredDailyBriefDueSoon,
  StructuredDailyBriefQuestion,
} from "@arvya/core";
import styles from "./page.module.css";

// Daily Brief - layout from docs/prototype/Brief.html, data from the
// real `daily_brief` agent run stored in agent_runs.rawOutput.structured.
//
// generateDailyFounderBrief writes a row with name="daily_brief" and
// rawOutput = { headline, openLoopCount, loopsToReviewCount, structured }.
// We pick the most recent succeeded run, parse the structured payload,
// and render. If none exists yet, we trigger one (best-effort, time-
// boxed) and fall back to an empty-state view.

type Cite = { label: string };

function pillClass(variant: "gold" | "warn" | "ok" | "default") {
  if (variant === "gold") return `${styles.pill} ${styles.pillGold}`;
  if (variant === "warn") return `${styles.pill} ${styles.pillWarn}`;
  if (variant === "ok") return `${styles.pill} ${styles.pillOk}`;
  return styles.pill;
}

type PageProps = {
  params: Promise<{ brainId: string }>;
};

function isDailyBriefRun(run: AgentRun): boolean {
  return run.name === "daily_brief" && run.status === "succeeded";
}

function readStructured(run: AgentRun): StructuredDailyBrief | null {
  const raw = run.rawOutput as { structured?: StructuredDailyBrief } | undefined;
  return raw?.structured ?? null;
}

function readHeadline(run: AgentRun): string | null {
  const raw = run.rawOutput as { headline?: string } | undefined;
  return raw?.headline ?? null;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateLong(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function severityToPill(s: "high" | "medium" | "low") {
  if (s === "high") return { variant: "warn" as const, text: "High risk" };
  if (s === "medium") return { variant: "gold" as const, text: "Watch" };
  return { variant: "default" as const, text: "Low" };
}

function relationshipPill(kind: StructuredDailyBriefRelationship["kind"]) {
  if (kind === "customer") return { variant: "gold" as const, text: "Customer" };
  if (kind === "investor") return { variant: "warn" as const, text: "Investor" };
  if (kind === "advisor") return { variant: "ok" as const, text: "Advisor" };
  return { variant: "default" as const, text: "Prospect" };
}

async function getOrGenerateLatestBrief(
  brainId: string,
): Promise<{ run: AgentRun | null; structured: StructuredDailyBrief | null; headline: string | null }> {
  const repository = getRepository();
  const runs = await repository.listAgentRuns(brainId, 50);
  const latest = runs
    .filter(isDailyBriefRun)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];

  if (latest) {
    return {
      run: latest,
      structured: readStructured(latest),
      headline: readHeadline(latest),
    };
  }

  // No brief yet - try to generate one (best effort, ~30s budget). If the
  // model fails or isn't configured we just render the empty state.
  try {
    await Promise.race([
      generateDailyFounderBrief(brainId),
      new Promise<void>((resolve) => setTimeout(resolve, 30_000)),
    ]);
    const fresh = await repository.listAgentRuns(brainId, 5);
    const generated = fresh.filter(isDailyBriefRun).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
    if (generated) {
      return {
        run: generated,
        structured: readStructured(generated),
        headline: readHeadline(generated),
      };
    }
  } catch {
    // swallow - fall through to empty state
  }
  return { run: null, structured: null, headline: null };
}

export default async function BriefPage({ params }: PageProps) {
  const { brainId } = await params;
  const snapshot = await getBrainSnapshot(brainId);
  const { run, structured, headline } = await getOrGenerateLatestBrief(brainId);

  // Empty state - no brief has been generated yet for this brain.
  if (!run || !structured) {
    return (
      <div className={styles.wrap}>
        <div className={styles.meta}>
          <span>The Founder Brief</span>
          <div className={styles.metaRight}>
            <span>{formatDateLong(new Date().toISOString())}</span>
          </div>
        </div>
        <h1 className={styles.h1}>No brief yet for this brain.</h1>
        <p className={styles.lede}>
          The brain compiles a brief once it has at least a few sources to
          read from. Connect a calendar, a meeting, or some emails - or run
          the daily brief manually from <Link href={`/brains/${brainId}/agent-runs`}>Agent runs</Link>.
        </p>
      </div>
    );
  }

  // Sequence existing runs to compute brief number (newest is current).
  const repository = getRepository();
  const allRuns = await repository.listAgentRuns(brainId, 200);
  const briefRuns = allRuns.filter(isDailyBriefRun);
  const briefNumber = briefRuns.findIndex((r) => r.id === run.id);
  const briefIndex = briefNumber >= 0 ? briefRuns.length - briefNumber : briefRuns.length;

  const compiledLabel = formatTime(run.startedAt);
  const dateLabel = formatDateLong(structured.date ?? run.startedAt);
  const sourceCount = snapshot.sourceItems?.length ?? 0;
  const memoryCount = snapshot.memoryObjects?.length ?? 0;
  const overdue = structured.overdue_follow_ups ?? [];
  const dueSoon = structured.due_soon ?? [];
  const priorities = structured.top_priorities_today ?? [];
  const relationships = structured.high_intent_relationships ?? [];
  const insights = structured.product_insights_to_act_on ?? [];
  const risks = structured.risks_and_dropped_balls ?? [];
  const naveenActions = structured.suggested_actions_naveen ?? [];
  const pbActions = structured.suggested_actions_pb ?? [];
  const questions = structured.questions_to_resolve ?? [];

  const ledeIntro = `${sourceCount} artifacts logged. ${memoryCount} memory objects compiled. ${overdue.length} promises overdue, ${dueSoon.length} due soon.`;

  return (
    <div className={styles.wrap}>
      <div className={styles.deliveryNote}>
        <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.7" aria-hidden>
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        <span>
          Compiled by Arvya at <b>{compiledLabel}</b> from {sourceCount} sources and {memoryCount} memory objects.{" "}
          <Link href={`/brains/${brainId}/settings`}>Settings</Link>
        </span>
      </div>

      <div className={styles.meta}>
        <span>The Founder Brief - No. {briefIndex}</span>
        <div className={styles.metaRight}>
          <span>{dateLabel}</span>
          <span>
            Compiled <b>{compiledLabel}</b>
          </span>
        </div>
      </div>

      <h1 className={styles.h1}>{headline ?? "Today’s brief."}</h1>
      <p className={styles.lede}>{ledeIntro}</p>

      <nav className={styles.toc}>
        <a href="#overnight">
          <span className={styles.tocNo}>01</span>
          <span className={styles.tocNm}>Signals</span>
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

      {/* 01 - Signals: synthesis of relationships, insights, risks. */}
      <section className={styles.section} id="overnight">
        <div className={styles.sectionHead}>
          <span className={styles.no}>01 Signals</span>
          <h2>What the brain noticed.</h2>
          <span className={styles.rule} />
        </div>

        {[
          ...relationships.map((r: StructuredDailyBriefRelationship) => ({
            kind: "relationship" as const,
            data: r,
          })),
          ...insights.map((i: StructuredDailyBriefInsight) => ({
            kind: "insight" as const,
            data: i,
          })),
          ...risks.map((r: StructuredDailyBriefRisk) => ({
            kind: "risk" as const,
            data: r,
          })),
        ].length === 0 ? (
          <div
            style={{
              padding: "32px 0",
              fontSize: 14,
              color: "var(--text-tertiary)",
              fontStyle: "italic",
            }}
          >
            The brain has nothing remarkable to flag this morning.
          </div>
        ) : null}

        {relationships.map((rel, i) => (
          <div key={`rel-${i}`} className={styles.card}>
            <div className={styles.cardHead}>
              <h3>{rel.entity}</h3>
              <span className={pillClass(relationshipPill(rel.kind).variant)}>
                <span className="dot" />
                {relationshipPill(rel.kind).text}
              </span>
            </div>
            <div className={styles.cardBody}>
              <p>{rel.signal}</p>
            </div>
            {rel.source_refs.length > 0 ? (
              <div className={styles.srcRow}>
                {rel.source_refs.map((s, j) => (
                  <span key={j} className={styles.cite}>
                    {s}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ))}

        {insights.map((ins, i) => (
          <div key={`ins-${i}`} className={styles.card}>
            <div className={styles.cardHead}>
              <h3>Product insight</h3>
              <span className={pillClass("default")}>
                <span className="dot" />
                Pattern
              </span>
            </div>
            <div className={styles.cardBody}>
              <p>{ins.insight}</p>
              {ins.suggested_action ? (
                <p>
                  <b>Suggested action.</b> {ins.suggested_action}
                </p>
              ) : null}
            </div>
            {ins.source_refs.length > 0 ? (
              <div className={styles.srcRow}>
                {ins.source_refs.map((s, j) => (
                  <span key={j} className={styles.cite}>
                    {s}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ))}

        {risks.map((risk, i) => {
          const pill = severityToPill(risk.severity);
          return (
            <div key={`risk-${i}`} className={`${styles.card} ${styles.cardAccent}`}>
              <div className={styles.cardHead}>
                <h3>Risk / dropped ball</h3>
                <span className={pillClass(pill.variant)}>
                  <span className="dot" />
                  {pill.text}
                </span>
              </div>
              <div className={styles.cardBody}>
                <p>{risk.description}</p>
              </div>
              {risk.source_refs.length > 0 ? (
                <div className={styles.srcRow}>
                  {risk.source_refs.map((s, j) => (
                    <span key={j} className={styles.cite}>
                      {s}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </section>

      {/* 02 - Today: priorities + suggested actions per founder. */}
      <section className={styles.section} id="priorities">
        <div className={styles.sectionHead}>
          <span className={styles.no}>02 Today</span>
          <h2>What should happen.</h2>
          <span className={styles.rule} />
        </div>

        {priorities.length > 0 ? (
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <h3>Top priorities</h3>
            </div>
            <div className={styles.cardBody}>
              {priorities.map((p: StructuredDailyBriefPriority, i) => (
                <p key={i}>
                  <b>{p.statement}.</b> {p.why_today}
                </p>
              ))}
            </div>
          </div>
        ) : null}

        <div className={styles.actionsGrid}>
          {naveenActions.length > 0 ? (
            <div className={styles.person}>
              <h4>
                <span className={`${styles.av} ${styles.avGold}`}>N</span>
                For Naveen.
              </h4>
              <ol>
                {naveenActions.map((item: StructuredDailyBriefAction, j) => (
                  <li key={j}>
                    <span className={styles.actionN}>{String(j + 1).padStart(2, "0")}</span>
                    <div>
                      <b>{item.action}</b>
                      {item.source_refs && item.source_refs.length > 0 ? (
                        <div className={styles.actionSrc}>
                          {item.source_refs.map((c: string, k: number) => (
                            <span key={k} className={styles.cite}>
                              {c}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          {pbActions.length > 0 ? (
            <div className={styles.person}>
              <h4>
                <span className={styles.av}>P</span>
                For PB.
              </h4>
              <ol>
                {pbActions.map((item, j) => (
                  <li key={j}>
                    <span className={styles.actionN}>{String(j + 1).padStart(2, "0")}</span>
                    <div>
                      <b>{item.action}</b>
                      {item.source_refs && item.source_refs.length > 0 ? (
                        <div className={styles.actionSrc}>
                          {item.source_refs.map((c, k) => (
                            <span key={k} className={styles.cite}>
                              {c}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </div>

        {priorities.length === 0 && naveenActions.length === 0 && pbActions.length === 0 ? (
          <div
            style={{
              padding: "24px 0",
              fontSize: 14,
              color: "var(--text-tertiary)",
              fontStyle: "italic",
            }}
          >
            No specific action items synthesized for today.
          </div>
        ) : null}
      </section>

      {/* 03 - Promises: overdue + due soon, surfaced from open loops. */}
      <section className={styles.section} id="promises">
        <div className={styles.sectionHead}>
          <span className={styles.no}>03 Promises</span>
          <h2>What we owe people.</h2>
          <span className={styles.rule} />
        </div>

        <p className={styles.sectionIntro}>
          Open commitments the brain is tracking. Overdue first, then due in the next few days.
        </p>

        {overdue.length === 0 && dueSoon.length === 0 ? (
          <div
            style={{
              padding: "24px 0",
              fontSize: 14,
              color: "var(--text-tertiary)",
              fontStyle: "italic",
            }}
          >
            Nothing overdue. Nothing due soon.
          </div>
        ) : (
          <table className={styles.promiseTable}>
            <thead>
              <tr>
                <th>Promise</th>
                <th>Owner</th>
                <th>Due</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {overdue.map((p: StructuredDailyBriefOverdueFollowUp, i) => (
                <tr key={`o-${i}`}>
                  <td className={styles.tdWhat}>{p.title}</td>
                  <td className={styles.tdWho}>{p.owner.toUpperCase()}</td>
                  <td className={`${styles.tdDue} ${styles.tdDueLate}`}>
                    {p.days_overdue}d late
                  </td>
                  <td>
                    <span className={pillClass("warn")}>
                      <span className="dot" />
                      Overdue
                    </span>
                  </td>
                </tr>
              ))}
              {dueSoon.map((p: StructuredDailyBriefDueSoon, i) => (
                <tr key={`d-${i}`}>
                  <td className={styles.tdWhat}>{p.title}</td>
                  <td className={styles.tdWho}>-</td>
                  <td className={styles.tdDue}>
                    {p.due_in_days <= 0 ? "today" : `in ${p.due_in_days}d`}
                  </td>
                  <td>
                    <span className={pillClass("gold")}>
                      <span className="dot" />
                      Due soon
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* 04 - Questions to resolve. */}
      <section className={styles.section} id="questions">
        <div className={styles.sectionHead}>
          <span className={styles.no}>04 Questions for you</span>
          <h2>Things only you can decide.</h2>
          <span className={styles.rule} />
        </div>

        {questions.length === 0 ? (
          <div
            style={{
              padding: "24px 0",
              fontSize: 14,
              color: "var(--text-tertiary)",
              fontStyle: "italic",
            }}
          >
            No open strategic questions this morning.
          </div>
        ) : (
          <div className={styles.questions}>
            <ol>
              {questions.map((q: StructuredDailyBriefQuestion, i) => (
                <li key={i}>
                  <div>
                    <b>{q.question}</b>
                    {q.why_now ? (
                      <div className={styles.questionCtx}>
                        <span className={styles.citeDark}>{q.why_now}</span>
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}
      </section>

      <div className={styles.footer}>
        <span>
          Compiled by Arvya - {sourceCount} sources - {memoryCount} memory objects
        </span>
        <div className={styles.footerLinks}>
          <Link href={`/brains/${brainId}/agent-runs`}>Agent runs</Link>
          <Link href={`/brains/${brainId}/settings`}>Tune signal</Link>
        </div>
      </div>
    </div>
  );
}

// Suppress unused-symbol lints for Cite which is intentionally kept for
// future structured citation rendering.
void ({} as Cite);
