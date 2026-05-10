"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createOnboardingBrain } from "./actions";
import styles from "./page.module.css";

const BRAIN_KINDS = [
  { value: "company", label: "Company", desc: "Track deals, people, and commitments across your org" },
  { value: "fund", label: "Fund / VC", desc: "Portfolio monitoring, LP updates, and deal flow" },
  { value: "personal", label: "Personal", desc: "Your own knowledge base and action items" },
] as const;

export function CreateBrainStep() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [kind, setKind] = useState("company");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.set("name", name.trim());
      formData.set("kind", kind);
      await createOnboardingBrain(formData);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <>
      <div className={styles.eyebrow}>STEP 1 OF 2</div>
      <h2>Name your brain.</h2>
      <p className={styles.lede}>
        A brain is a private workspace where Arvya connects your email,
        calendar, and messages into a single knowledge graph.
      </p>

      <form onSubmit={handleSubmit} className={styles.createForm}>
        <div className={styles.field}>
          <label htmlFor="brain-name" className={styles.fieldLabel}>
            Brain name
          </label>
          <input
            id="brain-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Acme Corp, My Fund, Personal"
            className={styles.fieldInput}
            autoFocus
            required
          />
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel}>What is this brain for?</label>
          <div className={styles.kindGrid}>
            {BRAIN_KINDS.map((k) => (
              <button
                key={k.value}
                type="button"
                className={`${styles.kindCard} ${kind === k.value ? styles.kindCardOn : ""}`}
                onClick={() => setKind(k.value)}
              >
                <div className={styles.kindLabel}>{k.label}</div>
                <div className={styles.kindDesc}>{k.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <button
          type="submit"
          disabled={loading || !name.trim()}
          className={`${styles.btn} ${styles.btnGold}`}
        >
          {loading ? "Creating..." : "Create brain"}
        </button>
      </form>
    </>
  );
}
