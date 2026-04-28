import { SectionShell } from "@/components/layout/section-shell";
import { createPriorityAction, updatePriorityStatusAction } from "@/app/actions";
import { listBrainPriorities, selectedBrainOrDefault } from "@/lib/brain/store";

type PageProps = {
  params: Promise<{ brainId: string }>;
};

const horizonLabel: Record<string, string> = {
  today: "Today",
  week: "This week",
  sprint: "This sprint",
  quarter: "This quarter",
};

const setByLabel: Record<string, string> = {
  naveen: "Naveen",
  pb: "PB",
  system: "System",
};

const statusLabel: Record<string, string> = {
  active: "Active",
  achieved: "Achieved",
  abandoned: "Abandoned",
};

const statusBadge: Record<string, string> = {
  active: "bg-amber-100 text-amber-900",
  achieved: "bg-emerald-100 text-emerald-900",
  abandoned: "bg-stone-200 text-stone-700",
};

export default async function PrioritiesPage({ params }: PageProps) {
  const { brainId } = await params;
  const { selectedBrain } = await selectedBrainOrDefault(brainId);
  const selectedBrainId = selectedBrain.id;
  const all = await listBrainPriorities(selectedBrainId);
  const active = all.filter((p) => p.status === "active");
  const achieved = all.filter((p) => p.status === "achieved");
  const abandoned = all.filter((p) => p.status === "abandoned");

  return (
    <SectionShell
      brainId={selectedBrainId}
      title="Priorities"
      description="The founders' stated priorities. The daily brief and drift review use these as the source of truth for what should actually be happening."
    >
      <form action={createPriorityAction} className="rounded-2xl bg-stone-50 p-5">
        <input type="hidden" name="brainId" value={selectedBrainId} />
        <div className="grid gap-3">
          <label className="text-sm font-medium">
            New priority statement
            <textarea
              name="statement"
              required
              minLength={1}
              maxLength={500}
              rows={2}
              placeholder="e.g. Ship beta to 10 design partner customers by end of week"
              className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm leading-6 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-200"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">
              Set by
              <select
                name="setBy"
                defaultValue="naveen"
                className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-200"
              >
                <option value="naveen">Naveen</option>
                <option value="pb">PB</option>
                <option value="system">System</option>
              </select>
            </label>
            <label className="text-sm font-medium">
              Horizon
              <select
                name="horizon"
                defaultValue="week"
                className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-200"
              >
                <option value="today">Today</option>
                <option value="week">This week</option>
                <option value="sprint">This sprint</option>
                <option value="quarter">This quarter</option>
              </select>
            </label>
          </div>
          <div className="flex justify-end">
            <button type="submit" className="button">
              Set priority
            </button>
          </div>
        </div>
      </form>

      <div className="mt-6 space-y-4">
        <PriorityList
          title={`Active (${active.length})`}
          priorities={active}
          brainId={selectedBrainId}
          showActions
        />
        {achieved.length > 0 ? (
          <PriorityList
            title={`Achieved (${achieved.length})`}
            priorities={achieved}
            brainId={selectedBrainId}
          />
        ) : null}
        {abandoned.length > 0 ? (
          <PriorityList
            title={`Abandoned (${abandoned.length})`}
            priorities={abandoned}
            brainId={selectedBrainId}
          />
        ) : null}
      </div>
    </SectionShell>
  );
}

function PriorityList({
  title,
  priorities,
  brainId,
  showActions,
}: {
  title: string;
  priorities: Awaited<ReturnType<typeof listBrainPriorities>>;
  brainId: string;
  showActions?: boolean;
}) {
  return (
    <section>
      <p className="eyebrow text-amber-700">{title}</p>
      {priorities.length === 0 ? (
        <p className="mt-2 rounded-2xl bg-stone-50 p-5 text-sm text-stone-600">
          No priorities in this state yet.
        </p>
      ) : (
        <ul className="mt-2 space-y-3">
          {priorities.map((priority) => (
            <li key={priority.id} className="rounded-2xl border border-stone-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="text-sm font-medium leading-6">{priority.statement}</p>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    statusBadge[priority.status] ?? "bg-stone-100 text-stone-700"
                  }`}
                >
                  {statusLabel[priority.status] ?? priority.status}
                </span>
              </div>
              <p className="mt-2 text-xs text-stone-500">
                {setByLabel[priority.setBy] ?? priority.setBy} • {horizonLabel[priority.horizon] ?? priority.horizon} •
                {" "}
                set {new Date(priority.setAt).toLocaleDateString()}
              </p>
              {showActions ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <form action={updatePriorityStatusAction}>
                    <input type="hidden" name="brainId" value={brainId} />
                    <input type="hidden" name="priorityId" value={priority.id} />
                    <input type="hidden" name="status" value="achieved" />
                    <button type="submit" className="button-secondary text-xs">
                      Mark achieved
                    </button>
                  </form>
                  <form action={updatePriorityStatusAction}>
                    <input type="hidden" name="brainId" value={brainId} />
                    <input type="hidden" name="priorityId" value={priority.id} />
                    <input type="hidden" name="status" value="abandoned" />
                    <button type="submit" className="button-secondary text-xs">
                      Abandon
                    </button>
                  </form>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
