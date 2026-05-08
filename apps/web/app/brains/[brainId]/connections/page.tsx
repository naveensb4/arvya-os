import Image from "next/image";
import styles from "./page.module.css";
import { ConnectorPrivacyToggles } from "./privacy-toggles";

// TODO: wire to real connector configs once Phase 3.x endpoints land. The
// repository already has connector-config wiring (see _legacy.tsx.bak in
// this directory for the prior production page that ran OAuth flows + sync
// runs). This rewrite matches the prototype visually first; data wiring
// gets re-attached in a follow-up PR by mapping configs/syncRuns into the
// `Connector` shape below and replacing `placeholderConnectors`.

type ConnectorPillVariant = "live" | "warn";

type Connector = {
  id: string;
  name: string;
  meta: string;
  pill: { variant: ConnectorPillVariant; label: string };
  branded?: boolean;
  /** Render an actual image asset from /public if available; otherwise an
   * inline SVG mark falls back. */
  logoSrc?: string;
  logoAlt?: string;
  logoSvg?: React.ReactNode;
};

const arvyaNotetakerLogo = (
  <svg viewBox="0 0 32 32" width="32" height="32" aria-hidden>
    <rect width="32" height="32" rx="7" fill="#0E1726" />
    <circle cx="16" cy="13.5" r="3.5" fill="#D89A3F" />
    <rect x="14" y="17" width="4" height="6" rx="1.5" fill="#D89A3F" />
    <rect x="11" y="20.5" width="10" height="1.6" rx="0.8" fill="#D89A3F" />
  </svg>
);

const calendarLogo = (
  <svg viewBox="0 0 24 24" width="32" height="32" aria-hidden>
    <rect
      x="2"
      y="3"
      width="20"
      height="19"
      rx="3"
      fill="#fff"
      stroke="#DADCE0"
      strokeWidth="1"
    />
    <path d="M2 7h20" stroke="#DADCE0" strokeWidth="1" />
    <text
      x="12"
      y="17.5"
      textAnchor="middle"
      fontFamily="Roboto, Arial"
      fontSize="9.5"
      fill="#1A73E8"
      fontWeight="700"
    >
      7
    </text>
    <rect x="6" y="1.5" width="2" height="4" rx="0.7" fill="#5F6368" />
    <rect x="16" y="1.5" width="2" height="4" rx="0.7" fill="#5F6368" />
  </svg>
);

const notionLogo = (
  <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden>
    <rect
      width="24"
      height="24"
      rx="5"
      fill="#fff"
      stroke="#E5E2DC"
      strokeWidth="1"
    />
    <path d="M6 7v11h2V11.5l5 6.5h2V7h-2v6.5L8 7H6z" fill="#000" />
  </svg>
);

const hubspotLogo = (
  <svg viewBox="0 0 24 24" width="32" height="32" aria-hidden>
    <circle cx="12" cy="12" r="11" fill="#FF7A59" />
    <path
      d="M16 9V6.5a1.5 1.5 0 1 0-1.5 1.5h.2v1A4 4 0 0 0 12 9.7L8.4 7.3a2 2 0 1 0-1 1.6L11 11.3a4 4 0 1 0 5-2.3z"
      fill="#fff"
    />
  </svg>
);

const placeholderConnectors: Connector[] = [
  {
    id: "arvya-notetaker",
    name: "Arvya Notetaker",
    meta: "First-party - joins your meetings",
    pill: { variant: "live", label: "Live" },
    branded: true,
    logoSvg: arvyaNotetakerLogo,
  },
  {
    id: "gmail",
    name: "Gmail",
    meta: "naveen@arvya.co - 847 / 90d",
    pill: { variant: "live", label: "Live" },
    logoSrc: "/brand/gmail.png",
    logoAlt: "Gmail",
  },
  {
    id: "slack",
    name: "Slack",
    meta: "arvya.slack - 12 channels - 98 threads",
    pill: { variant: "live", label: "Live" },
    logoSrc: "/brand/slack.png",
    logoAlt: "Slack",
  },
  {
    id: "google-drive",
    name: "Google Drive",
    meta: "4 shared drives - 22 docs indexed",
    pill: { variant: "warn", label: "Reauth" },
    logoSrc: "/brand/gdrive.png",
    logoAlt: "Google Drive",
  },
  {
    id: "google-calendar",
    name: "Google Calendar",
    meta: "142 meetings - 6 today",
    pill: { variant: "live", label: "Live" },
    logoSvg: calendarLogo,
  },
  {
    id: "notion",
    name: "Notion",
    meta: "/strategy, /board - 86 docs",
    pill: { variant: "live", label: "Live" },
    logoSvg: notionLogo,
  },
  {
    id: "hubspot",
    name: "HubSpot",
    meta: "184 contacts - 22 deals",
    pill: { variant: "live", label: "Live" },
    logoSvg: hubspotLogo,
  },
];

const placeholderPrivacy = [
  {
    id: "forget_on_disconnect",
    label: "Forget on disconnect",
    desc: "When a source is disconnected, all derived memories, edges, and entity-page sections are removed within 30 days. You can also force-purge instantly.",
    on: true,
  },
  {
    id: "personal_invisible",
    label: "Personal label is invisible",
    desc: "Any source labelled 'personal' (Gmail label, Calendar private, Slack DM) is excluded entirely. The brain never sees, indexes, or surfaces it.",
    on: true,
  },
  {
    id: "reads_never_writes",
    label: "Reads, never writes",
    desc: "By default the brain only reads. To draft replies, send messages, or update tickets, you must enable per-connector write scopes.",
    on: true,
  },
  {
    id: "audit_log",
    label: "Audit log of every read",
    desc: "Every fetch, every entity touched, every model call is in the agent runs page with timestamps and source citations.",
    on: true,
  },
];

function pillClass(variant: ConnectorPillVariant) {
  return variant === "live"
    ? `${styles.pill} ${styles.pillLive}`
    : `${styles.pill} ${styles.pillWarn}`;
}

export default async function ConnectionsPage() {
  return (
    <div>
      <header className={styles.heroHead}>
        <span className={styles.eyebrow}>Source health</span>
        <h1>Connectors.</h1>
        <p>
          Where the brain learns from. Anything you connect, the brain reads in
          real time and writes into entity pages, the graph, and open loops.
          Anything you disconnect, it forgets within a 30 day grace.
        </p>
      </header>

      <div className={styles.summary}>
        <b>{placeholderConnectors.filter((c) => c.pill.variant === "live").length} connected</b>
        <span style={{ color: "var(--text-tertiary)" }}>
          - {placeholderConnectors.filter((c) => c.pill.variant === "warn").length} need reauth - 142 sources today - last sync 6s ago
        </span>
        <span className={styles.grow} />
        <div className={styles.search}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <span>Search</span>
        </div>
      </div>

      <div className={styles.groupLab}>Active connectors</div>
      <div className={styles.igGrid}>
        {placeholderConnectors.map((c) => (
          <div
            key={c.id}
            className={`${styles.ig} ${c.branded ? styles.igArvya : ""}`}
          >
            <span className={styles.lg}>
              {c.logoSrc ? (
                <Image
                  src={c.logoSrc}
                  alt={c.logoAlt ?? c.name}
                  width={32}
                  height={32}
                />
              ) : (
                c.logoSvg
              )}
            </span>
            <div className={styles.nmBlock}>
              <div className={styles.nm}>{c.name}</div>
              <div className={styles.ac}>{c.meta}</div>
            </div>
            <span className={pillClass(c.pill.variant)}>
              <span className={styles.dot} />
              {c.pill.label}
            </span>
          </div>
        ))}
      </div>

      <ConnectorPrivacyToggles toggles={placeholderPrivacy} />
    </div>
  );
}
