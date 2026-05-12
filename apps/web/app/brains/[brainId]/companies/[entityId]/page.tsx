import styles from "./page.module.css";
import { CompanyTabs } from "./tabs";

// TODO: wire to real /api/brains/[brainId]/companies/[entityId] (Phase 3.7)
// + /entities/[entityId]/timeline (Phase 3.8) + /entities/[entityId]/notes
// (Phase 3.3). Until those endpoints land, the page renders the prototype's
// Marlowe Health showcase content.

type TimelineItem = {
  when: string;
  source: string;
  title: string;
  body: string;
  pills: Array<{ variant: "default" | "gold" | "warn" | "ok"; text: string }>;
  quote?: string;
  marker: "default" | "gold" | "warn" | "ok";
};

type ActionItem = {
  title: string;
  sub: string;
  due: string;
  dueWarn?: boolean;
  done?: boolean;
};

type Contact = {
  initials: string;
  name: string;
  role: string;
  heat: "hot" | "warm" | "ok" | "default";
};

type Ledger = { k: string; v: string; tone?: "warn" | "ok" };

type CompanyDetail = {
  name: string;
  domain_meta: string;
  tag_line: string;
  initials: string;
  relation_label: string;
  kpis: Array<{ label: string; value: string; sub: string; tone?: "warn" | "ok" }>;
  timeline: TimelineItem[];
  actions: ActionItem[];
  contacts: Contact[];
  ledger: Ledger[];
  sources: Ledger[];
};

const placeholderMarlowe: CompanyDetail = {
  name: "Marlowe Health",
  domain_meta: "marlowe.health - 240 employees - NYC",
  tag_line: "Healthcare AI infrastructure",
  initials: "M",
  relation_label: "Customer - paid",
  kpis: [
    { label: "ARR", value: "$84k", sub: "renewed Apr" },
    { label: "Health", value: "82", sub: "up 8 this month", tone: "ok" },
    { label: "Last touch", value: "8d", sub: "Eli (PM) - email" },
    { label: "Open commits", value: "1", sub: "data residency", tone: "warn" },
    { label: "Confidence", value: "0.84", sub: "call notes 18d old" },
  ],
  timeline: [
    {
      when: "Today - 06:14",
      source: "Brain inference",
      title: "Eli's reply length is dropping - decision close.",
      body:
        "Reply length on the diligence thread dropped 40 percent over last 3 messages (avg 480w to 287w). For Eli, this pattern usually precedes a decision within 5 to 10 days. He still hasn't responded to your data residency answer.",
      pills: [
        { variant: "gold", text: "Behavioral signal" },
        { variant: "default", text: "Confidence 0.81" },
      ],
      marker: "gold",
    },
    {
      when: "Tue - 8d ago",
      source: "Email - Eli Chen",
      title: "Eli sent diligence notes - asked about data residency.",
      body:
        "Long-form email (480w) walking through their security review. Key ask: where does customer data live, and what is your sub-processor list? You replied with the generic FAQ. He hasn't responded.",
      quote:
        "We are past the point of evaluating capabilities - the gating question is data residency. Our compliance team needs a definitive answer before we can expand.",
      pills: [
        { variant: "warn", text: "Reply 1.5 days late" },
        { variant: "default", text: "generated FAQ entry" },
      ],
      marker: "warn",
    },
    {
      when: "Fri - 11d ago",
      source: "Linear - PR #482",
      title: "Bug fix shipped - they don't know yet.",
      body:
        "PR #482 fixed the export issue Marlowe reported on Oct 14. Engineering shipped Friday but no one told them. Brain drafted a 1-liner ready to send.",
      pills: [{ variant: "ok", text: "Loop ready to close" }],
      marker: "ok",
    },
    {
      when: "Wed - 13d ago",
      source: "Meet - 47min",
      title: "Weekly check-in (Eli, Priya, Maya).",
      body:
        "Pilot extending well. Two new internal teams requested access. Eli flagged he wants to discuss expansion in 4 to 6 weeks.",
      pills: [
        { variant: "gold", text: "Expansion signal" },
        { variant: "default", text: "3 commitments captured" },
      ],
      marker: "default",
    },
    {
      when: "Apr 12 - 30d ago",
      source: "DocuSign",
      title: "Pilot agreement signed.",
      body: "3-month pilot, 50 seats, $7k/mo. Auto-converts to annual unless cancelled by Jul 12.",
      pills: [],
      marker: "default",
    },
  ],
  actions: [
    {
      title: "Send Eli the data residency answer",
      sub: "promised in his Tue email - brain has draft ready",
      due: "3 days late",
      dueWarn: true,
    },
    {
      title: "Tell them PR #482 shipped",
      sub: "bug they reported Oct 14 - 1-liner drafted",
      due: "Today",
    },
    {
      title: "Schedule expansion conversation",
      sub: "Eli flagged on Wed call - target 4 to 6 weeks",
      due: "Jun 10",
    },
    {
      title: "Renewal paperwork",
      sub: "signed Apr 12, $84k ARR",
      due: "Done",
      done: true,
    },
  ],
  contacts: [
    { initials: "EC", name: "Eli Chen", role: "Product Lead - primary contact", heat: "hot" },
    { initials: "PR", name: "Priya Rao", role: "Eng Manager - technical contact", heat: "warm" },
    { initials: "MN", name: "Maya Nair", role: "Clinical Ops - power user", heat: "ok" },
    { initials: "DV", name: "Dev Varma", role: "CTO - economic buyer", heat: "default" },
    { initials: "SK", name: "Sara Kapur", role: "Procurement - legal", heat: "default" },
  ],
  ledger: [
    { k: "Pilot signed", v: "Apr 12" },
    { k: "Renewal", v: "Jul 12 - auto" },
    { k: "ARR", v: "$84k" },
    { k: "Open promises", v: "1 late", tone: "warn" },
    { k: "Reply window", v: "+1.5d over", tone: "warn" },
    { k: "Health", v: "82 / 100", tone: "ok" },
    { k: "Expansion signal", v: "Strong", tone: "ok" },
  ],
  sources: [
    { k: "Gmail", v: "22 threads" },
    { k: "Calendar", v: "14 meetings" },
    { k: "Notetaker", v: "7 transcripts" },
    { k: "HubSpot", v: "5 contacts" },
    { k: "Notion", v: "12 docs" },
    { k: "Linear", v: "3 tickets" },
  ],
};

function pillClass(v: TimelineItem["pills"][number]["variant"]) {
  if (v === "gold") return `${styles.ipill} ${styles.ipillGold}`;
  if (v === "warn") return `${styles.ipill} ${styles.ipillWarn}`;
  if (v === "ok") return `${styles.ipill} ${styles.ipillOk}`;
  return styles.ipill;
}

function markerClass(m: TimelineItem["marker"]) {
  if (m === "gold") return `${styles.tlItem} ${styles.tlGold}`;
  if (m === "warn") return `${styles.tlItem} ${styles.tlWarn}`;
  if (m === "ok") return `${styles.tlItem} ${styles.tlOk}`;
  return styles.tlItem;
}

function heatDotClass(h: Contact["heat"]) {
  if (h === "hot") return `${styles.heatDot} ${styles.heatDotHot}`;
  if (h === "warm") return `${styles.heatDot} ${styles.heatDotWarm}`;
  if (h === "ok") return `${styles.heatDot} ${styles.heatDotOk}`;
  return styles.heatDot;
}

type PageProps = {
  params: Promise<{ brainId: string; entityId: string }>;
};

export default async function CompanyDetailPage({ params }: PageProps) {
  const { entityId } = await params;
  // TODO: fetch by entityId. Until the endpoint exists, render the placeholder.
  void entityId;
  const co = placeholderMarlowe;

  const tabs = [
    {
      id: "timeline" as const,
      label: "Timeline",
      count: 42,
      content: (
        <div className={styles.tl}>
          {co.timeline.map((item, i) => (
            <div key={i} className={markerClass(item.marker)}>
              <div className={styles.tlMeta}>
                <span>{item.when}</span>
                <span className={styles.src}>{item.source}</span>
              </div>
              <div className={styles.tlCard}>
                <div className={styles.ttl}>{item.title}</div>
                <div className={styles.body}>{item.body}</div>
                {item.quote && <div className={styles.quote}>{item.quote}</div>}
                <div className={styles.pills}>
                  {item.pills.map((p, j) => (
                    <span key={j} className={pillClass(p.variant)}>
                      {p.text}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      ),
    },
    {
      id: "actions" as const,
      label: "Action items",
      count: co.actions.length,
      content: (
        <div className={styles.aiList}>
          {co.actions.map((a, i) => (
            <div
              key={i}
              className={`${styles.aiItem} ${a.done ? styles.aiItemDone : ""}`}
            >
              <span className={styles.chk} />
              <div>
                <div className={styles.ttl}>{a.title}</div>
                <div className={styles.sub}>{a.sub}</div>
              </div>
              <span className={`${styles.due} ${a.dueWarn ? styles.dueWarn : ""}`}>
                {a.due}
              </span>
            </div>
          ))}
        </div>
      ),
    },
    {
      id: "transcripts" as const,
      label: "Transcripts",
      count: 7,
      content: (
        <div className={styles.panel}>
          <h3>Transcripts <span className="c">7 indexed</span></h3>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
            TODO: Render call transcripts list once /entities/[entityId]/transcripts endpoint lands.
          </p>
        </div>
      ),
    },
    {
      id: "docs" as const,
      label: "Docs",
      count: 12,
      content: (
        <div className={styles.panel}>
          <h3>Shared documents <span className="c">12 indexed</span></h3>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
            TODO: render shared doc list once /entities/[entityId]/docs endpoint lands.
          </p>
        </div>
      ),
    },
    {
      id: "threads" as const,
      label: "Email threads",
      count: 22,
      content: (
        <div className={styles.panel}>
          <h3>Email threads <span className="c">22 with this company</span></h3>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
            TODO: render thread list once /entities/[entityId]/threads endpoint lands.
          </p>
        </div>
      ),
    },
  ];

  return (
    <div>
      <header className={styles.coHead}>
        <div className={styles.lg}>{co.initials}</div>
        <div>
          <h1>{co.name}</h1>
          <div className={styles.coHeadMeta}>
            <span className={styles.rel}>
              <span className={styles.pip} />
              {co.relation_label}
            </span>
            <span>{co.domain_meta}</span>
            <span style={{ color: "var(--arvya-gold-700)" }}>{co.tag_line}</span>
          </div>
        </div>
        <div className={styles.coActions}>
          <button type="button">Catch me up</button>
          <button type="button">Schedule</button>
          <button type="button" className={styles.primary}>
            Reply to Eli
          </button>
        </div>
      </header>

      <div className={styles.kpis}>
        {co.kpis.map((k) => (
          <div key={k.label}>
            <div className={styles.lab}>{k.label}</div>
            <div
              className={`${styles.v} ${k.tone === "warn" ? styles.vWarn : ""} ${k.tone === "ok" ? styles.vGood : ""}`}
            >
              {k.value}
            </div>
            <div className={styles.sub}>{k.sub}</div>
          </div>
        ))}
      </div>

      <div className={styles.grid}>
        <div>
          <CompanyTabs tabs={tabs} initial="timeline" />
        </div>

        <aside>
          <div className={styles.panel}>
            <h3>
              Contacts <span className="c">{co.contacts.length} at {co.name.split(" ")[0]}</span>
            </h3>
            {co.contacts.map((c) => (
              <div key={c.initials} className={styles.contactRow}>
                <span className={styles.av}>{c.initials}</span>
                <div>
                  <div className={styles.nm}>{c.name}</div>
                  <div className={styles.role}>{c.role}</div>
                </div>
                <span className={heatDotClass(c.heat)} />
              </div>
            ))}
          </div>

          <div className={styles.panel}>
            <h3>Ledger</h3>
            {co.ledger.map((l) => (
              <div key={l.k} className={styles.ledgerRow}>
                <span className={styles.k}>{l.k}</span>
                <span
                  className={`${styles.v} ${l.tone === "warn" ? styles.vWarn : ""} ${l.tone === "ok" ? styles.vOk : ""}`}
                >
                  {l.v}
                </span>
              </div>
            ))}
          </div>

          <div className={styles.panel}>
            <h3>
              Sources <span className="c">pulling from</span>
            </h3>
            {co.sources.map((s) => (
              <div key={s.k} className={styles.ledgerRow}>
                <span className={styles.k}>{s.k}</span>
                <span className={styles.v}>{s.v}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
