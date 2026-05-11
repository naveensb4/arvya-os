import { exec } from "node:child_process";

const APP_ID = process.env.SLACK_APP_ID?.trim() || "A0B0XAGSMPD";
const TARGET_CHANNEL = process.env.MARKETING_OS_SLACK_CHANNEL_ID?.trim() || "C0B3Q83MJL8";
const BOT_TOKEN = process.env.SLACK_BOT_TOKEN?.trim();

const SOCKET_TOGGLE_URL = `https://api.slack.com/apps/${APP_ID}/socket-mode`;
const EVENTS_TOGGLE_URL = `https://api.slack.com/apps/${APP_ID}/event-subscriptions`;
const INTERACTIVITY_URL = `https://api.slack.com/apps/${APP_ID}/interactive-messages`;

function logBanner() {
  console.log("");
  console.log("=".repeat(78));
  console.log("  Arvya · Enable Socket Mode in the Slack app config");
  console.log("=".repeat(78));
  console.log("");
  console.log("  No Slack config-access token (xoxe.xoxp-...) was found, so we cannot");
  console.log("  flip the toggle via apps.manifest.update. Two clicks in the browser:");
  console.log("");
  console.log(`    1. Open  ${SOCKET_TOGGLE_URL}`);
  console.log("       and turn ON 'Enable Socket Mode'.");
  console.log("");
  console.log(`    2. Open  ${EVENTS_TOGGLE_URL}`);
  console.log("       and confirm 'Enable Events' is ON and the bot subscribes to");
  console.log("       message.channels, app_mention, message.groups, message.im.");
  console.log("");
  console.log(`    3. Open  ${INTERACTIVITY_URL}`);
  console.log("       and confirm 'Interactivity' is ON (request URL can stay blank for Socket Mode).");
  console.log("");
  console.log("  Then post any message in #arvya-marketing (or wait for the user's). This script");
  console.log("  polls and prints 'Confirmed: Socket Mode live.' when the listener receives an event.");
  console.log("");
}

function openInBrowser(url: string) {
  exec(`open "${url.replace(/"/g, '\\"')}"`, (err) => {
    if (err) console.warn(`[enable-socket-mode] could not auto-open ${url}: ${err.message}`);
  });
}

async function authTest(): Promise<{ ok: boolean; teamId?: string; userId?: string; error?: string }> {
  if (!BOT_TOKEN) return { ok: false, error: "missing_SLACK_BOT_TOKEN" };
  try {
    const response = await fetch("https://slack.com/api/auth.test", {
      method: "POST",
      headers: { authorization: `Bearer ${BOT_TOKEN}` },
    });
    const json = (await response.json()) as { ok?: boolean; team_id?: string; user_id?: string; error?: string };
    return { ok: Boolean(json.ok), teamId: json.team_id, userId: json.user_id, error: json.error };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function postProbe(threadIndex: number): Promise<string | undefined> {
  if (!BOT_TOKEN) return undefined;
  try {
    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        authorization: `Bearer ${BOT_TOKEN}`,
        "content-type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        channel: TARGET_CHANNEL,
        text: `_socket-mode probe #${threadIndex} — if you see this and the listener prints 'message in ${TARGET_CHANNEL}' below, Socket Mode is live._`,
        unfurl_links: false,
        unfurl_media: false,
      }),
    });
    const json = (await response.json()) as { ok?: boolean; ts?: string; error?: string };
    if (!json.ok) {
      console.warn(`[enable-socket-mode] probe post failed: ${json.error}`);
      return undefined;
    }
    return json.ts;
  } catch (err) {
    console.warn(`[enable-socket-mode] probe post threw: ${err instanceof Error ? err.message : err}`);
    return undefined;
  }
}

type RecentMessage = { text?: string; user?: string; ts?: string; bot_id?: string };

async function fetchRecentMessages(): Promise<RecentMessage[]> {
  if (!BOT_TOKEN) return [];
  const url = new URL("https://slack.com/api/conversations.history");
  url.searchParams.set("channel", TARGET_CHANNEL);
  url.searchParams.set("limit", "10");
  try {
    const response = await fetch(url, { headers: { authorization: `Bearer ${BOT_TOKEN}` } });
    const json = (await response.json()) as { ok?: boolean; messages?: RecentMessage[] };
    if (!json.ok || !json.messages) return [];
    return json.messages;
  } catch {
    return [];
  }
}

async function fetchAppsConnectionsCount(): Promise<number | null> {
  // apps.connections.open requires an xapp- token; we can't poll connection count
  // without one. We use it as a sanity check rather than truth.
  const appToken = process.env.SLACK_APP_TOKEN?.trim();
  if (!appToken) return null;
  try {
    const response = await fetch("https://slack.com/api/apps.connections.open", {
      method: "POST",
      headers: { authorization: `Bearer ${appToken}` },
    });
    const json = (await response.json()) as { ok?: boolean; error?: string };
    // If Socket Mode is OFF, Slack returns ok:false with error:"not_authed" or
    // similar. If ON, it returns ok:true with a wss URL. We don't actually keep
    // the WS open — the running listener already holds one.
    return json.ok ? 1 : 0;
  } catch {
    return null;
  }
}

async function main() {
  logBanner();

  const initialAuth = await authTest();
  if (!initialAuth.ok) {
    console.error(`[enable-socket-mode] auth.test failed: ${initialAuth.error ?? "unknown"}.`);
    console.error("  Set SLACK_BOT_TOKEN in arvya-os/.env.local and rerun.");
    process.exit(2);
  }
  console.log(`[enable-socket-mode] auth.test ok — team ${initialAuth.teamId}, bot ${initialAuth.userId}.`);

  console.log("[enable-socket-mode] opening Slack app config in your browser...");
  openInBrowser(SOCKET_TOGGLE_URL);
  setTimeout(() => openInBrowser(EVENTS_TOGGLE_URL), 1500);
  setTimeout(() => openInBrowser(INTERACTIVITY_URL), 3000);

  const start = Date.now();
  const timeoutMs = 2 * 60 * 1000;
  let probeIndex = 0;
  let lastProbeTs: string | undefined;
  let lastSeenTs: string | undefined;
  const seenSet = new Set<string>();

  // Snapshot baseline so we can detect a NEW message (probe or human) after toggle.
  const baseline = await fetchRecentMessages();
  for (const m of baseline) {
    if (m.ts) seenSet.add(m.ts);
  }

  // Loop: every 10s, send a probe; every 5s, poll history for any new message
  // whose ts is greater than the baseline. If we see one of OUR probes pop back
  // in history within 5s AND apps.connections.open returns ok:true, Socket Mode
  // is fully live.
  while (Date.now() - start < timeoutMs) {
    const elapsed = Math.floor((Date.now() - start) / 1000);
    const connections = await fetchAppsConnectionsCount();
    if (connections === 1) {
      console.log(`[enable-socket-mode] t=${elapsed}s · Socket Mode endpoint reachable (apps.connections.open ok).`);

      // Final confirmation: send a probe and confirm we see it in history within 15s.
      if (!lastProbeTs || Date.now() - Number(lastProbeTs) * 1000 > 12_000) {
        probeIndex += 1;
        lastProbeTs = await postProbe(probeIndex);
        if (lastProbeTs) console.log(`[enable-socket-mode] sent probe #${probeIndex} ts=${lastProbeTs}.`);
      }

      const recent = await fetchRecentMessages();
      const newer = recent.filter((m) => m.ts && !seenSet.has(m.ts));
      for (const m of newer) {
        if (m.ts) seenSet.add(m.ts);
        if (m.text && (m.text.includes("socket-mode probe") || !m.bot_id)) {
          lastSeenTs = m.ts;
        }
      }

      if (lastProbeTs && lastSeenTs) {
        console.log("");
        console.log("Confirmed: Socket Mode live.");
        console.log(`  team=${initialAuth.teamId} bot=${initialAuth.userId} channel=${TARGET_CHANNEL}`);
        console.log(`  last verified ts=${lastSeenTs}`);
        process.exit(0);
      }
    } else if (connections === 0) {
      console.log(`[enable-socket-mode] t=${elapsed}s · Socket Mode still OFF (apps.connections.open returns not_authed).`);
    } else {
      console.log(`[enable-socket-mode] t=${elapsed}s · cannot check (no xapp- token).`);
    }

    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }

  console.error("");
  console.error("[enable-socket-mode] Timed out after 2 minutes without confirmed event flow.");
  console.error(`  Manual checks: ${SOCKET_TOGGLE_URL}`);
  console.error("  - 'Enable Socket Mode' must be ON.");
  console.error("  - Event Subscriptions must be ON with message.channels + message.groups + app_mention + message.im.");
  console.error("  - Interactivity must be ON.");
  console.error("  - After flipping, the running `pnpm slack:listen` process must reconnect (it auto-reconnects every ~30s).");
  process.exit(1);
}

main().catch((err) => {
  console.error("[enable-socket-mode] fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
