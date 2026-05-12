export type SlackConfig = {
  teamId: string;
  teamName: string;
  botToken: string;
  channels: string[];
  // Slack user ID of the person who installed the app. We DM them the
  // welcome / capabilities message so it doesn't spam #general.
  installerUserId?: string;
};

export async function startSlackOAuth(redirectUri: string, state?: string): Promise<string> {
  const clientId = process.env.SLACK_CLIENT_ID!;
  // groups:write was added 2026-05-09 for the auto-created #arvya-brain
  // private channel. Existing installs need to re-OAuth once to upgrade.
  const scopes = "app_mentions:read,channels:history,channels:read,chat:write,groups:write,im:history,im:write,users:read";
  const url = new URL("https://slack.com/oauth/v2/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("scope", scopes);
  url.searchParams.set("redirect_uri", redirectUri);
  if (state) url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeSlackCode(code: string, redirectUri: string): Promise<SlackConfig> {
  const resp = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.SLACK_CLIENT_ID!,
      client_secret: process.env.SLACK_CLIENT_SECRET!,
      code,
      redirect_uri: redirectUri,
    }),
  });
  const data = await resp.json();
  if (!data.ok) throw new Error(`Slack OAuth failed: ${data.error}`);
  return {
    teamId: data.team.id,
    teamName: data.team.name,
    botToken: data.access_token,
    channels: [],
    installerUserId: data.authed_user?.id,
  };
}

// Open (or fetch) a DM channel with a Slack user. Slack returns the same
// channel id on repeat calls, so it's safe to call this every time we
// want to DM someone.
export async function openSlackDm(
  botToken: string,
  userId: string,
): Promise<string | null> {
  const resp = await fetch("https://slack.com/api/conversations.open", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ users: userId }),
  });
  const data = await resp.json();
  if (!data.ok) return null;
  return data.channel?.id ?? null;
}

export async function listSlackChannels(botToken: string): Promise<Array<{id: string; name: string}>> {
  const resp = await fetch("https://slack.com/api/conversations.list?types=public_channel&limit=200", {
    headers: { Authorization: `Bearer ${botToken}` },
  });
  const data = await resp.json();
  if (!data.ok) throw new Error(`Slack channels list failed: ${data.error}`);
  return data.channels.map((c: any) => ({ id: c.id, name: c.name }));
}

export async function syncChannelHistory(
  botToken: string,
  channelId: string,
  oldest?: string
): Promise<Array<{ts: string; user: string; text: string; threadTs?: string}>> {
  const params = new URLSearchParams({ channel: channelId, limit: "100" });
  if (oldest) params.set("oldest", oldest);
  const resp = await fetch(`https://slack.com/api/conversations.history?${params}`, {
    headers: { Authorization: `Bearer ${botToken}` },
  });
  const data = await resp.json();
  if (!data.ok) throw new Error(`Slack history failed: ${data.error}`);
  return data.messages
    .filter((m: any) => m.type === "message" && !m.subtype)
    .map((m: any) => ({
      ts: m.ts,
      user: m.user,
      text: m.text,
      threadTs: m.thread_ts,
    }));
}

export async function sendSlackDM(
  botToken: string,
  userId: string,
  text: string
): Promise<void> {
  const openResp = await fetch("https://slack.com/api/conversations.open", {
    method: "POST",
    headers: { Authorization: `Bearer ${botToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ users: userId }),
  });
  const openData = await openResp.json();
  if (!openData.ok) throw new Error(`Slack DM open failed: ${openData.error}`);

  const postResp = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { Authorization: `Bearer ${botToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ channel: openData.channel.id, text }),
  });
  const postData = await postResp.json();
  if (!postData.ok) throw new Error(`Slack DM send failed: ${postData.error}`);
}

export async function postSlackMessage(
  botToken: string,
  channelId: string,
  text: string,
  blocks?: unknown[],
): Promise<{ ts: string } | null> {
  const body: Record<string, unknown> = { channel: channelId, text };
  if (blocks && blocks.length > 0) body.blocks = blocks;
  const resp = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { Authorization: `Bearer ${botToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  if (!data.ok) throw new Error(`Slack post failed: ${data.error}`);
  return data.ts ? { ts: String(data.ts) } : null;
}

// Create a private (or public) Slack channel. Idempotent at the call site
// via name_taken handling — caller is expected to look up the existing
// channel by name when this returns null.
export async function createSlackChannel(input: {
  botToken: string;
  name: string;
  isPrivate: boolean;
}): Promise<{ id: string; name: string } | { error: "name_taken" } | { error: string }> {
  const resp = await fetch("https://slack.com/api/conversations.create", {
    method: "POST",
    headers: { Authorization: `Bearer ${input.botToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: input.name, is_private: input.isPrivate }),
  });
  const data = await resp.json();
  if (!data.ok) {
    if (data.error === "name_taken") return { error: "name_taken" };
    return { error: String(data.error ?? "unknown") };
  }
  return { id: data.channel.id, name: data.channel.name };
}

export async function inviteSlackUsersToChannel(input: {
  botToken: string;
  channelId: string;
  userIds: string[];
}): Promise<void> {
  if (input.userIds.length === 0) return;
  const resp = await fetch("https://slack.com/api/conversations.invite", {
    method: "POST",
    headers: { Authorization: `Bearer ${input.botToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ channel: input.channelId, users: input.userIds.join(",") }),
  });
  const data = await resp.json();
  // already_in_channel is fine — the user is already there. Anything else
  // that's not "ok" is a hard error worth surfacing to the caller.
  if (!data.ok && data.error !== "already_in_channel") {
    throw new Error(`Slack invite failed: ${data.error}`);
  }
}

// Look up a private/group channel by name. The bot must be a member or
// have groups:read. We add this for the "channel already exists" path of
// the auto-create flow — once the bot has created #arvya-brain, the same
// brain on a re-install can find it again.
export async function findSlackChannelByName(input: {
  botToken: string;
  name: string;
}): Promise<{ id: string; name: string } | null> {
  // We need both public and private channel types because the bot may have
  // been given access to either.
  const url = new URL("https://slack.com/api/conversations.list");
  url.searchParams.set("types", "public_channel,private_channel");
  url.searchParams.set("limit", "200");
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${input.botToken}` },
  });
  const data = await resp.json();
  if (!data.ok) return null;
  const match = (data.channels ?? []).find((c: { name?: string }) => c.name === input.name);
  if (!match) return null;
  return { id: match.id, name: match.name };
}
