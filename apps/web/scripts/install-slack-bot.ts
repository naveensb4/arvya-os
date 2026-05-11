import "dotenv/config";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";

const REDIRECT_PORT = 3000;
const REDIRECT_PATH = "/api/connectors/slack/auth/callback";
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}${REDIRECT_PATH}`;

// Bot scopes: must already be configured on the Slack app at api.slack.com.
// We request the union of (a) what the existing scripts/handlers need and
// (b) what setup-marketing-slack-channel.ts uses.
const BOT_SCOPES = [
  "channels:read",
  "channels:history",
  "channels:manage",
  "groups:read",
  "groups:write",
  "chat:write",
  "chat:write.public",
  "users:read",
  "im:write",
  "commands",
].join(",");

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is missing in .env.local`);
  }
  return value;
}

function writeEnvLocal(updates: Record<string, string>) {
  const envPath = path.join(process.cwd(), ".env.local");
  const text = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
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

async function main() {
  const clientId = requireEnv("SLACK_CLIENT_ID");
  const clientSecret = requireEnv("SLACK_CLIENT_SECRET");

  const state = Math.random().toString(36).slice(2);
  const installUrl =
    `https://slack.com/oauth/v2/authorize` +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&scope=${encodeURIComponent(BOT_SCOPES)}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&state=${state}`;

  const tokenPromise = new Promise<{ botToken: string; teamId: string; teamName?: string }>((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        if (!req.url) return;
        const url = new URL(req.url, `http://localhost:${REDIRECT_PORT}`);
        if (url.pathname !== REDIRECT_PATH) {
          res.writeHead(404);
          res.end("Not the OAuth callback path.");
          return;
        }
        const error = url.searchParams.get("error");
        if (error) {
          res.writeHead(400, { "content-type": "text/html; charset=utf-8" });
          res.end(`<h1>Slack returned an error: ${error}</h1>`);
          server.close();
          reject(new Error(`Slack OAuth error: ${error}`));
          return;
        }
        const code = url.searchParams.get("code");
        const stateParam = url.searchParams.get("state");
        if (!code || stateParam !== state) {
          res.writeHead(400, { "content-type": "text/html; charset=utf-8" });
          res.end("<h1>Missing code or invalid state.</h1>");
          server.close();
          reject(new Error("Missing OAuth code or invalid state."));
          return;
        }

        const exchange = await fetch("https://slack.com/api/oauth.v2.access", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: REDIRECT_URI,
          }).toString(),
        });
        const json = (await exchange.json()) as {
          ok?: boolean;
          error?: string;
          access_token?: string;
          team?: { id?: string; name?: string };
        };
        if (!json.ok || !json.access_token) {
          res.writeHead(500, { "content-type": "text/html; charset=utf-8" });
          res.end(`<h1>Slack token exchange failed: ${json.error ?? "unknown"}</h1>`);
          server.close();
          reject(new Error(`oauth.v2.access failed: ${json.error ?? "unknown_error"}`));
          return;
        }

        const teamName = json.team?.name ?? "your workspace";
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(
          `<!doctype html><html><body style="font-family: system-ui; padding: 32px;">` +
            `<h1>Arvya Marketing installed.</h1>` +
            `<p>Bot token captured for ${teamName}. You can close this tab.</p>` +
            `</body></html>`,
        );
        server.close();
        resolve({
          botToken: json.access_token,
          teamId: json.team?.id ?? "",
          teamName: json.team?.name,
        });
      } catch (err) {
        try {
          res.writeHead(500);
          res.end("Internal error during OAuth exchange.");
        } catch {}
        server.close();
        reject(err);
      }
    });
    server.listen(REDIRECT_PORT, "127.0.0.1", () => {
      console.log(`Listening for Slack OAuth callback at ${REDIRECT_URI}`);
      console.log("");
      console.log("Open this URL and click 'Allow' (auto-opening in your browser):");
      console.log(installUrl);
      console.log("");
      exec(`open "${installUrl.replace(/"/g, '\\"')}"`);
    });
    setTimeout(() => {
      server.close();
      reject(new Error("Timed out waiting for Slack OAuth (5 min)."));
    }, 5 * 60 * 1000).unref();
  });

  const { botToken, teamName } = await tokenPromise;
  writeEnvLocal({ SLACK_BOT_TOKEN: botToken });
  console.log(`SLACK_BOT_TOKEN written to .env.local for ${teamName ?? "workspace"}.`);
  console.log("Run: pnpm slack:setup-marketing");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
