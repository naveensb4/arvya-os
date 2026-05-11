/**
 * Dismiss-pattern feedback loop (D12).
 *
 * Tracks which loop types get dismissed frequently. When >=3 active loops
 * match a previously-dismissed type pattern, surfaces a suggestion to
 * dismiss them all.
 *
 * TTL/decay mechanism (critical gap #3): patterns older than 30 days
 * decay in weight, patterns older than 90 days are ignored entirely.
 */

import type { OpenLoop } from "@arvya/core";

const PATTERN_THRESHOLD = 3;
const DECAY_START_DAYS = 30;
const PATTERN_TTL_DAYS = 90;

export type DismissPattern = {
  loopType: string;
  count: number;
  matchingIds: string[];
};

export function detectDismissPatterns(loops: OpenLoop[]): DismissPattern[] {
  const now = Date.now();

  const dismissed = loops.filter((l) => l.status === "dismissed");
  const active = loops.filter(
    (l) => !["closed", "done", "dismissed"].includes(l.status),
  );

  const typeWeights = new Map<string, number>();
  for (const loop of dismissed) {
    const dismissedAt = loop.closedAt ?? loop.updatedAt ?? loop.createdAt;
    if (!dismissedAt) continue;

    const ageDays = (now - new Date(dismissedAt).getTime()) / (24 * 60 * 60 * 1000);
    if (ageDays > PATTERN_TTL_DAYS) continue;

    let weight = 1;
    if (ageDays > DECAY_START_DAYS) {
      weight = Math.max(0.1, 1 - (ageDays - DECAY_START_DAYS) / (PATTERN_TTL_DAYS - DECAY_START_DAYS));
    }

    const current = typeWeights.get(loop.loopType) ?? 0;
    typeWeights.set(loop.loopType, current + weight);
  }

  const patterns: DismissPattern[] = [];

  for (const [loopType, weight] of typeWeights) {
    if (weight < 1) continue;

    const matching = active.filter((l) => l.loopType === loopType);
    if (matching.length >= PATTERN_THRESHOLD) {
      patterns.push({
        loopType,
        count: matching.length,
        matchingIds: matching.map((l) => l.id),
      });
    }
  }

  return patterns.sort((a, b) => b.count - a.count);
}
