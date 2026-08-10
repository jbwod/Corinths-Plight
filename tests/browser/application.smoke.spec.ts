import { expect, test, type Page } from "@playwright/test";
import type { CampaignView } from "../../packages/domain/src";
import { calculateRouteCost, canTarget, hexDistance, shortestPath } from "../../packages/rules-engine/src";

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
    const foundationSupportUnit = ["LONGBOW", "MULE-3", "DOC-7", "RAVEN-2", "ANVIL", "NOMAD", "BELLATR"].some((callsign) => label.includes(callsign));
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

async function resolveCurrentK17Round(page: Page): Promise<void> {
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
}

function affordableRoute(
  path: CampaignView["map"][number]["coord"][],
  map: CampaignView["map"],
  speed: number,
  rush: boolean,
) {
  const route = [path[0]!];
  for (const step of path.slice(1)) {
    const candidate = [...route, step];
    if (calculateRouteCost(candidate, map, { rush }).total > speed) break;
    route.push(step);
  }
  return route;
}

async function submitRelayDefenceOrder(page: Page): Promise<void> {
  for (const callsign of ["NOMAD", "BELLATR"]) {
    const response = await page.request.get("/api/campaigns/campaign-k17-relay/state", {
      headers: { "x-demo-user": "demo-user" },
    });
    expect(response.status()).toBe(200);
    const state = await response.json() as CampaignView;
    const defender = state.deployments.find((deployment) => deployment.callsign === callsign);
    const relay = state.objectives.find((objective) => objective.id === "objective-outpost");
    expect(defender).toBeDefined();
    expect(relay).toBeDefined();
    const route = affordableRoute(
      shortestPath(defender!.position, relay!.coord, state.map),
      state.map,
      defender!.stats.speed,
      true,
    );
    expect(route.length).toBeGreaterThan(1);
    const orderRevision = state.orders.find((order) => order.unitId === defender!.id && order.round === state.round)?.revision ?? 0;
    const status = await page.evaluate(async ({ command }) => {
      const result = await fetch("/api/campaigns/campaign-k17-relay/orders", {
        method: "POST",
        headers: { "content-type": "application/json", "x-demo-user": "demo-user" },
        body: JSON.stringify(command),
      });
      return { status: result.status, body: await result.text() };
    }, {
      command: {
        commandId: `browser-defend-relay-${callsign.toLowerCase()}-${state.round}`,
        expectedCampaignVersion: state.version,
        expectedOrderRevision: orderRevision,
        unitId: defender!.id,
        round: state.round,
        orderType: "RUSH",
        lifecycle: "SUBMITTED",
        route,
        facing: defender!.facing,
        actions: [],
        incidentalActions: [],
      },
    });
    expect(status, status.body).toMatchObject({ status: 201 });
  }
}

async function submitRelayDefenceAttack(page: Page): Promise<void> {
  for (const callsign of ["NOMAD", "BELLATR"]) {
    const response = await page.request.get("/api/campaigns/campaign-k17-relay/state", {
      headers: { "x-demo-user": "demo-user" },
    });
    expect(response.status()).toBe(200);
    const state = await response.json() as CampaignView;
    const defender = state.deployments.find((deployment) => deployment.callsign === callsign);
    const relay = state.objectives.find((objective) => objective.id === "objective-outpost");
    expect(defender).toBeDefined();
    expect(relay).toBeDefined();
    if (defender!.status === "DESTROYED") continue;
    const route = affordableRoute(
      shortestPath(defender!.position, relay!.coord, state.map),
      state.map,
      defender!.stats.speed,
      true,
    );
    const moving = route.length > 1;
    const projectedDefender = { ...defender!, position: route.at(-1)! };
    const engagement = state.deployments
      .filter((deployment) => deployment.side === "ENEMY" && deployment.status === "ACTIVE")
      .flatMap((target) => defender!.weapons.map((weapon) => ({ target, weapon, legality: canTarget(projectedDefender, target, weapon, state.map) })))
      .find(({ legality }) => legality.legal);
    if (!moving) expect(engagement, `${callsign} should have a legal contact while defending the relay`).toBeDefined();
    const orderRevision = state.orders.find((order) => order.unitId === defender!.id && order.round === state.round)?.revision ?? 0;
    const status = await page.evaluate(async ({ command }) => {
      const result = await fetch("/api/campaigns/campaign-k17-relay/orders", {
        method: "POST",
        headers: { "content-type": "application/json", "x-demo-user": "demo-user" },
        body: JSON.stringify(command),
      });
      return { status: result.status, body: await result.text() };
    }, {
      command: {
        commandId: `browser-defend-relay-attack-${callsign.toLowerCase()}-${state.round}`,
        expectedCampaignVersion: state.version,
        expectedOrderRevision: orderRevision,
        unitId: defender!.id,
        round: state.round,
        orderType: moving ? "RUSH" : "HOLD",
        lifecycle: "SUBMITTED",
        route,
        facing: defender!.facing,
        actions: moving || !engagement ? [] : [{
          type: "ATTACK",
          targetDeploymentId: engagement.target.id,
          targetHex: engagement.target.position,
          weaponId: engagement.weapon.id,
          equipmentIds: [],
        }],
        incidentalActions: [],
      },
    });
    expect(status, status.body).toMatchObject({ status: 201 });
  }
}

async function submitEngineerAdvance(page: Page): Promise<void> {
  const response = await page.request.get("/api/campaigns/campaign-k17-relay/state", {
    headers: { "x-demo-user": "demo-user" },
  });
  expect(response.status()).toBe(200);
  const state = await response.json() as CampaignView;
  const engineer = state.deployments.find((deployment) => deployment.callsign === "ANVIL");
  const relay = state.objectives.find((objective) => objective.id === "objective-outpost");
  expect(engineer).toBeDefined();
  expect(relay).toBeDefined();
  const route = affordableRoute(
    shortestPath(engineer!.position, relay!.coord, state.map),
    state.map,
    engineer!.stats.speed,
    true,
  );
  const moving = route.length > 1;
  const orderRevision = state.orders.find((order) => order.unitId === engineer!.id && order.round === state.round)?.revision ?? 0;
  const result = await page.evaluate(async ({ command }) => {
    const order = await fetch("/api/campaigns/campaign-k17-relay/orders", {
      method: "POST",
      headers: { "content-type": "application/json", "x-demo-user": "demo-user" },
      body: JSON.stringify(command),
    });
    return { status: order.status, body: await order.text() };
  }, {
    command: {
      commandId: `browser-engineer-advance-${state.round}`,
      expectedCampaignVersion: state.version,
      expectedOrderRevision: orderRevision,
      unitId: engineer!.id,
      round: state.round,
      orderType: moving ? "RUSH" : "HOLD",
      lifecycle: "SUBMITTED",
      route,
      facing: engineer!.facing,
      actions: [],
      incidentalActions: [],
    },
  });
  expect(result, result.body).toMatchObject({ status: 201 });
}

async function submitInfantryRelayAdvance(page: Page): Promise<void> {
  const response = await page.request.get("/api/campaigns/campaign-k17-relay/state", {
    headers: { "x-demo-user": "demo-user" },
  });
  expect(response.status()).toBe(200);
  const state = await response.json() as CampaignView;
  const infantry = state.deployments.find((deployment) => deployment.callsign === "RAVEN-2")!;
  if (infantry.status === "DESTROYED") return;
  const relay = state.objectives.find((objective) => objective.id === "objective-outpost")!;
  const route = affordableRoute(
    shortestPath(infantry.position, relay.coord, state.map),
    state.map,
    infantry.stats.speed,
    true,
  );
  const orderRevision = state.orders.find((order) => order.unitId === infantry.id && order.round === state.round)?.revision ?? 0;
  const result = await page.evaluate(async ({ command }) => {
    const order = await fetch("/api/campaigns/campaign-k17-relay/orders", {
      method: "POST",
      headers: { "content-type": "application/json", "x-demo-user": "demo-user" },
      body: JSON.stringify(command),
    });
    return { status: order.status, body: await order.text() };
  }, {
    command: {
      commandId: `browser-infantry-relay-${state.round}`,
      expectedCampaignVersion: state.version,
      expectedOrderRevision: orderRevision,
      unitId: infantry.id,
      round: state.round,
      orderType: route.length > 1 ? "RUSH" : "HOLD",
      lifecycle: "SUBMITTED",
      route,
      facing: infantry.facing,
      actions: [],
      incidentalActions: [],
    },
  });
  expect(result, result.body).toMatchObject({ status: 201 });
}

async function submitEngineerRazorWire(page: Page): Promise<void> {
  const response = await page.request.get("/api/campaigns/campaign-k17-relay/state", {
    headers: { "x-demo-user": "demo-user" },
  });
  expect(response.status()).toBe(200);
  const state = await response.json() as CampaignView;
  const engineer = state.deployments.find((deployment) => deployment.callsign === "ANVIL")!;
  const orderRevision = state.orders.find((order) => order.unitId === engineer.id && order.round === state.round)?.revision ?? 0;
  const result = await page.evaluate(async ({ command }) => {
    const order = await fetch("/api/campaigns/campaign-k17-relay/orders", {
      method: "POST",
      headers: { "content-type": "application/json", "x-demo-user": "demo-user" },
      body: JSON.stringify(command),
    });
    return { status: order.status, body: await order.text() };
  }, {
    command: {
      commandId: `browser-engineer-razor-wire-${state.round}`,
      expectedCampaignVersion: state.version,
      expectedOrderRevision: orderRevision,
      unitId: engineer.id,
      round: state.round,
      orderType: "HOLD",
      lifecycle: "SUBMITTED",
      route: [engineer.position],
      facing: engineer.facing,
      actions: [{
        type: "CONSTRUCT",
        targetHex: engineer.position,
        structureDefinitionId: "structure-razor-wire",
      }],
      incidentalActions: [],
    },
  });
  expect(result, result.body).toMatchObject({ status: 201 });
}

async function submitEngineerArtilleryDigIn(page: Page): Promise<void> {
  const response = await page.request.get("/api/campaigns/campaign-k17-relay/state", {
    headers: { "x-demo-user": "demo-user" },
  });
  expect(response.status()).toBe(200);
  const state = await response.json() as CampaignView;
  const engineer = state.deployments.find((deployment) => deployment.callsign === "ANVIL")!;
  const artillery = state.deployments.find((deployment) => deployment.callsign === "LONGBOW")!;
  const relay = state.objectives.find((objective) => objective.id === "objective-outpost")!;
  const route = shortestPath(engineer.position, relay.coord, state.map).slice(0, 2);
  expect(route).toHaveLength(2);
  expect(hexDistance(route.at(-1)!, artillery.position)).toBeLessThanOrEqual(1);
  expect(calculateRouteCost(route, state.map, { rush: true, unitTags: engineer.tags }).total + 0.5).toBeLessThanOrEqual(engineer.stats.speed);
  const orderRevision = state.orders.find((order) => order.unitId === engineer.id && order.round === state.round)?.revision ?? 0;
  const result = await page.evaluate(async ({ command }) => {
    const order = await fetch("/api/campaigns/campaign-k17-relay/orders", {
      method: "POST",
      headers: { "content-type": "application/json", "x-demo-user": "demo-user" },
      body: JSON.stringify(command),
    });
    return { status: order.status, body: await order.text() };
  }, {
    command: {
      commandId: `browser-engineer-artillery-dig-in-${state.round}`,
      expectedCampaignVersion: state.version,
      expectedOrderRevision: orderRevision,
      unitId: engineer.id,
      round: state.round,
      orderType: "RUSH",
      lifecycle: "SUBMITTED",
      route,
      facing: engineer.facing,
      actions: [{ type: "ARTILLERY_DIG_IN", targetDeploymentId: artillery.id }],
      incidentalActions: [],
    },
  });
  expect(result, result.body).toMatchObject({ status: 201 });
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

test("strategic UI submits and resolves a Battlegroup disembark order", async ({ page }) => {
  await page.goto("/?view=galactic");
  await expect(page.getByRole("status").filter({ hasText: "Persistent world connected" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "The Corinth Expedition" })).toBeVisible();

  const formation = page.getByLabel("ORDERED FORMATION");
  await formation.selectOption("battlegroup-hammer");
  await page.getByRole("button", { name: "DISEMBARK", exact: true }).click();
  await expect(page.getByText(/Hammer: order submitted for strategic round/i)).toBeVisible();

  const before = await page.request.get("/api/strategic/maps/strategic-map-corinth", {
    headers: { "x-demo-user": "demo-user" },
  });
  expect(before.status()).toBe(200);
  const current = await before.json() as { map: { version: number }; round: { round: number } };
  await page.getByRole("button", { name: `RESOLVE ROUND ${current.round.round}` }).click();
  await expect(page.getByText(new RegExp(`Strategic round ${current.round.round} resolved`))).toBeVisible();

  await expect.poll(async () => {
    const response = await page.request.get("/api/strategic/maps/strategic-map-corinth", {
      headers: { "x-demo-user": "demo-user" },
    });
    const projection = await response.json() as {
      map: { version: number };
      round: { round: number };
      battlegroups: Array<{ id: string; status: string; currentNodeId: string | null }>;
    };
    const hammer = projection.battlegroups.find((group) => group.id === "battlegroup-hammer");
    return projection.map.version === current.map.version + 1
      && projection.round.round === current.round.round + 1
      && hammer?.status === "READY"
      && hammer.currentNodeId === "node-corinth-high-orbit";
  }).toBe(true);
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

  await page.locator(".unit-roster").getByRole("button", { name: /DOC-7/ }).click();
  await expect(composer.getByRole("button", { name: "LOAD", exact: true })).toBeVisible();
  await expect(composer.getByRole("button", { name: "UNLOAD", exact: true })).toBeVisible();
  await expect(composer.getByRole("button", { name: "SCAN", exact: true })).toHaveCount(0);

  await page.locator(".unit-roster").getByRole("button", { name: /NOMAD/ }).click();
  await expect(composer.getByRole("button", { name: "EVASIVE", exact: true })).toBeEnabled();
  await composer.getByRole("button", { name: "EVASIVE", exact: true }).click();
  await expect(composer.getByText(/EVASIVE: end at least/)).toBeVisible();

  await page.locator(".unit-roster").getByRole("button", { name: /LONGBOW/ }).click();
  await expect(composer.getByRole("button", { name: "ATTACK", exact: true })).toBeVisible();
  await expect(composer.getByRole("button", { name: "RELOAD", exact: true })).toBeVisible();
  await composer.getByRole("button", { name: "RELOAD", exact: true }).click();
  await expect(composer.getByText(/SMALL SUPPLY:/)).toBeVisible();
  await expect(composer.getByRole("button", { name: "DEPLOY", exact: true })).toBeVisible();
  await expect(composer.getByRole("button", { name: "PACK_UP", exact: true })).toHaveCount(0);
  await composer.getByRole("button", { name: "DEPLOY", exact: true }).click();
  await expect(composer.getByText(/CURRENT STATE: PACKED/)).toBeVisible();
  await composer.getByRole("button", { name: /SUBMIT ORDER|UPDATE ORDER/ }).click();
  await expect(page.getByText(/LONGBOW order submitted to campaign command/)).toBeVisible();

  await page.locator(".unit-roster").getByRole("button", { name: /DOC-7/ }).click();
  await expect(composer.getByRole("button", { name: "HEAL", exact: true })).toBeVisible();
  await composer.getByRole("button", { name: "HEAL", exact: true }).click();
  await expect(composer.getByLabel("WOUNDED INFANTRY")).toContainText("RAVEN-2");
  await expect(composer.getByText(/MEDICAL SUPPLY:/)).toBeVisible();
  await composer.getByRole("button", { name: /SUBMIT ORDER|UPDATE ORDER/ }).click();
  await expect(page.getByText(/DOC-7 order submitted to campaign command/)).toBeVisible();
  await submitRelayDefenceOrder(page);
  await submitEngineerRazorWire(page);
  await resolveCurrentK17Round(page);

  await expect.poll(async () => {
    const response = await page.request.get("/api/campaigns/campaign-k17-relay/state", {
      headers: { "x-demo-user": "demo-user" },
    });
    if (!response.ok()) return false;
    const state = await response.json() as {
      deployments?: Array<{ callsign: string; supplies?: Record<string, number>; statuses?: string[] }>;
      events?: Array<{ type: string; actor?: string; payload?: Record<string, unknown> }>;
      map?: Array<{ structureIds: string[] }>;
    };
    const medic = state.deployments?.find((deployment) => deployment.callsign === "DOC-7");
    const artillery = state.deployments?.find((deployment) => deployment.callsign === "LONGBOW");
    const razorWireBuilt = state.map?.some((hex) =>
      hex.structureIds.some((id) => id.startsWith("structure-razor-wire:"))
    );
    return medic?.supplies?.MEDICAL_SUPPLY === 3 &&
      artillery?.statuses?.includes("DEPLOYED") === true &&
      razorWireBuilt === true &&
      state.events?.some((event) => event.type === "UNIT_HEALED") === true &&
      state.events.some((event) => event.type === "ARTILLERY_DEPLOYED") === true &&
      state.events.some((event) => event.type === "STRUCTURE_COMPLETED" && event.payload.structureDefinitionId === "structure-razor-wire") === true;
  }).toBe(true);

  await page.reload();
  await expect(page.getByText("CAMPAIGN LIVE", { exact: true })).toBeVisible();
  await page.locator(".unit-roster").getByRole("button", { name: /DOC-7/ }).click();
  await composer.getByRole("button", { name: "RELOAD", exact: true }).click();
  await expect(composer.getByText("MEDICAL SUPPLY: 3/4", { exact: false })).toBeVisible();
  await expect(composer.getByText(/SMALL SUPPLY: 1/)).toBeVisible();
  await composer.getByRole("button", { name: /SUBMIT ORDER|UPDATE ORDER/ }).click();
  await expect(page.getByText(/DOC-7 order submitted to campaign command/)).toBeVisible();
  await page.locator(".unit-roster").getByRole("button", { name: /LONGBOW/ }).click();
  await expect(composer.getByRole("button", { name: "BOMBARDMENT", exact: true })).toBeVisible();
  await composer.getByRole("button", { name: "BOMBARDMENT", exact: true }).click();
  await expect(composer.getByLabel("BOMBARDMENT TARGET HEX")).toBeVisible();
  await expect(composer.getByText(/Bombardment consumes 1/)).toBeVisible();
  await composer.getByRole("button", { name: /SUBMIT ORDER|UPDATE ORDER/ }).click();
  await expect(page.getByText(/LONGBOW order submitted to campaign command/)).toBeVisible();
  await submitRelayDefenceAttack(page);
  await page.locator(".unit-roster").getByRole("button", { name: /ANVIL/ }).click();
  await expect(composer.getByRole("button", { name: "DIG IN ARTILLERY", exact: true })).toBeVisible();
  await composer.getByRole("button", { name: "DIG IN ARTILLERY", exact: true }).click();
  await expect(composer.getByLabel("DEPLOYED ARTILLERY")).toContainText("LONGBOW");
  await expect(composer.getByText(/no Supply cost/)).toBeVisible();
  await submitEngineerArtilleryDigIn(page);
  await submitInfantryRelayAdvance(page);
  await resolveCurrentK17Round(page);

  await expect.poll(async () => {
    const response = await page.request.get("/api/campaigns/campaign-k17-relay/state", {
      headers: { "x-demo-user": "demo-user" },
    });
    if (!response.ok()) return false;
    const state = await response.json() as {
      deployments?: Array<{ callsign: string; supplies?: Record<string, number>; statuses?: string[] }>;
      events?: Array<{ type: string; payload?: Record<string, unknown> }>;
    };
    const medic = state.deployments?.find((deployment) => deployment.callsign === "DOC-7");
    const artillery = state.deployments?.find((deployment) => deployment.callsign === "LONGBOW");
    return medic?.supplies?.MEDICAL_SUPPLY === 4 && medic.supplies.SMALL_SUPPLY === 0 &&
      artillery?.supplies?.SMALL_SUPPLY === 1 &&
      artillery.statuses?.includes("DUG_IN") === true &&
      state.events?.some((event) => event.type === "MEDICAL_SUPPLY_RELOADED") === true &&
      state.events.some((event) => event.type === "ARTILLERY_BOMBARDED") === true &&
      state.events.some((event) => event.type === "UNIT_DUG_IN" && event.payload?.method === "ENGINEER_ARTILLERY_POSITION") === true;
  }).toBe(true);

  const roundThree = await page.request.get("/api/campaigns/campaign-k17-relay/state", {
    headers: { "x-demo-user": "demo-user" },
  });
  expect(roundThree.status()).toBe(200);
  const roundThreeState = await roundThree.json() as CampaignView;
  const roundThreeDiagnostic = {
    round: roundThreeState.round,
    phase: roundThreeState.phase,
    outcome: roundThreeState.outcome,
    nomad: roundThreeState.deployments.find((deployment) => deployment.callsign === "NOMAD"),
    recentEvents: roundThreeState.events.filter((event) => event.round === 2),
  };
  expect(roundThreeState.round, JSON.stringify(roundThreeDiagnostic)).toBe(3);
  expect(roundThreeState.phase).toBe("PLANNING");

  await page.locator(".unit-roster").getByRole("button", { name: /MULE-3/ }).click();
  await expect(composer.getByRole("button", { name: "RESUPPLY", exact: true })).toBeVisible();
  await composer.getByRole("button", { name: "RESUPPLY", exact: true }).click();
  await expect(composer.getByLabel("ARTILLERY STOCKPILE")).toContainText("LONGBOW");
  await expect(composer.getByText(/LOGI STOCK: 5\/10 SMALL SUPPLY/)).toBeVisible();
  await composer.getByRole("button", { name: /SUBMIT ORDER|UPDATE ORDER/ }).click();
  await expect(page.getByText(/MULE-3 order submitted to campaign command/)).toBeVisible();

  await submitRelayDefenceAttack(page);
  await submitEngineerAdvance(page);
  await submitInfantryRelayAdvance(page);
  await resolveCurrentK17Round(page);

  await page.reload();
  await expect(page.getByText("CAMPAIGN LIVE", { exact: true })).toBeVisible();
  await page.locator(".unit-roster").getByRole("button", { name: /ANVIL/ }).click();
  await expect(composer.getByRole("button", { name: "CONSTRUCT", exact: true })).toBeVisible();
  await composer.getByRole("button", { name: "CONSTRUCT", exact: true }).click();
  await expect(composer.getByLabel("FIELDWORK")).toContainText("Sandbag Line");
  await expect(composer.getByLabel("FIELDWORK")).toContainText("Razor Wire");
  await expect(composer.getByLabel("FIELDWORK")).toContainText("Tank Traps");
  await expect(composer.getByRole("button", { name: "REPAIR", exact: true })).toBeVisible();
  await composer.getByRole("button", { name: "REPAIR", exact: true }).click();
  const repairOptions = composer.getByLabel("DAMAGED VEHICLE").locator("option");
  const repairSubmitted = await repairOptions.count() > 0;
  if (repairSubmitted) {
    await composer.getByLabel("DAMAGED VEHICLE").selectOption({ index: 0 });
    const restoreHit = composer.getByRole("button", { name: "RESTORE 1 HIT" });
    if (await restoreHit.isEnabled()) await restoreHit.click();
    await expect(composer.getByText(/SMALL SUPPLY: 4/)).toBeVisible();
    await composer.getByRole("button", { name: /SUBMIT ORDER|UPDATE ORDER/ }).click();
    await expect(page.getByText(/ANVIL order submitted to campaign command/)).toBeVisible();
  } else {
    await submitEngineerAdvance(page);
  }
  await submitRelayDefenceAttack(page);
  await submitInfantryRelayAdvance(page);
  await resolveCurrentK17Round(page);

  await expect.poll(async () => {
    const response = await page.request.get("/api/campaigns/campaign-k17-relay/state", {
      headers: { "x-demo-user": "demo-user" },
    });
    if (!response.ok()) return undefined;
    const state = await response.json() as CampaignView;
    return {
      phase: state.phase,
      result: state.outcome?.result,
      reason: state.outcome?.reason,
      round: state.outcome?.round,
    };
  }).toEqual({
    phase: "COMPLETE",
    result: "VICTORY",
    reason: "FINAL_ROUND_PRIMARY_HELD",
    round: 4,
  });

  const repairedStateResponse = await page.request.get("/api/campaigns/campaign-k17-relay/state", {
    headers: { "x-demo-user": "demo-user" },
  });
  expect(repairedStateResponse.status()).toBe(200);
  const repairedState = await repairedStateResponse.json() as CampaignView;
  expect(repairedState.events).toContainEqual(expect.objectContaining({
    type: "SUPPLY_TRANSFERRED",
    actor: expect.stringContaining("force-mule-3"),
    payload: expect.objectContaining({ resourceType: "SMALL_SUPPLY", quantity: 1 }),
  }));
  expect(repairedState.deployments.find((deployment) => deployment.callsign === "MULE-3")?.supplies?.SMALL_SUPPLY).toBe(4);
  expect(repairedState.deployments.find((deployment) => deployment.callsign === "LONGBOW")?.supplies?.SMALL_SUPPLY).toBe(2);
  if (repairSubmitted) {
    expect(repairedState.events).toContainEqual(expect.objectContaining({ type: "UNIT_REPAIRED", actor: expect.stringContaining("force-anvil") }));
    expect(repairedState.deployments.find((deployment) => deployment.callsign === "ANVIL")?.supplies?.SMALL_SUPPLY).toBe(3);
  } else {
    expect(repairedState.deployments.find((deployment) => deployment.callsign === "ANVIL")?.supplies?.SMALL_SUPPLY).toBe(3);
  }

  await expect.poll(async () => {
    const response = await page.request.get("/api/campaigns", {
      headers: { "x-demo-user": "demo-user" },
    });
    if (!response.ok()) return undefined;
    const directory = await response.json() as {
      campaigns?: Array<{
        campaignId: string;
        status: string;
        outcome?: CampaignView["outcome"];
      }>;
    };
    const completed = directory.campaigns?.find((entry) => entry.campaignId === "campaign-k17-relay");
    return completed && {
      status: completed.status,
      result: completed.outcome?.result,
      rewardStatus: completed.outcome?.rewards.requisition.status,
      rewardAmount: completed.outcome?.rewards.requisition.amount,
    };
  }).toEqual({
    status: "COMPLETE",
    result: "VICTORY",
    rewardStatus: "BALANCE_REQUIRED",
    rewardAmount: null,
  });

  await page.reload();
  await expect(page.getByText("MISSION ACCOMPLISHED", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "OPEN AFTER-ACTION REPORT" }).click();
  await expect(page.getByRole("heading", { name: "Campaign Reports" })).toBeVisible();
  await expect(page.getByText("MISSION ACCOMPLISHED", { exact: true })).toBeVisible();
  const rewards = page.getByRole("region", { name: "Campaign rewards" });
  await expect(rewards.getByText("RECORDED", { exact: true })).toBeVisible();
  await expect(rewards.getByText("BALANCE REQUIRED", { exact: true })).toBeVisible();
  await expect(rewards).toContainText("RC-V5-016");
});

test("tactical roster scope and map layers provide live planning views", async ({ page }) => {
  await page.goto("/?view=campaigns");
  await ensurePlayableK17(page);
  await expect(page.getByText("CAMPAIGN LIVE", { exact: true })).toBeVisible();

  const rosterScope = page.getByLabel("Deployed force roster scope");
  await rosterScope.getByRole("button", { name: "ALLIED", exact: true }).click();
  await expect(rosterScope.getByRole("button", { name: "ALLIED", exact: true })).toHaveClass(/active/);
  await rosterScope.getByRole("button", { name: "MY UNITS", exact: true }).click();
  await expect(rosterScope.getByRole("button", { name: "MY UNITS", exact: true })).toHaveClass(/active/);

  const layers = page.getByLabel("Tactical map layer");
  await layers.getByRole("button", { name: "INTEL", exact: true }).click();
  await expect(page.locator(".map-legend")).toContainText("S# SENSOR");
  await layers.getByRole("button", { name: "SUPPLY", exact: true }).click();
  await expect(page.locator(".map-legend")).toContainText("M# MEDICAL");
  await layers.getByRole("button", { name: "SURFACE", exact: true }).click();
  await expect(page.locator(".map-legend")).toContainText("HOSTILE");
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
