import Link from "next/link";
import styles from "./page.module.css";

// TODO: wire to real /api/brains/[brainId]/companies once Phase 3.7
// (companies list aggregation) endpoint lands. The data shape below mirrors
// what that endpoint will return per docs/plans/frontend-rewrite.md.

type Relation = "investor" | "customer" | "prospect" | "partner" | "competitor";
type Heat = "hot" | "warm" | "cool" | "cold";

type CompanyRow = {
  id: string;
  name: string;
  domain: string;
  logo_initial: string;
  logo_bg?: string;
  logo_color?: string;
  relation: { variant: Relation; label: string };
  heat: { variant: Heat; label: string };
  people: Array<{ initials: string; gold?: boolean }>;
  more_people?: number;
  open_loops: { count: number; late: number };
  last_touch: { ago: string; channel: string };
  ai_decision_maker: { value: string; meta: string };
  ai_stage: { value: string; meta: string };
  detail_href?: string;
};

const placeholderCompanies: CompanyRow[] = [
  {
    id: "sequoia",
    name: "Sequoia Capital",
    domain: "sequoiacap.com",
    logo_initial: "S",
    logo_bg: "var(--arvya-gold)",
    logo_color: "var(--arvya-dark-900)",
    relation: { variant: "investor", label: "Investor - lead" },
    heat: { variant: "hot", label: "Hot - today" },
    people: [
      { initials: "RB", gold: true },
      { initials: "MV" },
      { initials: "JR" },
    ],
    more_people: 2,
    open_loops: { count: 3, late: 2 },
    last_touch: { ago: "1h", channel: "email" },
    ai_decision_maker: { value: "Mike Vernal", meta: "0.89 - n=12 calls" },
    ai_stage: { value: "Term sheet - awaiting", meta: "3 blockers - 0.94" },
  },
  {
    id: "insight",
    name: "Insight Partners",
    domain: "insightpartners.com",
    logo_initial: "I",
    relation: { variant: "investor", label: "Investor - party" },
    heat: { variant: "warm", label: "Warm - 3d" },
    people: [{ initials: "SK" }, { initials: "LH" }],
    open_loops: { count: 1, late: 0 },
    last_touch: { ago: "3d", channel: "note" },
    ai_decision_maker: { value: "Sarah Kim", meta: "0.71 - n=4 emails" },
    ai_stage: { value: "Interest - pre-DD", meta: "followed deck send" },
  },
  {
    id: "marlowe",
    name: "Marlowe Health",
    domain: "marlowe.health - 240 employees",
    logo_initial: "M",
    relation: { variant: "customer", label: "Customer - paid" },
    heat: { variant: "hot", label: "Hot - today" },
    people: [{ initials: "LC" }, { initials: "DM" }, { initials: "PH" }],
    more_people: 4,
    open_loops: { count: 4, late: 0 },
    last_touch: { ago: "16h", channel: "slack" },
    ai_decision_maker: { value: "Daniel Mehta - COO", meta: "0.92 - signed POC" },
    ai_stage: { value: "Expansion - Q3", meta: "added 3 seats wk" },
    detail_href: "marlowe",
  },
  {
    id: "verdant",
    name: "Verdant",
    domain: "verdant.io - 45 employees",
    logo_initial: "V",
    relation: { variant: "customer", label: "Customer - pilot" },
    heat: { variant: "warm", label: "Warm - 2d" },
    people: [{ initials: "JC" }, { initials: "RA" }],
    open_loops: { count: 2, late: 0 },
    last_touch: { ago: "2d", channel: "email" },
    ai_decision_maker: { value: "Joel Chen - founder", meta: "0.96 - founder-led" },
    ai_stage: { value: "Pilot wk 3/6", meta: "on track" },
  },
  {
    id: "caffeinated",
    name: "Caffeinated AI",
    domain: "caffeinated.cc",
    logo_initial: "C",
    relation: { variant: "partner", label: "Partner" },
    heat: { variant: "cool", label: "Cool - 1w" },
    people: [{ initials: "MS" }, { initials: "TG" }],
    open_loops: { count: 0, late: 0 },
    last_touch: { ago: "1w", channel: "meeting" },
    ai_decision_maker: { value: "Maya Singh - advisor", meta: "0.78 - gatekeeper" },
    ai_stage: { value: "Co-marketing scoped", meta: "draft circulating" },
  },
  {
    id: "blackrock",
    name: "BlackRock",
    domain: "blackrock.com - enterprise",
    logo_initial: "B",
    relation: { variant: "prospect", label: "Prospect" },
    heat: { variant: "hot", label: "Hot - 2h" },
    people: [{ initials: "JR", gold: true }, { initials: "EA" }],
    open_loops: { count: 1, late: 1 },
    last_touch: { ago: "2h", channel: "email" },
    ai_decision_maker: { value: "resolving", meta: "n=2 too few" },
    ai_stage: { value: "First-call won", meta: "requested deck" },
  },
  {
    id: "kettle",
    name: "Kettle Labs",
    domain: "kettle.dev - seed",
    logo_initial: "K",
    relation: { variant: "competitor", label: "Competitor" },
    heat: { variant: "cool", label: "Cool - 4d" },
    people: [],
    open_loops: { count: 0, late: 0 },
    last_touch: { ago: "4d", channel: "news" },
    ai_decision_maker: { value: "n/a", meta: "competitor" },
    ai_stage: { value: "Closed $4M seed", meta: "Apr 28 - TC" },
  },
  {
    id: "stripe",
    name: "Stripe",
    domain: "stripe.com - payments vendor",
    logo_initial: "S",
    relation: { variant: "partner", label: "Vendor" },
    heat: { variant: "cold", label: "Cold - 2w" },
    people: [{ initials: "TC" }],
    open_loops: { count: 0, late: 0 },
    last_touch: { ago: "2w", channel: "billing" },
    ai_decision_maker: { value: "vendor", meta: "n/a" },
    ai_stage: { value: "Live - $1.2k MRR", meta: "stable" },
  },
  {
    id: "helix",
    name: "Helix Genomics",
    domain: "helix.com - 800 employees",
    logo_initial: "H",
    relation: { variant: "prospect", label: "Prospect" },
    heat: { variant: "warm", label: "Warm - 5d" },
    people: [{ initials: "DK" }, { initials: "EL" }],
    more_people: 1,
    open_loops: { count: 3, late: 0 },
    last_touch: { ago: "5d", channel: "meeting" },
    ai_decision_maker: { value: "resolving", meta: "3 candidates" },
    ai_stage: { value: "Eval - POC scoped", meta: "security review next" },
  },
  {
    id: "lattice",
    name: "Lattice",
    domain: "lattice.com - 600 employees",
    logo_initial: "L",
    relation: { variant: "prospect", label: "Prospect - cold" },
    heat: { variant: "cold", label: "Cold - 3w" },
    people: [{ initials: "JN" }],
    open_loops: { count: 0, late: 0 },
    last_touch: { ago: "3w", channel: "email" },
    ai_decision_maker: { value: "too cold", meta: "need 1+ touch" },
    ai_stage: { value: "Discovery - stalled", meta: "no response 21d" },
  },
];

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

type PageProps = {
  params: Promise<{ brainId: string }>;
};

export default async function CompaniesPage({ params }: PageProps) {
  const { brainId } = await params;
  const total = placeholderCompanies.length;
  const lateLastSyncMin = 4;

  return (
    <div>
      <header className={styles.pageHead}>
        <div className={styles.eyebrow}>11 / Companies</div>
        <h1>Companies</h1>
        <p>
          Every company the brain has heard of, who relates to whom, and where
          each one stands. Add an AI column to ask the brain a question across
          every row.
        </p>
      </header>

      <div className={styles.coBar}>
        <div className={styles.seg}>
          <span className={styles.segOn}>Table</span>
          <span>Cards</span>
          <span>Graph</span>
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

        <span className={`${styles.filter} ${styles.filterOn}`}>
          Relation: <b>All</b>
        </span>
        <span className={styles.filter}>+ Add filter</span>

        <div className={styles.right}>
          <span className={styles.ct}>
            <b>{total}</b> companies - synced {lateLastSyncMin}m ago
          </span>
          <button type="button" className={styles.iconBtn} aria-label="Sort">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              aria-hidden
            >
              <path d="M3 6h18M6 12h12M9 18h6" />
            </svg>
          </button>
          <button type="button" className={styles.iconBtn} aria-label="Export">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              aria-hidden
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>
        </div>
      </div>

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
              <th className={styles.aiCol}>
                <span className={styles.aiBadge}>AI</span>Decision-maker
              </th>
              <th className={styles.aiCol}>
                <span className={styles.aiBadge}>AI</span>Stage
              </th>
              <th className={styles.addCol} aria-label="Add AI column">
                +
              </th>
            </tr>
          </thead>
          <tbody>
            {placeholderCompanies.map((c) => (
              <tr key={c.id}>
                <td>
                  {c.detail_href ? (
                    <Link
                      href={`/brains/${brainId}/companies/${c.detail_href}`}
                      style={{ textDecoration: "none", color: "inherit", display: "block" }}
                    >
                      <CoNameCell row={c} />
                    </Link>
                  ) : (
                    <CoNameCell row={c} />
                  )}
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
                        <span
                          key={i}
                          className={styles.av}
                          style={
                            p.gold
                              ? { background: "var(--arvya-gold)", color: "var(--arvya-dark-900)" }
                              : undefined
                          }
                        >
                          {p.initials}
                        </span>
                      ))
                    )}
                    {c.more_people && (
                      <span className={`${styles.av} ${styles.more}`}>
                        +{c.more_people}
                      </span>
                    )}
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
                  <span className={styles.ago}>
                    <b>{c.last_touch.ago}</b> - {c.last_touch.channel}
                  </span>
                </td>
                <td className={styles.aiCell}>
                  <div className={styles.aiVal}>{c.ai_decision_maker.value}</div>
                  <div className={styles.aiMeta}>{c.ai_decision_maker.meta}</div>
                </td>
                <td className={styles.aiCell}>
                  <div className={styles.aiVal}>{c.ai_stage.value}</div>
                  <div className={styles.aiMeta}>{c.ai_stage.meta}</div>
                </td>
                <td />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.footHint}>
        <span>
          AI columns are continuously recompiled by the brain - confidence
          shown beneath each cell
        </span>
        <span style={{ marginLeft: "auto" }}>
          showing {total} of 87 companies
        </span>
      </div>
    </div>
  );
}

function CoNameCell({ row }: { row: CompanyRow }) {
  return (
    <div className={styles.coName}>
      <span
        className={styles.coNameLg}
        style={
          row.logo_bg
            ? { background: row.logo_bg, color: row.logo_color }
            : undefined
        }
      >
        {row.logo_initial}
      </span>
      <span className={styles.coNameNm}>
        {row.name}
        <span className={`${styles.coNameNm} ${styles.sub}`}>{row.domain}</span>
      </span>
    </div>
  );
}
