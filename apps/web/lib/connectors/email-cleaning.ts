// Email body cleaning. Strips quoted reply blocks, "On <date> wrote:"
// reply chains, common signatures, and forwarded-message banners so the
// LLM (and the regex fallback) sees the actual new message instead of
// re-ingesting the same forwarded body 5 times.
//
// Also parses RFC822 "Name <email@host>" address strings into a
// structured participant list that the ingestion pipeline can match
// against extracted person memory objects (so we can fill in
// properties.email even when the LLM doesn't see the address inline).

export type EmailParticipant = {
  name?: string;
  email?: string;
  raw: string;
};

const REPLY_SEPARATORS = [
  // English ("On Tue, May 6, 2026 at 10:00 AM, Sumit Roy <s@x.com> wrote:")
  /^\s*On\s+.{1,200}\bwrote:\s*$/im,
  // Forwarded message banner
  /^\s*-{2,}\s*Forwarded message\s*-{2,}\s*$/im,
  // Outlook-style header dividers
  /^\s*From:\s.+$/im,
  // Some clients use a single divider line
  /^_{5,}\s*$/im,
];

const SIGNATURE_MARKERS = [
  /^\s*--\s*$/m,                 // standard sig delimiter
  /^\s*Sent from my\s/im,        // iPhone/Android
  /^\s*Get Outlook for\s/im,
  /^\s*Get the Outlook app/im,
  /^\s*Sent via\s/im,
  /^\s*Best,?\s*$/im,            // "Best,\nName" common closer (we trim AFTER)
  /^\s*Thanks,?\s*$/im,
  /^\s*Regards,?\s*$/im,
];

function dropFromMatch(content: string, regex: RegExp): string {
  const match = content.match(regex);
  if (!match || match.index === undefined) return content;
  return content.slice(0, match.index).trimEnd();
}

function stripQuotedLines(content: string): string {
  const lines = content.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    if (/^\s*>+/.test(line)) continue;
    out.push(line);
  }
  return out.join("\n");
}

export function cleanEmailBody(rawBody: string): string {
  if (!rawBody) return "";
  let body = rawBody.replace(/\r\n/g, "\n");

  // Cut at the first reply / forwarded-message marker.
  for (const sep of REPLY_SEPARATORS) {
    body = dropFromMatch(body, sep);
  }

  // Drop classic ">"-quoted lines (gmail, outlook, mutt, etc.).
  body = stripQuotedLines(body);

  // Cut at the first signature marker. We keep one closer line
  // ("Thanks,\nNaveen") because that gives the LLM the sender's name; only
  // strip if the closer is followed by Sent-from / Get-Outlook tells.
  for (const marker of SIGNATURE_MARKERS) {
    const match = body.match(marker);
    if (!match || match.index === undefined) continue;
    const tail = body.slice(match.index);
    // Only strip closers like "Best," / "Thanks," when the next ~6 lines
    // contain a phone footer or device tag. Otherwise the closer carries
    // signal (the sender's name).
    if (/^\s*(Best|Thanks|Regards),?\s*$/im.test(match[0])) {
      const next6 = tail.split("\n").slice(0, 6).join("\n");
      if (!/Sent from my|Get Outlook|Sent via|@/i.test(next6)) continue;
    }
    body = body.slice(0, match.index).trimEnd();
    break;
  }

  // Collapse runs of blank lines.
  body = body.replace(/\n{3,}/g, "\n\n").trim();
  return body;
}

// Parse "John Doe <john@x.com>, jane@y.com" into structured participants.
export function parseAddressList(raw?: string): EmailParticipant[] {
  if (!raw) return [];
  const out: EmailParticipant[] = [];
  // Split on commas not inside quotes / angle brackets.
  const parts = raw.split(/,(?![^<]*>)/g);
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const angle = trimmed.match(/^"?([^"<]+?)"?\s*<([^>]+)>$/);
    if (angle) {
      out.push({ name: angle[1].trim(), email: angle[2].trim().toLowerCase(), raw: trimmed });
      continue;
    }
    const emailOnly = trimmed.match(/^<?([^\s<>]+@[^\s<>]+)>?$/);
    if (emailOnly) {
      out.push({ email: emailOnly[1].trim().toLowerCase(), raw: trimmed });
      continue;
    }
    out.push({ name: trimmed.replace(/^"|"$/g, ""), raw: trimmed });
  }
  return out;
}

// Build the structured content the LLM sees. Keeps the from/to context as a
// short header block (so the model knows who wrote what) but the body is
// cleaned. Subject/date go through metadata, not the body, since the body
// shouldn't repeat the title we already pass separately.
export function buildEmailContent(input: {
  from?: string;
  to?: string;
  cleanBody: string;
}): string {
  const lines: string[] = [];
  if (input.from) lines.push(`From: ${input.from}`);
  if (input.to) lines.push(`To: ${input.to}`);
  if (lines.length > 0) lines.push("");
  lines.push(input.cleanBody);
  return lines.join("\n").trim();
}
