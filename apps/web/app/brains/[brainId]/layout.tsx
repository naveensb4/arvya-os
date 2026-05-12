import { notFound } from "next/navigation";
import { BrainNav } from "@/components/brain/brain-nav";
import { Topbar } from "@/components/brain/topbar";
import { getAuthUser } from "@/lib/auth/session";
import {
  getBrainSnapshot,
  isBrainNotFoundError,
} from "@/lib/brain/store";
import shell from "@/components/brain/shell.module.css";

// Brain shell - prototype-matched dark-navy sidebar + sticky topbar
// (Phase 5.2). All /brains/[brainId]/<page> routes render inside this
// layout. Counts in the sidebar derive from a single getBrainSnapshot
// call so each page-rewrite stays clean.

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ brainId: string }>;
};

export default async function BrainLayout({ children, params }: LayoutProps) {
  const { brainId } = await params;

  let snapshot;
  try {
    snapshot = await getBrainSnapshot(brainId);
  } catch (error) {
    if (isBrainNotFoundError(error)) notFound();
    throw error;
  }

  const me = await getAuthUser();
  const meName = me?.email?.split("@")[0] ?? "You";
  const meRole = "Founder";

  const brain = snapshot.selectedBrain;
  const counts = {
    loops: snapshot.openLoops?.length ?? 0,
    sources: snapshot.sourceItems?.length ?? 0,
  };

  return (
    <div className={shell.app}>
      <BrainNav brain={brain} meName={meName} meRole={meRole} counts={counts} />
      <main className={shell.main}>
        <Topbar
          brainId={brain.id}
          crumbs={[{ label: brain.name }, { label: "Today" }]}
        />
        <div className={shell.content}>{children}</div>
      </main>
    </div>
  );
}
