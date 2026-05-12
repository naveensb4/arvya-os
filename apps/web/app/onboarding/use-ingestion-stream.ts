"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type SyncProgress = {
  total: number;
  completed: number;
  failed: number;
  running: number;
  people: number;
  companies: number;
};

export type DiscoveredEntity = {
  id: string;
  objectType: string;
  name: string;
  description: string;
  sourceContext: string | null;
  discoveredAt: number;
};

export type StreamPhase = "connecting" | "streaming" | "done" | "fallback";

const MAX_ENTITIES = 50;
const POLL_INTERVAL_MS = 3000;

export function useIngestionStream(brainId: string, enabled: boolean) {
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [entities, setEntities] = useState<DiscoveredEntity[]>([]);
  const [phase, setPhase] = useState<StreamPhase>("connecting");
  const esRef = useRef<EventSource | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startFallback = useCallback(() => {
    if (pollRef.current) return;
    setPhase("fallback");

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/brains/${brainId}/sync`);
        if (res.ok) {
          const data = await res.json();
          setProgress(data);
          if (data.phase === "ready" || (data.total > 0 && data.completed === data.total)) {
            setPhase("done");
            if (pollRef.current) {
              clearInterval(pollRef.current);
              pollRef.current = null;
            }
          }
        }
      } catch {}
    }, POLL_INTERVAL_MS);
  }, [brainId]);

  useEffect(() => {
    if (!enabled) return;

    const url = `/api/brains/${brainId}/ingestion-stream`;
    let es: EventSource;

    try {
      es = new EventSource(url);
      esRef.current = es;
    } catch {
      startFallback();
      return;
    }

    const failTimeout = setTimeout(() => {
      if (es.readyState !== EventSource.OPEN) {
        es.close();
        esRef.current = null;
        startFallback();
      }
    }, 5000);

    es.addEventListener("progress", (e) => {
      clearTimeout(failTimeout);
      setPhase("streaming");
      try {
        const data = JSON.parse(e.data) as SyncProgress;
        setProgress(data);
      } catch {}
    });

    es.addEventListener("entity", (e) => {
      clearTimeout(failTimeout);
      setPhase("streaming");
      try {
        const data = JSON.parse(e.data) as Omit<DiscoveredEntity, "discoveredAt">;
        setEntities((prev) => {
          if (prev.some((ent) => ent.id === data.id)) return prev;
          const next = [{ ...data, discoveredAt: Date.now() }, ...prev];
          return next.slice(0, MAX_ENTITIES);
        });
      } catch {}
    });

    let streamDone = false;

    es.addEventListener("done", (e) => {
      streamDone = true;
      clearTimeout(failTimeout);
      try {
        const data = JSON.parse(e.data) as SyncProgress;
        setProgress(data);
      } catch {}
      setPhase("done");
      es.close();
      esRef.current = null;
    });

    es.onerror = () => {
      clearTimeout(failTimeout);
      if (!streamDone) {
        es.close();
        esRef.current = null;
        startFallback();
      }
    };

    return () => {
      clearTimeout(failTimeout);
      es.close();
      esRef.current = null;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [enabled, brainId, startFallback]);

  return { progress, entities, phase };
}
