import { SectionShell } from "@/components/layout/section-shell";
import { assertMarketingOsAccess } from "@/lib/marketing/access";
import { getMarketingDashboard } from "@/lib/marketing/store";
import {
  generateMarketingDraftsAction,
  generateMarketingWeeklyReportAction,
  recordMarketingEventAction,
  recordMarketingMetricAction,
  scheduleMarketingPostAction,
  submitMarketingInputAction,
  syncMarketingDriveTranscriptsAction,
  updateMarketingPostAction,
} from "./actions";

type PageProps = {
  params: Promise<{ brainId: string }>;
  searchParams?: Promise<{ key?: string }>;
};

export default async function Page({ params, searchParams }: PageProps) {
  const { brainId } = await params;
  assertMarketingOsAccess(await searchParams);
  const { brain, items, insights, posts, metrics, events, reports, usage } = await getMarketingDashboard(brainId);
  const draftPosts = posts.filter((post) => post.status === "draft" || post.status === "needs_revision" || post.status === "approved" || post.status === "failed_schedule");
  const publishedPosts = posts.filter((post) => post.status === "scheduled" || post.status === "published");
  const totalEstimatedCost = usage.reduce((sum, entry) => sum + entry.estimatedCostUsd, 0);

  return (
    <SectionShell
      brainId={brain.id}
      title="Internal Marketing OS"
      description="Hidden internal growth loop for turning real Arvya signal into redacted insights, drafts, scheduled posts, and weekly learning."
    >
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
        Internal-only v1. This page is not linked from customer-facing navigation. Dry-run scheduling is controlled by <code>MARKETING_OS_DRY_RUN</code>.
      </div>

      <section className="mt-6 grid gap-4 md:grid-cols-4">
        <Stat label="Content Items" value={items.length} />
        <Stat label="Insights" value={insights.length} />
        <Stat label="Posts" value={posts.length} />
        <Stat label="Tracked Events" value={events.length} />
      </section>

      <section className="mt-6 rounded-2xl bg-stone-50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="eyebrow text-amber-700">New Input</p>
          <form action={syncMarketingDriveTranscriptsAction}>
            <input type="hidden" name="brainId" value={brain.id} />
            <button className="button-secondary">Sync Drive Transcripts</button>
          </form>
        </div>
        <form action={submitMarketingInputAction} className="mt-4 grid gap-3">
          <input type="hidden" name="brainId" value={brain.id} />
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm font-medium text-stone-700">
              Source platform
              <select name="sourcePlatform" className="field mt-1">
                <option value="manual">Manual</option>
                <option value="google_drive">Google Drive</option>
                <option value="voice">Voice Transcript</option>
              </select>
            </label>
            <label className="text-sm font-medium text-stone-700">
              Source type
              <select name="sourceType" className="field mt-1">
                <option value="manual_note">Manual note</option>
                <option value="google_drive_transcript">Drive transcript</option>
                <option value="voice_note">Voice note transcript</option>
                <option value="customer_objection">Customer objection</option>
                <option value="investor_question">Investor question</option>
                <option value="product_update">Product update</option>
              </select>
            </label>
          </div>
          <input name="sourceOwner" className="field" placeholder="Source owner, optional" />
          <input name="sourceUrl" className="field" placeholder="Source URL, optional" />
          <textarea name="rawText" className="field min-h-40" placeholder="Paste transcript, note, or excerpt..." required />
          <button className="button w-fit">Create Redacted Insights</button>
        </form>
      </section>

      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow text-amber-700">Drafts</p>
            <h2 className="mt-1 text-2xl font-semibold">Review Queue</h2>
          </div>
          <form action={generateMarketingDraftsAction}>
            <input type="hidden" name="brainId" value={brain.id} />
            <button className="button-secondary">Generate Drafts</button>
          </form>
        </div>
        <div className="mt-4 grid gap-4">
          {draftPosts.length ? draftPosts.map((post) => (
            <article key={post.id} className="rounded-2xl border border-stone-200 bg-white p-5">
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge>{post.channel}</Badge>
                <Badge>{post.status}</Badge>
                <Badge>{post.pillar ?? "untagged"}</Badge>
                <Badge>{post.sensitivityLevel}</Badge>
              </div>
              {post.revisionReason || post.safetyCheckReason ? (
                <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{post.revisionReason ?? post.safetyCheckReason}</p>
              ) : null}
              <form action={updateMarketingPostAction} className="mt-4 grid gap-3">
                <input type="hidden" name="brainId" value={brain.id} />
                <input type="hidden" name="postId" value={post.id} />
                <textarea name="bodyText" className="field min-h-44" defaultValue={post.bodyText} />
                <div className="flex flex-wrap gap-2">
                  <button name="status" value="approved" className="button-secondary">Approve</button>
                  <button name="status" value="needs_revision" className="button-secondary">Request Revision</button>
                  <button name="status" value="archived" className="button-secondary">Archive</button>
                </div>
              </form>
              <form action={scheduleMarketingPostAction} className="mt-3 flex flex-wrap items-end gap-2">
                <input type="hidden" name="brainId" value={brain.id} />
                <input type="hidden" name="postId" value={post.id} />
                <label className="text-sm font-medium text-stone-700">
                  Schedule at
                  <input name="scheduledAt" className="field mt-1" placeholder="ISO timestamp, optional" />
                </label>
                <button className="button">Approve + Schedule</button>
              </form>
            </article>
          )) : (
            <div className="rounded-2xl bg-stone-50 p-5 text-sm text-stone-600">No drafts yet. Add input, then generate drafts.</div>
          )}
        </div>
      </section>

      <section className="mt-8">
        <p className="eyebrow text-amber-700">Published</p>
        <h2 className="mt-1 text-2xl font-semibold">Scheduled and Published Posts</h2>
        <div className="mt-4 grid gap-4">
          {publishedPosts.length ? publishedPosts.map((post) => (
            <article key={post.id} className="rounded-2xl border border-stone-200 bg-white p-5">
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge>{post.channel}</Badge>
                <Badge>{post.status}</Badge>
                <Badge>{post.schedulerProvider ?? "manual"}</Badge>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-stone-700">{post.bodyText}</p>
              <form action={recordMarketingMetricAction} className="mt-4 grid gap-2 md:grid-cols-4">
                <input type="hidden" name="brainId" value={brain.id} />
                <input type="hidden" name="postId" value={post.id} />
                <input name="impressions" className="field" placeholder="Impressions" />
                <input name="reactions" className="field" placeholder="Reactions" />
                <input name="comments" className="field" placeholder="Comments" />
                <button className="button-secondary">Record Metrics</button>
              </form>
              <form action={recordMarketingEventAction} className="mt-3 grid gap-2 md:grid-cols-[160px_1fr_auto]">
                <input type="hidden" name="brainId" value={brain.id} />
                <input type="hidden" name="postId" value={post.id} />
                <select name="eventType" className="field">
                  <option value="demo">Demo</option>
                  <option value="dm">DM</option>
                  <option value="reply">Reply</option>
                  <option value="qualified_lead">Qualified lead</option>
                </select>
                <input name="description" className="field" placeholder="What happened?" />
                <button className="button-secondary">Record Event</button>
              </form>
            </article>
          )) : (
            <div className="rounded-2xl bg-stone-50 p-5 text-sm text-stone-600">No scheduled or published posts yet.</div>
          )}
        </div>
      </section>

      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow text-amber-700">Reports</p>
            <h2 className="mt-1 text-2xl font-semibold">Weekly Learning</h2>
            <p className="mt-1 text-sm text-stone-600">Estimated logged LLM cost: ${totalEstimatedCost.toFixed(2)}</p>
          </div>
          <form action={generateMarketingWeeklyReportAction}>
            <input type="hidden" name="brainId" value={brain.id} />
            <button className="button-secondary">Generate Weekly Report</button>
          </form>
        </div>
        <div className="mt-4 grid gap-4">
          {reports.length ? reports.map((report) => (
            <article key={report.id} className="rounded-2xl border border-stone-200 bg-white p-5">
              <p className="text-sm font-semibold">{new Date(report.weekStart).toLocaleDateString()} - {new Date(report.weekEnd).toLocaleDateString()}</p>
              <p className="mt-2 text-sm text-stone-600">{report.summary}</p>
              <pre className="mt-4 whitespace-pre-wrap rounded-xl bg-stone-950 p-4 text-xs leading-6 text-stone-50">{report.markdown}</pre>
            </article>
          )) : (
            <div className="rounded-2xl bg-stone-50 p-5 text-sm text-stone-600">No weekly reports yet.</div>
          )}
        </div>
      </section>

      <p className="mt-8 text-xs text-stone-500">
        Pipeline state: {items.length} items, {insights.filter((insight) => insight.approvedForContent).length} approved insights, {metrics.length} metric snapshots.
      </p>
    </SectionShell>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-white p-4">
      <p className="eyebrow text-stone-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-stone-100 px-2 py-1 text-stone-700">{children}</span>;
}
