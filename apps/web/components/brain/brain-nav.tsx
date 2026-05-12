"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Brain } from "@arvya/core";
import { signOutAction } from "@/app/actions";
import styles from "./brain-nav.module.css";

// Dark-navy prototype sidebar (Phase 5.2). 1:1 port of
// docs/prototype/assets/shell.js renderSidebar() + app.css .sidebar styles.

type NavItem = {
  key: string;
  label: string;
  href: string;
  icon: React.ReactNode;
  count?: string | number;
};

type NavGroup = {
  label?: string;
  items: NavItem[];
};

const ICONS = {
  grid: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  ),
  sun: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  ),
  message: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  loop: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <path d="M17 1l4 4-4 4" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <path d="M7 23l-4-4 4-4" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  ),
  inbox: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  ),
  users: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  building: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <line x1="9" y1="6" x2="9" y2="6" />
      <line x1="15" y1="6" x2="15" y2="6" />
      <line x1="9" y1="10" x2="9" y2="10" />
      <line x1="15" y1="10" x2="15" y2="10" />
      <line x1="9" y1="14" x2="9" y2="14" />
      <line x1="15" y1="14" x2="15" y2="14" />
      <line x1="10" y1="22" x2="10" y2="18" />
      <line x1="14" y1="22" x2="14" y2="18" />
    </svg>
  ),
  graph: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <circle cx="6" cy="6" r="3" />
      <circle cx="18" cy="18" r="3" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <line x1="8.1" y1="8.1" x2="15.9" y2="15.9" />
      <line x1="15.9" y1="8.1" x2="8.1" y2="15.9" />
    </svg>
  ),
  compass: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
    </svg>
  ),
  bot: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <rect x="3" y="11" width="18" height="10" rx="2" />
      <circle cx="12" cy="5" r="2" />
      <path d="M12 7v4" />
      <line x1="8" y1="16" x2="8" y2="16" />
      <line x1="16" y1="16" x2="16" y2="16" />
    </svg>
  ),
  plug: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <path d="M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-12 0V8zM12 17v5" />
    </svg>
  ),
  cog: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  signOut: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
};

type Counts = {
  brief?: number;
  loops?: number;
  sources?: number;
  people?: number;
  companies?: number;
  drift?: number;
  connectors?: number;
};

export function BrainNav({
  brain,
  meName,
  meRole,
  counts = {},
}: {
  brain: Brain;
  meName: string;
  meRole: string;
  counts?: Counts;
}) {
  const pathname = usePathname() ?? "";
  const base = `/brains/${brain.id}`;

  const fmt = (n?: number) => (typeof n === "number" ? n.toLocaleString() : undefined);

  const groups: NavGroup[] = [
    {
      items: [
        { key: "dashboard", label: "Today", href: base, icon: ICONS.grid },
        {
          key: "brief",
          label: "Daily brief",
          href: `${base}/brief`,
          icon: ICONS.sun,
          count: counts.brief ? `${counts.brief} new` : undefined,
        },
        { key: "ask", label: "Ask brain", href: `${base}/ask`, icon: ICONS.message },
        {
          key: "loops",
          label: "Open loops",
          href: `${base}/open-loops`,
          icon: ICONS.loop,
          count: fmt(counts.loops),
        },
      ],
    },
    {
      label: "Memory",
      items: [
        {
          key: "sources",
          label: "Sources",
          href: `${base}/sources`,
          icon: ICONS.inbox,
          count: fmt(counts.sources),
        },
        {
          key: "people",
          label: "People",
          href: `${base}/people`,
          icon: ICONS.users,
          count: fmt(counts.people),
        },
        {
          key: "companies",
          label: "Companies",
          href: `${base}/companies`,
          icon: ICONS.building,
          count: fmt(counts.companies),
        },
        {
          key: "graph",
          label: "Knowledge graph",
          href: `${base}/graph`,
          icon: ICONS.graph,
        },
      ],
    },
    {
      label: "Operations",
      items: [
        {
          key: "drift",
          label: "Drift review",
          href: `${base}/drift`,
          icon: ICONS.compass,
          count: fmt(counts.drift),
        },
        {
          key: "agents",
          label: "Agent runs",
          href: `${base}/agent-runs`,
          icon: ICONS.bot,
        },
        {
          key: "connectors",
          label: "Connectors",
          href: `${base}/connections`,
          icon: ICONS.plug,
          count: fmt(counts.connectors),
        },
      ],
    },
  ];

  function isActive(href: string): boolean {
    if (href === base) return pathname === base || pathname === `${base}/`;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  const brandLetter = brain.name?.[0]?.toUpperCase() ?? "A";
  const meInitials = meName
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <Image
          src="/brand/arvya-icon-light.png"
          alt="Arvya"
          width={26}
          height={26}
          className={styles.mk}
        />
        <Image
          src="/brand/arvya-wordmark-dark.png"
          alt="ARVYA"
          width={80}
          height={15}
          className={styles.wm}
        />
      </div>

      <div className={styles.brainSwitcher} title="Switch workspace">
        <span className={styles.badge}>{brandLetter}</span>
        <div>
          <div className={styles.nm}>{brain.name}</div>
          <div className={styles.rl}>- Company brain</div>
        </div>
        <svg
          className={styles.chev}
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          aria-hidden
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      <nav>
        {groups.map((group, gi) => (
          <div key={gi}>
            {group.label && <div className={styles.groupLabel}>- {group.label}</div>}
            {group.items.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={`${styles.navLink} ${active ? styles.navLinkActive : ""}`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                  {item.count !== undefined ? (
                    <span className={styles.count}>{item.count}</span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className={styles.spacer} />

      <div className={styles.sideFoot}>
        <Link href={`${base}/settings`} className={styles.footLink}>
          {ICONS.cog}
          <span>Settings</span>
        </Link>
        <form action={signOutAction}>
          <button type="submit" className={styles.footLink}>
            {ICONS.signOut}
            <span>Log out</span>
          </button>
        </form>
      </div>

      <div className={styles.me}>
        <span className={styles.av}>{meInitials}</span>
        <div>
          <div className={styles.nm}>{meName}</div>
          <div className={styles.rl}>- {meRole}</div>
        </div>
      </div>
    </aside>
  );
}
