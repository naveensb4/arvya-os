"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { OpenLoop } from "@arvya/core";
import styles from "./page.module.css";
import listStyles from "./list.module.css";

type SourceLite = { id: string; title: string; externalUri: string | null };

type DismissPattern = { loopType: string; count: number; matchingIds: string[] } | null;

type Props = {
  loops: OpenLoop[];
  sourcesById: Record<string, SourceLite>;
  brainId: string;
  staleLoopIds: string[];
  dismissPattern: DismissPattern;
  initialSearchParams: Record<string, string | string[] | undefined>;
};

type SortKey = "due" | "priority" | "age" | "status" | "type";
type ViewMode = "list" | "board" | "timeline";

const ACTIVE_STATUSES = new Set(["needs_review", "open", "in_progress", "waiting"]);
const TERMINAL_STATUSES = new Set(["closed", "done", "dismissed"]);
const ALL_STATUSES = ["needs_review", "open", "in_progress", "waiting", "done", "dismissed", "closed"] as const;
const ALL_TYPES = [
  "follow_up", "intro", "product", "investor", "sales", "marketing",
  "engineering", "deal", "diligence", "crm", "scheduling", "task",
  "investor_ask", "customer_ask", "strategic_question", "other",
] as const;
const ALL_PRIORITIES = ["critical", "high", "medium", "low"] as const;

function priorityRank(p: string): number {
  return { critical: 0, high: 1, medium: 2, low: 3 }[p] ?? 4;
}

function dueRank(loop: OpenLoop): number {
  if (!loop.dueDate) return Number.MAX_SAFE_INTEGER;
  return new Date(loop.dueDate).getTime();
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function ageLabel(loop: OpenLoop): { text: string; late?: boolean } {
  const ref = loop.dueDate ?? loop.createdAt;
  if (!ref) return { text: "recent" };
  const ms = Date.now() - new Date(ref).getTime();
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days < 0) return { text: `due in ${-days}d` };
  if (days === 0) return { text: `${Math.max(1, Math.floor(ms / (60 * 60 * 1000)))}h ago` };
  if (loop.dueDate && new Date(loop.dueDate).getTime() < Date.now()) {
    return { text: `${days}d late`, late: true };
  }
  return { text: `${days}d ago` };
}

function readEvidenceBadge(loop: OpenLoop): { type: "auto" | "manual"; text: string; sourceId?: string } | null {
  if (!TERMINAL_STATUSES.has(loop.status)) return null;
  const props = (loop.properties ?? {}) as Record<string, unknown>;
  if (props.closedBy === "outcome_detector" || props.closedBy === "resolution_sweep") {
    const sourceId = typeof props.closedFromSourceId === "string" ? props.closedFromSourceId : undefined;
    return { type: "auto", text: `Resolved by: ${loop.outcome?.slice(0, 60) ?? "auto-detected"}`, sourceId };
  }
  if (loop.outcome) {
    return { type: "manual", text: `Marked done${loop.outcome !== "done" ? `: ${loop.outcome.slice(0, 60)}` : ""}` };
  }
  if (loop.status === "dismissed") {
    return { type: "manual", text: "Dismissed" };
  }
  return null;
}

function sp(params: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const val = params[key];
  return Array.isArray(val) ? val[0] : val;
}

export function OpenLoopsClient({ loops, sourcesById, brainId, staleLoopIds, dismissPattern, initialSearchParams }: Props) {
  const router = useRouter();
  const [view, setView] = useState<ViewMode>((sp(initialSearchParams, "view") as ViewMode) ?? "list");
  const [statusFilter, setStatusFilter] = useState<string>(sp(initialSearchParams, "status") ?? "active");
  const [typeFilter, setTypeFilter] = useState<string>(sp(initialSearchParams, "type") ?? "all");
  const [priorityFilter, setPriorityFilter] = useState<string>(sp(initialSearchParams, "priority") ?? "all");
  const [ownerFilter, setOwnerFilter] = useState<string>(sp(initialSearchParams, "owner") ?? "all");
  const [searchQuery, setSearchQuery] = useState<string>(sp(initialSearchParams, "q") ?? "");
  const [sortKey, setSortKey] = useState<SortKey>((sp(initialSearchParams, "sort") as SortKey) ?? "due");
  const [sortDir, setSortDir] = useState<"asc" | "desc">(sp(initialSearchParams, "dir") === "desc" ? "desc" : "asc");

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [dismissToast, setDismissToast] = useState<{ ids: string[]; phase: "offer" | "done" | "hidden" } | null>(null);
  const [patternToast, setPatternToast] = useState<{ type: string; ids: string[] } | null>(null);
  const [actionInFlight, setActionInFlight] = useState<string | null>(null);
  const [localDismissed, setLocalDismissed] = useState<Set<string>>(new Set());
  const [doneNote, setDoneNote] = useState<{ loopId: string; note: string } | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const owners = useMemo(() => {
    const set = new Set<string>();
    for (const l of loops) if (l.owner) set.add(l.owner);
    return [...set].sort();
  }, [loops]);

  // Persist filter state to URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (view !== "list") params.set("view", view);
    if (statusFilter !== "active") params.set("status", statusFilter);
    if (typeFilter !== "all") params.set("type", typeFilter);
    if (priorityFilter !== "all") params.set("priority", priorityFilter);
    if (ownerFilter !== "all") params.set("owner", ownerFilter);
    if (searchQuery) params.set("q", searchQuery);
    if (sortKey !== "due") params.set("sort", sortKey);
    if (sortDir !== "asc") params.set("dir", sortDir);
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [view, statusFilter, typeFilter, priorityFilter, ownerFilter, searchQuery, sortKey, sortDir]);

  // Show stale toast on mount, then pattern toast 2s after
  useEffect(() => {
    if (staleLoopIds.length > 3) {
      setDismissToast({ ids: staleLoopIds, phase: "offer" });
    }
    if (dismissPattern && dismissPattern.count >= 3) {
      const delay = staleLoopIds.length > 3 ? 10000 : 0;
      const timer = setTimeout(() => {
        setPatternToast({ type: dismissPattern.loopType, ids: dismissPattern.matchingIds });
      }, delay);
      return () => clearTimeout(timer);
    }
  }, [staleLoopIds, dismissPattern]);

  const filtered = useMemo(() => {
    let result = loops.filter((l) => !localDismissed.has(l.id));

    if (statusFilter === "active") {
      result = result.filter((l) => ACTIVE_STATUSES.has(l.status));
    } else if (statusFilter !== "all") {
      result = result.filter((l) => l.status === statusFilter);
    }
    if (typeFilter !== "all") result = result.filter((l) => l.loopType === typeFilter);
    if (priorityFilter !== "all") result = result.filter((l) => l.priority === priorityFilter);
    if (ownerFilter !== "all") {
      if (ownerFilter === "unassigned") result = result.filter((l) => !l.owner);
      else result = result.filter((l) => l.owner === ownerFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (l) =>
          l.title.toLowerCase().includes(q) ||
          (l.description ?? "").toLowerCase().includes(q) ||
          (l.owner ?? "").toLowerCase().includes(q),
      );
    }

    const cmp = (a: OpenLoop, b: OpenLoop): number => {
      let r = 0;
      if (sortKey === "due") r = dueRank(a) - dueRank(b);
      else if (sortKey === "priority") r = priorityRank(a.priority) - priorityRank(b.priority);
      else if (sortKey === "age") r = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      else if (sortKey === "status") r = (a.status ?? "").localeCompare(b.status ?? "");
      else if (sortKey === "type") r = (a.loopType ?? "").localeCompare(b.loopType ?? "");
      if (r === 0) r = priorityRank(a.priority) - priorityRank(b.priority);
      return sortDir === "asc" ? r : -r;
    };

    return [...result].sort(cmp);
  }, [loops, localDismissed, statusFilter, typeFilter, priorityFilter, ownerFilter, searchQuery, sortKey, sortDir]);

  // Keyboard shortcuts
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;

      if (e.key === "j") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "k") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "d") {
        e.preventDefault();
        const loop = filtered[selectedIndex];
        if (loop) handleAction(loop.id, "dismissed");
      } else if (e.key === "s") {
        e.preventDefault();
        const loop = filtered[selectedIndex];
        if (loop) handleAction(loop.id, "waiting");
      } else if (e.key === "Enter") {
        e.preventDefault();
        const loop = filtered[selectedIndex];
        if (loop) router.push(`/brains/${brainId}/open-loops/${loop.id}`);
      } else if (e.key === "Escape") {
        if (dismissToast) setDismissToast({ ...dismissToast, phase: "hidden" });
      } else if (e.key === "/") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [filtered, selectedIndex, brainId, dismissToast, router]);

  const handleAction = useCallback(async (loopId: string, status: string, note?: string) => {
    setActionInFlight(loopId);
    try {
      const body: Record<string, unknown> = { status };
      if (note) body.outcome = note;
      await fetch(`/api/brains/${brainId}/open-loops/${loopId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setLocalDismissed((prev) => new Set(prev).add(loopId));
      setSelectedIndex((i) => Math.min(i, filtered.length - 2));
    } finally {
      setActionInFlight(null);
    }
  }, [brainId, filtered.length]);

  const handleBulkDismiss = useCallback(async () => {
    if (!dismissToast) return;
    setActionInFlight("bulk");
    try {
      await fetch(`/api/brains/${brainId}/open-loops/bulk-dismiss`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loopIds: dismissToast.ids }),
      });
      setLocalDismissed((prev) => {
        const next = new Set(prev);
        for (const id of dismissToast.ids) next.add(id);
        return next;
      });
      setDismissToast({ ...dismissToast, phase: "done" });
      setTimeout(() => setDismissToast(null), 8000);
    } finally {
      setActionInFlight(null);
    }
  }, [brainId, dismissToast]);

  const handleUndoBulk = useCallback(async () => {
    if (!dismissToast) return;
    setActionInFlight("bulk-undo");
    try {
      for (const id of dismissToast.ids) {
        await fetch(`/api/brains/${brainId}/open-loops/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "needs_review" }),
        });
      }
      setLocalDismissed((prev) => {
        const next = new Set(prev);
        for (const id of dismissToast.ids) next.delete(id);
        return next;
      });
      setDismissToast(null);
    } finally {
      setActionInFlight(null);
    }
  }, [brainId, dismissToast]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "age" ? "desc" : "asc");
    }
  };

  // Zero-state celebration
  if (filtered.length === 0 && statusFilter === "active" && !searchQuery) {
    return (
      <>
        {renderToolbar()}
        <div className={listStyles.zeroState}>
          <div className={listStyles.zeroStateTitle}>All clear.</div>
          <div className={listStyles.zeroStateBody}>
            Every promise has been fulfilled. When new commitments appear in your
            sources, they will show up here automatically.
          </div>
        </div>
      </>
    );
  }

  function renderToolbar() {
    return (
      <div className={styles.toolbar}>
        <div className={listStyles.filterRow}>
          <div className={styles.seg}>
            {(["list", "board", "timeline"] as ViewMode[]).map((v) => (
              <button
                key={v}
                type="button"
                className={view === v ? styles.segOn : ""}
                onClick={() => setView(v)}
              >
                {v === "list" ? "List" : v === "board" ? "Board" : "Timeline"}
              </button>
            ))}
          </div>

          <select
            className={listStyles.filterChip}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="active">Active</option>
            <option value="all">All statuses</option>
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
            ))}
          </select>

          <select
            className={listStyles.filterChip}
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="all">All types</option>
            {ALL_TYPES.map((t) => (
              <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
            ))}
          </select>

          <select
            className={listStyles.filterChip}
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
          >
            <option value="all">All priorities</option>
            {ALL_PRIORITIES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>

          <select
            className={listStyles.filterChip}
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
          >
            <option value="all">All owners</option>
            <option value="unassigned">Unassigned</option>
            {owners.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>

          <input
            ref={searchInputRef}
            type="text"
            className={listStyles.searchInput}
            placeholder="Search loops... (/)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>
    );
  }

  return (
    <>
      {renderToolbar()}

      {view === "list" ? (
        <div className={listStyles.tableWrap}>
          <table className={listStyles.table}>
            <thead>
              <tr>
                <th className={listStyles.colTitle}>
                  <button type="button" onClick={() => toggleSort("age")} className={listStyles.sortBtn}>
                    Action {sortKey === "age" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </button>
                </th>
                <th>Owner</th>
                <th>
                  <button type="button" onClick={() => toggleSort("due")} className={listStyles.sortBtn}>
                    Due {sortKey === "due" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </button>
                </th>
                <th>
                  <button type="button" onClick={() => toggleSort("priority")} className={listStyles.sortBtn}>
                    Priority {sortKey === "priority" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </button>
                </th>
                <th>
                  <button type="button" onClick={() => toggleSort("type")} className={listStyles.sortBtn}>
                    Type {sortKey === "type" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </button>
                </th>
                <th>
                  <button type="button" onClick={() => toggleSort("status")} className={listStyles.sortBtn}>
                    Status {sortKey === "status" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </button>
                </th>
                <th>Source</th>
                <th className={listStyles.colActions}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((loop, idx) => {
                const age = ageLabel(loop);
                const source = loop.sourceItemId ? sourcesById[loop.sourceItemId] : undefined;
                const isOverdue = loop.dueDate && new Date(loop.dueDate).getTime() < Date.now();
                const isSelected = idx === selectedIndex;
                const badge = readEvidenceBadge(loop);

                return (
                  <tr
                    key={loop.id}
                    className={[
                      isOverdue ? listStyles.rowLate : "",
                      isSelected ? listStyles.rowSelected : "",
                    ].join(" ")}
                    onClick={() => setSelectedIndex(idx)}
                  >
                    <td className={listStyles.colTitle}>
                      <Link
                        href={`/brains/${brainId}/open-loops/${loop.id}`}
                        className={listStyles.titleLink}
                      >
                        <div className={listStyles.title}>{loop.title || "Untitled"}</div>
                        {loop.description && loop.description !== loop.title ? (
                          <div className={listStyles.desc}>{loop.description}</div>
                        ) : null}
                      </Link>
                      {badge ? (
                        <div className={badge.type === "auto" ? listStyles.badgeAuto : listStyles.badgeManual}>
                          {badge.text}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <span className={listStyles.owner}>{loop.owner ?? "—"}</span>
                    </td>
                    <td>
                      {loop.dueDate ? (
                        <span className={isOverdue ? listStyles.dueLate : listStyles.due}>
                          {formatDate(loop.dueDate)}
                        </span>
                      ) : (
                        <span className={listStyles.dueNone}>—</span>
                      )}
                    </td>
                    <td>
                      <span className={`${listStyles.priority} ${listStyles[`prio_${loop.priority}`] ?? ""}`}>
                        {loop.priority}
                      </span>
                    </td>
                    <td>
                      <span className={listStyles.loopType}>{loop.loopType.replace(/_/g, " ")}</span>
                    </td>
                    <td>
                      <span className={listStyles.status}>{loop.status.replace(/_/g, " ")}</span>
                    </td>
                    <td>
                      {source ? (
                        source.externalUri ? (
                          <a href={source.externalUri} target="_blank" rel="noreferrer" className={listStyles.sourceLink}>
                            {source.title.slice(0, 32)}{source.title.length > 32 ? "…" : ""}
                          </a>
                        ) : (
                          <span className={listStyles.sourceText}>
                            {source.title.slice(0, 32)}{source.title.length > 32 ? "…" : ""}
                          </span>
                        )
                      ) : (
                        <span className={listStyles.dueNone}>—</span>
                      )}
                    </td>
                    <td className={listStyles.colActions}>
                      {ACTIVE_STATUSES.has(loop.status) ? (
                        <div className={listStyles.actions}>
                          {doneNote?.loopId === loop.id ? (
                            <form
                              className={listStyles.doneNoteForm}
                              onSubmit={(e) => {
                                e.preventDefault();
                                handleAction(loop.id, "done", doneNote.note || undefined);
                                setDoneNote(null);
                              }}
                            >
                              <input
                                type="text"
                                className={listStyles.doneNoteInput}
                                placeholder="Note (optional)"
                                value={doneNote.note}
                                onChange={(e) => setDoneNote({ loopId: loop.id, note: e.target.value })}
                                autoFocus
                              />
                              <button type="submit" className={listStyles.actionBtn}>Save</button>
                              <button type="button" className={listStyles.actionBtn} onClick={() => setDoneNote(null)}>Cancel</button>
                            </form>
                          ) : (
                            <>
                              <button
                                type="button"
                                className={listStyles.actionBtn}
                                disabled={actionInFlight === loop.id}
                                onClick={() => setDoneNote({ loopId: loop.id, note: "" })}
                              >
                                Done
                              </button>
                              <button
                                type="button"
                                className={listStyles.actionBtn}
                                disabled={actionInFlight === loop.id}
                                onClick={() => handleAction(loop.id, "dismissed")}
                              >
                                Dismiss
                              </button>
                              <button
                                type="button"
                                className={listStyles.actionBtn}
                                disabled={actionInFlight === loop.id}
                                onClick={() => handleAction(loop.id, "waiting")}
                              >
                                Snooze
                              </button>
                            </>
                          )}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 ? (
            <div className={listStyles.empty}>No loops match these filters.</div>
          ) : null}
        </div>
      ) : null}

      {view !== "list" ? (
        <div className={listStyles.empty}>
          Switch to List view for the full experience. Board and Timeline views are being redesigned.
        </div>
      ) : null}

      <div className={styles.audit}>
        <div className={styles.lab}>Keyboard shortcuts</div>
        <span className={listStyles.kbdHint}>j/k navigate</span>
        <span className={listStyles.kbdHint}>d dismiss</span>
        <span className={listStyles.kbdHint}>s snooze</span>
        <span className={listStyles.kbdHint}>Enter open detail</span>
        <span className={listStyles.kbdHint}>/ search</span>
      </div>

      {/* Bulk dismiss toast */}
      {dismissToast && dismissToast.phase !== "hidden" ? (
        <div className={listStyles.toast} role="status" aria-live="polite">
          {dismissToast.phase === "offer" ? (
            <>
              <span>{dismissToast.ids.length} items look stale.</span>
              <button
                type="button"
                className={listStyles.toastBtn}
                onClick={handleBulkDismiss}
                disabled={actionInFlight === "bulk"}
                aria-label={`Dismiss ${dismissToast.ids.length} stale items`}
              >
                Dismiss all
              </button>
              <button
                type="button"
                className={listStyles.toastBtnSecondary}
                onClick={() => setDismissToast({ ...dismissToast, phase: "hidden" })}
              >
                Skip
              </button>
              <div className={listStyles.toastProgress} />
            </>
          ) : (
            <>
              <span>Dismissed {dismissToast.ids.length} items.</span>
              <button
                type="button"
                className={listStyles.toastBtnSecondary}
                onClick={handleUndoBulk}
                disabled={actionInFlight === "bulk-undo"}
              >
                Undo
              </button>
            </>
          )}
        </div>
      ) : null}

      {/* Dismiss pattern feedback toast */}
      {patternToast && !dismissToast ? (
        <div className={listStyles.toast} role="status" aria-live="polite">
          <span>You often dismiss {patternToast.type.replace(/_/g, " ")} loops. Dismiss {patternToast.ids.length} similar?</span>
          <button
            type="button"
            className={listStyles.toastBtn}
            disabled={actionInFlight === "bulk"}
            onClick={async () => {
              setActionInFlight("bulk");
              try {
                await fetch(`/api/brains/${brainId}/open-loops/bulk-dismiss`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ loopIds: patternToast.ids }),
                });
                setLocalDismissed((prev) => {
                  const next = new Set(prev);
                  for (const id of patternToast.ids) next.add(id);
                  return next;
                });
              } finally {
                setActionInFlight(null);
                setPatternToast(null);
              }
            }}
          >
            Dismiss all
          </button>
          <button
            type="button"
            className={listStyles.toastBtnSecondary}
            onClick={() => setPatternToast(null)}
          >
            Skip
          </button>
          <div className={listStyles.toastProgress} />
        </div>
      ) : null}
    </>
  );
}
