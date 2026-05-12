import Link from "next/link";
import styles from "./topbar.module.css";

// Topbar - sticky 60px header with breadcrumbs on the left, Ask search +
// notification icon on the right. Server component (renders once per nav).

export type Crumb = {
  label: string;
  /** href is optional; the last crumb (the "here" position) usually has no
   * link and renders gold. */
  href?: string;
};

export function Topbar({ brainId, crumbs }: { brainId: string; crumbs: Crumb[] }) {
  return (
    <header className={styles.topbar}>
      <div className={styles.crumbs}>
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              {c.href && !last ? (
                <Link
                  href={c.href}
                  style={{ color: "inherit", textDecoration: "none" }}
                >
                  {c.label}
                </Link>
              ) : (
                <span className={last ? styles.here : ""}>{c.label}</span>
              )}
              {!last && <span className={styles.sep}>/</span>}
            </span>
          );
        })}
      </div>
      <div className={styles.actions}>
        <Link href={`/brains/${brainId}/ask`} className={styles.ask}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            aria-hidden
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <span>Ask the brain anything</span>
          <kbd>⌘K</kbd>
        </Link>
        <button type="button" className={styles.icBtn} aria-label="Notifications">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </button>
      </div>
    </header>
  );
}
