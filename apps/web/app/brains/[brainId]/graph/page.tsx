import styles from "./page.module.css";

// TODO: wire to real graph data. The brain has node + edge stores backing
// it (lib/db/neo4j.ts and lib/graph/) - this page renders the prototype's
// fixed-position node + edge canvas as a static showcase until a
// real-graph layout endpoint is built. Filter rail and detail panel are
// presentational; the layout-toggle (Force/Tree/Cluster) does not switch
// algorithms yet.

type NodeKind = "person" | "company" | "topic" | "deal" | "promise";

type GraphNode = {
  id: string;
  kind: NodeKind;
  initial: string;
  name: string;
  x: number;
  y: number;
  selected?: boolean;
};

type GraphEdge = {
  d: string;
  gold?: boolean;
};

type EdgeLabel = {
  text: string;
  x: number;
  y: number;
};

const PROTO_NODES: GraphNode[] = [
  { id: "roelof", kind: "person", initial: "RB", name: "Roelof Botha", x: 470, y: 320, selected: true },
  { id: "sequoia", kind: "company", initial: "S", name: "Sequoia Capital", x: 240, y: 240 },
  { id: "mike", kind: "person", initial: "MV", name: "Mike Vernal", x: 100, y: 180 },
  { id: "pat", kind: "person", initial: "PG", name: "Pat Grady", x: 130, y: 320 },
  { id: "maya", kind: "person", initial: "MS", name: "Maya Singh", x: 280, y: 480 },
  { id: "caffeinated", kind: "company", initial: "C", name: "Caffeinated", x: 130, y: 540 },
  { id: "joel", kind: "person", initial: "JC", name: "Joel - Verdant", x: 380, y: 620 },
  { id: "soc2", kind: "topic", initial: "T", name: "SOC 2 readiness", x: 690, y: 200 },
  { id: "graphspec", kind: "topic", initial: "T", name: "Graph spec", x: 720, y: 420 },
  { id: "blackrock", kind: "company", initial: "B", name: "BlackRock", x: 760, y: 540 },
  { id: "jon", kind: "person", initial: "JR", name: "Jon Rivers", x: 800, y: 360 },
  { id: "promise", kind: "promise", initial: "!", name: "3 answers by Fri", x: 480, y: 540 },
  { id: "deal", kind: "deal", initial: "$", name: "Sequoia term sheet", x: 660, y: 600 },
];

const PROTO_EDGES: GraphEdge[] = [
  { d: "M 470 320 L 240 240", gold: true },
  { d: "M 470 320 L 690 200", gold: true },
  { d: "M 470 320 L 720 420", gold: true },
  { d: "M 470 320 L 280 480", gold: true },
  { d: "M 470 320 L 480 540", gold: true },
  { d: "M 470 320 L 660 600", gold: true },
  { d: "M 280 480 L 130 540" },
  { d: "M 280 480 L 380 620" },
  { d: "M 240 240 L 100 180" },
  { d: "M 240 240 L 130 320" },
  { d: "M 760 540 L 720 420" },
  { d: "M 800 360 L 720 420" },
];

const PROTO_LABELS: EdgeLabel[] = [
  { text: "invested-in", x: 355, y: 280 },
  { text: "asked-about", x: 580, y: 260 },
  { text: "asked-about", x: 600, y: 370 },
  { text: "introduced-by", x: 380, y: 420 },
  { text: "promised-to", x: 480, y: 430 },
];

function avClass(k: NodeKind) {
  return {
    person: styles.av,
    company: `${styles.av} ${styles.avCompany}`,
    topic: `${styles.av} ${styles.avTopic}`,
    deal: `${styles.av} ${styles.avDeal}`,
    promise: `${styles.av} ${styles.avPromise}`,
  }[k];
}

const NODE_TYPES: Array<{ key: string; label: string; color: string; ct: number }> = [
  { key: "people", label: "People", color: "var(--arvya-dark-900)", ct: 142 },
  { key: "companies", label: "Companies", color: "var(--arvya-gold)", ct: 88 },
  { key: "topics", label: "Topics", color: "var(--cream-400)", ct: 63 },
  { key: "deals", label: "Deals", color: "#C75050", ct: 22 },
  { key: "promises", label: "Promises", color: "#2A6F45", ct: 38 },
  { key: "documents", label: "Documents", color: "#5673A8", ct: 79 },
];

const EDGE_TYPES: Array<{ key: string; label: string; ct: number }> = [
  { key: "works-at", label: "works-at", ct: 312 },
  { key: "asked-about", label: "asked-about", ct: 189 },
  { key: "promised-to", label: "promised-to", ct: 102 },
  { key: "introduced-by", label: "introduced-by", ct: 88 },
  { key: "mentioned-in", label: "mentioned-in", ct: 540 },
  { key: "attended", label: "attended", ct: 241 },
];

export default async function GraphPage() {
  return (
    <div>
      <header className={styles.pageHead}>
        <div>
          <span className={styles.eyebrow}>Knowledge graph</span>
          <h1>The shape of what we know.</h1>
          <p>
            432 nodes - 1,847 edges across 43 canonical relationship types.
            Click any node to see what links to it. Use the chains to follow
            how a single signal - a person, a deal, a question - connects
            across the company.
          </p>
        </div>
        <div className={styles.actions}>
          <button type="button" className={`${styles.btn} ${styles.btnGhost}`}>
            Export subgraph
          </button>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`}>
            Run dream cycle
          </button>
        </div>
      </header>

      <div className={styles.layout}>
        <aside className={styles.side}>
          <h4>Show node types</h4>
          {NODE_TYPES.map((t) => (
            <label key={t.key}>
              <input type="checkbox" defaultChecked={t.key !== "documents"} />
              <span className={styles.swatch} style={{ background: t.color }} />
              {t.label}
              <span className={styles.ct}>{t.ct}</span>
            </label>
          ))}

          <h4>Show edge types</h4>
          {EDGE_TYPES.map((e) => (
            <label key={e.key}>
              <input
                type="checkbox"
                defaultChecked={["works-at", "asked-about", "promised-to", "introduced-by"].includes(e.key)}
              />
              {e.label}
              <span className={styles.ct}>{e.ct}</span>
            </label>
          ))}

          <h4>Confidence floor</h4>
          <input type="range" min={0} max={100} defaultValue={60} className={styles.confSlider} />
          <div className={styles.confLabels}>
            <span>0.0</span>
            <span className={styles.gold}>greater than 0.60</span>
            <span>1.0</span>
          </div>
        </aside>

        <div className={styles.canvas}>
          <div className={styles.grid} />

          <div className={styles.canvasToolbar}>
            <span className={styles.tbLab}>LAYOUT</span>
            <div className={styles.tbGroup}>
              <button type="button" className="on">
                Force
              </button>
              <button type="button">Tree</button>
              <button type="button">Cluster</button>
            </div>
            <span className={styles.tbLab}>432 / 1,847</span>
          </div>

          <svg
            className={styles.edges}
            viewBox="0 0 900 720"
            preserveAspectRatio="none"
            aria-hidden
          >
            <defs>
              <marker
                id="arrG"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M0,0 L10,5 L0,10 Z" fill="#D89A3F" />
              </marker>
              <marker
                id="arrGray"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M0,0 L10,5 L0,10 Z" fill="#a3a3a8" />
              </marker>
            </defs>
            {PROTO_EDGES.map((e, i) => (
              <path
                key={i}
                d={e.d}
                stroke={e.gold ? "#D89A3F" : "#a3a3a8"}
                strokeWidth={e.gold ? 1.6 : 1.2}
                fill="none"
                markerEnd={e.gold ? "url(#arrG)" : "url(#arrGray)"}
              />
            ))}
          </svg>

          {PROTO_LABELS.map((l, i) => (
            <div
              key={i}
              className={styles.edgeLabel}
              style={{ left: l.x, top: l.y }}
            >
              {l.text}
            </div>
          ))}

          {PROTO_NODES.map((n) => (
            <div
              key={n.id}
              className={`${styles.node} ${n.selected ? styles.nodeSel : ""}`}
              style={{ left: n.x, top: n.y }}
            >
              <span className={avClass(n.kind)}>{n.initial}</span>
              <span className={styles.nm}>{n.name}</span>
              <span className={styles.ty}>{n.kind}</span>
            </div>
          ))}

          <div className={styles.legend}>
            <span className="it">
              <span className={styles.sw} style={{ background: "var(--arvya-dark-900)" }} />
              Person
            </span>
            <span className="it">
              <span className={styles.sw} style={{ background: "var(--arvya-gold)" }} />
              Company
            </span>
            <span className="it">
              <span className={styles.sw} style={{ background: "var(--cream-400)" }} />
              Topic
            </span>
            <span className="it">
              <span className={styles.sw} style={{ background: "#C75050" }} />
              Deal
            </span>
            <span className="it">
              <span className={styles.sw} style={{ background: "#2A6F45" }} />
              Promise
            </span>
            <span style={{ borderLeft: "1px solid var(--cream-300)", paddingLeft: 14 }}>
              Edge thickness = supporting sources
            </span>
          </div>
        </div>

        <aside>
          <div className={styles.detailCard}>
            <span className={styles.subline}>PERSON - selected</span>
            <h2>Roelof Botha</h2>
            <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 4 }}>
              Connected to <b>14 entities</b> across <b>23 sources</b>.
            </div>

            <h3>Outgoing edges (8)</h3>
            <div className={styles.edgeRow}>
              <span className={styles.v}>works-at</span>
              <span className={styles.o}>Sequoia Capital - since 2003</span>
            </div>
            <div className={styles.edgeRow}>
              <span className={styles.v}>invested-in</span>
              <span className={styles.o}>
                Square, YouTube, Whatsapp, MongoDB, Arvya OS (negotiating)
              </span>
            </div>
            <div className={styles.edgeRow}>
              <span className={styles.v}>asked-about</span>
              <span className={styles.o}>
                SOC 2, model lock-in, ownership, retention, pricing
              </span>
            </div>
            <div className={styles.edgeRow}>
              <span className={styles.v}>promised-to</span>
              <span className={styles.o}>
                Naveen - set up Mike + Pat (conditional)
              </span>
            </div>
            <div className={styles.edgeRow}>
              <span className={styles.v}>introduced-by</span>
              <span className={styles.o}>Maya Singh - Aug 2024</span>
            </div>
            <div className={styles.edgeRow}>
              <span className={styles.v}>attended</span>
              <span className={styles.o}>Sequoia partner mtg - Apr 28 plus 1 other</span>
            </div>
          </div>

          <div className={styles.detailCard}>
            <h3 style={{ marginTop: 0 }}>Saved chains</h3>
            <div className={styles.chain}>
              <h4>How does Maya connect to Sequoia?</h4>
              <div className={styles.pth}>
                <b>Maya</b> introduced <b>Roelof</b> works-at <b>Sequoia</b>
              </div>
            </div>
            <div className={styles.chain}>
              <h4>Who has asked us about ownership?</h4>
              <div className={styles.pth}>
                <b>Topic: ownership</b> asked-about <b>Roelof, Lonne, Jon</b>
              </div>
            </div>
            <div className={styles.chain}>
              <h4>What does BlackRock want from us?</h4>
              <div className={styles.pth}>
                <b>BlackRock</b> promised-to-receive <b>Graph spec v0</b> (3d late)
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
