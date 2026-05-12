import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import puppeteer from "puppeteer";

const port = Number(process.env.PUPPETEER_PORT ?? 3101);
const baseUrl = process.env.ARVYA_E2E_BASE_URL ?? `http://127.0.0.1:${port}`;
const brainId = "arvya-company-brain";

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url: string, timeoutMs = 90_000) {
  const started = Date.now();
  let lastError = "";
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.status < 500) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(750);
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError}`);
}

function startServer(): ChildProcessWithoutNullStreams | null {
  if (process.env.ARVYA_E2E_BASE_URL) return null;
  return spawn(
    "pnpm",
    ["--filter", "@arvya/web", "exec", "next", "dev", "-H", "127.0.0.1", "-p", String(port)],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ARVYA_E2E_AUTH_BYPASS: "1",
        ARVYA_DISABLE_LIVE_AI: "1",
        DATABASE_URL: "",
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "e2e-anon-key",
        SUPABASE_SERVICE_ROLE_KEY: "",
      },
    },
  );
}

async function textIncludes(page: import("puppeteer").Page, pattern: RegExp) {
  const bodyText = await page.evaluate(() => document.body.innerText);
  if (!pattern.test(bodyText)) {
    throw new Error(`Expected page text to match ${pattern}, got:\n${bodyText.slice(0, 1200)}`);
  }
}

async function main() {
  const server = startServer();
  if (server) {
    server.stdout.on("data", (chunk) => process.stdout.write(chunk));
    server.stderr.on("data", (chunk) => process.stderr.write(chunk));
  }

  try {
    await waitForServer(`${baseUrl}/login`);
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    page.setDefaultTimeout(20_000);

    const dashboard = await page.goto(`${baseUrl}/brains/${brainId}`, {
      waitUntil: "domcontentloaded",
    });
    if (!dashboard || dashboard.status() >= 400) {
      throw new Error(`Dashboard failed with HTTP ${dashboard?.status() ?? "unknown"}`);
    }
    await textIncludes(page, /Arvya Company Brain/);
    await textIncludes(page, /Daily brief/);
    await textIncludes(page, /Action items/);

    const ask = await page.goto(`${baseUrl}/brains/${brainId}/ask`, {
      waitUntil: "domcontentloaded",
    });
    if (!ask || ask.status() >= 400) {
      throw new Error(`Ask page failed with HTTP ${ask?.status() ?? "unknown"}`);
    }
    await page.type("textarea", "What should stay visible until closed?");
    await page.click("button[aria-label='Send']");
    await page.waitForFunction(
      () => /open loops|closed|visible/i.test(document.body.innerText),
      { timeout: 25_000 },
    );

    const stats = await fetch(`${baseUrl}/api/brains/${brainId}/stats`, {
      headers: { "content-type": "application/json" },
    });
    if (!stats.ok) throw new Error(`Stats API failed with HTTP ${stats.status}`);
    const statsJson = (await stats.json()) as {
      sourcesIngested: number;
      memoriesExtracted: number;
    };
    if (statsJson.sourcesIngested < 1 || statsJson.memoriesExtracted < 1) {
      throw new Error(`Stats API returned insufficient company memory: ${JSON.stringify(statsJson)}`);
    }

    await browser.close();
    console.log("Puppeteer company brain verification passed.");
  } finally {
    if (server) {
      server.kill("SIGTERM");
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
