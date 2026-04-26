import Link from "next/link";
import type { Brain } from "@arvya/core";

const navItems = [
  ["Overview", ""],
  ["Ask", "/ask"],
  ["Sources", "/sources"],
  ["Connections", "/connections"],
  ["Notetaker", "/notetaker"],
  ["Memory", "/memory"],
  ["Open Loops", "/open-loops"],
  ["Insights", "/insights"],
  ["Workflows", "/workflows"],
  ["Agent Runs", "/agent-runs"],
  ["Settings", "/settings"],
] as const;

export function BrainNav({ brain }: { brain: Brain }) {
  return (
    <aside className="card h-fit">
      <p className="eyebrow">{brain.name}</p>
      <p className="mt-2 text-sm leading-6 text-stone-600">{brain.kind.replace("_", " ")}</p>
      <nav className="mt-5 space-y-2">
        {navItems.map(([label, suffix]) => (
          <Link
            key={label}
            href={`/brains/${brain.id}${suffix}`}
            className="block rounded-xl px-3 py-2 text-sm hover:bg-stone-100"
          >
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
