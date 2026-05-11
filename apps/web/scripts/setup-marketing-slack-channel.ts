import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

const CHANNEL_NAME = "arvya-marketing";
const DEFAULT_USERS = ["U0AFADN213M", "U0AFDCGPFK7", "U0AFGQPCMNW"];

async function slack<T>(method: string, body: Record<string, unknown>): Promise<T & { ok?: boolean; error?: string }> {
  const token = process.env.SLACK_BOT_TOKEN?.trim();
  if (!token) {
    throw new Error("SLACK_BOT_TOKEN is missing. Add the bot token that starts with xoxb- to .env.local.");
  }
  const response = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });
  const json = await response.json() as T & { ok?: boolean; error?: string };
  if (!json.ok) throw new Error(`${method} failed: ${json.error ?? "unknown_error"}`);
  return json;
}

function updateEnvLocal(channelId: string) {
  const envPath = path.join(process.cwd(), ".env.local");
  const text = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const updates: Record<string, string> = {
    MARKETING_OS_SLACK_CHANNEL_ID: channelId,
  };
  const lines = text.split(/\n/);
  const seen = new Set<string>();
  const out = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) return line;
    const key = trimmed.split("=", 1)[0];
    if (!(key in updates)) return line;
    seen.add(key);
    return `${key}="${updates[key]}"`;
  });
  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) out.push(`${key}="${value}"`);
  }
  fs.writeFileSync(envPath, `${out.join("\n").replace(/\n+$/, "")}\n`);
}

async function findExistingChannel() {
  const response = await slack<{ channels?: Array<{ id: string; name: string }> }>("conversations.list", {
    exclude_archived: true,
    limit: 1000,
    types: "public_channel,private_channel",
  });
  return response.channels?.find((channel) => channel.name === CHANNEL_NAME);
}

async function main() {
  const existing = await findExistingChannel().catch(() => undefined);
  const channel = existing ?? (await slack<{ channel: { id: string; name: string } }>("conversations.create", {
    name: CHANNEL_NAME,
    is_private: false,
  })).channel;

  await slack("conversations.join", { channel: channel.id }).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    if (
      !message.includes("already_in_channel") &&
      !message.includes("method_not_supported_for_channel_type") &&
      !message.includes("is_archived")
    ) {
      throw error;
    }
  });

  await slack("conversations.invite", {
    channel: channel.id,
    users: DEFAULT_USERS.join(","),
  }).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("already_in_channel")) throw error;
  });

  await slack("conversations.setTopic", {
    channel: channel.id,
    topic: "Arvya Marketing: the working room for turning founder/customer/market signal into thoughtful Arvya LinkedIn posts.",
  });

  await slack("conversations.setPurpose", {
    channel: channel.id,
    purpose: "Talk here like you would with the marketing team. Share rough ideas, competitor moves, customer objections, links, and positioning questions. Arvya Marketing will turn the best signals into LinkedIn options for approval.",
  });

  updateEnvLocal(channel.id);
  console.log(`Configured #${CHANNEL_NAME} (${channel.id}) and updated MARKETING_OS_SLACK_CHANNEL_ID in .env.local.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
