import { notFound } from "next/navigation";
import { BrainNav } from "@/components/brain/brain-nav";
import {
  isBrainNotFoundError,
  selectedBrainOrDefault,
} from "@/lib/brain/store";

// Brain shell: every /brains/[brainId]/<page> renders inside this layout so
// it shares one BrainNav sidebar and one resolved brain snapshot. The
// nested page is the right column.
//
// This file was missing from git history (uncommitted local-only work).
// Without it every page under /brains/[brainId]/ rendered naked - no nav,
// no shell. Discovered while running pnpm dev to QA the new prototype-
// matched pages (PRs #5-#17). Phase 5.2 of frontend-rewrite.md replaces
// BrainNav with the prototype's dark-navy sidebar; this PR ships the
// minimum-viable shell so pages aren't naked in the meantime.

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ brainId: string }>;
};

export default async function BrainLayout({ children, params }: LayoutProps) {
  const { brainId } = await params;
  let brain;
  try {
    const snapshot = await selectedBrainOrDefault(brainId);
    brain = snapshot.selectedBrain;
  } catch (error) {
    if (isBrainNotFoundError(error)) notFound();
    throw error;
  }

  return (
    <div className="min-h-screen grid grid-cols-[260px_1fr] bg-[var(--cream-100)]">
      <BrainNav brain={brain} />
      <main className="min-w-0">{children}</main>
    </div>
  );
}
