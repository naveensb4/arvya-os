import type { MemoryObject, OpenLoop, SourceItem } from "@arvya/core";
import { getBrainSnapshot } from "@/lib/brain/store";
import styles from "./page.module.css";
import { PeopleTable } from "./people-table-client";

// People - real data from memory_objects of type "person". Owes / heat /
// last touch are derived from the brain snapshot. AI columns that we
// don't have real data for are dropped rather than faked.

type Relation = "investor" | "customer" | "partner" | "team" | "press" | "recruit";
type Heat = "hot" | "warm" | "ok";

type TimelineEntry = {
  sourceId: string;
  sourceTitle: string;
  sourceType: string;
  externalUri: string | null;
  occurredAt: string;
  snippet: string;
};

type DrawerLoop = {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  dueDate: string | null;
  sourceTitle: string | null;
};

type PersonRow = {
  id: string;
  name: string;
  email: string;
  initials: string;
  relation: { variant: Relation; label: string };
  company: { letter: string; name: string } | null;
  role: string;
  last_touch: { text: string; warn?: boolean };
  owe: { variant: "warn" | "ok" | "you"; text: string };
  heat: { variant: Heat; bars: number; label: string };
  description: string;
  evidence: { sourceTitle: string; quote: string } | null;
  confidence: number | null;
  // Data for the side-panel drawer. Built up-front on the server so the
  // client component doesn't have to re-fetch when a row is opened.
  timeline: TimelineEntry[];
  loops: DrawerLoop[];
  aliases: string[];
};

function initialsFor(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

function inferRelation(props?: Record<string, unknown>): {
  variant: Relation;
  label: string;
} {
  const raw = (props?.relation ?? props?.kind ?? props?.role_type ?? "") as string;
  const r = String(raw).toLowerCase();
  if (r.includes("investor")) return { variant: "investor", label: "Investor" };
  if (r.includes("customer")) return { variant: "customer", label: "Customer" };
  if (r.includes("partner")) return { variant: "partner", label: "Partner" };
  if (r.includes("team") || r.includes("internal")) return { variant: "team", label: "Team" };
  if (r.includes("press") || r.includes("media")) return { variant: "press", label: "Press" };
  if (r.includes("recruit") || r.includes("candidate")) return { variant: "recruit", label: "Recruit" };
  return { variant: "partner", label: "Contact" };
}

function buildPersonRow(
  person: MemoryObject,
  openLoops: OpenLoop[],
  sourceItems: SourceItem[],
): PersonRow {
  const props = (person.properties ?? {}) as Record<string, unknown>;
  const email =
    (props.email as string | undefined) ??
    (props.contact_email as string | undefined) ??
    "";
  const role =
    (props.role as string | undefined) ??
    (props.title as string | undefined) ??
    "";
  const companyName =
    (props.company as string | undefined) ??
    (props.organization as string | undefined) ??
    "";

  // Linked sources come from properties.sourceItemIds, which the merge
  // pipeline updates on every re-extraction. Falling back to the
  // person's own person.sourceItemId catches first-time mentions.
  // We deliberately do NOT do substring matching on source content here —
  // that's how "Hi Sudi" used to match every email containing "hi sudi"
  // and made literally everyone show up as "Hot".
  const linkedIds = new Set<string>();
  if (Array.isArray(props.sourceItemIds)) {
    for (const id of props.sourceItemIds) {
      if (typeof id === "string") linkedIds.add(id);
    }
  }
  if (person.sourceItemId) linkedIds.add(person.sourceItemId);

  const relatedSources = sourceItems
    .filter((s) => linkedIds.has(s.id))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const lastSource = relatedSources[0];
  const lastTouchMs = lastSource
    ? Date.now() - new Date(lastSource.createdAt).getTime()
    : null;

  const day = 24 * 60 * 60 * 1000;
  let last_touch: { text: string; warn?: boolean };
  if (lastTouchMs === null) {
    last_touch = { text: "no touches" };
  } else if (lastTouchMs < day) {
    const h = Math.max(1, Math.floor(lastTouchMs / (60 * 60 * 1000)));
    last_touch = { text: `${h}h` };
  } else {
    const d = Math.floor(lastTouchMs / day);
    last_touch = { text: `${d}d`, warn: d >= 7 };
  }

  // Heat: 4 bars if touched today, 3 if this week, 2 if this month, else 1.
  let bars = 1;
  let heatVar: Heat = "ok";
  if (lastTouchMs !== null) {
    if (lastTouchMs < day) {
      bars = 4;
      heatVar = "hot";
    } else if (lastTouchMs < 7 * day) {
      bars = 3;
      heatVar = "hot";
    } else if (lastTouchMs < 30 * day) {
      bars = 2;
      heatVar = "warm";
    } else {
      bars = 1;
      heatVar = "ok";
    }
  }
  const heatLabel = heatVar === "hot" ? "Hot" : heatVar === "warm" ? "Warm" : "Cool";

  // Owe a reply: a loop linked via the same source as this person, or a
  // loop whose title/description mentions them. Loop titles are short so
  // substring matching is fine here (unlike the heat calc, which had to
  // scan full email bodies).
  const personLower = person.name.toLowerCase();
  const myOpenLoop = openLoops.find((l) => {
    if (l.status === "done" || l.status === "closed" || l.status === "dismissed") return false;
    if (l.sourceItemId && linkedIds.has(l.sourceItemId)) return true;
    const haystack = `${l.title} ${l.description}`.toLowerCase();
    return haystack.includes(personLower);
  });
  let owe: PersonRow["owe"];
  if (myOpenLoop) {
    const overdue =
      myOpenLoop.dueDate &&
      new Date(myOpenLoop.dueDate).getTime() < Date.now();
    owe = overdue
      ? { variant: "warn", text: "You - overdue" }
      : { variant: "you", text: "You" };
  } else {
    owe = { variant: "ok", text: "-" };
  }

  const evidenceSource = person.sourceItemId
    ? sourceItems.find((s) => s.id === person.sourceItemId)
    : undefined;
  const evidence = evidenceSource
    ? { sourceTitle: evidenceSource.title, quote: person.sourceQuote ?? "" }
    : null;

  // Timeline entries: every linked source, oldest to newest reversed
  // (most recent first). Snippet is the first ~140 chars of the body
  // with the person's first-name highlighted client-side.
  const timeline: TimelineEntry[] = relatedSources.map((source) => ({
    sourceId: source.id,
    sourceTitle: source.title,
    sourceType: source.type,
    externalUri: source.externalUri ?? null,
    occurredAt: source.createdAt,
    snippet: (source.content ?? "").slice(0, 240).replace(/\s+/g, " ").trim(),
  }));

  const drawerLoops: DrawerLoop[] = openLoops
    .filter((l) => {
      if (l.status === "closed" || l.status === "done" || l.status === "dismissed") return false;
      if (l.sourceItemId && linkedIds.has(l.sourceItemId)) return true;
      const haystack = `${l.title} ${l.description}`.toLowerCase();
      return haystack.includes(personLower);
    })
    .slice(0, 12)
    .map((l) => ({
      id: l.id,
      title: l.title,
      description: l.description,
      status: l.status,
      priority: l.priority,
      dueDate: l.dueDate ?? null,
      sourceTitle: l.sourceItemId
        ? sourceItems.find((s) => s.id === l.sourceItemId)?.title ?? null
        : null,
    }));

  const aliases = Array.isArray(props.aliases)
    ? (props.aliases as unknown[]).filter((a): a is string => typeof a === "string")
    : [];

  return {
    id: person.id,
    name: person.name,
    email,
    initials: initialsFor(person.name),
    relation: inferRelation(props),
    company: companyName
      ? { letter: companyName.charAt(0).toUpperCase() || "?", name: companyName }
      : null,
    role,
    last_touch,
    owe,
    heat: { variant: heatVar, bars, label: heatLabel },
    description: person.description ?? "",
    evidence,
    confidence:
      typeof person.confidence === "number" ? person.confidence : null,
    timeline,
    loops: drawerLoops,
    aliases,
  };
}

type PageProps = {
  params: Promise<{ brainId: string }>;
};

export default async function PeoplePage({ params }: PageProps) {
  const { brainId } = await params;
  const snapshot = await getBrainSnapshot(brainId);
  const memoryObjects = snapshot.memoryObjects ?? [];
  const openLoops = snapshot.openLoops ?? [];
  const sourceItems = snapshot.sourceItems ?? [];

  const people = memoryObjects.filter((m) => m.objectType === "person");
  const rows = people
    .map((p) => buildPersonRow(p, openLoops, sourceItems))
    .sort((a, b) => {
      const order: Record<Heat, number> = { hot: 0, warm: 1, ok: 2 };
      const d = order[a.heat.variant] - order[b.heat.variant];
      if (d !== 0) return d;
      return a.name.localeCompare(b.name);
    });

  const total = rows.length;
  const oweCount = rows.filter((r) => r.owe.variant !== "ok").length;
  const hotCount = rows.filter((r) => r.heat.variant === "hot").length;
  const coolCount = rows.filter((r) => r.heat.variant === "ok").length;
  const investorCount = rows.filter((r) => r.relation.variant === "investor").length;

  return (
    <div>
      <header className={styles.pageHead}>
        <span className={styles.eyebrow}>People - {total} contacts</span>
        <h1>Contacts.</h1>
      </header>

      <PeopleTable
        rows={rows}
        counts={{ total, oweCount, hotCount, coolCount, investorCount }}
      />

      <span style={{ display: "none" }}>{brainId}</span>
    </div>
  );
}
