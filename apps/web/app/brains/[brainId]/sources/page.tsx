import Link from "next/link";
import { SourceCard } from "@/components/sources/source-card";
import { selectedBrainOrDefault } from "@/lib/brain/store";
import styles from "./page.module.css";

// TODO: this page wires to the existing repository.listSourceItems() but
// renders the new prototype shell (KPI strip, left filter rail, source list).
// Filter rail is presentational only; once Phase 3 source-aggregation
// endpoints land, the filter links become real query params and the KPI
// strip pulls live counts via /api/brains/[brainId]/stats.

const RECENT_SOURCE_LIMIT = 24;

const placeholderFilters: Array<{ label: string; ct: number; on?: boolean }> = [
  { label: "All sources", ct: 1284, on: true },
  { label: "Email", ct: 847 },
  { label: "Meetings", ct: 142 },
  { label: "Slack", ct: 98 },
  { label: "Docs", ct: 86 },
  { label: "Code", ct: 61 },
  { label: "Voice memos", ct: 28 },
  { label: "PDFs", ct: 22 },
];

const placeholderStatusFilters: Array<{ label: string; ct: number }> = [
  { label: "Pending review", ct: 12 },
  { label: "Indexed", ct: 1269 },
  { label: "Failed", ct: 3 },
];

const placeholderSavedViews = [
  "Investor mentions",
  "Unanswered questions",
  "Sequoia thread",
  "My voice memos",
];

type PageProps = {
  params: Promise<{ brainId: string }>;
  searchParams: Promise<{ ingested?: string }>;
};

export default async function SourcesPage({ params, searchParams }: PageProps) {
  const { brainId } = await params;
  const filters = await searchParams;
  const { repository, selectedBrain } = await selectedBrainOrDefault(brainId);
  const selectedBrainId = selectedBrain.id;
  const recentSources = await repository.listSourceItems(selectedBrainId, {
    limit: RECENT_SOURCE_LIMIT,
  });

  return (
    <div>
      <header className={styles.pageHead}>
        <div>
          <span className={styles.eyebrow}>Capture layer</span>
          <h1>Sources.</h1>
          <p className={styles.sub}>
            Every artifact the brain has ingested, in chronological order.
            Hover any item to see what was extracted, where it landed in the
            graph, and which entity pages it changed.
          </p>
        </div>
        <div className={styles.actions}>
          <Link
            href={`/brains/${selectedBrainId}/sources/batch-upload`}
            className={`${styles.btn} ${styles.btnGhost}`}
          >
            + Drop file
          </Link>
          <Link
            href={`/brains/${selectedBrainId}/sources/new`}
            className={`${styles.btn} ${styles.btnPrimary}`}
          >
            + Connect source
          </Link>
        </div>
      </header>

      {filters.ingested ? (
        <div
          style={{
            margin: "16px 0 0",
            padding: "12px 16px",
            background: "var(--arvya-status-ok-bg)",
            border: "1px solid #bcdfc6",
            borderRadius: "10px",
            color: "#247048",
            fontSize: "13px",
            lineHeight: 1.55,
          }}
        >
          Source ingested. The brain updated memory, open loops, retrieval
          context, and agent logs from the new material.
        </div>
      ) : null}

      <div className={styles.kpis}>
        <div className={styles.kpi}>
          <div className={styles.lab}>Total artifacts</div>
          <div className={styles.v}>{recentSources.length > 0 ? "1,284" : "0"}</div>
          <div className={styles.delta}>+142 overnight</div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.lab}>Last 24h</div>
          <div className={styles.v}>142</div>
          <div className={styles.delta}>12 connectors</div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.lab}>Memories extracted</div>
          <div className={styles.v}>3,612</div>
          <div className={styles.delta}>+412 overnight</div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.lab}>Failed parses</div>
          <div className={`${styles.v} ${styles.vWarn}`}>3</div>
          <div className={`${styles.delta} ${styles.deltaNeg}`}>2 PDFs - 1 audio</div>
        </div>
      </div>

      <div className={styles.layout}>
        <aside className={styles.filters}>
          <h4>By type</h4>
          {placeholderFilters.map((f) => (
            <a key={f.label} className={f.on ? "on" : ""}>
              {f.label}
              <span className={styles.ct}>{f.ct.toLocaleString()}</span>
            </a>
          ))}

          <h4>By status</h4>
          {placeholderStatusFilters.map((f) => (
            <a key={f.label}>
              {f.label}
              <span className={styles.ct}>{f.ct.toLocaleString()}</span>
            </a>
          ))}

          <h4>Saved views</h4>
          {placeholderSavedViews.map((v) => (
            <a key={v}>{v}</a>
          ))}
        </aside>

        <div className={styles.list}>
          <div className={styles.head}>
            <span className={styles.ct}>
              Latest {recentSources.length} sources
            </span>
            <span className={styles.ct}>sorted: ingested</span>
          </div>

          {recentSources.length === 0 ? (
            <div className={styles.empty}>
              No sources yet. Add a transcript, email, note, or document to start
              building memory.
            </div>
          ) : (
            <div className={styles.cardGrid}>
              {recentSources.map((source) => (
                <SourceCard key={source.id} source={source} />
              ))}
            </div>
          )}

          <p className={styles.foot}>
            Older source bodies are kept out of this page load to keep the
            workspace fast. Ask Brain and retrieval still work across indexed
            memory.
          </p>
        </div>
      </div>
    </div>
  );
}
