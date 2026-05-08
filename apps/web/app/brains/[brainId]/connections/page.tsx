import Image from "next/image";
import {
  CONNECTOR_TYPES,
  ensureDefaultConnectorConfigs,
} from "@/lib/always-on/runtime";
import { selectedBrainOrDefault } from "@/lib/brain/store";
import {
  getRepository,
  type ConnectorConfig,
  type ConnectorType,
} from "@/lib/db/repository";
import styles from "./page.module.css";
import { ConnectorPrivacyToggles } from "./privacy-toggles";

// Renders the prototype's 7-card layout (docs/prototype/Connectors.html) but
// wires every card to the real OAuth start + sync routes that live under
// app/api/connectors/. The four real OAuth connectors (slack, gmail,
// google_drive, outlook) get Connect / Reconnect / Sync now buttons. Recall
// (Arvya Notetaker) gets a sync button only - it is webhook-first. Visual-
// only cards (Calendar, Notion, HubSpot) stay decorative until those
// connectors land.

type CardSpec = {
  id: string;
  name: string;
  meta: string;
  branded?: boolean;
  logoSrc?: string;
  logoAlt?: string;
  logoSvg?: React.ReactNode;
  connectorType: ConnectorType | null;
  authStart?: string;
  syncRoute?: string;
};

const calendarLogo = (
  <svg viewBox="0 0 24 24" width="32" height="32" aria-hidden>
    <rect x="2" y="3" width="20" height="19" rx="3" fill="#fff" stroke="#DADCE0" strokeWidth="1" />
    <path d="M2 7h20" stroke="#DADCE0" strokeWidth="1" />
    <text x="12" y="17.5" textAnchor="middle" fontFamily="Roboto, Arial" fontSize="9.5" fill="#1A73E8" fontWeight="700">7</text>
    <rect x="6" y="1.5" width="2" height="4" rx="0.7" fill="#5F6368" />
    <rect x="16" y="1.5" width="2" height="4" rx="0.7" fill="#5F6368" />
  </svg>
);

const notionLogo = (
  <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden>
    <rect width="24" height="24" rx="5" fill="#fff" stroke="#E5E2DC" strokeWidth="1" />
    <path d="M6 7v11h2V11.5l5 6.5h2V7h-2v6.5L8 7H6z" fill="#000" />
  </svg>
);

const hubspotLogo = (
  <svg viewBox="0 0 24 24" width="32" height="32" aria-hidden>
    <circle cx="12" cy="12" r="11" fill="#FF7A59" />
    <path d="M16 9V6.5a1.5 1.5 0 1 0-1.5 1.5h.2v1A4 4 0 0 0 12 9.7L8.4 7.3a2 2 0 1 0-1 1.6L11 11.3a4 4 0 1 0 5-2.3z" fill="#fff" />
  </svg>
);

const arvyaNotetakerLogo = (
  <svg viewBox="0 0 32 32" width="32" height="32" aria-hidden>
    <rect width="32" height="32" rx="7" fill="#0E1726" />
    <circle cx="16" cy="13.5" r="3.5" fill="#D89A3F" />
    <rect x="14" y="17" width="4" height="6" rx="1.5" fill="#D89A3F" />
    <rect x="11" y="20.5" width="10" height="1.6" rx="0.8" fill="#D89A3F" />
  </svg>
);

const CARDS: CardSpec[] = [
  {
    id: "arvya-notetaker",
    name: "Arvya Notetaker",
    meta: "First-party - joins your meetings",
    branded: true,
    logoSvg: arvyaNotetakerLogo,
    connectorType: "recall",
    syncRoute: "/api/connectors/sync-now",
  },
  {
    id: "gmail",
    name: "Gmail",
    meta: "Scheduled polling on selected labels",
    logoSrc: "/brand/gmail.png",
    logoAlt: "Gmail",
    connectorType: "gmail",
    authStart: "/api/connectors/gmail/auth/start",
    syncRoute: "/api/connectors/gmail/sync",
  },
  {
    id: "slack",
    name: "Slack",
    meta: "Channel ingestion + Q&A bot",
    logoSrc: "/brand/slack.png",
    logoAlt: "Slack",
    connectorType: "slack",
    authStart: "/api/connectors/slack/auth/start",
    syncRoute: "/api/connectors/sync-now",
  },
  {
    id: "google-drive",
    name: "Google Drive",
    meta: "Selected transcript folders",
    logoSrc: "/brand/gdrive.png",
    logoAlt: "Google Drive",
    connectorType: "google_drive",
    authStart: "/api/connectors/google-drive/auth/start",
    syncRoute: "/api/connectors/google-drive/sync",
  },
  {
    id: "google-calendar",
    name: "Google Calendar",
    meta: "Connect via Google Workspace OAuth",
    logoSvg: calendarLogo,
    connectorType: null,
  },
  {
    id: "notion",
    name: "Notion",
    meta: "Coming soon - top-level pages",
    logoSvg: notionLogo,
    connectorType: null,
  },
  {
    id: "hubspot",
    name: "HubSpot",
    meta: "Coming soon - contacts and deals",
    logoSvg: hubspotLogo,
    connectorType: null,
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

type PageProps = {
  params: Promise<{ brainId: string }>;
};

function isLive(config: ConnectorConfig | undefined): boolean {
  if (!config) return false;
  return config.status === "connected" || config.status === "active";
}

function needsReauth(config: ConnectorConfig | undefined): boolean {
  return config?.status === "needs_reauth";
}

function pillStateFor(card: CardSpec, config?: ConnectorConfig) {
  if (card.connectorType === null) {
    return { variant: "muted" as const, label: "Coming soon" };
  }
  if (needsReauth(config)) return { variant: "warn" as const, label: "Reauth" };
  if (isLive(config)) return { variant: "live" as const, label: "Live" };
  return { variant: "muted" as const, label: "Not connected" };
}

function pillClass(variant: "live" | "warn" | "muted") {
  if (variant === "live") return `${styles.pill} ${styles.pillLive}`;
  if (variant === "warn") return `${styles.pill} ${styles.pillWarn}`;
  return `${styles.pill} ${styles.pillMuted}`;
}

function formatAgo(iso: string | null | undefined): string {
  if (!iso) return "no syncs";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

export default async function ConnectionsPage({ params }: PageProps) {
  const { brainId } = await params;
  const { selectedBrain } = await selectedBrainOrDefault(brainId);
  const selectedBrainId = selectedBrain.id;
  const repository = getRepository();
  const configs = await ensureDefaultConnectorConfigs(selectedBrainId);
  const syncRuns = await repository.listConnectorSyncRuns({
    brainId: selectedBrainId,
    limit: 20,
  });

  const configByType = new Map<ConnectorType, ConnectorConfig>(
    configs.map((c) => [c.connectorType, c]),
  );

  const googleConnected =
    isLive(configByType.get("gmail")) || isLive(configByType.get("google_drive"));

  const liveCount = CARDS.filter((card) => {
    if (card.id === "google-calendar") return googleConnected;
    if (!card.connectorType) return false;
    return isLive(configByType.get(card.connectorType));
  }).length;

  const reauthCount = CARDS.filter((card) => {
    if (!card.connectorType) return false;
    return needsReauth(configByType.get(card.connectorType));
  }).length;

  const lastSyncRun = syncRuns[0];

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
        <b>{liveCount} connected</b>
        <span style={{ color: "var(--text-tertiary)" }}>
          {reauthCount > 0 ? `- ${reauthCount} need reauth ` : ""}
          {lastSyncRun
            ? `- last sync ${formatAgo(lastSyncRun.startedAt)}`
            : "- no syncs yet"}
        </span>
        <span className={styles.grow} />
      </div>

      <div className={styles.groupLab}>Active connectors</div>
      <div className={styles.igGrid}>
        {CARDS.map((card) => {
          const config = card.connectorType
            ? configByType.get(card.connectorType)
            : undefined;
          const cardConfig =
            card.id === "google-calendar"
              ? googleConnected
                ? ({ status: "connected" } as ConnectorConfig)
                : undefined
              : config;
          const pill = pillStateFor(card, cardConfig);
          const live = pill.variant === "live";
          const reauth = pill.variant === "warn";

          return (
            <div
              key={card.id}
              className={`${styles.ig} ${card.branded ? styles.igArvya : ""}`}
            >
              <span className={styles.lg}>
                {card.logoSrc ? (
                  <Image
                    src={card.logoSrc}
                    alt={card.logoAlt ?? card.name}
                    width={32}
                    height={32}
                  />
                ) : (
                  card.logoSvg
                )}
              </span>
              <div className={styles.nmBlock}>
                <div className={styles.nm}>{card.name}</div>
                <div className={styles.ac}>{card.meta}</div>
              </div>
              <div className={styles.cardActions}>
                <span className={pillClass(pill.variant)}>
                  <span className={styles.dot} />
                  {pill.label}
                </span>
                {card.authStart ? (
                  <a
                    className={styles.btnLink}
                    href={`${card.authStart}?brainId=${encodeURIComponent(selectedBrainId)}`}
                  >
                    {live || reauth ? "Reconnect" : "Connect"}
                  </a>
                ) : null}
                {card.syncRoute && live && config ? (
                  <form action={card.syncRoute} method="post" className={styles.inlineForm}>
                    <input type="hidden" name="brainId" value={selectedBrainId} />
                    <input
                      type="hidden"
                      name="connectorConfigId"
                      value={config.id}
                    />
                    <button type="submit" className={styles.btnLink}>
                      Sync now
                    </button>
                  </form>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <ConnectorPrivacyToggles toggles={placeholderPrivacy} />
    </div>
  );
}

void CONNECTOR_TYPES;
