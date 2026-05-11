import crypto from "node:crypto";
import { SocketModeClient } from "@slack/socket-mode";

const appToken = process.env.SLACK_APP_TOKEN?.trim();
const signingSecret = process.env.SLACK_SIGNING_SECRET?.trim();
const targetUrl = (process.env.SLACK_LISTENER_TARGET_URL?.trim() || "http://127.0.0.1:3000").replace(/\/$/, "");
const allowedChannel = process.env.MARKETING_OS_SLACK_CHANNEL_ID?.trim();

if (!appToken) {
  console.error("SLACK_APP_TOKEN is required (xapp-...). Set it in .env.local.");
  process.exit(1);
}
if (!signingSecret) {
  console.error("SLACK_SIGNING_SECRET is required for the listener (it signs payloads sent to the local app).");
  process.exit(1);
}

const slack = new SocketModeClient({ appToken });

function sign(rawBody: string) {
  const ts = String(Math.floor(Date.now() / 1000));
  const base = `v0:${ts}:${rawBody}`;
  const sig = `v0=${crypto.createHmac("sha256", signingSecret!).update(base).digest("hex")}`;
  return { ts, sig };
}

async function forwardJson(path: string, payload: unknown) {
  const rawBody = JSON.stringify(payload);
  const { ts, sig } = sign(rawBody);
  const response = await fetch(`${targetUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-slack-request-timestamp": ts,
      "x-slack-signature": sig,
    },
    body: rawBody,
  });
  const text = await response.text().catch(() => "");
  return { status: response.status, body: text };
}

async function forwardForm(path: string, fields: Record<string, string>) {
  const params = new URLSearchParams(fields);
  const rawBody = params.toString();
  const { ts, sig } = sign(rawBody);
  const response = await fetch(`${targetUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-slack-request-timestamp": ts,
      "x-slack-signature": sig,
    },
    body: rawBody,
  });
  const text = await response.text().catch(() => "");
  return { status: response.status, body: text };
}

slack.on("connecting", () => console.log("[slack:listen] connecting to Slack Socket Mode..."));
slack.on("authenticated", () => console.log("[slack:listen] authenticated."));
slack.on("connected", () => {
  console.log(`[slack:listen] connected. Forwarding to ${targetUrl}. Channel filter: ${allowedChannel ?? "(any)"}`);
});
slack.on("disconnected", () => console.log("[slack:listen] disconnected."));
slack.on("error", (error) => console.error("[slack:listen] error:", error));

slack.on("events_api", async ({ ack, body }) => {
  await ack();
  try {
    const event = body?.event ?? {};
    if (event.bot_id) return;
    if (event.type !== "message") return;
    if (allowedChannel && event.channel !== allowedChannel) return;
    const text = (event.text ?? "").slice(0, 200);
    console.log(`[slack:listen] message in ${event.channel} from ${event.user}: ${text}`);
    const result = await forwardJson("/api/connectors/slack/events", body);
    console.log(`[slack:listen] forwarded events → ${result.status}`);
  } catch (error) {
    console.error("[slack:listen] events_api handler failed:", error);
  }
});

slack.on("interactive", async ({ ack, body }) => {
  await ack();
  try {
    console.log(`[slack:listen] interactive ${body?.type ?? "?"} from ${body?.user?.id ?? "?"}`);
    const result = await forwardForm("/api/connectors/slack/interactions", {
      payload: JSON.stringify(body),
    });
    console.log(`[slack:listen] forwarded interactions → ${result.status}`);
  } catch (error) {
    console.error("[slack:listen] interactive handler failed:", error);
  }
});

slack.on("slash_commands", async ({ ack, body }) => {
  await ack();
  try {
    console.log(`[slack:listen] slash command ${body?.command ?? "?"} from ${body?.user_id ?? "?"}`);
    const fields: Record<string, string> = {};
    for (const [k, v] of Object.entries(body ?? {})) fields[k] = String(v ?? "");
    const result = await forwardForm("/api/connectors/slack/commands", fields);
    console.log(`[slack:listen] forwarded slash → ${result.status}`);
  } catch (error) {
    console.error("[slack:listen] slash_commands handler failed:", error);
  }
});

function shutdown(signal: string) {
  console.log(`[slack:listen] caught ${signal}, disconnecting...`);
  slack.disconnect().finally(() => process.exit(0));
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

slack.start().catch((error) => {
  console.error("[slack:listen] start failed:", error);
  process.exit(1);
});
