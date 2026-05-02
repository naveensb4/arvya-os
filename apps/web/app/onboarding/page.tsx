"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createOnboardingBrain, getOnboardingState } from "./actions";

const CONSULTING_SUGGESTED_QUESTIONS = [
  "What did we promise the client in our last call?",
  "Which projects have upcoming deadlines this week?",
  "Summarize the latest emails from our top 3 clients",
  "What commitments are overdue across all engagements?",
  "Who are the key contacts we've been communicating with?",
];

type Step = "create" | "connect" | "progress";

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("create");
  const [brainId, setBrainId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getOnboardingState().then((state) => {
      if (state.step === "auth") {
        router.push("/signup");
        return;
      }
      setStep(state.step);
      setBrainId(state.brainId);
      setLoading(false);
    });
  }, [router]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f2ea]">
        <p className="text-sm text-stone-500">Loading...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f6f2ea] px-6 py-8 text-stone-950">
      <div className="mx-auto max-w-2xl">
        <p className="eyebrow text-amber-700">Arvya OS</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">
          {step === "create" && "Create your Brain"}
          {step === "connect" && "Connect your sources"}
          {step === "progress" && "Your Brain is learning"}
        </h1>
        <p className="mt-2 text-sm text-stone-600">
          {step === "create" && "Give your Brain a name. It will learn from everything you connect."}
          {step === "connect" && "Connect Google Workspace and Slack. Your Brain starts learning immediately."}
          {step === "progress" && "Sources are being ingested. You can start asking questions."}
        </p>

        <StepIndicator current={step} />

        {error && (
          <div className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {step === "create" && (
          <CreateStep
            onCreated={(id) => {
              setBrainId(id);
              setStep("connect");
            }}
            onError={setError}
          />
        )}
        {step === "connect" && brainId && (
          <ConnectStep brainId={brainId} onDone={() => setStep("progress")} />
        )}
        {step === "progress" && brainId && (
          <ProgressStep brainId={brainId} />
        )}
      </div>
    </main>
  );
}

function StepIndicator({ current }: { current: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: "create", label: "Create Brain" },
    { key: "connect", label: "Connect Sources" },
    { key: "progress", label: "Brain Learning" },
  ];
  const currentIndex = steps.findIndex((s) => s.key === current);

  return (
    <div className="mt-6 flex gap-2">
      {steps.map((s, i) => (
        <div key={s.key} className="flex-1">
          <div
            className={`h-1 rounded-full transition ${
              i <= currentIndex ? "bg-stone-950" : "bg-stone-200"
            }`}
          />
          <p
            className={`mt-2 text-xs font-medium ${
              i <= currentIndex ? "text-stone-950" : "text-stone-400"
            }`}
          >
            {s.label}
          </p>
        </div>
      ))}
    </div>
  );
}

function CreateStep({
  onCreated,
  onError,
}: {
  onCreated: (brainId: string) => void;
  onError: (err: string) => void;
}) {
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    onError("");

    const formData = new FormData(e.currentTarget);
    try {
      const result = await createOnboardingBrain(formData);
      onCreated(result.brainId);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to create Brain");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card mt-6 space-y-4">
      <div>
        <label htmlFor="brain-name" className="mb-1 block text-sm font-medium text-stone-700">
          Brain name
        </label>
        <input
          id="brain-name"
          name="name"
          className="field"
          placeholder="Acme Consulting"
          required
        />
      </div>
      <div>
        <label htmlFor="brain-kind" className="mb-1 block text-sm font-medium text-stone-700">
          Template
        </label>
        <select id="brain-kind" name="kind" className="field" defaultValue="company">
          <option value="company">Company Brain (Consulting)</option>
          <option value="sell_side">Sell-Side Deal Brain</option>
          <option value="buy_side">Buy-Side / PE Deal Brain</option>
        </select>
      </div>
      <input type="hidden" name="thesis" value="" />
      <button type="submit" disabled={submitting} className="button w-full">
        {submitting ? "Creating Brain..." : "Create Brain"}
      </button>
    </form>
  );
}

function ConnectStep({ brainId, onDone }: { brainId: string; onDone: () => void }) {
  const [googleConnected, setGoogleConnected] = useState(false);
  const [slackConnected, setSlackConnected] = useState(false);

  useEffect(() => {
    async function checkConnections() {
      try {
        const res = await fetch(`/api/brains/${brainId}/stats`);
        if (res.ok) {
          const data = await res.json();
          if (data.connectorsActive > 0) {
            setGoogleConnected(true);
            onDone();
          }
        }
      } catch {
        // ignore — will retry on user action
      }
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get("connected") === "google") {
      setGoogleConnected(true);
    }
    if (params.get("connected") === "slack") {
      setSlackConnected(true);
    }

    checkConnections();
  }, [brainId, onDone]);

  return (
    <div className="mt-6 space-y-4">
      <div className="card flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white">
            <GoogleLogo />
          </div>
          <div>
            <p className="font-semibold">Google Workspace</p>
            <p className="text-sm text-stone-600">Gmail, Calendar, and Drive in one click</p>
          </div>
        </div>
        {googleConnected ? (
          <span className="text-sm font-medium text-stone-500">Connected</span>
        ) : (
          <a
            href={`/api/connectors/google/auth/start?brainId=${encodeURIComponent(brainId)}`}
            className="button shrink-0"
          >
            Connect Google
          </a>
        )}
      </div>

      <div className="card flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white">
            <SlackLogo />
          </div>
          <div>
            <p className="font-semibold">Slack</p>
            <p className="text-sm text-stone-600">Read channels and answer questions when mentioned</p>
          </div>
        </div>
        {slackConnected ? (
          <span className="text-sm font-medium text-stone-500">Connected</span>
        ) : (
          <a
            href={`/api/connectors/slack/auth/start?brainId=${encodeURIComponent(brainId)}`}
            className="button shrink-0"
          >
            Connect Slack
          </a>
        )}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-stone-500">You can connect more sources later from Settings.</p>
        <button onClick={onDone} className="button-secondary">
          {googleConnected || slackConnected ? "Continue" : "Skip for now"}
        </button>
      </div>
    </div>
  );
}

function ProgressStep({ brainId }: { brainId: string }) {
  const router = useRouter();
  const [stats, setStats] = useState({ sourcesIngested: 0, memoriesExtracted: 0, connectorsActive: 0 });

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/brains/${brainId}/stats`);
      if (res.ok) setStats(await res.json());
    } catch {
      // silent retry
    }
  }, [brainId]);

  useEffect(() => {
    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [poll]);

  return (
    <div className="mt-6 space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <AnimatedCounter label="Sources ingested" value={stats.sourcesIngested} />
        <AnimatedCounter label="Memories extracted" value={stats.memoriesExtracted} />
        <AnimatedCounter label="Connectors active" value={stats.connectorsActive} />
      </div>

      <div className="card">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
          Try asking your Brain
        </p>
        <div className="mt-4 space-y-2">
          {CONSULTING_SUGGESTED_QUESTIONS.map((q) => (
            <a
              key={q}
              href={`/brains/${brainId}/ask?q=${encodeURIComponent(q)}`}
              className="block rounded-2xl border border-stone-200 px-4 py-3 text-sm transition hover:border-stone-950 hover:bg-stone-50"
            >
              {q}
            </a>
          ))}
        </div>
      </div>

      <button
        onClick={() => router.push(`/brains/${brainId}`)}
        className="button w-full"
      >
        Go to Brain Dashboard
      </button>
    </div>
  );
}

function AnimatedCounter({ label, value }: { label: string; value: number }) {
  return (
    <div className="card text-center">
      <p className="text-3xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs uppercase tracking-widest text-stone-500">{label}</p>
    </div>
  );
}

function GoogleLogo() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

function SlackLogo() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24">
      <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z" fill="#E01E5A" />
      <path d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.527 2.527 0 0 1 2.521 2.521 2.527 2.527 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z" fill="#36C5F0" />
      <path d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.27 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.163 0a2.528 2.528 0 0 1 2.523 2.522v6.312z" fill="#2EB67D" />
      <path d="M15.163 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.163 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.27a2.527 2.527 0 0 1-2.52-2.523 2.527 2.527 0 0 1 2.52-2.52h6.315A2.528 2.528 0 0 1 24 15.163a2.528 2.528 0 0 1-2.522 2.523h-6.315z" fill="#ECB22E" />
    </svg>
  );
}
