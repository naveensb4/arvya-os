"use client";

import { useState } from "react";
import styles from "./page.module.css";

type Toggle = {
  id: string;
  label: string;
  desc: string;
  on: boolean;
};

export function ConnectorPrivacyToggles({ toggles }: { toggles: Toggle[] }) {
  const [state, setState] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(toggles.map((t) => [t.id, t.on])),
  );

  return (
    <div className={styles.privacy}>
      <h3>Boundaries the brain respects.</h3>
      {toggles.map((t) => {
        const on = state[t.id] ?? false;
        return (
          <div key={t.id} className={styles.row}>
            <div className={styles.lab}>
              {t.label}
              <div className={styles.desc}>{t.desc}</div>
            </div>
            <button
              type="button"
              className={`${styles.toggle} ${on ? styles.toggleOn : ""}`}
              aria-pressed={on}
              aria-label={`${t.label}: ${on ? "on" : "off"}`}
              onClick={() => setState((s) => ({ ...s, [t.id]: !on }))}
            />
          </div>
        );
      })}
    </div>
  );
}
