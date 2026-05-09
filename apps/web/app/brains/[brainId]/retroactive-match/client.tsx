"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export type ProposalRow = {
  id: string;
  loopId: string;
  loopTitle: string;
  loopOwner: string | null;
  loopStatus: string | null;
  sourceItemId: string | null;
  sourceTitle: string;
  sourceType: string | null;
  decision: string;
  confidence: number | null;
  evidenceQuote: string | null;
  reason: string | null;
  decidedAt: string;
};

function decisionColor(decision: string): string {
  if (decision === "closed") return "#2ECC7A";
  if (decision === "advanced") return "#D89A3F";
  if (decision === "contradicts") return "#E64C4C";
  if (decision === "uncertain") return "#5C5CE6";
  return "#9aa1ae";
}

export function RetroactiveClient({
  brainId,
  initialProposals,
}: {
  brainId: string;
  initialProposals: ProposalRow[];
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<{
    sourcesScanned: number;
    llmCalls: number;
    proposalCount: number;
  } | null>(null);
  const [proposals, setProposals] = useState<ProposalRow[]>(initialProposals);
  const [selected, setSelected] = useState<Set<string>>(() => {
    // Pre-select high-confidence closes by default — the user can uncheck.
    return new Set(
      initialProposals
        .filter((p) => p.decision === "closed" && (p.confidence ?? 0) >= 0.85)
        .map((p) => p.id),
    );
  });
  const [applying, startApply] = useTransition();
  const [applyResult, setApplyResult] = useState<{ applied: number } | null>(null);

  const grouped = useMemo(() => {
    const out = {
      closed: [] as ProposalRow[],
      uncertain: [] as ProposalRow[],
      advanced: [] as ProposalRow[],
      contradicts: [] as ProposalRow[],
    };
    for (const p of proposals) {
      if (p.decision === "closed") out.closed.push(p);
      else if (p.decision === "uncertain") out.uncertain.push(p);
      else if (p.decision === "advanced") out.advanced.push(p);
      else if (p.decision === "contradicts") out.contradicts.push(p);
    }
    return out;
  }, [proposals]);

  async function runDryRun() {
    setRunning(true);
    setRunError(null);
    setRunResult(null);
    setApplyResult(null);
    try {
      const resp = await fetch(`/api/brains/${brainId}/retroactive-match`, { method: "POST" });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        setRunError((data as { error?: string }).error ?? "Request failed");
      } else {
        const data = (await resp.json()) as {
          sourcesScanned: number;
          llmCalls: number;
          proposalCount: number;
        };
        setRunResult(data);
        // Reload page data to pick up new proposals.
        router.refresh();
      }
    } catch (error) {
      setRunError(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setRunning(false);
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllInGroup(group: ProposalRow[]) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const p of group) next.add(p.id);
      return next;
    });
  }

  function clearAll() {
    setSelected(new Set());
  }

  function applySelected() {
    if (selected.size === 0) return;
    startApply(async () => {
      const resp = await fetch(`/api/brains/${brainId}/retroactive-match/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalIds: [...selected] }),
      });
      const data = await resp.json().catch(() => ({}));
      setApplyResult({ applied: (data as { applied?: number }).applied ?? 0 });
      setProposals((prev) => prev.filter((p) => !selected.has(p.id)));
      setSelected(new Set());
      router.refresh();
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <section
        style={{
          background: "var(--cream-100, #faf6ef)",
          border: "1px solid var(--border-soft, rgba(14,23,38,0.08))",
          borderRadius: 10,
          padding: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>
            {proposals.length === 0
              ? "No proposals yet."
              : `${proposals.length} proposals waiting for review.`}
          </div>
          <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>
            {runResult
              ? `Last run: scanned ${runResult.sourcesScanned} sources, ${runResult.llmCalls} LLM calls, ${runResult.proposalCount} proposals generated.`
              : "Click 'Run dry-run' to have the brain scan every existing source and propose loop closures."}
          </div>
          {runError ? <div style={{ color: "#c43838", fontSize: 12, marginTop: 4 }}>Error: {runError}</div> : null}
        </div>
        <button
          type="button"
          onClick={runDryRun}
          disabled={running}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "1px solid var(--text-primary, #0E1726)",
            background: running ? "var(--cream-200)" : "var(--text-primary, #0E1726)",
            color: running ? "var(--text-secondary)" : "white",
            cursor: running ? "wait" : "pointer",
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          {running ? "Running..." : "Run dry-run"}
        </button>
      </section>

      {applyResult ? (
        <div
          style={{
            background: "rgba(46, 204, 122, 0.08)",
            border: "1px solid rgba(46, 204, 122, 0.4)",
            borderRadius: 8,
            padding: "10px 14px",
            color: "#1d7c4a",
            fontSize: 13,
          }}
        >
          Applied {applyResult.applied} proposal{applyResult.applied === 1 ? "" : "s"}.
        </div>
      ) : null}

      {proposals.length > 0 ? (
        <section
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "var(--surface-primary, #fff)",
            border: "1px solid var(--border-soft)",
            borderRadius: 8,
            padding: "10px 14px",
          }}
        >
          <div style={{ fontSize: 13 }}>
            {selected.size} of {proposals.length} selected
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={clearAll}
              disabled={applying}
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                border: "1px solid var(--border-soft)",
                background: "transparent",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Clear selection
            </button>
            <button
              type="button"
              onClick={applySelected}
              disabled={applying || selected.size === 0}
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                border: "1px solid #2ECC7A",
                background: selected.size === 0 ? "transparent" : "#2ECC7A",
                color: selected.size === 0 ? "var(--text-secondary)" : "white",
                fontSize: 12,
                cursor: selected.size === 0 ? "not-allowed" : "pointer",
                fontWeight: 500,
              }}
            >
              {applying ? "Applying..." : `Apply ${selected.size} selected`}
            </button>
          </div>
        </section>
      ) : null}

      {(["closed", "uncertain", "advanced", "contradicts"] as const).map((kind) => {
        const items = grouped[kind];
        if (items.length === 0) return null;
        const label = {
          closed: "High-confidence closures",
          uncertain: "Possibly closed (needs your eye)",
          advanced: "Loops that advanced (no closure)",
          contradicts: "Contradictions (loop direction changed)",
        }[kind];
        return (
          <section key={kind}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 10,
              }}
            >
              <h3
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--text-tertiary)",
                  margin: 0,
                }}
              >
                {label} · {items.length}
              </h3>
              <button
                type="button"
                onClick={() => selectAllInGroup(items)}
                style={{
                  fontSize: 11,
                  color: "var(--text-secondary)",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                select all in group
              </button>
            </div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              {items.map((p) => (
                <li
                  key={p.id}
                  style={{
                    border: "1px solid var(--border-soft)",
                    borderRadius: 8,
                    padding: 12,
                    background: selected.has(p.id) ? "rgba(46, 204, 122, 0.04)" : "var(--surface-primary)",
                    display: "flex",
                    gap: 10,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={() => toggle(p.id)}
                    style={{ marginTop: 4 }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 10,
                          letterSpacing: "0.04em",
                          textTransform: "uppercase",
                          color: "white",
                          background: decisionColor(p.decision),
                          padding: "1px 8px",
                          borderRadius: 3,
                          fontWeight: 600,
                        }}
                      >
                        {p.decision}
                      </span>
                      {p.confidence !== null ? (
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-tertiary)" }}>
                          conf {p.confidence.toFixed(2)}
                        </span>
                      ) : null}
                      {p.loopOwner ? (
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-tertiary)" }}>
                          owner: {p.loopOwner}
                        </span>
                      ) : null}
                    </div>
                    <div style={{ fontWeight: 500, marginBottom: 2 }}>{p.loopTitle}</div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>
                      Source: <em>{p.sourceTitle}</em>
                      {p.sourceType ? <> · {p.sourceType}</> : null}
                    </div>
                    {p.evidenceQuote ? (
                      <blockquote
                        style={{
                          margin: "4px 0 6px",
                          paddingLeft: 10,
                          borderLeft: "2px solid var(--cream-300, #ece4d2)",
                          fontStyle: "italic",
                          color: "var(--text-secondary)",
                          fontSize: 12,
                        }}
                      >
                        “{p.evidenceQuote}”
                      </blockquote>
                    ) : null}
                    {p.reason ? (
                      <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
                        {p.reason}
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
