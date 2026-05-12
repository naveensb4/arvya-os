"use client";

import { useState, useCallback } from "react";
import type { MeetingPrepBrief } from "@arvya/core";

type Props = {
  brainId: string;
  brainName: string;
  meetingId: string;
  meetingTitle: string;
  meetingStart?: string;
  meetingEnd?: string;
  brief: MeetingPrepBrief | null;
  isLowConfidence: boolean;
  agentRunId?: string;
  docId?: string;
  initialFeedback?: "useful" | "not_useful" | null;
};

function ThumbUpIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4.5 7L7.1 2.9C7.3 2.6 7.7 2.4 8 2.4H8.2C8.8 2.4 9.2 2.9 9.1 3.5L8.7 5.5H12.2C12.9 5.5 13.5 6.2 13.3 6.9L12.1 11.9C12 12.4 11.5 12.8 11 12.8H6.5C6 12.8 5.5 12.6 5.2 12.2L4.5 11.3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      <rect x="2" y="7" width="2.5" height="5.8" rx="0.5" stroke="currentColor" strokeWidth="1.2"/>
    </svg>
  );
}

function ThumbDownIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M11.5 9L8.9 13.1C8.7 13.4 8.3 13.6 8 13.6H7.8C7.2 13.6 6.8 13.1 6.9 12.5L7.3 10.5H3.8C3.1 10.5 2.5 9.8 2.7 9.1L3.9 4.1C4 3.6 4.5 3.2 5 3.2H9.5C10 3.2 10.5 3.4 10.8 3.8L11.5 4.7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      <rect x="11.5" y="3.2" width="2.5" height="5.8" rx="0.5" stroke="currentColor" strokeWidth="1.2"/>
    </svg>
  );
}

function ConfidenceMeter({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const fillColor = value >= 0.7 ? "var(--arvya-status-active, #059669)" :
    value >= 0.4 ? "var(--arvya-gold, #D89A3F)" : "var(--text-tertiary, #71717A)";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div
        role="meter"
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={value}
        aria-label="Brain confidence in this prep"
        style={{
          width: 120,
          height: 6,
          borderRadius: 3,
          background: "var(--cream-300, #EBE5DC)",
          overflow: "hidden",
        }}
      >
        <div style={{
          width: `${pct}%`,
          height: "100%",
          borderRadius: 3,
          background: fillColor,
          transition: "width 0.3s ease",
        }} />
      </div>
      <span style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 13,
        color: "var(--text-secondary, #3D4970)",
      }}>
        {value.toFixed(2)}
      </span>
    </div>
  );
}

function SectionHeader({ number, title }: { number: string; title: string }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "baseline",
      gap: 12,
      marginTop: 40,
      marginBottom: 16,
    }}>
      <span style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
        letterSpacing: "0.1em",
        color: "var(--text-tertiary, #71717A)",
      }}>
        {number}
      </span>
      <h2 style={{
        fontFamily: "'Roboto Slab', serif",
        fontWeight: 600,
        fontSize: 22,
        letterSpacing: "-0.01em",
        margin: 0,
        flexShrink: 0,
      }}>
        {title}
      </h2>
      <div style={{
        flex: 1,
        height: 1,
        background: "var(--border-subtle, #EBE5DC)",
      }} />
    </div>
  );
}

function SourceChip({ source }: { source: { kind: string; id_or_url: string; excerpt?: string } }) {
  const isLink = source.kind === "web_url" || source.kind === "linkedin_url";
  const label = source.kind === "web_url" ? "web" :
    source.kind === "linkedin_url" ? "LinkedIn" :
    source.kind.replace("_", " ");

  if (isLink) {
    return (
      <a
        href={source.id_or_url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`View source: ${label}`}
        style={{
          display: "inline-block",
          padding: "2px 8px",
          borderRadius: 6,
          background: "var(--cream-200, #F5F1EB)",
          fontSize: 11,
          fontFamily: "'JetBrains Mono', monospace",
          color: "var(--text-accent, #BC8530)",
          textDecoration: "none",
          marginRight: 4,
          marginBottom: 4,
        }}
      >
        {label}
      </a>
    );
  }

  return (
    <span style={{
      display: "inline-block",
      padding: "2px 8px",
      borderRadius: 6,
      background: "var(--cream-200, #F5F1EB)",
      fontSize: 11,
      fontFamily: "'JetBrains Mono', monospace",
      color: "var(--text-tertiary, #71717A)",
      marginRight: 4,
      marginBottom: 4,
    }}>
      {label}
    </span>
  );
}

export default function PrepViewClient(props: Props) {
  const { brief, brainId, meetingId, meetingTitle, isLowConfidence, docId, initialFeedback } = props;
  const [reprepping, setReprepping] = useState(false);
  const [feedback, setFeedback] = useState<"useful" | "not_useful" | null>(initialFeedback ?? null);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(!!initialFeedback);

  const handleReprep = useCallback(async () => {
    setReprepping(true);
    try {
      await fetch(`/api/brains/${brainId}/meetings/${meetingId}/prep`, {
        method: "POST",
      });
      window.location.reload();
    } finally {
      setReprepping(false);
    }
  }, [brainId, meetingId]);

  const handleFeedback = useCallback(async (rating: "useful" | "not_useful") => {
    setFeedback(rating);
    if (docId) {
      try {
        await fetch(`/api/brains/${brainId}/docs/${docId}/feedback`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ feedback: rating }),
        });
        setFeedbackSubmitted(true);
      } catch {
        // Keep the UI state even if the API call fails
      }
    }
  }, [brainId, docId]);

  const startDate = props.meetingStart ? new Date(props.meetingStart) : null;
  const endDate = props.meetingEnd ? new Date(props.meetingEnd) : null;

  const isLive = startDate && endDate &&
    Date.now() >= startDate.getTime() && Date.now() <= endDate.getTime();

  return (
    <main
      role="main"
      aria-labelledby="meeting-title"
      style={{
        maxWidth: 880,
        margin: "0 auto",
        padding: "56px 48px 96px",
        fontFamily: "'Instrument Sans', -apple-system, sans-serif",
        color: "var(--text-primary, #0E1726)",
      }}
    >
      <div style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: "var(--text-accent, #BC8530)",
        marginBottom: 8,
      }}>
        {startDate && (
          <>
            {startDate.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()}{" "}
            {startDate.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}
            {endDate && ` — ${endDate.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}`}
            {brief && ` · ${brief.attendees.length} attendee${brief.attendees.length !== 1 ? "s" : ""}`}
          </>
        )}
      </div>

      <h1
        id="meeting-title"
        style={{
          fontFamily: "'Roboto Slab', serif",
          fontSize: 36,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          margin: "0 0 12px",
          lineHeight: 1.15,
        }}
      >
        {meetingTitle}
      </h1>

      {isLive && (
        <span style={{
          display: "inline-block",
          padding: "3px 10px",
          borderRadius: 999,
          background: "var(--arvya-gold-bg, #FBF2E0)",
          color: "var(--arvya-gold-600, #BC8530)",
          fontSize: 12,
          fontWeight: 600,
          marginBottom: 16,
        }}>
          ▶ Live now
        </span>
      )}

      {!brief && !isLowConfidence && (
        <div style={{
          padding: "32px 24px",
          borderRadius: 14,
          border: "1px solid var(--border-subtle, #EBE5DC)",
          background: "var(--cream-100, #FAF8F5)",
          textAlign: "center",
          marginTop: 32,
        }}>
          <p style={{ fontSize: 16, marginBottom: 16 }}>
            Brain hasn&apos;t generated a prep for this meeting yet.
          </p>
          <button
            onClick={handleReprep}
            disabled={reprepping}
            style={{
              padding: "10px 24px",
              borderRadius: 10,
              background: "var(--arvya-dark-900, #0E1726)",
              color: "white",
              fontSize: 14,
              fontWeight: 600,
              border: "none",
              cursor: reprepping ? "not-allowed" : "pointer",
              opacity: reprepping ? 0.7 : 1,
            }}
          >
            {reprepping ? "Generating..." : "Generate prep now"}
          </button>
        </div>
      )}

      {isLowConfidence && !brief && (
        <div style={{
          padding: "24px",
          borderRadius: 14,
          border: "1px solid var(--border-subtle, #EBE5DC)",
          background: "var(--cream-100, #FAF8F5)",
          marginTop: 32,
        }}>
          <span style={{
            display: "inline-block",
            padding: "2px 8px",
            borderRadius: 999,
            background: "var(--cream-300, #EBE5DC)",
            fontSize: 11,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginBottom: 12,
          }}>
            LOW CONFIDENCE
          </span>
          <p style={{ fontSize: 15, margin: "0 0 12px" }}>
            Brain wasn&apos;t confident enough to send this prep — only limited sources mentioned the attendees.
          </p>
          <a
            href={`/brains/${brainId}`}
            style={{
              color: "var(--arvya-gold-600, #BC8530)",
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            Connect Gmail to grow context →
          </a>
        </div>
      )}

      {brief && (
        <>
          {brief.why_now.reason && (
            <p style={{
              fontFamily: "'Roboto Slab', serif",
              fontStyle: "italic",
              fontSize: 17,
              color: "var(--text-secondary, #3D4970)",
              maxWidth: "56ch",
              lineHeight: 1.55,
              margin: "12px 0 24px",
            }}>
              {brief.why_now.reason}
            </p>
          )}

          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingBottom: 20,
            borderBottom: "1px solid var(--border-subtle, #EBE5DC)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <ConfidenceMeter value={brief.overall_confidence} />
              <span style={{
                fontSize: 13,
                color: "var(--text-secondary, #3D4970)",
              }}>
                {brief.source_count} sources cited
              </span>
            </div>
            <button
              onClick={handleReprep}
              disabled={reprepping}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: "1px solid var(--border-subtle, #EBE5DC)",
                background: "transparent",
                fontSize: 13,
                fontWeight: 600,
                cursor: reprepping ? "not-allowed" : "pointer",
                opacity: reprepping ? 0.7 : 1,
              }}
            >
              {reprepping ? "Re-prepping..." : "Re-prep"}
            </button>
          </div>

          {brief.questions_to_ask.length > 0 && (
            <>
              <SectionHeader number="01" title="Ask them" />
              <ol style={{ paddingLeft: 20, margin: 0 }}>
                {brief.questions_to_ask.map((q, i) => (
                  <li key={i} style={{ marginBottom: 14, fontSize: 15, lineHeight: 1.5 }}>
                    <strong>{q.question}</strong>
                    {q.rationale && (
                      <span style={{ color: "var(--text-secondary, #3D4970)" }}>
                        {" "}— {q.rationale}
                      </span>
                    )}
                    <div style={{ marginTop: 4 }}>
                      {q.sources.map((s, j) => <SourceChip key={j} source={s} />)}
                    </div>
                  </li>
                ))}
              </ol>
            </>
          )}

          {brief.things_to_know.length > 0 && (
            <>
              <SectionHeader number="02" title="Know" />
              <ol style={{ paddingLeft: 20, margin: 0 }}>
                {brief.things_to_know.map((t, i) => (
                  <li key={i} style={{ marginBottom: 14, fontSize: 15, lineHeight: 1.5 }}>
                    {t.point}
                    {t.freshness_label && (
                      <span style={{
                        fontSize: 12,
                        color: "var(--text-tertiary, #71717A)",
                        marginLeft: 6,
                      }}>
                        · {t.freshness_label}
                      </span>
                    )}
                    <div style={{ marginTop: 4 }}>
                      {t.sources.map((s, j) => <SourceChip key={j} source={s} />)}
                    </div>
                  </li>
                ))}
              </ol>
            </>
          )}

          {brief.risks_to_dodge.length > 0 && (
            <>
              <SectionHeader number="03" title="Risks" />
              <div>
                {brief.risks_to_dodge.map((r, i) => (
                  <div
                    key={i}
                    style={{
                      padding: "12px 16px",
                      marginBottom: 8,
                      borderRadius: 10,
                      background: "var(--cream-100, #FAF8F5)",
                      borderLeft: r.trust_label === "fact"
                        ? "3px solid var(--arvya-gold, #D89A3F)"
                        : "3px solid var(--border-subtle, #EBE5DC)",
                      fontSize: 15,
                      lineHeight: 1.5,
                    }}
                  >
                    <span style={{
                      fontSize: 11,
                      fontFamily: "'JetBrains Mono', monospace",
                      color: "var(--text-tertiary, #71717A)",
                      textTransform: "uppercase",
                      marginRight: 8,
                    }}>
                      {r.trust_label}
                    </span>
                    {r.risk}
                    <div style={{ marginTop: 4 }}>
                      {r.sources.map((s, j) => <SourceChip key={j} source={s} />)}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {brief.attendees.length > 0 && (
            <>
              <SectionHeader number="04" title="Attendees" />
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
                gap: 12,
              }}>
                {brief.attendees.map((a, i) => (
                  <div
                    key={i}
                    style={{
                      padding: "16px 20px",
                      borderRadius: 14,
                      border: "1px solid var(--border-subtle, #EBE5DC)",
                      background: "white",
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>
                      {a.name}
                    </div>
                    {(a.role || a.company) && (
                      <div style={{
                        fontSize: 13,
                        color: "var(--text-secondary, #3D4970)",
                        marginBottom: 8,
                      }}>
                        {[a.role, a.company].filter(Boolean).join(", ")}
                      </div>
                    )}
                    {a.linkedin_url && (
                      <a
                        href={a.linkedin_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: 12,
                          color: "var(--text-accent, #BC8530)",
                          display: "block",
                          marginBottom: 8,
                        }}
                      >
                        LinkedIn →
                      </a>
                    )}
                    {a.mini_dossier.recent_mentions.length > 0 && (
                      <div style={{ marginTop: 8 }}>
                        {a.mini_dossier.recent_mentions.slice(0, 3).map((m, j) => (
                          <div
                            key={j}
                            style={{
                              fontSize: 13,
                              color: "var(--text-secondary, #3D4970)",
                              marginBottom: 4,
                              paddingLeft: 8,
                              borderLeft: "2px solid var(--cream-300, #EBE5DC)",
                            }}
                          >
                            {m.snippet}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {brief.open_loops_with_attendees.length > 0 && (
            <>
              <SectionHeader number="05" title="Open loops" />
              <ul style={{ paddingLeft: 20, margin: 0 }}>
                {brief.open_loops_with_attendees.map((loop, i) => (
                  <li key={i} style={{ marginBottom: 8, fontSize: 15 }}>
                    {loop.title}
                    {loop.due_date && (
                      <span style={{
                        fontSize: 12,
                        color: "var(--text-tertiary, #71717A)",
                        marginLeft: 6,
                      }}>
                        · due {loop.due_date}
                      </span>
                    )}
                    {loop.overdue && (
                      <span style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: "var(--arvya-gold-600, #BC8530)",
                        marginLeft: 6,
                      }}>
                        overdue
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}

          {brief.tone_calibration.description && (
            <div style={{
              marginTop: 32,
              padding: "12px 16px",
              borderRadius: 10,
              background: "var(--cream-100, #FAF8F5)",
              fontSize: 14,
              fontStyle: "italic",
              color: "var(--text-secondary, #3D4970)",
            }}>
              Tone: {brief.tone_calibration.description}
              <span style={{
                fontSize: 12,
                color: "var(--text-tertiary, #71717A)",
                marginLeft: 8,
              }}>
                (based on {brief.tone_calibration.based_on_n_messages} messages)
              </span>
            </div>
          )}

          {brief.uncertainty_notes.length > 0 && (
            <div style={{
              marginTop: 24,
              fontSize: 13,
              color: "var(--text-tertiary, #71717A)",
            }}>
              {brief.uncertainty_notes.map((note, i) => (
                <div key={i}>· {note}</div>
              ))}
            </div>
          )}

          <div style={{
            marginTop: 32,
            padding: "16px 0",
            borderTop: "1px solid var(--border-subtle, #EBE5DC)",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}>
            {feedbackSubmitted ? (
              <span style={{
                fontSize: 12,
                color: "var(--text-tertiary, #71717A)",
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                Feedback recorded
              </span>
            ) : (
              <>
                <button
                  onClick={() => handleFeedback("useful")}
                  aria-label="Mark as useful"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "5px 12px",
                    borderRadius: 6,
                    border: `1px solid ${feedback === "useful" ? "var(--arvya-gold, #D89A3F)" : "var(--border-subtle, #EBE5DC)"}`,
                    background: feedback === "useful" ? "var(--arvya-gold-bg, #FBF2E0)" : "transparent",
                    fontSize: 12,
                    cursor: "pointer",
                    color: "var(--text-secondary, #52525B)",
                  }}
                >
                  <ThumbUpIcon size={14} /> useful
                </button>
                <button
                  onClick={() => handleFeedback("not_useful")}
                  aria-label="Mark as not useful"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "5px 12px",
                    borderRadius: 6,
                    border: `1px solid ${feedback === "not_useful" ? "var(--arvya-gold, #D89A3F)" : "var(--border-subtle, #EBE5DC)"}`,
                    background: feedback === "not_useful" ? "var(--arvya-gold-bg, #FBF2E0)" : "transparent",
                    fontSize: 12,
                    cursor: "pointer",
                    color: "var(--text-secondary, #52525B)",
                  }}
                >
                  <ThumbDownIcon size={14} /> not useful
                </button>
              </>
            )}
          </div>
        </>
      )}
    </main>
  );
}
