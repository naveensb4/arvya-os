import type { AiClient, MemoryObject, OpenLoop, SourceItem } from "@arvya/core";

export type BrainContextResult = {
  memoryObjects: MemoryObject[];
  openLoops: OpenLoop[];
  sourceItems: SourceItem[];
  totalResults: number;
};

export type RetrieveBrainContextFn = (query: string) => Promise<BrainContextResult>;

export class CrossBrainAccessError extends Error {
  constructor(requestedBrainId: string, boundBrainId: string) {
    super(`Cross-brain access denied: requested ${requestedBrainId}, bound to ${boundBrainId}`);
    this.name = "CrossBrainAccessError";
  }
}

/**
 * Creates a closure-bound retrieval function for a specific brain.
 * The brainId is captured at construction time and CANNOT be overridden
 * by the tool input — this prevents cross-brain data leaks.
 */
export function createRetrieveBrainContextTool(deps: {
  brainId: string;
  retrieveFn: (input: {
    brainId: string;
    question: string;
    limit?: number;
  }) => Promise<Array<{
    memoryObject?: MemoryObject;
    openLoop?: OpenLoop;
    sourceItem?: SourceItem;
    score: number;
  }>>;
}): RetrieveBrainContextFn {
  const { brainId, retrieveFn } = deps;

  return async (query: string): Promise<BrainContextResult> => {
    const results = await retrieveFn({
      brainId,
      question: query,
      limit: 20,
    });

    const memoryObjects: MemoryObject[] = [];
    const openLoops: OpenLoop[] = [];
    const sourceItems: SourceItem[] = [];

    for (const result of results) {
      if (result.memoryObject) memoryObjects.push(result.memoryObject);
      if (result.openLoop) openLoops.push(result.openLoop);
      if (result.sourceItem) sourceItems.push(result.sourceItem);
    }

    return {
      memoryObjects,
      openLoops,
      sourceItems,
      totalResults: results.length,
    };
  };
}
