import Link from "next/link";
import styles from "./page.module.css";

// TODO: wire to GET /api/brains/[brainId]/people (Phase 3.6) and
// /api/brains/[brainId]/ai-columns?entityType=person (Phase 3.5). Until
// those endpoints land, the page renders the prototype's 12-row showcase.

type Relation = "investor" | "customer" | "partner" | "team" | "press" | "recruit";
type Heat = "hot" | "warm" | "ok";
type OweVariant = "warn" | "ok" | "you";

type Person = {
  id: string;
  name: string;
  email: string;
  initials: string;
  initials_variant?: "gold" | "dark";
  relation: { variant: Relation; label: string };
  company?: { letter: string; bg: string; color: string; name: string; href?: string } | null;
  role: string;
  last_touch: { text: string; warn?: boolean };
  owe: { variant: OweVariant; text: string };
  heat: { variant: Heat; bars: number; label: string };
  ai_signal: { text: string; conf: number };
};

const placeholderPeople: Person[] = [
  {
    id: "roelof",
    name: "Roelof Botha",
    email: "roelof@sequoiacap.com",
    initials: "RB",
    initials_variant: "dark",
    relation: { variant: "investor", label: "Investor" },
    company: { letter: "S", bg: "var(--arvya-gold)", color: "#0E1726", name: "Sequoia Capital" },
    role: "Partner",
    last_touch: { text: "Today - 06:04" },
    owe: { variant: "warn", text: "You - 3h left" },
    heat: { variant: "hot", bars: 4, label: "Hot" },
    ai_signal: { text: "Sent 3 questions; reply window closing fast.", conf: 0.94 },
  },
  {
    id: "eli",
    name: "Eli Chen",
    email: "eli@marlowe.health",
    initials: "EC",
    relation: { variant: "customer", label: "Customer" },
    company: { letter: "M", bg: "#2A6FDB", color: "#fff", name: "Marlowe Health", href: "marlowe" },
    role: "Product Lead",
    last_touch: { text: "8d", warn: true },
    owe: { variant: "warn", text: "You - 1.5d late" },
    heat: { variant: "hot", bars: 3, label: "Hot" },
    ai_signal: { text: "Reply length dropped 40 percent - decision close.", conf: 0.81 },
  },
  {
    id: "jon",
    name: "Jon Kessler",
    email: "jon.kessler@blackrock.com",
    initials: "JK",
    relation: { variant: "partner", label: "Prospect" },
    company: { letter: "B", bg: "#0a0a0a", color: "#fff", name: "BlackRock" },
    role: "VP Strategy",
    last_touch: { text: "Mon - 6d" },
    owe: { variant: "warn", text: "You - 3d late" },
    heat: { variant: "hot", bars: 4, label: "Hot" },
    ai_signal: { text: "Promised graph spec by Thu. Drift = 3 days.", conf: 0.97 },
  },
  {
    id: "maya",
    name: "Maya Nair",
    email: "maya@caffeinated.cc",
    initials: "MN",
    initials_variant: "gold",
    relation: { variant: "partner", label: "Partner" },
    company: { letter: "C", bg: "#6E4F2A", color: "#fff", name: "Caffeinated AI" },
    role: "Founder",
    last_touch: { text: "Wed - 4d" },
    owe: { variant: "warn", text: "You" },
    heat: { variant: "warm", bars: 3, label: "Warm" },
    ai_signal: { text: "Slack connector ETA - pilot blocking.", conf: 0.86 },
  },
  {
    id: "andy",
    name: "Andy Weissman",
    email: "andy@usv.com",
    initials: "AW",
    relation: { variant: "investor", label: "Investor" },
    company: { letter: "U", bg: "#FF5050", color: "#fff", name: "Union Square Ventures" },
    role: "Partner",
    last_touch: { text: "Tue - 5d" },
    owe: { variant: "you", text: "Soft ask" },
    heat: { variant: "warm", bars: 2, label: "Warm" },
    ai_signal: { text: "Offered partner intro - expires day 14.", conf: 0.78 },
  },
  {
    id: "priya",
    name: "Priya Rao",
    email: "priya@marlowe.health",
    initials: "PR",
    relation: { variant: "customer", label: "Customer" },
    company: { letter: "M", bg: "#2A6FDB", color: "#fff", name: "Marlowe Health", href: "marlowe" },
    role: "Eng Manager",
    last_touch: { text: "Wed - 4d" },
    owe: { variant: "ok", text: "-" },
    heat: { variant: "warm", bars: 3, label: "Warm" },
    ai_signal: { text: "Expansion signal - 2 new teams in 4 to 6w.", conf: 0.83 },
  },
  {
    id: "sarah",
    name: "Sarah Meier",
    email: "sarah.meier@insightpartners.com",
    initials: "SM",
    relation: { variant: "investor", label: "Investor" },
    company: { letter: "I", bg: "#1F4FA8", color: "#fff", name: "Insight Partners" },
    role: "VP",
    last_touch: { text: "Mon - 6d" },
    owe: { variant: "ok", text: "She" },
    heat: { variant: "warm", bars: 2, label: "Warm" },
    ai_signal: { text: "3/5 references replied. Ahead of expectation.", conf: 0.74 },
  },
  {
    id: "lina",
    name: "Lina Kapoor",
    email: "lina.kapoor@gmail.com",
    initials: "LK",
    relation: { variant: "recruit", label: "Recruiting" },
    company: null,
    role: "Principal Eng",
    last_touch: { text: "6d" },
    owe: { variant: "warn", text: "You" },
    heat: { variant: "warm", bars: 2, label: "Warm" },
    ai_signal: { text: "Decide by Friday silent. Probably stuck.", conf: 0.69 },
  },
  {
    id: "dev",
    name: "Dev Varma",
    email: "dev@marlowe.health",
    initials: "DV",
    relation: { variant: "customer", label: "Customer" },
    company: { letter: "M", bg: "#2A6FDB", color: "#fff", name: "Marlowe Health", href: "marlowe" },
    role: "CTO",
    last_touch: { text: "14d" },
    owe: { variant: "ok", text: "-" },
    heat: { variant: "ok", bars: 2, label: "OK" },
    ai_signal: { text: "Economic buyer - quiet but reads weekly recap.", conf: 0.62 },
  },
  {
    id: "rohan",
    name: "Rohan Tiwari",
    email: "rohan@theinformation.com",
    initials: "RT",
    relation: { variant: "press", label: "Press" },
    company: { letter: "T", bg: "#000", color: "#fff", name: "The Information" },
    role: "Reporter",
    last_touch: { text: "89d" },
    owe: { variant: "you", text: "-" },
    heat: { variant: "ok", bars: 1, label: "Cool" },
    ai_signal: { text: "Quoted 2 competitors recently. Re-engage now.", conf: 0.71 },
  },
  {
    id: "sara",
    name: "Sara Kapur",
    email: "legal@marlowe.health",
    initials: "SK",
    relation: { variant: "customer", label: "Customer" },
    company: { letter: "M", bg: "#2A6FDB", color: "#fff", name: "Marlowe Health", href: "marlowe" },
    role: "Procurement",
    last_touch: { text: "22d" },
    owe: { variant: "ok", text: "-" },
    heat: { variant: "ok", bars: 1, label: "Cool" },
    ai_signal: { text: "Activates only at renewal. Don't bug.", conf: 0.55 },
  },
  {
    id: "david",
    name: "David Garcia",
    email: "dgarcia@gmail.com",
    initials: "DG",
    relation: { variant: "team", label: "Advisor" },
    company: null,
    role: "Advisor",
    last_touch: { text: "42d" },
    owe: { variant: "you", text: "-" },
    heat: { variant: "ok", bars: 1, label: "Cool" },
    ai_signal: { text: "Catch up next month said in March. Lapsed.", conf: 0.66 },
  },
];

const tagClass = (v: Relation) => {
  return {
    investor: styles.tagInvestor,
    customer: styles.tagCustomer,
    partner: styles.tagPartner,
    team: styles.tagTeam,
    press: styles.tagPress,
    recruit: styles.tagRecruit,
  }[v];
};

const heatClass = (v: Heat) =>
  v === "hot" ? styles.heatHot : v === "warm" ? styles.heatWarm : styles.heatOk;

const oweClass = (v: OweVariant) =>
  `${styles.owePill} ${v === "warn" ? styles.oweWarn : v === "ok" ? styles.oweOk : styles.oweYou}`;

const avClass = (variant?: "gold" | "dark") =>
  `${styles.av} ${variant === "gold" ? styles.avGold : variant === "dark" ? styles.avDark : ""}`;

type PageProps = {
  params: Promise<{ brainId: string }>;
};

export default async function PeoplePage({ params }: PageProps) {
  const { brainId } = await params;
  const total = placeholderPeople.length;

  return (
    <div>
      <header className={styles.pageHead}>
        <span className={styles.eyebrow}>People - 184 contacts</span>
        <h1>Contacts.</h1>
      </header>

      <div className={styles.strip}>
        <div className={styles.stripOn}>
          <div className={styles.lab}>All</div>
          <div className={styles.v}>184</div>
          <div className={styles.sub}>across 47 companies</div>
        </div>
        <div>
          <div className={styles.lab}>Owe a reply</div>
          <div className={`${styles.v} ${styles.vWarn}`}>7</div>
          <div className={styles.sub}>3 past patience window</div>
        </div>
        <div>
          <div className={styles.lab}>Hot this week</div>
          <div className={styles.v}>14</div>
          <div className={styles.sub}>touched in last 7d</div>
        </div>
        <div>
          <div className={styles.lab}>Cooling</div>
          <div className={styles.v}>12</div>
          <div className={styles.sub}>no touch over 30d</div>
        </div>
        <div>
          <div className={styles.lab}>Investors</div>
          <div className={styles.v}>22</div>
          <div className={styles.sub}>8 active diligence</div>
        </div>
      </div>

      <div className={styles.ppBar}>
        <div className={styles.seg}>
          <span className={styles.segOn}>Table</span>
          <span>Cards</span>
          <span>Queue</span>
        </div>
        <span className={`${styles.filter} ${styles.filterOn}`}>Relation: All</span>
        <span className={styles.filter}>Last touch: Anytime</span>
        <span className={styles.filter}>Owes reply: Any</span>
        <span className={styles.filter}>+ Add filter</span>
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
          <input placeholder="Find a person" />
        </div>
        <button type="button" className={styles.add}>
          + New contact
        </button>
      </div>

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
            <th className={styles.aiCol} style={{ minWidth: 280 }}>
              Why now <span style={{ fontWeight: 400, color: "var(--text-tertiary)" }}>ai</span>
            </th>
            <th className={styles.addCol}>+ Add column</th>
          </tr>
        </thead>
        <tbody>
          {placeholderPeople.map((p) => (
            <tr key={p.id}>
              <td>
                <div className={styles.pn}>
                  <span className={avClass(p.initials_variant)}>{p.initials}</span>
                  <span className={styles.nm}>
                    {p.name}
                    <span className={styles.sub}>{p.email}</span>
                  </span>
                </div>
              </td>
              <td>
                <span className={`${styles.tag} ${tagClass(p.relation.variant)}`}>
                  <span className={styles.pip} />
                  {p.relation.label}
                </span>
              </td>
              <td>
                {p.company ? (
                  p.company.href ? (
                    <Link
                      href={`/brains/${brainId}/companies/${p.company.href}`}
                      style={{ textDecoration: "none", color: "inherit" }}
                    >
                      <CompanyChip company={p.company} />
                    </Link>
                  ) : (
                    <CompanyChip company={p.company} />
                  )
                ) : (
                  <span style={{ color: "var(--text-tertiary)", fontStyle: "italic" }}>
                    Independent
                  </span>
                )}
              </td>
              <td>{p.role}</td>
              <td>
                <span className={`${styles.last} ${p.last_touch.warn ? styles.lastWarn : ""}`}>
                  {p.last_touch.text}
                </span>
              </td>
              <td>
                <span className={oweClass(p.owe.variant)}>{p.owe.text}</span>
              </td>
              <td>
                <span className={`${styles.heat} ${heatClass(p.heat.variant)}`}>
                  <span className={styles.bars}>
                    <i className={p.heat.bars >= 1 ? styles.on : ""} />
                    <i className={p.heat.bars >= 2 ? styles.on : ""} />
                    <i className={p.heat.bars >= 3 ? styles.on : ""} />
                    <i className={p.heat.bars >= 4 ? styles.on : ""} />
                  </span>
                  {p.heat.label}
                </span>
              </td>
              <td className={styles.aiCell}>
                <span className={styles.aiSig}>
                  <span className={styles.spark}>~</span>
                  {p.ai_signal.text}
                  <span className={styles.conf}>{p.ai_signal.conf.toFixed(2)}</span>
                </span>
              </td>
              <td />
            </tr>
          ))}
        </tbody>
      </table>

      <p className={styles.hint}>
        {total} of {total} shown - row click opens person - drag column header
        to reorder - the brain fills new columns for everyone
      </p>
    </div>
  );
}

function CompanyChip({ company }: { company: NonNullable<Person["company"]> }) {
  return (
    <span className={styles.cm}>
      <span
        className={styles.lg}
        style={{ background: company.bg, color: company.color }}
      >
        {company.letter}
      </span>
      {company.name}
    </span>
  );
}
