import Link from "next/link";
import type { DriftReview, DriftSignal } from "@arvya/core";
import { runDriftReviewAction } from "@/app/actions";
import { SectionShell } from "@/components/layout/section-shell";
import {
  getLatestDriftReview,
  selectedBrainOrDefault,
} from "@/lib/brain/store";

type PageProps = {
  params: Promise<{ brainId: string }>;
};

const alignmentBadge: Record<string, string> = {
  aligned: "bg-emerald-100 text-emerald-900",
  minor_drift: "bg-amber-100 text-amber-900",
  major_drift: "bg-red-100 text-red-900",
};

const alignmentLabel: Record<string, string> = {
  aligned: "Aligned",
  minor_drift: "Minor drift",
  major_drift: "Major drift",
};

const severityBadge: Record<string, string> = {
  high: "bg-red-100 text-red-900",
  medium: "bg-amber-100 text-amber-900",
  low: "bg-stone-200 text-stone-800",
};

const signalTypeLabel: Record<string, string> = {
  commitment_dropped: "Commitment dropped",
  insight_unaddressed: "Insight unaddressed",
  objection_recurring: "Objection recurring",
  priority_drifting: "Priority drifting",
  owner_missing: "Owner missing",
  narrative_stale: "Narrative stale",
};

export default async function DriftPage({ params }: PageProps) {
  const { brainId } = await params;
  const { selectedBrain } = await selectedBrainOrDefault(brainId);
  const selectedBrainId = selectedBrain.id;
  const latest = await getLatestDriftReview(selectedBrainId);

  return (
    <SectionShell
      brainId={selectedBrainId}
      title="Company Drift Review"
      description="Compare current activity against the founders' stated priorities, customer commitments, investor narrative, and open risks. Surface contradictions before they cost time or trust."
    >
      <form action={runDriftReviewAction} className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-stone-50 p-4">
        <input type="hidden" name="brainId" value={selectedBrainId} />
        <div>
          <p className="text-sm font-medium">
            {latest
              ? `Last run ${new Date(latest.review.generated_at).toLocaleString()}`
              : "No drift review run yet."}
          </p>
          <p className="mt-1 text-xs text-stone-500">
            Drift reviews run on demand. Each run is persisted as an agent_run (kind: drift_review).
          </p>
        </div>
        <button type="submit" className="button">
          {latest ? "Run new review" : "Run drift review"}
        </button>
      </form>

      {latest ? <DriftReviewView brainId={selectedBrainId} review={latest.review} /> : null}
    </SectionShell>
  );
}

function DriftReviewView({ brainId, review }: { brainId: string; review: DriftReview }) {
  const groupedBySeverity = {
    high: review.signals.filter((s) => s.severity === "high"),
    medium: review.signals.filter((s) => s.severity === "medium"),
    low: review.signals.filter((s) => s.severity === "low"),
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-stone-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                alignmentBadge[review.overall_alignment] ?? "bg-stone-100 text-stone-700"
              }`}
            >
              {alignmentLabel[review.overall_alignment] ?? review.overall_alignment}
            </span>
            <p className="text-sm text-stone-500">
              {review.signals.length} signal{review.signals.length === 1 ? "" : "s"} found
            </p>
          </div>
          <p className="text-xs text-stone-400">
            Generated {new Date(review.generated_at).toLocaleString()}
          </p>
        </div>
        <p className="mt-4 leading-7 text-stone-800">{review.summary_for_founders}</p>
      </div>

      {review.signals.length === 0 ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
          No drift detected. Stated priorities, commitments, and current activity look aligned. Re-run after the next sources land.
        </div>
      ) : (
        <>
          <SeveritySection
            label="High severity"
            tone="bg-red-50"
            signals={groupedBySeverity.high}
            brainId={brainId}
          />
          <SeveritySection
            label="Medium severity"
            tone="bg-amber-50"
            signals={groupedBySeverity.medium}
            brainId={brainId}
          />
          <SeveritySection
            label="Low severity"
            tone="bg-stone-100"
            signals={groupedBySeverity.low}
            brainId={brainId}
          />
        </>
      )}
    </div>
  );
}

function SeveritySection({
  label,
  tone,
  signals,
  brainId,
}: {
  label: string;
  tone: string;
  signals: DriftSignal[];
  brainId: string;
}) {
  if (signals.length === 0) return null;
  return (
    <section>
      <p className="eyebrow text-amber-700">{label}</p>
      <div className="mt-2 space-y-3">
        {signals.map((signal, idx) => (
          <article
            key={`${signal.type}-${idx}`}
            className={`rounded-2xl border border-stone-200 ${tone} p-5`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    severityBadge[signal.severity] ?? "bg-stone-200 text-stone-800"
                  }`}
                >
                  {signal.severity}
                </span>
                <span className="ml-2 text-xs uppercase tracking-wide text-stone-500">
                  {signalTypeLabel[signal.type] ?? signal.type}
                </span>
                <p className="mt-2 text-base font-semibold leading-7">{signal.summary}</p>
              </div>
            </div>
            <p className="mt-3 text-sm leading-6 text-stone-700">{signal.detail}</p>
            <div className="mt-3 rounded-xl bg-white/70 p-3 text-sm leading-6">
              <p className="text-stone-800">
                <span className="font-medium">Recommended action:</span> {signal.recommended_action}
              </p>
              {signal.recommended_owner ? (
                <p className="mt-1 text-xs text-stone-500">
                  Owner: {signal.recommended_owner}
                </p>
              ) : null}
            </div>
            <CitationChips
              brainId={brainId}
              sourceRefs={signal.source_refs}
              memoryRefs={signal.memory_refs}
              priorityRefs={signal.priority_refs}
            />
          </article>
        ))}
      </div>
    </section>
  );
}

function CitationChips({
  brainId,
  sourceRefs,
  memoryRefs,
  priorityRefs,
}: {
  brainId: string;
  sourceRefs: string[];
  memoryRefs: string[];
  priorityRefs?: string[];
}) {
  const total = sourceRefs.length + memoryRefs.length + (priorityRefs?.length ?? 0);
  if (total === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2 text-xs">
      {sourceRefs.map((ref) => (
        <Link
          key={`s-${ref}`}
          href={`/brains/${brainId}/sources`}
          className="rounded-full bg-amber-100 px-2 py-1 font-medium text-amber-900 hover:bg-amber-200"
          title={`Source ${ref}`}
        >
          source: {ref.slice(0, 8)}
        </Link>
      ))}
      {memoryRefs.map((ref) => (
        <Link
          key={`m-${ref}`}
          href={`/brains/${brainId}/memory`}
          className="rounded-full bg-emerald-100 px-2 py-1 font-medium text-emerald-900 hover:bg-emerald-200"
          title={`Memory ${ref}`}
        >
          memory: {ref.slice(0, 8)}
        </Link>
      ))}
      {priorityRefs?.map((ref) => (
        <Link
          key={`p-${ref}`}
          href={`/brains/${brainId}/priorities`}
          className="rounded-full bg-blue-100 px-2 py-1 font-medium text-blue-900 hover:bg-blue-200"
          title={`Priority ${ref}`}
        >
          priority: {ref.slice(0, 8)}
        </Link>
      ))}
    </div>
  );
}
