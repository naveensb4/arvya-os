import { expect, test, type Page } from "@playwright/test";

const brainId = "arvya-company-brain";
const brainBase = `/brains/${brainId}`;

async function expectHealthyPage(page: Page, path: string, heading: RegExp | string) {
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(response?.status(), `${path} should not server-error`).toBeLessThan(400);
  await expect(page.locator("body")).toContainText(heading);
  await expect(page.locator("body")).not.toContainText("Application error");
}

test.describe("Arvya Company Brain browser smoke", () => {
  test("routes /brains into the seeded company brain shell", async ({ page }) => {
    const response = await page.goto("/brains", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(new RegExp(`${brainBase}$`));
    await expect(page.getByRole("complementary").getByText("Arvya Company Brain")).toBeVisible();
    await expect(page.getByRole("link", { name: /Daily brief/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Ask brain/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Action items/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Agent runs/i })).toBeVisible();
  });

  test("core operating-system surfaces render without server failures", async ({ page }) => {
    const surfaces: Array<[string, RegExp | string]> = [
      [brainBase, /Today|Company Brain|Arvya/i],
      [`${brainBase}/sources`, "Sources."],
      [`${brainBase}/open-loops`, "Open loops."],
      [`${brainBase}/ask`, "Ask the brain anything."],
      [`${brainBase}/brief`, /brief|No brief yet/i],
      [`${brainBase}/agent-runs`, /Agent runs/i],
      [`${brainBase}/connections`, /Connectors|Connections/i],
      [`${brainBase}/people`, /People/i],
      [`${brainBase}/companies`, /Companies/i],
      [`${brainBase}/graph`, /Knowledge graph|Graph/i],
      [`${brainBase}/drift`, /Drift/i],
    ];

    for (const [path, heading] of surfaces) {
      await expectHealthyPage(page, path, heading);
    }
  });

  test("ask brain answers from source-backed company memory", async ({ page }) => {
    await page.goto(`${brainBase}/ask`, { waitUntil: "domcontentloaded" });
    const composer = page.getByPlaceholder(/Ask anything/i);
    await composer.click();
    await composer.pressSequentially("What should stay visible until closed?");
    await expect(page.getByRole("button", { name: "Send" })).toBeEnabled();
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText("retrieve_context")).toBeVisible();
    await expect(page.getByText("compile_truth")).toBeVisible();
    await expect(page.locator("body")).toContainText(/open loops|manual upload|visible|closed/i, {
      timeout: 20_000,
    });
    await expect(page.locator("body")).toContainText(/Confidence|Sources cited/i, {
      timeout: 20_000,
    });
  });

  test("API layer exposes the closed-loop brain primitives", async ({ request }) => {
    const health = await request.get("/api/health");
    expect(health.status()).toBeLessThan(500);
    const healthBody = await health.json();
    expect(["ok", "degraded"]).toContain(healthBody.status);

    const stats = await request.get(`/api/brains/${brainId}/stats`);
    expect(stats.status()).toBe(200);
    await expect(stats).toBeOK();
    const statsBody = await stats.json();
    expect(statsBody.sourcesIngested).toBeGreaterThanOrEqual(1);
    expect(statsBody.memoriesExtracted).toBeGreaterThanOrEqual(1);

    const ask = await request.post(`/api/brains/${brainId}/ask`, {
      data: { question: "What must stay visible until closed?" },
    });
    expect(ask.status()).toBe(200);
    const askBody = await ask.json();
    expect(askBody.answer).toMatch(/manual upload|open loops|closed|visible/i);
    expect(Array.isArray(askBody.citations)).toBe(true);
  });
});
