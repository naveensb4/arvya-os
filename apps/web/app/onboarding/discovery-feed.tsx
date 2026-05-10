"use client";

import type { DiscoveredEntity, StreamPhase, SyncProgress } from "./use-ingestion-stream";
import styles from "./discovery-feed.module.css";

const PERSON_SVG = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21v-1a6 6 0 0 1 12 0v1" />
  </svg>
);

const COMPANY_SVG = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M9 3v18M3 9h6M3 15h6" />
    <rect x="13" y="13" width="4" height="4" />
  </svg>
);

const VISIBLE_COUNT = 8;

function EntityIcon({ type }: { type: string }) {
  return (
    <div className={styles.entityIcon}>
      {type === "person" ? PERSON_SVG : COMPANY_SVG}
    </div>
  );
}

export function DiscoveryFeed({
  progress,
  entities,
  phase,
}: {
  progress: SyncProgress | null;
  entities: DiscoveredEntity[];
  phase: StreamPhase;
}) {
  const isDone = phase === "done";
  const visibleEntities = entities.slice(0, VISIBLE_COUNT);

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={`${styles.pulsingDot} ${isDone ? styles.pulsingDotDone : ""}`} />
        <span className={styles.headerLabel}>
          {isDone ? "Done" : "Learning from your emails..."}
        </span>
        {progress && (
          <div className={styles.counters}>
            {progress.total > 0 && (
              <span>
                <span className={styles.counterValue}>{progress.completed}</span>/{progress.total}
              </span>
            )}
            {progress.people > 0 && (
              <span>
                <span className={styles.counterValue}>{progress.people}</span> people
              </span>
            )}
            {progress.companies > 0 && (
              <span>
                <span className={styles.counterValue}>{progress.companies}</span> companies
              </span>
            )}
          </div>
        )}
      </div>

      {visibleEntities.length > 0 && (
        <div className={styles.feed}>
          {visibleEntities.map((entity, i) => (
            <div
              key={entity.id}
              className={styles.entityCard}
              style={{ "--i": i } as React.CSSProperties}
            >
              <EntityIcon type={entity.objectType} />
              <div className={styles.entityInfo}>
                <div className={styles.entityName}>{entity.name}</div>
                {entity.sourceContext && (
                  <div className={styles.entitySource}>{entity.sourceContext}</div>
                )}
              </div>
              <span className={styles.entityType}>{entity.objectType}</span>
            </div>
          ))}
        </div>
      )}

      {isDone && progress && (
        <div className={styles.doneMessage}>
          Discovered <strong>{progress.people}</strong> people and{" "}
          <strong>{progress.companies}</strong> companies from your emails.
        </div>
      )}
    </div>
  );
}
