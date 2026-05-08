export type SlackConfig = {
  teamId: string;
  teamName: string;
  botToken: string;
  channels: string[];
};

export async function startSlackOAuth(redirectUri: string, state?: string): Promise<string> {
  const clientId = process.env.SLACK_CLIENT_ID!;
  const scopes = "app_mentions:read,channels:history,channels:read,chat:write,im:history,im:write,users:read";
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
  };
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
  text: string
): Promise<void> {
  const resp = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { Authorization: `Bearer ${botToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ channel: channelId, text }),
  });
  const data = await resp.json();
  if (!data.ok) throw new Error(`Slack post failed: ${data.error}`);
}
