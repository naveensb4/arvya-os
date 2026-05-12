import { Suspense } from "react";
import { getBrainSnapshot } from "@/lib/brain/store";
import { AskChat } from "./ask-chat";

// Ask Brain - Claude-chat style page per docs/prototype/Ask.html. Composer
// pinned bottom, answers stream from top, no user-name in chat bubbles.
//
// Server component reads real counts (sourceItems / memoryObjects /
// openLoops) from the snapshot and passes them to the client AskChat.
// AskChat POSTs every question to /api/brains/[brainId]/ask, which calls
// the existing answerBrainQuestion -> retrieval + LLM pipeline and returns
// the full answer + citations. The visible UX (thinking pill, streamed
// answer, sources panel, confidence meter) plays back the real response.

type PageProps = {
  params: Promise<{ brainId: string }>;
};

export default async function AskPage({ params }: PageProps) {
  const { brainId } = await params;
  const snapshot = await getBrainSnapshot(brainId);

  const counts = {
    artifacts: snapshot.sourceItems?.length ?? 0,
    entityPages: snapshot.memoryObjects?.length ?? 0,
    openLoops: snapshot.openLoops?.length ?? 0,
  };

  return (
    <Suspense fallback={null}>
      <AskChat brainId={snapshot.selectedBrain.id} counts={counts} />
    </Suspense>
  );
}
