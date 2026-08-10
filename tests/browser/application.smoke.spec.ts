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

async function ensurePlayableK17(page: Page, deployFoundation = false): Promise<void> {
  const join = page.getByRole("button", { name: /JOIN K-17: HOLD THE RELAY/i });
  const map = page.getByRole("region", { name: "Tactical operations map" });
  const noPlayableCampaign = page.getByRole("heading", { name: "No playable campaign assigned" });
  await expect(map.or(noPlayableCampaign)).toBeVisible();
  if (await map.isVisible() && !deployFoundation) return;
  if (await join.isVisible()) {
    await join.click();
    await expect(page.getByText(/Campaign joined/)).toBeVisible();
    await expect.poll(async () => {
      const response = await page.request.get("/api/campaigns", { headers: { "x-demo-user": "demo-user" } });
      if (!response.ok()) return false;
      const directory = await response.json() as { campaigns?: Array<{ campaignId: string }> };
      return directory.campaigns?.some((campaign) => campaign.campaignId === "campaign-k17-relay") ?? false;
    }).toBe(true);
  }

  const stateResponse = await page.request.get("/api/campaigns/campaign-k17-relay/state", {
    headers: { "x-demo-user": "demo-user" },
  });
  const deployedCallsigns = stateResponse.ok()
    ? new Set(((await stateResponse.json()) as { deployments?: Array<{ callsign: string }> }).deployments?.map((unit) => unit.callsign) ?? [])
    : new Set<string>();

  await page.getByRole("navigation", { name: "Primary" }).getByRole("button", { name: "Deployment" }).click();
  await expect(page.getByRole("heading", { name: "Deployment planner", exact: true })).toBeVisible();
  await expect(page.getByText("PLANNER LIVE", { exact: true })).toBeVisible();
  const deployableUnits = page.locator('input[type="checkbox"]:enabled');
  let selectedForDeployment = 0;
  for (let index = 0; index < await deployableUnits.count(); index += 1) {
    const checkbox = deployableUnits.nth(index);
    const label = await checkbox.locator("..").innerText();
    const foundationSupportUnit = ["ANVIL", "LONGBOW", "DOC-7", "RAVEN-2"].some((callsign) => label.includes(callsign));
    if (foundationSupportUnit && ![...deployedCallsigns].some((callsign) => label.includes(callsign))) {
      await checkbox.check();
      selectedForDeployment += 1;
    }
  }
  if (selectedForDeployment > 0) {
    await page.getByRole("button", { name: /VALIDATE PLAN|REVALIDATE PLAN/ }).click();
    await expect(page.getByRole("heading", { name: "Ready for command" })).toBeVisible();
    await page.getByRole("button", { name: "COMMIT DEPLOYMENT" }).click();
    await expect(page.getByText(/deployment snapshots committed/i)).toBeVisible();
  }
  await page.getByRole("navigation", { name: "Primary" }).getByRole("button", { name: "Campaigns" }).click();
  await expect(map).toBeVisible();
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

  await page.getByRole("navigation", { name: "Primary" }).getByRole("button", { name: "Campaigns" }).click();
  await ensurePlayableK17(page);
  const campaign = await page.request.get("/api/campaigns/campaign-k17-relay/state", {
    headers: { "x-demo-user": "demo-user" },
  });
  expect(campaign.status()).toBe(200);
  await expect(campaign.json()).resolves.toMatchObject({ campaignId: "campaign-k17-relay" });
  await expect(page.getByText("CAMPAIGN LIVE", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "K-17: Hold the Relay" })).toBeVisible();
  await expect(page.getByText(/Local tactical projection active/)).toHaveCount(0);
});

test("tactical API rejects client-authored action economy", async ({ page }) => {
  await page.goto("/?view=campaigns");
  await ensurePlayableK17(page);
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

test("tactical composer exposes every currently executable action and no catalogue-only controls", async ({ page }) => {
  await page.goto("/?view=campaigns");
  await ensurePlayableK17(page, true);
  await expect(page.getByText("CAMPAIGN LIVE", { exact: true })).toBeVisible();
  const composer = page.locator(".right-panel");

  await expect(composer.getByRole("button", { name: "LOAD", exact: true })).toBeVisible();
  await expect(composer.getByRole("button", { name: "UNLOAD", exact: true })).toBeVisible();
  await expect(composer.getByRole("button", { name: "SCAN", exact: true })).toHaveCount(0);

  await page.locator(".unit-roster").getByRole("button", { name: /LONGBOW/ }).click();
  await expect(composer.getByRole("button", { name: "ATTACK", exact: true })).toBeVisible();
  await expect(composer.getByRole("button", { name: "RELOAD", exact: true })).toBeVisible();
  await composer.getByRole("button", { name: "RELOAD", exact: true }).click();
  await expect(composer.getByText(/SMALL SUPPLY:/)).toBeVisible();

  await page.locator(".unit-roster").getByRole("button", { name: /DOC-7/ }).click();
  await expect(composer.getByRole("button", { name: "HEAL", exact: true })).toBeVisible();
  await composer.getByRole("button", { name: "HEAL", exact: true }).click();
  await expect(composer.getByLabel("WOUNDED INFANTRY")).toContainText("RAVEN-2");
  await expect(composer.getByText(/MEDICAL SUPPLY:/)).toBeVisible();
  await composer.getByRole("button", { name: /SUBMIT ORDER|UPDATE ORDER/ }).click();
  await expect(page.getByText(/DOC-7 order submitted to campaign command/)).toBeVisible();
  const resolution = await page.evaluate(async () => {
    const headers = { "x-demo-user": "demo-user" };
    const current = await fetch("/api/campaigns/campaign-k17-relay/state", { headers });
    const state = await current.json() as { round: number };
    const resolved = await fetch("/api/campaigns/campaign-k17-relay/resolve", {
      method: "POST",
      headers: { ...headers, "x-expected-round": String(state.round) },
    });
    return { status: resolved.status, body: await resolved.text() };
  });
  expect(resolution, resolution.body).toMatchObject({ status: 200 });

  await expect.poll(async () => {
    const response = await page.request.get("/api/campaigns/campaign-k17-relay/state", {
      headers: { "x-demo-user": "demo-user" },
    });
    if (!response.ok()) return false;
    const state = await response.json() as {
      deployments?: Array<{ callsign: string; supplies?: Record<string, number> }>;
      events?: Array<{ type: string; actor?: string; payload?: Record<string, unknown> }>;
    };
    const medic = state.deployments?.find((deployment) => deployment.callsign === "DOC-7");
    return medic?.supplies?.MEDICAL_SUPPLY === 3 && state.events?.some((event) => event.type === "UNIT_HEALED") === true;
  }).toBe(true);
});

test("public and authenticated shells do not overflow a 390px viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto("/?signedout=1");
  await expect(page.getByRole("heading", { name: "Every unit has a name. Every order has a cost." })).toBeVisible();
  await expectNoDocumentOverflow(page);

  await page.goto("/?view=campaigns");
  await ensurePlayableK17(page);
  await expectNoDocumentOverflow(page);
});
