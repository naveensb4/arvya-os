"use client";

import { useState } from "react";
import styles from "./page.module.css";

type TabId = "timeline" | "actions" | "transcripts" | "docs" | "threads";

type Tab = {
  id: TabId;
  label: string;
  count: number;
  content: React.ReactNode;
};

export function CompanyTabs({ tabs, initial = "timeline" }: { tabs: Tab[]; initial?: TabId }) {
  const [active, setActive] = useState<TabId>(initial);
  return (
    <div>
      <div className={styles.tabs} role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={active === t.id}
            className={active === t.id ? styles.on : ""}
            onClick={() => setActive(t.id)}
            type="button"
          >
            {t.label}
            <span className={styles.count}>{t.count}</span>
          </button>
        ))}
      </div>
      {tabs.map((t) =>
        active === t.id ? (
          <div key={t.id} role="tabpanel">
            {t.content}
          </div>
        ) : null,
      )}
    </div>
  );
}
