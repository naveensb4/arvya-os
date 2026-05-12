import type { MeetingPrepBrief } from "@arvya/core";

const SLACK_CHAR_LIMIT = 38_000;

function severityEmoji(trustLabel: "fact" | "inference" | "judgment_call"): string {
  if (trustLabel === "fact") return ":warning:";
  if (trustLabel === "inference") return ":large_yellow_circle:";
  return ":white_circle:";
}

function sourceChip(source: { kind: string; id_or_url: string; excerpt?: string }): string {
  if (source.kind === "web_url" || source.kind === "linkedin_url") {
    return `<${source.id_or_url}|${source.kind === "linkedin_url" ? "LinkedIn" : "web"}>`;
  }
  return `[${source.kind}]`;
}

function formatAttendee(attendee: MeetingPrepBrief["attendees"][0]): string {
  const parts = [`*${attendee.name}*`];
  if (attendee.role && attendee.company) {
    parts.push(`${attendee.role}, ${attendee.company}`);
  } else if (attendee.company) {
    parts.push(attendee.company);
  } else if (attendee.role) {
    parts.push(attendee.role);
  }
  if (attendee.linkedin_url) {
    parts.push(`<${attendee.linkedin_url}|LinkedIn>`);
  }
  const mentions = attendee.mini_dossier.recent_mentions;
  if (mentions.length > 0) {
    const mentionLines = mentions
      .slice(0, 3)
      .map((m) => `  • ${m.snippet.slice(0, 120)}`);
    parts.push(mentionLines.join("\n"));
  }
  return parts.join(" · ");
}

export type FormattedPrepMessage = {
  text: string;
  truncated: boolean;
};

export function formatPrepBrief(
  brief: MeetingPrepBrief,
  dashboardUrl: string,
): FormattedPrepMessage {
  const parts: string[] = [];

  const startDate = new Date(brief.meeting_window.start);
  const dayStr = startDate.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
  const timeStr = startDate.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  parts.push(`:calendar: *${brief.attendees[0]?.company ?? "Meeting"} / ${brief.attendees[0]?.name ?? "Unknown"} / ${timeStr} — ${dayStr}*`);
  parts.push("");

  if (brief.why_now.reason) {
    parts.push(`_${brief.why_now.reason}_`);
    parts.push("");
  }

  if (brief.questions_to_ask.length > 0) {
    parts.push("*ASK THEM*");
    for (const q of brief.questions_to_ask.slice(0, 3)) {
      const sources = q.sources.map(sourceChip).join(" ");
      parts.push(`${q.question}${q.rationale ? ` — _${q.rationale}_` : ""} ${sources}`);
    }
    parts.push("");
  }

  if (brief.things_to_know.length > 0) {
    parts.push("*KNOW*");
    for (const t of brief.things_to_know.slice(0, 3)) {
      const sources = t.sources.map(sourceChip).join(" ");
      const freshness = t.freshness_label ? ` · ${t.freshness_label}` : "";
      parts.push(`${t.point}${freshness} ${sources}`);
    }
    parts.push("");
  }

  if (brief.risks_to_dodge.length > 0) {
    parts.push("*RISKS*");
    for (const r of brief.risks_to_dodge) {
      parts.push(`${severityEmoji(r.trust_label)} ${r.risk}`);
    }
    parts.push("");
  }

  if (brief.attendees.length > 0) {
    parts.push("*ATTENDEES*");
    for (const a of brief.attendees) {
      parts.push(formatAttendee(a));
    }
    parts.push("");
  }

  if (brief.open_loops_with_attendees.length > 0) {
    parts.push("*OPEN LOOPS*");
    for (const loop of brief.open_loops_with_attendees) {
      const overdueTag = loop.overdue ? " :warning: overdue" : "";
      const dueTag = loop.due_date ? ` · due ${loop.due_date}` : "";
      parts.push(`• ${loop.title}${dueTag}${overdueTag}`);
    }
    parts.push("");
  }

  if (brief.tone_calibration.description) {
    parts.push(`_Tone: ${brief.tone_calibration.description}_`);
    parts.push("");
  }

  const confidenceStr = brief.overall_confidence.toFixed(2);
  parts.push(
    `Confidence ${confidenceStr} · ${brief.source_count} sources cited · <${dashboardUrl}|Open in Brain →>`,
  );

  parts.push("");
  parts.push("👍 useful · 👎 not useful · 💬 tell me why");

  let text = parts.join("\n");
  let truncated = false;

  if (text.length > SLACK_CHAR_LIMIT) {
    truncated = true;
    text = text.slice(0, SLACK_CHAR_LIMIT - 100);
    text += `\n\n... <${dashboardUrl}|Full brief in dashboard →>`;
  }

  return { text, truncated };
}

export function formatPrepFirstTimeTip(): string {
  return "\n_Pro tip: mention me with `prep me for <meeting>`, use `/meeting-prep <title>`, or click Prep on the dashboard._";
}

export function formatLowConfidenceMessage(dashboardUrl: string): string {
  return `Brain wasn't confident enough to send this prep — only limited sources mentioned the attendees.\n\n<${dashboardUrl}|View on dashboard> · Connect Gmail to grow context.`;
}
