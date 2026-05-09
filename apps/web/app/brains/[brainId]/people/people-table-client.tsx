"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./page.module.css";
import drawerStyles from "./drawer.module.css";

// Mirrors the PersonRow type from page.tsx. Kept structural here so the
// server page can build the rows and pass them in as plain props.
type Heat = "hot" | "warm" | "ok";
type Relation = "investor" | "customer" | "partner" | "team" | "press" | "recruit";

type TimelineEntry = {
  sourceId: string;
  sourceTitle: string;
  sourceType: string;
  externalUri: string | null;
  occurredAt: string;
  snippet: string;
};

type DrawerLoop = {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  dueDate: string | null;
  sourceTitle: string | null;
};

export type PersonRow = {
  id: string;
  name: string;
  email: string;
  initials: string;
  relation: { variant: Relation; label: string };
  company: { letter: string; name: string } | null;
  role: string;
  last_touch: { text: string; warn?: boolean };
  owe: { variant: "warn" | "ok" | "you"; text: string };
  heat: { variant: Heat; bars: number; label: string };
  description: string;
  evidence: { sourceTitle: string; quote: string } | null;
  confidence: number | null;
  timeline: TimelineEntry[];
  loops: DrawerLoop[];
  aliases: string[];
};

const tagClass = (v: Relation) =>
  ({
    investor: styles.tagInvestor,
    customer: styles.tagCustomer,
    partner: styles.tagPartner,
    team: styles.tagTeam,
    press: styles.tagPress,
    recruit: styles.tagRecruit,
  })[v];

const heatClass = (v: Heat) =>
  v === "hot" ? styles.heatHot : v === "warm" ? styles.heatWarm : styles.heatOk;

const oweClass = (v: "warn" | "ok" | "you") =>
  `${styles.owePill} ${v === "warn" ? styles.oweWarn : v === "ok" ? styles.oweOk : styles.oweYou}`;

function formatDate(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatRelative(iso: string): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "";
  const day = 24 * 60 * 60 * 1000;
  const hour = 60 * 60 * 1000;
  if (ms < hour) return `${Math.max(1, Math.floor(ms / 60_000))}m ago`;
  if (ms < day) return `${Math.floor(ms / hour)}h ago`;
  if (ms < 7 * day) return `${Math.floor(ms / day)}d ago`;
  return formatDate(iso);
}

function priorityColor(priority: string): string {
  if (priority === "critical" || priority === "high") return "#E64C4C";
  if (priority === "medium") return "#D89A3F";
  return "#6E6E73";
}

function sourceTypeLabel(type: string): string {
  if (type === "email") return "Email";
  if (type === "transcript") return "Transcript";
  if (type === "doc") return "Document";
  if (type === "note") return "Note";
  return type;
}

export function PeopleTable({ rows }: { rows: PersonRow[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      return (
        row.name.toLowerCase().includes(q) ||
        row.email.toLowerCase().includes(q) ||
        (row.company?.name ?? "").toLowerCase().includes(q) ||
        row.role.toLowerCase().includes(q)
      );
    });
  }, [rows, query]);

  const selectedRow = useMemo(
    () => rows.find((r) => r.id === selectedId) ?? null,
    [rows, selectedId],
  );

  // Close drawer on Escape.
  useEffect(() => {
    if (!selectedId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId]);

  return (
    <>
      <div className={styles.ppBar}>
        <div className={styles.seg}>
          <span className={styles.segOn}>Table</span>
        </div>
        <span className={styles.grow} />
        <div className={styles.ppSearch}>
          <svg
            viewBox="0 0 24 24"
            width="13"
            height="13"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            placeholder="Find a person"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div
          style={{
            padding: "60px 20px",
            textAlign: "center",
            fontSize: 14,
            color: "var(--text-tertiary)",
          }}
        >
          {query
            ? `No matches for "${query}".`
            : "No people have been extracted from your sources yet."}
        </div>
      ) : (
        <table className={styles.crm}>
          <thead>
            <tr>
              <th style={{ width: 240 }}>Name</th>
              <th style={{ width: 130 }}>Relation</th>
              <th style={{ width: 180 }}>Company</th>
              <th style={{ width: 110 }}>Role</th>
              <th>Last touch</th>
              <th>Owes</th>
              <th>Heat</th>
              <th>Source of truth</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((person) => (
              <tr
                key={person.id}
                onClick={() => setSelectedId(person.id)}
                style={{ cursor: "pointer" }}
                className={selectedId === person.id ? drawerStyles.rowActive : undefined}
              >
                <td>
                  <div className={styles.pn}>
                    <span className={styles.av}>{person.initials}</span>
                    <span className={styles.nm}>
                      {person.name}
                      {person.email ? (
                        <span className={styles.sub}>{person.email}</span>
                      ) : null}
                    </span>
                  </div>
                </td>
                <td>
                  <span className={`${styles.tag} ${tagClass(person.relation.variant)}`}>
                    <span className={styles.pip} />
                    {person.relation.label}
                  </span>
                </td>
                <td>
                  {person.company ? (
                    <span className={styles.cm}>
                      <span className={styles.lg}>{person.company.letter}</span>
                      {person.company.name}
                    </span>
                  ) : (
                    <span style={{ color: "var(--text-tertiary)", fontStyle: "italic" }}>
                      Independent
                    </span>
                  )}
                </td>
                <td>{person.role || "-"}</td>
                <td>
                  <span
                    className={`${styles.last} ${person.last_touch.warn ? styles.lastWarn : ""}`}
                  >
                    {person.last_touch.text}
                  </span>
                </td>
                <td>
                  <span className={oweClass(person.owe.variant)}>{person.owe.text}</span>
                </td>
                <td>
                  <span className={`${styles.heat} ${heatClass(person.heat.variant)}`}>
                    <span className={styles.bars}>
                      <i className={person.heat.bars >= 1 ? styles.on : ""} />
                      <i className={person.heat.bars >= 2 ? styles.on : ""} />
                      <i className={person.heat.bars >= 3 ? styles.on : ""} />
                      <i className={person.heat.bars >= 4 ? styles.on : ""} />
                    </span>
                    {person.heat.label}
                  </span>
                </td>
                <td>
                  <SourceOfTruthCell person={person} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {filtered.length > 0 ? (
        <p className={styles.hint}>
          {filtered.length} {filtered.length === 1 ? "person" : "people"} shown.
          Click any row to open details on the right.
        </p>
      ) : null}

      <PersonDrawer
        person={selectedRow}
        onClose={() => setSelectedId(null)}
      />
    </>
  );
}

// Collapsible source-of-truth cell. Default: dimmed pill saying which
// source. Expand: show the full quote and the source title verbatim.
// Solves the "the cell is too noisy at scan time" complaint.
function SourceOfTruthCell({ person }: { person: PersonRow }) {
  const [expanded, setExpanded] = useState(false);
  if (!person.evidence) {
    return (
      <span
        style={{
          fontSize: 11,
          color: "var(--text-tertiary)",
          fontStyle: "italic",
        }}
      >
        no source
      </span>
    );
  }
  return (
    <div
      onClick={(event) => {
        event.stopPropagation();
        setExpanded((value) => !value);
      }}
      className={drawerStyles.sourcePill}
    >
      <div className={drawerStyles.sourcePillHeader}>
        <span className={drawerStyles.sourcePillLabel}>
          source
          {person.confidence !== null
            ? ` · conf ${person.confidence.toFixed(2)}`
            : ""}
        </span>
        <span className={drawerStyles.sourcePillChevron}>
          {expanded ? "−" : "+"}
        </span>
      </div>
      <div className={drawerStyles.sourcePillTitle}>
        {person.evidence.sourceTitle.length > 60 && !expanded
          ? `${person.evidence.sourceTitle.slice(0, 60)}…`
          : person.evidence.sourceTitle}
      </div>
      {expanded && person.evidence.quote ? (
        <div className={drawerStyles.sourcePillQuote}>
          “{person.evidence.quote}”
        </div>
      ) : null}
    </div>
  );
}

function PersonDrawer({
  person,
  onClose,
}: {
  person: PersonRow | null;
  onClose: () => void;
}) {
  if (!person) return null;
  const heatStyle =
    person.heat.variant === "hot"
      ? "#E64C4C"
      : person.heat.variant === "warm"
        ? "#D89A3F"
        : "#6E6E73";

  return (
    <>
      <div
        className={drawerStyles.backdrop}
        onClick={onClose}
        aria-hidden
      />
      <aside className={drawerStyles.drawer} role="dialog" aria-label={`Details for ${person.name}`}>
        <header className={drawerStyles.drawerHead}>
          <div className={drawerStyles.identity}>
            <span className={drawerStyles.bigAvatar}>{person.initials}</span>
            <div>
              <h2>{person.name}</h2>
              {person.aliases.length > 0 ? (
                <div className={drawerStyles.aliases}>
                  also: {person.aliases.filter((a) => a !== person.name).slice(0, 3).join(", ")}
                </div>
              ) : null}
              <div className={drawerStyles.identityMeta}>
                {person.email ? (
                  <a
                    href={`mailto:${person.email}`}
                    className={drawerStyles.emailLink}
                  >
                    {person.email}
                  </a>
                ) : (
                  <span style={{ color: "var(--text-tertiary)" }}>no email</span>
                )}
                {person.role ? <span> · {person.role}</span> : null}
                {person.company ? (
                  <span> · {person.company.name}</span>
                ) : null}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={drawerStyles.closeBtn}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div className={drawerStyles.statRow}>
          <div className={drawerStyles.statBox}>
            <div className={drawerStyles.statLab}>Relation</div>
            <div className={drawerStyles.statVal}>{person.relation.label}</div>
          </div>
          <div className={drawerStyles.statBox}>
            <div className={drawerStyles.statLab}>Heat</div>
            <div className={drawerStyles.statVal} style={{ color: heatStyle }}>
              {person.heat.label}
            </div>
          </div>
          <div className={drawerStyles.statBox}>
            <div className={drawerStyles.statLab}>Last touch</div>
            <div className={drawerStyles.statVal}>{person.last_touch.text}</div>
          </div>
          <div className={drawerStyles.statBox}>
            <div className={drawerStyles.statLab}>Open loops</div>
            <div className={drawerStyles.statVal}>{person.loops.length}</div>
          </div>
        </div>

        {person.description ? (
          <section className={drawerStyles.section}>
            <h3>Summary</h3>
            <p className={drawerStyles.summary}>{person.description}</p>
          </section>
        ) : null}

        {person.loops.length > 0 ? (
          <section className={drawerStyles.section}>
            <h3>Open loops linked to {person.name}</h3>
            <ul className={drawerStyles.loopList}>
              {person.loops.map((loop) => (
                <li key={loop.id} className={drawerStyles.loopItem}>
                  <div className={drawerStyles.loopRow}>
                    <span
                      className={drawerStyles.loopDot}
                      style={{ background: priorityColor(loop.priority) }}
                    />
                    <span className={drawerStyles.loopTitle}>{loop.title}</span>
                    {loop.dueDate ? (
                      <span className={drawerStyles.loopDue}>
                        due {formatDate(loop.dueDate)}
                      </span>
                    ) : null}
                  </div>
                  {loop.sourceTitle ? (
                    <div className={drawerStyles.loopSource}>
                      from {loop.sourceTitle}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className={drawerStyles.section}>
          <h3>
            Timeline · {person.timeline.length}{" "}
            {person.timeline.length === 1 ? "source" : "sources"}
          </h3>
          {person.timeline.length === 0 ? (
            <p className={drawerStyles.empty}>
              No linked sources yet. The brain will pick this up next time
              {person.name} appears in an email or transcript.
            </p>
          ) : (
            <ul className={drawerStyles.timelineList}>
              {person.timeline.map((entry) => (
                <li key={entry.sourceId} className={drawerStyles.timelineItem}>
                  <div className={drawerStyles.timelineHead}>
                    <span className={drawerStyles.timelineType}>
                      {sourceTypeLabel(entry.sourceType)}
                    </span>
                    <span className={drawerStyles.timelineDate}>
                      {formatRelative(entry.occurredAt)}
                    </span>
                  </div>
                  <div className={drawerStyles.timelineTitle}>
                    {entry.externalUri ? (
                      <a
                        href={entry.externalUri}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {entry.sourceTitle}
                      </a>
                    ) : (
                      entry.sourceTitle
                    )}
                  </div>
                  {entry.snippet ? (
                    <p className={drawerStyles.timelineSnippet}>
                      {entry.snippet}
                      {entry.snippet.length >= 240 ? "…" : ""}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
    </>
  );
}
