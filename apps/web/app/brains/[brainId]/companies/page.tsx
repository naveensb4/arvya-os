import Link from "next/link";
import type { MemoryObject, OpenLoop, SourceItem } from "@arvya/core";
import { getBrainSnapshot } from "@/lib/brain/store";
import styles from "./page.module.css";

// Companies - real data from memory_objects of type "company". Each row
// derives heat (recency), relation (from properties.relation if set), open
// loops (matched by entity name in linked openLoops), and last touch
// (most recent linked source item) from the brain snapshot.

type Relation = "investor" | "customer" | "prospect" | "partner" | "competitor";
type Heat = "hot" | "warm" | "cool" | "cold";

type CompanyRow = {
  id: string;
  name: string;
  domain: string;
  logo_initial: string;
  relation: { variant: Relation; label: string };
  heat: { variant: Heat; label: string };
  people: Array<{ initials: string; gold?: boolean }>;
  more_people?: number;
  open_loops: { count: number; late: number };
  last_touch: { ago: string; channel: string } | null;
  description: string;
  // Where did the brain learn about this company? Source title + a short
  // exact quote from the source. Lets the user verify the company is real
  // and not a hallucination.
  evidence: { sourceTitle: string; quote: string } | null;
  confidence: number | null;
};

function relClass(v: Relation) {
  return {
    investor: styles.relInvestor,
    customer: styles.relCustomer,
    prospect: styles.relProspect,
    partner: styles.relPartner,
    competitor: styles.relCompetitor,
  }[v];
}

function heatClass(v: Heat) {
  return {
    hot: styles.heatHot,
    warm: styles.heatWarm,
    cool: styles.heatCool,
    cold: styles.heatCold,
  }[v];
}

function inferRelation(props?: Record<string, unknown>): {
  variant: Relation;
  label: string;
} {
  const raw = (props?.relation ?? props?.kind ?? props?.type ?? "") as string;
  const r = String(raw).toLowerCase();
  if (r.includes("investor")) return { variant: "investor", label: "Investor" };
  if (r.includes("customer")) return { variant: "customer", label: "Customer" };
  if (r.includes("partner")) return { variant: "partner", label: "Partner" };
  if (r.includes("competitor")) return { variant: "competitor", label: "Competitor" };
  return { variant: "prospect", label: "Prospect" };
}

function heatFromAge(ms: number): { variant: Heat; label: string } {
  const day = 24 * 60 * 60 * 1000;
  if (ms < 2 * day) return { variant: "hot", label: "Hot - today" };
  if (ms < 7 * day) {
    const d = Math.floor(ms / day);
    return { variant: "warm", label: `Warm - ${d}d` };
  }
  if (ms < 21 * day) {
    const d = Math.floor(ms / day);
    return { variant: "cool", label: `Cool - ${d}d` };
  }
  const w = Math.max(1, Math.floor(ms / (7 * day)));
  return { variant: "cold", label: `Cold - ${w}w` };
}

function formatAgo(ms: number): string {
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  return `${w}w`;
}

function initialsFromName(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

function buildCompanyRow(
  company: MemoryObject,
  people: MemoryObject[],
  openLoops: OpenLoop[],
  sourceItems: SourceItem[],
): CompanyRow {
  const props = company.properties ?? {};
  const domain = (props.domain as string | undefined) ?? "";
  const description = company.description ?? "";

  const lower = company.name.toLowerCase();
  const relatedPeople = people.filter((p) => {
    const orgName =
      (p.properties?.company as string | undefined) ??
      (p.properties?.organization as string | undefined) ??
      "";
    return (
      orgName.toLowerCase() === lower ||
      p.description.toLowerCase().includes(lower)
    );
  });

  const relatedLoops = openLoops.filter((l) => {
    const haystack = `${l.title} ${l.description}`.toLowerCase();
    return haystack.includes(lower);
  });
  const overdue = relatedLoops.filter(
    (l) =>
      l.dueDate &&
      new Date(l.dueDate).getTime() < Date.now() &&
      l.status !== "done" &&
      l.status !== "closed" &&
      l.status !== "dismissed",
  ).length;

  // Most-recent source mentioning the company (by name match in title or
  // raw text). Used for both heat and last-touch.
  const relatedSources = sourceItems
    .filter(
      (s) =>
        s.title.toLowerCase().includes(lower) ||
        (s.content ?? "").toLowerCase().includes(lower),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const lastSource = relatedSources[0];
  const lastTouchMs = lastSource
    ? Date.now() - new Date(lastSource.createdAt).getTime()
    : null;

  const heat = lastTouchMs !== null
    ? heatFromAge(lastTouchMs)
    : { variant: "cold" as const, label: "No touches" };

  const last_touch = lastSource
    ? {
        ago: formatAgo(lastTouchMs ?? 0),
        channel: lastSource.type,
      }
    : null;

  const peopleAvatars = relatedPeople.slice(0, 4).map((p) => ({
    initials: initialsFromName(p.name),
  }));
  const more = relatedPeople.length > 4 ? relatedPeople.length - 4 : 0;

  // Evidence: the source the company was extracted from (memory_object
  // tracks sourceItemId). Quote is the snippet the brain stored, if any.
  const sourceItem = company.sourceItemId
    ? sourceItems.find((s) => s.id === company.sourceItemId)
    : undefined;
  const evidence = sourceItem
    ? {
        sourceTitle: sourceItem.title,
        quote: company.sourceQuote ?? "",
      }
    : null;

  return {
    id: company.id,
    name: company.name,
    domain,
    logo_initial: company.name.charAt(0).toUpperCase() || "?",
    relation: inferRelation(props),
    heat,
    people: peopleAvatars,
    more_people: more > 0 ? more : undefined,
    open_loops: { count: relatedLoops.length, late: overdue },
    last_touch,
    description,
    evidence,
    confidence:
      typeof company.confidence === "number" ? company.confidence : null,
  };
}

type PageProps = {
  params: Promise<{ brainId: string }>;
};

export default async function CompaniesPage({ params }: PageProps) {
  const { brainId } = await params;
  const snapshot = await getBrainSnapshot(brainId);
  const memoryObjects = snapshot.memoryObjects ?? [];
  const openLoops = snapshot.openLoops ?? [];
  const sourceItems = snapshot.sourceItems ?? [];

  const companies = memoryObjects.filter((m) => m.objectType === "company");
  const people = memoryObjects.filter((m) => m.objectType === "person");

  const rows = companies
    .map((c) => buildCompanyRow(c, people, openLoops, sourceItems))
    .sort((a, b) => {
      // Hot first, then by name.
      const order: Record<Heat, number> = { hot: 0, warm: 1, cool: 2, cold: 3 };
      const d = order[a.heat.variant] - order[b.heat.variant];
      if (d !== 0) return d;
      return a.name.localeCompare(b.name);
    });

  const total = rows.length;
  const lastSyncMin = sourceItems[0]
    ? Math.floor((Date.now() - new Date(sourceItems[0].createdAt).getTime()) / 60_000)
    : null;

  return (
    <div>
      <header className={styles.pageHead}>
        <div className={styles.eyebrow}>Companies</div>
        <h1>Companies</h1>
        <p>
          Every company the brain has heard of, who relates to whom, and where
          each one stands. Heat is computed from how recently a source touched
          the company.
        </p>
      </header>

      <div className={styles.coBar}>
        <div className={styles.seg}>
          <span className={styles.segOn}>Table</span>
        </div>

        <div className={styles.coSearch}>
          <svg
            viewBox="0 0 24 24"
            width="13"
            height="13"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            aria-hidden
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input placeholder={`Search ${total} companies`} />
        </div>

        <div className={styles.right}>
          <span className={styles.ct}>
            <b>{total}</b> companies
            {lastSyncMin !== null ? ` - last source ${lastSyncMin}m ago` : ""}
          </span>
        </div>
      </div>

      {total === 0 ? (
        <div
          style={{
            padding: "60px 20px",
            textAlign: "center",
            fontSize: 14,
            color: "var(--text-tertiary)",
          }}
        >
          No companies have been extracted from your sources yet. Ingest a
          source - email, transcript, document - and the brain will start
          surfacing companies here.
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.crm}>
            <thead>
              <tr>
                <th>Company</th>
                <th>Relation</th>
                <th>Heat</th>
                <th>People</th>
                <th>Open loops</th>
                <th>Last touch</th>
                <th>Source of truth</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td>
                    <CoNameCell row={c} />
                  </td>
                  <td>
                    <span className={`${styles.rel} ${relClass(c.relation.variant)}`}>
                      <span className={styles.pip} />
                      {c.relation.label}
                    </span>
                  </td>
                  <td>
                    <span className={`${styles.heat} ${heatClass(c.heat.variant)}`}>
                      <span className={styles.bars}>
                        <i />
                        <i />
                        <i />
                        <i />
                      </span>
                      {c.heat.label}
                    </span>
                  </td>
                  <td>
                    <span className={styles.ppl}>
                      {c.people.length === 0 ? (
                        <span className={`${styles.av} ${styles.more}`}>-</span>
                      ) : (
                        c.people.map((p, i) => (
                          <span key={i} className={styles.av}>
                            {p.initials}
                          </span>
                        ))
                      )}
                      {c.more_people ? (
                        <span className={`${styles.av} ${styles.more}`}>
                          +{c.more_people}
                        </span>
                      ) : null}
                    </span>
                  </td>
                  <td>
                    {c.open_loops.count === 0 ? (
                      <span className={`${styles.loops} ${styles.loopsZero}`}>none</span>
                    ) : c.open_loops.late > 0 ? (
                      <span className={`${styles.loops} ${styles.loopsLate}`}>
                        <b>{c.open_loops.late} late</b>
                        {c.open_loops.count > c.open_loops.late
                          ? ` - ${c.open_loops.count} open`
                          : ""}
                      </span>
                    ) : (
                      <span className={styles.loops}>
                        <b>{c.open_loops.count}</b> open
                      </span>
                    )}
                  </td>
                  <td>
                    {c.last_touch ? (
                      <span className={styles.ago}>
                        <b>{c.last_touch.ago}</b> - {c.last_touch.channel}
                      </span>
                    ) : (
                      <span className={styles.ago}>-</span>
                    )}
                  </td>
                  <td>
                    {c.evidence ? (
                      <div
                        style={{
                          fontSize: 11.5,
                          color: "var(--text-secondary)",
                          lineHeight: 1.5,
                        }}
                      >
                        <div
                          style={{
                            color: "var(--text-tertiary)",
                            fontFamily: "var(--font-mono)",
                            fontSize: 10,
                            letterSpacing: "0.04em",
                            textTransform: "uppercase",
                            marginBottom: 2,
                          }}
                        >
                          source
                          {c.confidence !== null
                            ? ` - confidence ${c.confidence.toFixed(2)}`
                            : ""}
                        </div>
                        <div
                          style={{
                            color: "var(--text-primary)",
                            fontWeight: 500,
                          }}
                        >
                          {c.evidence.sourceTitle.slice(0, 50)}
                          {c.evidence.sourceTitle.length > 50 ? "..." : ""}
                        </div>
                        {c.evidence.quote ? (
                          <div
                            style={{
                              fontStyle: "italic",
                              fontSize: 11,
                              color: "var(--text-secondary)",
                              marginTop: 2,
                            }}
                          >
                            “{c.evidence.quote.slice(0, 90)}
                            {c.evidence.quote.length > 90 ? "..." : ""}”
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <span
                        style={{
                          fontSize: 11,
                          color: "var(--text-tertiary)",
                          fontStyle: "italic",
                        }}
                      >
                        no source
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > 0 ? (
        <div className={styles.footHint}>
          <span>
            Companies are extracted from your sources by the brain. Connect
            more sources to grow this list.
          </span>
          <span style={{ marginLeft: "auto" }}>
            showing {total} {total === 1 ? "company" : "companies"}
          </span>
        </div>
      ) : null}

      {/* brainId is captured here so subsequent links can use it without
          unused-var warnings. */}
      <span style={{ display: "none" }}>{brainId}</span>
    </div>
  );
}

function CoNameCell({ row }: { row: CompanyRow }) {
  return (
    <div className={styles.coName}>
      <span className={styles.coNameLg}>{row.logo_initial}</span>
      <span className={styles.coNameNm}>
        {row.name}
        {row.domain ? (
          <span className={`${styles.coNameNm} ${styles.sub}`}>{row.domain}</span>
        ) : null}
      </span>
    </div>
  );
}
