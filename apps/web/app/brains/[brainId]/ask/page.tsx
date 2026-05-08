import { Suspense } from "react";
import { AskChat } from "./ask-chat";

// Ask Brain - Claude-chat style page per docs/prototype/Ask.html. Composer
// pinned bottom, answers stream from top, no user-name in chat bubbles.
//
// The visible behavior (thinking pill -> reasoning trace -> tool rows ->
// streamed answer with citations -> sources panel + confidence + followups)
// is implemented client-side via fixture scenarios that mirror the
// prototype's output 1:1. Once the existing /api/brains/[brainId]/ask
// route streams reasoning + tool calls, swap the fixture-driven runner in
// ask-chat.tsx for a real fetch + reader. The visible UX stays the same.

export default function AskPage() {
  return (
    <Suspense fallback={null}>
      <AskChat />
    </Suspense>
  );
}
