"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AgentRun, MemoryObject, OpenLoop, SourceItem } from "@arvya/core";
import type { BatchIngestionStatus } from "@/lib/workflows/batch-ingestion";

type UploadRow = {
  fileName: string;
  status: BatchIngestionStatus;
  error?: string;
};

type BatchResult = {
  fileName: string;
  status: BatchIngestionStatus;
  duplicate?: boolean;
  duplicateSourceItem?: SourceItem;
  sourceItem?: SourceItem;
  memoryObjects: MemoryObject[];
  openLoops: OpenLoop[];
  agentRuns: AgentRun[];
  storagePath?: string;
  metadata?: Record<string, unknown>;
  error?: string;
};

export function BatchUploadForm({ brainId }: { brainId: string }) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [rows, setRows] = useState<UploadRow[]>([]);
  const [results, setResults] = useState<BatchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const counts = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc[row.status] += 1;
        return acc;
      },
      { pending: 0, processing: 0, completed: 0, failed: 0 },
    );
  }, [rows]);

  function onFilesSelected(nextFiles: FileList | null) {
    const selected = Array.from(nextFiles ?? []);
    setFiles(selected);
    setResults([]);
    setError(null);
    setRows(selected.map((file) => ({ fileName: file.name, status: "pending" })));
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (files.length === 0) {
      setError("Choose at least one .txt or .md transcript.");
      return;
    }

    const formData = new FormData();
    formData.append("brainId", brainId);
    files.forEach((file) => formData.append("files", file));

    setIsSubmitting(true);
    setError(null);
    setRows((current) => current.map((row) => ({ ...row, status: "processing" })));

    try {
      const response = await fetch("/api/sources/batch-ingest", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Batch ingestion failed");
      }

      const nextResults = payload.results as BatchResult[];
      setResults(nextResults);
      setRows(
        nextResults.map((result) => ({
          fileName: result.fileName,
          status: result.status,
          error: result.error,
        })),
      );
      router.refresh();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Batch ingestion failed";
      setError(message);
      setRows((current) => current.map((row) => ({ ...row, status: "failed", error: message })));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={onSubmit} className="card space-y-4">
        <div>
          <label className="eyebrow" htmlFor="transcript-files">
            Transcript Files
          </label>
          <input
            id="transcript-files"
            type="file"
            multiple
            accept=".txt,.md,text/plain,text/markdown"
            onChange={(event) => onFilesSelected(event.currentTarget.files)}
            className="field mt-2"
          />
          <p className="mt-2 text-sm leading-6 text-stone-600">
            Use filenames like 2026-04-25__Investor__DormRoomFund-Annie__Intro-Call.txt
            to auto-fill transcript metadata.
          </p>
        </div>

        <button className="button disabled:opacity-60" disabled={isSubmitting || files.length === 0}>
          {isSubmitting ? "Ingesting transcripts..." : "Ingest Batch"}
        </button>

        {error ? <p className="text-sm font-medium text-red-700">{error}</p> : null}
      </form>

      {rows.length > 0 ? (
        <section className="card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">Batch Status</h2>
            <p className="text-sm text-stone-600">
              {counts.pending} pending · {counts.processing} processing · {counts.completed} completed ·{" "}
              {counts.failed} failed
            </p>
          </div>
          <div className="mt-4 space-y-2">
            {rows.map((row) => (
              <div
                key={row.fileName}
                className="flex flex-col gap-2 rounded-2xl bg-stone-50 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="text-sm font-medium">{row.fileName}</span>
                <span className={statusClassName(row.status)}>{row.status}</span>
                {row.error ? <p className="text-sm text-red-700">{row.error}</p> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {results.length > 0 ? (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold">Ingestion Results</h2>
          {results.map((result) => (
            <ResultCard key={result.fileName} result={result} />
          ))}
        </section>
      ) : null}
    </div>
  );
}

function statusClassName(status: BatchIngestionStatus) {
  const base = "rounded-full px-2 py-1 text-xs font-semibold uppercase tracking-widest";
  if (status === "completed") return `${base} bg-emerald-100 text-emerald-800`;
  if (status === "failed") return `${base} bg-red-100 text-red-800`;
  if (status === "processing") return `${base} bg-amber-100 text-amber-800`;
  return `${base} bg-stone-200 text-stone-700`;
}

function ResultCard({ result }: { result: BatchResult }) {
  const metadata = result.metadata ?? result.sourceItem?.metadata ?? {};
  return (
    <article className="rounded-2xl border border-stone-100 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow text-amber-700">{result.fileName}</p>
          <h3 className="mt-2 text-lg font-semibold">
            {result.sourceItem?.title ?? result.duplicateSourceItem?.title ?? "Not ingested"}
          </h3>
        </div>
        <span className={statusClassName(result.status)}>{result.status}</span>
      </div>

      {result.error ? <p className="mt-3 text-sm font-medium text-red-700">{result.error}</p> : null}
      {result.storagePath ? <p className="mt-3 text-sm text-stone-600">Storage: {result.storagePath}</p> : null}

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <Metric label="Source Items" value={result.sourceItem ? 1 : 0} />
        <Metric label="Memory Objects" value={result.memoryObjects.length} />
        <Metric label="Open Loops" value={result.openLoops.length} />
        <Metric label="Agent Runs" value={result.agentRuns.length} />
      </div>

      {Object.keys(metadata).length > 0 ? (
        <div className="mt-4 rounded-2xl bg-stone-50 p-4 text-sm leading-6 text-stone-700">
          <p className="font-semibold">Parsed metadata</p>
          <p>
            occurred_at: {stringValue(metadata.occurred_at) || "unknown"} · domain_type:{" "}
            {stringValue(metadata.domain_type) || "unknown"} · company/person:{" "}
            {stringValue(metadata.company_person_text) || "unknown"} · topic:{" "}
            {stringValue(metadata.topic) || "unknown"}
          </p>
        </div>
      ) : null}

      {result.memoryObjects.length > 0 ? (
        <DetailList title="Memory Objects" values={result.memoryObjects.map((memory) => memory.name)} />
      ) : null}
      {result.openLoops.length > 0 ? (
        <DetailList title="Open Loops" values={result.openLoops.map((loop) => loop.title)} />
      ) : null}
      {result.agentRuns.length > 0 ? (
        <DetailList
          title="Agent Runs"
          values={result.agentRuns.map((run) => `${run.stepName ?? run.name}: ${run.status}`)}
        />
      ) : null}
    </article>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-stone-50 p-3">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs uppercase tracking-widest text-stone-500">{label}</p>
    </div>
  );
}

function DetailList({ title, values }: { title: string; values: string[] }) {
  return (
    <div className="mt-4">
      <p className="text-sm font-semibold">{title}</p>
      <ul className="mt-2 space-y-1 text-sm leading-6 text-stone-600">
        {values.slice(0, 8).map((value) => (
          <li key={value}>{value}</li>
        ))}
      </ul>
    </div>
  );
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}
