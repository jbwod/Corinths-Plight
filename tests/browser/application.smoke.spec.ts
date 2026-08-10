import { expect, test, type Page } from "@playwright/test";

async function expectNoDocumentOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth, `document width ${dimensions.scrollWidth}px exceeded viewport width ${dimensions.clientWidth}px`).toBeLessThanOrEqual(
    dimensions.clientWidth + 1,
  );
}

test("public landing exposes the signed-out authentication shell", async ({ page }) => {
  const sessionResponse = page.waitForResponse((response) => response.url().endsWith("/api/auth/session"));

  await page.goto("/?signedout=1");

  const response = await sessionResponse;
  expect(response.status()).toBe(200);
  await expect(response.json()).resolves.toMatchObject({ signedIn: false, authAvailable: true });
  await expect(page.getByRole("heading", { name: "Every unit has a name. Every order has a cost." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Corinth's Plight home" })).toBeVisible();

  await page.getByRole("button", { name: "SIGN IN", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Return to command" })).toBeVisible();
  await expect(page.getByLabel("EMAIL")).toBeEnabled();
  await expect(page.getByRole("button", { name: "EMAIL SECURE LINK" })).toBeEnabled();

  await page.getByRole("button", { name: "NEW COMMANDER? ENLIST" }).click();
  await expect(page.getByRole("heading", { name: "Join the expedition" })).toBeVisible();
  await expect(page.getByLabel("DISPLAY NAME")).toBeVisible();
  await expect(page.getByLabel("USERNAME")).toBeVisible();
});

test("local demo navigation reaches live strategic and tactical services", async ({ page }) => {
  const sessionResponse = page.waitForResponse((response) => response.url().endsWith("/api/auth/session"));

  await page.goto("/?view=command");

  const response = await sessionResponse;
  expect(response.status()).toBe(200);
  await expect(response.json()).resolves.toMatchObject({ signedIn: true, demo: true });
  await expect(page.getByText("LOCAL DEMO", { exact: true })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Persistent world connected" })).toBeVisible();
  await expect(page.getByText("Local showcase · read only", { exact: true })).toHaveCount(0);

  const campaignResponse = page.waitForResponse((candidate) => (
    candidate.url().includes("/api/campaigns/outpost-k17/state") && candidate.request().method() === "GET"
  ));
  await page.getByRole("navigation", { name: "Primary" }).getByRole("button", { name: "Campaigns" }).click();

  const campaign = await campaignResponse;
  expect(campaign.status()).toBe(200);
  await expect(campaign.json()).resolves.toMatchObject({ campaignId: "outpost-k17" });
  await expect(page.getByText("CAMPAIGN LIVE", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Outpost K-17" })).toBeVisible();
  await expect(page.getByText(/Local tactical projection active/)).toHaveCount(0);
});

test("tactical API rejects client-authored action economy", async ({ page }) => {
  await page.goto("/?view=campaigns");
  await expect(page.getByText("CAMPAIGN LIVE", { exact: true })).toBeVisible();

  const rejected = await page.evaluate(async () => {
    const response = await fetch("/api/campaigns/outpost-k17/orders", {
      method: "POST",
      headers: { "content-type": "application/json", "x-demo-user": "demo-user" },
      body: JSON.stringify({
        commandId: "browser-invalid-economy",
        expectedCampaignVersion: 1,
        expectedOrderRevision: 0,
        unitId: "dep-rook-7",
        orderType: "HOLD",
        facing: 2,
        actions: [{ type: "ATTACK", economy: "INCIDENTAL", speedCost: -100 }],
      }),
    });
    return { status: response.status, body: await response.json() };
  });

  expect(rejected).toEqual({
    status: 400,
    body: {
      error: {
        code: "CAMPAIGN_REQUEST_INVALID",
        message: "Unknown fields: economy, speedCost.",
        details: { path: "$.actions[0]" },
      },
    },
  });
});

test("public and authenticated shells do not overflow a 390px viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto("/?signedout=1");
  await expect(page.getByRole("heading", { name: "Every unit has a name. Every order has a cost." })).toBeVisible();
  await expectNoDocumentOverflow(page);

  const campaignResponse = page.waitForResponse((candidate) => (
    candidate.url().includes("/api/campaigns/outpost-k17/state") && candidate.request().method() === "GET"
  ));
  await page.goto("/?view=campaigns");
  const campaign = await campaignResponse;
  expect(campaign.status()).toBe(200);
  await expect(campaign.json()).resolves.toMatchObject({ campaignId: "outpost-k17" });
  await expect(page.getByRole("region", { name: "Tactical operations map" })).toBeVisible();
  await expectNoDocumentOverflow(page);
});
