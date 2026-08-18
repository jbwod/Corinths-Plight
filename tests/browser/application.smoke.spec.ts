import { expect, test, type Page } from "@playwright/test";
import type { CampaignView } from "../../packages/domain/src";
import {
  calculateRouteCost,
  canTarget,
  hexDistance,
  IRON_RAIN_SCENARIO_VERSION,
  shortestPath,
} from "../../packages/rules-engine/src";

async function expectNoDocumentOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth, `document width ${dimensions.scrollWidth}px exceeded viewport width ${dimensions.clientWidth}px`).toBeLessThanOrEqual(
    dimensions.clientWidth + 1,
  );
}

async function ensureHammerReadyForDeployment(page: Page): Promise<void> {
  const current = await page.request.get("/api/strategic/maps/strategic-map-corinth", {
    headers: { "x-demo-user": "demo-user" },
  });
  if (!current.ok()) return;
  const projection = await current.json() as {
    map: { id: string; version: number };
    round: { round: number };
    battlegroups: Array<{ id: string; status: string; revision?: number; version?: number; currentCarrierTaskForceId?: string | null }>;
  };
  const hammer = projection.battlegroups.find((group) => group.id === "battlegroup-hammer");
  if (!hammer || hammer.status !== "EMBARKED" || !hammer.currentCarrierTaskForceId) return;
  const result = await page.evaluate(async ({ mapId, mapVersion, formationVersion, carrierTaskForceId }) => {
    const headers = { "content-type": "application/json", "x-demo-user": "demo-user" };
    const order = await fetch("/api/strategic/orders", {
      method: "POST",
      headers,
      body: JSON.stringify({
        commandId: crypto.randomUUID(),
        mapId,
        expectedMapVersion: mapVersion,
        expectedFormationVersion: formationVersion,
        formation: { kind: "BATTLEGROUP", id: "battlegroup-hammer" },
        intent: { type: "DISEMBARK_BATTLEGROUP", battlegroupId: "battlegroup-hammer", carrierTaskForceId },
      }),
    });
    if (!order.ok) return { status: order.status, body: await order.text() };
    const latest = await fetch(`/api/strategic/maps/${mapId}`, { headers: { "x-demo-user": "demo-user" } });
    const state = await latest.json() as { map: { version: number }; round: { round: number } };
    const resolved = await fetch(`/api/strategic/maps/${mapId}/resolve`, {
      method: "POST",
      headers,
      body: JSON.stringify({ commandId: crypto.randomUUID(), expectedMapVersion: state.map.version, expectedRound: state.round.round }),
    });
    return { status: resolved.status, body: await resolved.text() };
  }, {
    mapId: projection.map.id,
    mapVersion: projection.map.version,
    formationVersion: hammer.revision ?? hammer.version ?? 1,
    carrierTaskForceId: hammer.currentCarrierTaskForceId,
  });
  expect(result, result.body).toMatchObject({ status: 200 });
  await expect.poll(async () => {
    const response = await page.request.get("/api/strategic/maps/strategic-map-corinth", {
      headers: { "x-demo-user": "demo-user" },
    });
    if (!response.ok()) return false;
    const state = await response.json() as { battlegroups: Array<{ id: string; status: string }> };
    return state.battlegroups.find((group) => group.id === "battlegroup-hammer")?.status === "READY";
  }).toBe(true);
}

async function ensurePlayableK17(page: Page, deployFoundation = false): Promise<void> {
  const join = page.getByRole("button", { name: /JOIN K-17: HOLD THE RELAY/i });
  const map = page.getByRole("region", { name: "Tactical operations map" });
  const noPlayableCampaign = page.getByRole("heading", { name: "No playable campaign assigned" });
  const campaignDirectory = page.getByRole("heading", { name: "Choose your next operation" });
  await expect(map.or(noPlayableCampaign).or(campaignDirectory)).toBeVisible();
  if (await campaignDirectory.isVisible()) {
    const k17Card = page.locator(".campaign-directory-card").filter({ hasText: "K-17: HOLD THE RELAY" });
    const openCampaign = k17Card.getByRole("button", { name: "OPEN CAMPAIGN" });
    if (await openCampaign.isVisible()) {
      await openCampaign.click();
      await expect(map).toBeVisible();
    } else {
      const planDeployment = k17Card.getByRole("button", { name: "PLAN DEPLOYMENT" });
      const joinCampaign = k17Card.getByRole("button", { name: "JOIN CAMPAIGN" });
      if (await planDeployment.isVisible()) {
        await planDeployment.click();
        await expect(page.getByRole("heading", { name: "Deployment planner", exact: true })).toBeVisible();
      } else if (await joinCampaign.isVisible()) {
        await joinCampaign.click();
        await expect(page.getByRole("heading", { name: "Deployment planner", exact: true })).toBeVisible();
      }
    }
  }
  const campaignSelector = page.getByLabel("Active campaign");
  if (await campaignSelector.count() && await campaignSelector.locator('option[value="campaign-k17-relay"]').count()) {
    if (await campaignSelector.isVisible()) {
      await campaignSelector.selectOption("campaign-k17-relay");
    } else {
      const url = new URL(page.url());
      url.searchParams.set("campaign", "campaign-k17-relay");
      await page.goto(url.toString());
    }
    await expect(map).toBeVisible();
    await expect(map).toContainText("K-17: HOLD THE RELAY");
  }
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

  const membershipResponse = await page.request.get("/api/campaigns", {
    headers: { "x-demo-user": "demo-user" },
  });
  expect(membershipResponse.status()).toBe(200);
  const membershipDirectory = await membershipResponse.json() as {
    campaigns?: Array<{ campaignId: string }>;
  };
  if (!membershipDirectory.campaigns?.some((entry) => entry.campaignId === "campaign-k17-relay")) {
    const joined = await page.request.post("/api/campaigns/campaign-k17-relay/join", {
      headers: {
        "content-type": "application/json",
        "x-demo-user": "demo-user",
        origin: "http://127.0.0.1:4173",
      },
      data: { commandId: `browser-ensure-k17-${crypto.randomUUID()}` },
    });
    expect([200, 201]).toContain(joined.status());
  }

  const stateResponse = await page.request.get("/api/campaigns/campaign-k17-relay/state", {
    headers: { "x-demo-user": "demo-user" },
  });
  const deployedCallsigns = stateResponse.ok()
    ? new Set(((await stateResponse.json()) as { deployments?: Array<{ callsign: string }> }).deployments?.map((unit) => unit.callsign) ?? [])
    : new Set<string>();

  await ensureHammerReadyForDeployment(page);
  await page.goto("/?view=deployment&campaign=campaign-k17-relay");
  await expect(page.getByRole("heading", { name: "Deployment planner", exact: true })).toBeVisible();
  await expect(page.getByText("PLANNER LIVE", { exact: true })).toBeVisible();
  const deployableUnits = page.locator('input[type="checkbox"]:enabled');
  let selectedForDeployment = 0;
  for (let index = 0; index < await deployableUnits.count(); index += 1) {
    const checkbox = deployableUnits.nth(index);
    const label = await checkbox.locator("..").innerText();
    const foundationSupportUnit = ["LONGBOW", "MULE-3", "DOC-7", "POLAR-1", "ANVIL", "NOMAD", "CARR-6", "BELLATR"].some((callsign) => label.includes(callsign));
    if (foundationSupportUnit && ![...deployedCallsigns].some((callsign) => label.includes(callsign))) {
      await checkbox.check();
      selectedForDeployment += 1;
    }
  }
  if (selectedForDeployment > 0) {
    await page.getByRole("button", { name: /VALIDATE PLAN|REVALIDATE PLAN/ }).click();
    await expect(page.getByRole("heading", { name: "Ready for command" })).toBeVisible();
    await page.getByRole("button", { name: "COMMIT DEPLOYMENT" }).click();
    await expect(page.getByText(/deployment snapshots committed/i).or(map)).toBeVisible();
  }
  await page.getByRole("navigation", { name: "Primary" }).getByRole("button", { name: "Campaigns" }).click();
  await expect(map).toBeVisible();
}

async function resolveCampaignRoundAsGameMaster(page: Page, campaignId: string): Promise<void> {
  const resolution = await page.evaluate(async (selectedCampaignId) => {
    const headers = { "x-demo-user": "demo-user" };
    const current = await fetch(`/api/campaigns/${selectedCampaignId}/state`, { headers });
    const state = await current.json() as { round: number; version: number };
    const resolved = await fetch(`/api/game-master/campaigns/${selectedCampaignId}/resolve`, {
      method: "POST",
      headers: {
        ...headers,
        "x-demo-role": "ADMIN",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        commandId: `browser-gm-resolve-${crypto.randomUUID()}`,
        expectedCampaignVersion: state.version,
        expectedRound: state.round,
      }),
    });
    return { status: resolved.status, body: await resolved.text() };
  }, campaignId);
  expect(resolution, resolution.body).toMatchObject({ status: 200 });
}

async function resolveCurrentK17Round(page: Page): Promise<void> {
  await resolveCampaignRoundAsGameMaster(page, "campaign-k17-relay");
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
    const existingOrder = state.orders.find((order) => order.unitId === defender!.id && order.round === state.round);
    if (existingOrder?.lifecycle === "SUBMITTED") continue;
    const evasive = callsign === "NOMAD";
    const route = affordableRoute(
      shortestPath(defender!.position, relay!.coord, state.map),
      state.map,
      defender!.stats.speed,
      !evasive,
    );
    expect(route.length).toBeGreaterThan(1);
    const orderRevision = existingOrder?.revision ?? 0;
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
        orderType: evasive ? "EVASIVE" : "RUSH",
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
  const infantry = state.deployments.find((deployment) => deployment.callsign === "POLAR-1")!;
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
  await expect(page.getByRole("heading", { name: "Corinth is not lost. Not yet." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Corinth's Plight home" })).toBeVisible();

  await page.getByRole("button", { name: "SIGN IN", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Return to command" })).toBeVisible();
  await expect(page.getByLabel("EMAIL")).toBeEnabled();
  await expect(page.getByRole("button", { name: "EMAIL SECURE LINK" })).toBeEnabled();

  await page.getByRole("button", { name: "NEW COMMANDER? ENLIST" }).click();
  await expect(page.getByRole("heading", { name: "Join the expedition", exact: true })).toBeVisible();
  await expect(page.getByLabel("DISPLAY NAME")).toBeVisible();
  await expect(page.getByLabel("USERNAME")).toBeVisible();
});

test("quartermaster previews combat effects and fails closed for unresolved equipment slots", async ({ page }) => {
  await page.goto("/?view=forces");
  await expect(page.getByText("REGISTRY LIVE", { exact: true })).toBeVisible();
  await page.locator(".grouped-roster").getByRole("button", { name: /POLAR-1/ }).click();
  await page.getByRole("button", { name: "MANAGE LOADOUT" }).click();

  const openingLoadoutResponse = await page.request.get("/api/forces/force-polar-1/loadout", {
    headers: { "x-demo-user": "demo-user" },
  });
  expect(openingLoadoutResponse.status()).toBe(200);
  const openingLoadout = await openingLoadoutResponse.json() as {
    ownedEquipment: Array<{
      inventoryId: string;
      definitionId: string;
      assignedUnitId: string | null;
      executable: boolean;
    }>;
  };
  const availableAntiArmour = openingLoadout.ownedEquipment.find((equipment) =>
    equipment.definitionId === "equipment-light-at" &&
    equipment.executable &&
    (!equipment.assignedUnitId || equipment.assignedUnitId === "force-polar-1"));
  expect(availableAntiArmour, "the development quartermaster should own one usable light anti-armour weapon").toBeDefined();

  const dialog = page.getByRole("dialog", { name: /POLAR-1 loadout/i });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("COMBAT EFFECT PREVIEW", { exact: true })).toBeVisible();
  await dialog.getByText(/AVAILABLE ACTIONS/).scrollIntoViewIfNeeded();
  await expect(dialog.getByText(/AVAILABLE ACTIONS/)).toBeVisible();
  const availableActions = dialog.locator(".loadout-preview-list").filter({ hasText: "AVAILABLE ACTIONS" });
  await expect(availableActions.locator("p")).toContainText(/(^| · )ATTACK( · |$)/);

  const openingBalance = Number(await dialog.locator(".loadout-state span").filter({ hasText: "REQ" }).locator("b").innerText());
  await dialog.locator('button[aria-label^="+ Lightweight Anti-armour Weapon PRIMARY"]:not(:disabled)').click();
  await expect(dialog.getByRole("alert")).toContainText("Lightweight Anti-armour Weapon has no compatible unit slot.");
  await expect(dialog.getByText("VALID", { exact: true })).toBeVisible();

  const response = await page.request.get("/api/forces/force-polar-1/loadout", {
    headers: { "x-demo-user": "demo-user" },
  });
  expect(response.status()).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
    loadout: { items: expect.not.arrayContaining([expect.objectContaining({ inventoryId: availableAntiArmour!.inventoryId })]) },
    requisitionBalance: openingBalance,
    validation: { valid: true },
  });
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

test("Game Master publishes a governed map and creates an exact-pinned recruiting campaign", async ({ page }) => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const mapName = `Browser Icefront ${suffix}`;
  const campaignName = `Browser Northwatch ${suffix}`;

  await page.goto("/?view=command");
  await page.getByRole("navigation", { name: "Primary" }).getByRole("button", { name: "Game Master" }).click();
  await expect(page.getByRole("heading", { name: "Game Master", exact: true })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: /Loading live campaigns/ })).toHaveCount(0);
  const liveRegion = page.locator(".gm-live-region");

  const generator = page.getByRole("group", { name: "Generator" });
  await generator.getByRole("combobox").selectOption("ICY");
  await generator.getByRole("textbox").fill(`browser-icefront-${suffix}`);
  await generator.getByRole("spinbutton").nth(0).fill("18");
  await generator.getByRole("spinbutton").nth(1).fill("14");
  await generator.getByRole("button", { name: "GENERATE PREVIEW" }).click();
  await expect(liveRegion).toContainText(/Generated \d+ deterministic hexes/);
  await expect(page.getByText(/No published profile/)).toHaveCount(0);
  await expect(page.getByLabel(/mechanical profile/).first()).toContainText("Locked · terrain-");

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "EXPORT JSON" }).click();
  expect((await download).suggestedFilename()).toMatch(/\.json$/);

  const draftIdentity = page.getByRole("group", { name: "Draft identity" });
  await draftIdentity.getByRole("textbox").fill(mapName);
  await draftIdentity.getByRole("combobox").selectOption({ index: 1 });
  await page.getByRole("button", { name: "SAVE DRAFT" }).click();
  await expect(liveRegion).toContainText("Map draft saved.");
  await expect(page.getByRole("button", { name: "REVIEW PUBLISH" })).toBeEnabled();
  await page.getByRole("button", { name: "REVIEW PUBLISH" }).click();
  await expect(page.getByRole("alertdialog", { name: new RegExp(`Publish ${mapName}`) })).toBeVisible();
  await page.getByRole("button", { name: "CONFIRM PUBLISH MAP" }).click();
  await expect(liveRegion).toContainText("Map published for authoring selection.");

  const campaignForm = page.locator(".gm-create-campaign form");
  await campaignForm.getByRole("textbox").fill(campaignName);
  await campaignForm.getByRole("combobox").nth(0).selectOption({ index: 1 });
  const publishedMapSelect = campaignForm.getByRole("combobox").nth(1);
  const publishedMapOption = publishedMapSelect.locator("option").filter({ hasText: mapName });
  await expect(publishedMapOption).toHaveCount(1);
  const publishedMapId = await publishedMapOption.getAttribute("value");
  expect(publishedMapId).toBeTruthy();
  await publishedMapSelect.selectOption(publishedMapId!);
  const durationPreset = campaignForm.getByRole("combobox").nth(2);
  if (await durationPreset.count()) await durationPreset.selectOption({ index: 1 });
  else await campaignForm.getByRole("spinbutton").fill("1");
  await page.getByRole("button", { name: "CREATE AND PLACE CAMPAIGN" }).click();

  const created = page.getByRole("region", { name: "Created campaign result" });
  await expect(created).toContainText(campaignName);
  await expect(created).toContainText("READY TO DEPLOY");
  await expect(created).toContainText("READY_FOR_DEPLOYMENT");

  const directory = await page.request.get("/api/campaigns", { headers: { "x-demo-user": "demo-user" } });
  expect(directory.status()).toBe(200);
  const body = await directory.json() as {
    campaigns?: Array<{ name: string; role: string; scenarioAvailable: boolean; canEnter: boolean }>;
  };
  expect(body.campaigns).toContainEqual(expect.objectContaining({
    name: campaignName,
    role: "GM",
    scenarioAvailable: true,
    canEnter: false,
  }));
});

test("commander switches persistent Battalion context without rejoining", async ({ page }) => {
  type BattalionStatus = {
    activeBattalion: { battalionId: string; name: string } | null;
    activeBattalionRevision: number | null;
    battalionAssignments: Array<{ battalionId: string; name: string; current: boolean }>;
    publicBattalions: Array<{ battalionId: string; name: string }>;
  };
  const headers = { "x-demo-user": "demo-user", origin: "http://127.0.0.1:4173" };
  const readStatus = async () => {
    const response = await page.request.get("/api/onboarding", { headers });
    expect(response.status()).toBe(200);
    return response.json() as Promise<BattalionStatus>;
  };
  const currentAssignment = (value: BattalionStatus) => value.battalionAssignments.find((assignment) => assignment.current);
  const switchBattalion = async (battalionId: string, expectedSelectionRevision: number | null, commandId = `browser-switch-${crypto.randomUUID()}`) => {
    const response = await page.request.post("/api/onboarding/battalions/current", {
      headers,
      data: { commandId, battalionId, expectedSelectionRevision },
    });
    return { response, commandId };
  };

  let status = await readStatus();
  const original = currentAssignment(status);
  expect(original).toBeDefined();
  let target = status.battalionAssignments.find((assignment) => !assignment.current);

  if (!target) {
    const candidate = status.publicBattalions.find((battalion) => battalion.battalionId !== original!.battalionId);
    expect(candidate).toBeDefined();
    const unassigned = await switchBattalion(candidate!.battalionId, status.activeBattalionRevision);
    expect(unassigned.response.status()).toBe(404);
    const joined = await page.request.post("/api/onboarding/battalions/join", {
      headers,
      data: { commandId: `browser-join-${crypto.randomUUID()}`, battalionId: candidate!.battalionId },
    });
    expect(joined.status()).toBe(200);
    status = await readStatus();
    expect(currentAssignment(status)?.battalionId).toBe(candidate!.battalionId);
    const restore = await switchBattalion(original!.battalionId, status.activeBattalionRevision);
    expect(restore.response.status()).toBe(200);
    status = await readStatus();
    target = status.battalionAssignments.find((assignment) => assignment.battalionId === candidate!.battalionId);
  }

  expect(target).toBeDefined();
  expect(currentAssignment(status)?.battalionId).toBe(original!.battalionId);
  await page.goto("/?view=battalion");
  await expect(page.getByRole("status").filter({ hasText: "Persistent world connected" })).toBeVisible();
  await page.getByRole("tab", { name: "RECRUITMENT" }).click();
  const currentCard = page.locator(".recruitment-membership-list article.current");
  await expect(currentCard).toContainText(original!.name);
  const targetCard = page.locator(".recruitment-membership-list article").filter({ hasText: target!.name });
  await expect(targetCard.getByRole("button", { name: "SWITCH" })).toBeVisible();

  const switchedResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/onboarding/battalions/current") && response.request().method() === "POST");
  await targetCard.getByRole("button", { name: "SWITCH" }).click();
  expect((await switchedResponse).status()).toBe(200);
  await expect.poll(async () => currentAssignment(await readStatus())?.battalionId).toBe(target!.battalionId);

  status = await readStatus();
  const restoreCommandId = `browser-restore-${crypto.randomUUID()}`;
  const restored = await switchBattalion(original!.battalionId, status.activeBattalionRevision, restoreCommandId);
  expect(restored.response.status()).toBe(200);
  const replayed = await switchBattalion(original!.battalionId, status.activeBattalionRevision, restoreCommandId);
  expect(replayed.response.status()).toBe(200);
  await expect(replayed.response.json()).resolves.toEqual(await restored.response.json());
  const reused = await switchBattalion(target!.battalionId, status.activeBattalionRevision, restoreCommandId);
  expect(reused.response.status()).toBe(409);
  await expect.poll(async () => currentAssignment(await readStatus())?.battalionId).toBe(original!.battalionId);

  await page.goto("/?view=battalion");
  await page.getByRole("tab", { name: "RECRUITMENT" }).click();
  const departingCard = page.locator(".recruitment-membership-list article").filter({ hasText: target!.name });
  await departingCard.getByRole("button", { name: "LEAVE", exact: true }).click();
  const departureRequest = page.waitForRequest((request) =>
    request.url().endsWith("/api/onboarding/battalions/leave") && request.method() === "POST");
  await departingCard.getByRole("button", { name: "CONFIRM LEAVE" }).click();
  const committedDeparture = await departureRequest;
  const departureCommand = committedDeparture.postDataJSON() as {
    commandId: string;
    battalionId: string;
    expectedMembershipRevision: number;
    expectedSelectionRevision: number | null;
  };
  await expect.poll(async () => (await readStatus()).battalionAssignments.some((assignment) => assignment.battalionId === target!.battalionId)).toBe(false);
  const departureReplay = await page.request.post("/api/onboarding/battalions/leave", { headers, data: departureCommand });
  expect(departureReplay.status()).toBe(200);
  await expect(departureReplay.json()).resolves.toMatchObject({ left: true, battalionId: target!.battalionId, activeBattalionId: original!.battalionId });
  const departureCollision = await page.request.post("/api/onboarding/battalions/leave", {
    headers,
    data: { ...departureCommand, expectedMembershipRevision: departureCommand.expectedMembershipRevision + 1 },
  });
  expect(departureCollision.status()).toBe(409);
  await expect(departureCollision.json()).resolves.toMatchObject({ error: { code: "COMMAND_ID_REUSED" } });
});

test("Battalion command creates a permission rank and assigns it to a member", async ({ page }) => {
  type BattalionProjection = {
    ranks: Array<{ id: string; name: string; version: number; permissions: string[] }>;
    permissions: string[];
    permissionDefinitions: Array<{ permission: string }>;
  };
  type MemberProjection = { members: Array<{ userId: string; rankId: string; membershipRevision: number }> };
  const headers = { "x-demo-user": "demo-user", origin: "http://127.0.0.1:4173" };
  const battalion = async () => {
    const response = await page.request.get("/api/battalions/current", { headers });
    expect(response.status()).toBe(200);
    return response.json() as Promise<BattalionProjection>;
  };
  const members = async () => {
    const response = await page.request.get("/api/battalions/current/members", { headers });
    expect(response.status()).toBe(200);
    return response.json() as Promise<MemberProjection>;
  };

  const initial = await battalion();
  expect(initial.permissions).toContain("RANK_MANAGE");
  expect(initial.permissionDefinitions.map((item) => item.permission)).toContain("BATTLEGROUP_EDIT");
  const denied = await page.request.post("/api/battalions/current/ranks", {
    headers: { "x-demo-user": "demo-wing-user", origin: headers.origin },
    data: { commandId: `browser-rank-denied-${crypto.randomUUID()}`, name: "Unauthorized", sortOrder: 88, permissions: [] },
  });
  expect(denied.status()).toBe(403);
  await expect(denied.json()).resolves.toMatchObject({ error: { code: "BATTALION_PERMISSION_REQUIRED" } });

  await page.goto("/?view=battalion");
  await expect(page.getByRole("status").filter({ hasText: "Persistent world connected" })).toBeVisible();
  await page.getByRole("tab", { name: "RANKS" }).click();
  const rankEditor = page.getByRole("region", { name: "Rank editor" });
  await rankEditor.getByLabel("RANK NAME").fill("Field Coordinator");
  await rankEditor.getByRole("spinbutton", { name: "ORDER", exact: true }).fill("55");
  await rankEditor.getByText("BATTLEGROUP EDIT", { exact: true }).click();
  await rankEditor.getByText("SHIP VIEW", { exact: true }).click();
  const createRequest = page.waitForRequest((request) =>
    request.url().endsWith("/api/battalions/current/ranks") && request.method() === "POST");
  await rankEditor.getByRole("button", { name: "CREATE RANK", exact: true }).click();
  const committedCreate = await createRequest;
  const createCommand = committedCreate.postDataJSON() as {
    commandId: string;
    name: string;
    sortOrder: number;
    permissions: string[];
  };
  await expect.poll(async () => (await battalion()).ranks.some((rank) => rank.name === "Field Coordinator")).toBe(true);
  const createReplay = await page.request.post("/api/battalions/current/ranks", { headers, data: createCommand });
  expect(createReplay.status()).toBe(201);
  const createCollision = await page.request.post("/api/battalions/current/ranks", {
    headers,
    data: { ...createCommand, name: "Changed Coordinator" },
  });
  expect(createCollision.status()).toBe(409);
  await expect(createCollision.json()).resolves.toMatchObject({ error: { code: "IDEMPOTENCY_KEY_REUSED" } });

  await page.goto("/?view=battalion");
  await page.getByRole("tab", { name: "MEMBERS" }).click();
  const wingRow = page.getByRole("row").filter({ hasText: "WING-2" });
  await wingRow.getByLabel("Rank for WING-2").selectOption({ label: "Field Coordinator" });
  const assignRequest = page.waitForRequest((request) =>
    request.url().endsWith("/api/battalions/current/members/rank") && request.method() === "POST");
  await wingRow.getByRole("button", { name: "ASSIGN RANK" }).click();
  const committedAssignment = await assignRequest;
  const assignmentCommand = committedAssignment.postDataJSON() as {
    commandId: string;
    targetUserId: string;
    rankId: string;
    expectedMembershipRevision: number;
    expectedRankVersion: number;
  };
  await expect.poll(async () => (await members()).members.find((member) => member.userId === "demo-wing-user"))
    .toMatchObject({ rankId: assignmentCommand.rankId, membershipRevision: 2 });
  const assignmentReplay = await page.request.post("/api/battalions/current/members/rank", { headers, data: assignmentCommand });
  expect(assignmentReplay.status()).toBe(200);

  const created = (await battalion()).ranks.find((rank) => rank.id === assignmentCommand.rankId)!;
  const inUseDelete = await page.request.post(`/api/battalions/current/ranks/${created.id}/delete`, {
    headers,
    data: { commandId: `browser-rank-in-use-${crypto.randomUUID()}`, expectedVersion: created.version },
  });
  expect(inUseDelete.status()).toBe(409);
  await expect(inUseDelete.json()).resolves.toMatchObject({ error: { code: "RANK_IN_USE" } });
  const updateCommand = {
    commandId: `browser-rank-update-${crypto.randomUUID()}`,
    expectedVersion: created.version,
    name: "Field Liaison",
    sortOrder: 55,
    permissions: ["BATTLEGROUP_EDIT", "BATTLEGROUP_ASSIGN", "SHIP_VIEW"],
  };
  const updated = await page.request.post(`/api/battalions/current/ranks/${created.id}/update`, { headers, data: updateCommand });
  expect(updated.status()).toBe(200);
  await expect(updated.json()).resolves.toMatchObject({ operation: "UPDATE_BATTALION_RANK", rankVersion: 2 });
  const updateReplay = await page.request.post(`/api/battalions/current/ranks/${created.id}/update`, { headers, data: updateCommand });
  expect(updateReplay.status()).toBe(200);

  const trooper = (await battalion()).ranks.find((rank) => rank.name === "Trooper")!;
  const assignedMember = (await members()).members.find((member) => member.userId === "demo-wing-user")!;
  const reassigned = await page.request.post("/api/battalions/current/members/rank", {
    headers,
    data: {
      commandId: `browser-rank-restore-${crypto.randomUUID()}`,
      targetUserId: assignedMember.userId,
      rankId: trooper.id,
      expectedMembershipRevision: assignedMember.membershipRevision,
      expectedRankVersion: trooper.version,
    },
  });
  expect(reassigned.status()).toBe(200);

  const deleted = await page.request.post(`/api/battalions/current/ranks/${created.id}/delete`, {
    headers,
    data: { commandId: `browser-rank-delete-${crypto.randomUUID()}`, expectedVersion: 2 },
  });
  expect(deleted.status()).toBe(200);
  await expect.poll(async () => (await battalion()).ranks.some((rank) => rank.id === created.id)).toBe(false);
});

test("Battalion creator transfers command authority and the new commander can hand it back", async ({ page }) => {
  type BattalionProjection = {
    battalion: { id: string; createdBy: string; version: number };
  };
  type Member = {
    userId: string;
    callsign: string;
    rankId: string;
    rankName: string;
    commandRole: "PLAYER" | "BATTALION_COMMAND" | "ADMIN";
    membershipRevision: number;
    status: string;
  };
  type MemberProjection = { members: Member[] };
  const origin = "http://127.0.0.1:4173";
  const headersFor = (userId: string) => ({ "x-demo-user": userId, origin });
  const battalion = async (userId: string) => {
    const response = await page.request.get("/api/battalions/current", { headers: headersFor(userId) });
    expect(response.status()).toBe(200);
    return response.json() as Promise<BattalionProjection>;
  };
  const members = async (userId: string) => {
    const response = await page.request.get("/api/battalions/current/members", { headers: headersFor(userId) });
    expect(response.status()).toBe(200);
    return response.json() as Promise<MemberProjection>;
  };

  const before = await battalion("demo-user");
  const beforeMembers = await members("demo-user");
  const originalCommander = beforeMembers.members.find((member) => member.userId === "demo-user")!;
  const successor = beforeMembers.members.find((member) => member.userId === "demo-wing-user")!;
  expect(before.battalion.createdBy).toBe("demo-user");
  expect(originalCommander.commandRole).toBe("BATTALION_COMMAND");
  expect(successor.commandRole).toBe("PLAYER");

  const denied = await page.request.post("/api/battalions/current/command/transfer", {
    headers: headersFor("demo-wing-user"),
    data: {
      commandId: `browser-transfer-denied-${crypto.randomUUID()}`,
      targetUserId: "demo-user",
      expectedBattalionVersion: before.battalion.version,
      expectedActorMembershipRevision: successor.membershipRevision,
      expectedTargetMembershipRevision: originalCommander.membershipRevision,
    },
  });
  expect(denied.status()).toBe(403);
  await expect(denied.json()).resolves.toMatchObject({ error: { code: "BATTALION_CREATOR_REQUIRED" } });

  await page.goto("/?view=battalion");
  await expect(page.getByRole("status").filter({ hasText: "Persistent world connected" })).toBeVisible();
  await page.getByRole("tab", { name: "MEMBERS" }).click();
  const successorRow = page.getByRole("row").filter({ hasText: "WING-2" });
  await successorRow.getByRole("button", { name: "TRANSFER COMMAND", exact: true }).click();
  const transferRequest = page.waitForRequest((request) =>
    request.url().endsWith("/api/battalions/current/command/transfer") && request.method() === "POST");
  await successorRow.getByRole("button", { name: "CONFIRM TRANSFER", exact: true }).click();
  const transferCommand = (await transferRequest).postDataJSON() as {
    commandId: string;
    targetUserId: string;
    expectedBattalionVersion: number;
    expectedActorMembershipRevision: number;
    expectedTargetMembershipRevision: number;
  };

  await expect.poll(async () => (await battalion("demo-wing-user")).battalion.createdBy).toBe("demo-wing-user");
  const transferred = await battalion("demo-wing-user");
  const transferredMembers = await members("demo-wing-user");
  const formerCommander = transferredMembers.members.find((member) => member.userId === "demo-user")!;
  const newCommander = transferredMembers.members.find((member) => member.userId === "demo-wing-user")!;
  expect(transferred.battalion.version).toBe(before.battalion.version + 1);
  expect(formerCommander).toMatchObject({
    commandRole: "PLAYER",
    rankId: successor.rankId,
    membershipRevision: originalCommander.membershipRevision + 1,
  });
  expect(newCommander).toMatchObject({
    commandRole: "BATTALION_COMMAND",
    rankId: originalCommander.rankId,
    membershipRevision: successor.membershipRevision + 1,
  });

  const replay = await page.request.post("/api/battalions/current/command/transfer", {
    headers: headersFor("demo-user"),
    data: transferCommand,
  });
  expect(replay.status()).toBe(200);
  await expect(replay.json()).resolves.toMatchObject({
    operation: "TRANSFER_BATTALION_COMMAND",
    previousCommanderUserId: "demo-user",
    commanderUserId: "demo-wing-user",
  });
  const collision = await page.request.post("/api/battalions/current/command/transfer", {
    headers: headersFor("demo-user"),
    data: { ...transferCommand, expectedBattalionVersion: transferCommand.expectedBattalionVersion + 1 },
  });
  expect(collision.status()).toBe(409);
  await expect(collision.json()).resolves.toMatchObject({ error: { code: "IDEMPOTENCY_KEY_REUSED" } });

  const restoreCommand = {
    commandId: `browser-transfer-restore-${crypto.randomUUID()}`,
    targetUserId: "demo-user",
    expectedBattalionVersion: transferred.battalion.version,
    expectedActorMembershipRevision: newCommander.membershipRevision,
    expectedTargetMembershipRevision: formerCommander.membershipRevision,
  };
  const restored = await page.request.post("/api/battalions/current/command/transfer", {
    headers: headersFor("demo-wing-user"),
    data: restoreCommand,
  });
  expect(restored.status()).toBe(200);
  await expect.poll(async () => (await battalion("demo-user")).battalion.createdBy).toBe("demo-user");
  const restoredMembers = await members("demo-user");
  expect(restoredMembers.members.find((member) => member.userId === "demo-user")).toMatchObject({
    commandRole: "BATTALION_COMMAND",
    rankId: originalCommander.rankId,
    membershipRevision: originalCommander.membershipRevision + 2,
  });
  expect(restoredMembers.members.find((member) => member.userId === "demo-wing-user")).toMatchObject({
    commandRole: "PLAYER",
    rankId: successor.rankId,
    membershipRevision: successor.membershipRevision + 2,
  });
});

test("ship command changes the primary ship identity with exact replay and Battalion history", async ({ page }) => {
  type ShipProjection = { ship: { id: string; name: string; registry: string; version: number } };
  const origin = "http://127.0.0.1:4173";
  const headers = { "x-demo-user": "demo-user", origin };
  const readShip = async () => {
    const response = await page.request.get("/api/ships/primary", { headers });
    expect(response.status()).toBe(200);
    return response.json() as Promise<ShipProjection>;
  };
  const initial = await readShip();
  const nextName = "CSV Resolute Pathfinder";
  const nextRegistry = "CSV-PATHFINDER";

  const denied = await page.request.post("/api/ships/primary/identity", {
    headers: { "x-demo-user": "demo-wing-user", origin },
    data: {
      commandId: `browser-ship-denied-${crypto.randomUUID()}`,
      expectedVersion: initial.ship.version,
      name: nextName,
      registry: nextRegistry,
    },
  });
  expect(denied.status()).toBe(403);
  await expect(denied.json()).resolves.toMatchObject({ error: { code: "BATTALION_PERMISSION_REQUIRED" } });

  await page.goto("/?view=ship");
  await expect(page.getByRole("status").filter({ hasText: "Persistent world connected" })).toBeVisible();
  await page.getByRole("button", { name: "EDIT SHIP IDENTITY" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit ship identity" });
  await dialog.getByLabel("SHIP NAME").fill(nextName);
  await dialog.getByLabel("REGISTRY").fill(nextRegistry);
  const commandRequest = page.waitForRequest((request) =>
    request.url().endsWith("/api/ships/primary/identity") && request.method() === "POST");
  await dialog.getByRole("button", { name: "SAVE IDENTITY" }).click();
  const command = (await commandRequest).postDataJSON() as {
    commandId: string;
    expectedVersion: number;
    name: string;
    registry: string;
  };
  await expect.poll(async () => (await readShip()).ship).toMatchObject({
    name: nextName,
    registry: nextRegistry,
    version: initial.ship.version + 1,
  });

  const replay = await page.request.post("/api/ships/primary/identity", { headers, data: command });
  expect(replay.status()).toBe(200);
  await expect(replay.json()).resolves.toMatchObject({ operation: "RENAME_PRIMARY_SHIP", name: nextName, registry: nextRegistry });
  const collision = await page.request.post("/api/ships/primary/identity", {
    headers,
    data: { ...command, registry: "CSV-COLLISION" },
  });
  expect(collision.status()).toBe(409);
  await expect(collision.json()).resolves.toMatchObject({ error: { code: "IDEMPOTENCY_KEY_REUSED" } });

  const activity = await page.request.get("/api/battalions/current/activity", { headers });
  expect(activity.status()).toBe(200);
  await expect(activity.json()).resolves.toMatchObject({
    events: expect.arrayContaining([expect.objectContaining({ type: "SHIP_IDENTITY_CHANGED", subjectId: initial.ship.id })]),
  });

  const current = await readShip();
  const restored = await page.request.post("/api/ships/primary/identity", {
    headers,
    data: {
      commandId: `browser-ship-restore-${crypto.randomUUID()}`,
      expectedVersion: current.ship.version,
      name: initial.ship.name,
      registry: initial.ship.registry,
    },
  });
  expect(restored.status()).toBe(200);
  await expect.poll(async () => (await readShip()).ship).toMatchObject({
    name: initial.ship.name,
    registry: initial.ship.registry,
    version: initial.ship.version + 2,
  });
});

test("Battalion command removes an eligible ordinary member and preserves history", async ({ page }) => {
  const origin = "http://127.0.0.1:4173";
  const denied = await page.request.post("/api/onboarding/battalions/members/remove", {
    headers: { "x-demo-user": "demo-wing-user", origin },
    data: {
      commandId: `browser-remove-denied-${crypto.randomUUID()}`,
      targetUserId: "demo-user",
      expectedMembershipRevision: 1,
    },
  });
  expect(denied.status()).toBe(403);
  await expect(denied.json()).resolves.toMatchObject({ error: { code: "BATTALION_PERMISSION_REQUIRED" } });

  await page.goto("/?view=battalion");
  await expect(page.getByRole("status").filter({ hasText: "Persistent world connected" })).toBeVisible();
  await page.getByRole("tab", { name: "MEMBERS" }).click();
  const memberRow = page.getByRole("row").filter({ hasText: "WING-2" });
  await expect(memberRow).toContainText("Trooper");
  await memberRow.getByRole("button", { name: "REMOVE", exact: true }).click();
  const removalRequest = page.waitForRequest((request) =>
    request.url().endsWith("/api/onboarding/battalions/members/remove") && request.method() === "POST");
  await memberRow.getByRole("button", { name: "CONFIRM REMOVE" }).click();
  const committedRemoval = await removalRequest;
  const removalCommand = committedRemoval.postDataJSON() as {
    commandId: string;
    targetUserId: string;
    expectedMembershipRevision: number;
  };

  await expect.poll(async () => {
    const response = await page.request.get("/api/battalions/current/members", { headers: { "x-demo-user": "demo-user" } });
    const payload = await response.json() as { members: Array<{ userId: string; status: string; membershipRevision: number }> };
    return payload.members.find((member) => member.userId === "demo-wing-user");
  }).toMatchObject({ status: "REMOVED", membershipRevision: removalCommand.expectedMembershipRevision + 1 });

  const headers = { "x-demo-user": "demo-user", origin };
  const replay = await page.request.post("/api/onboarding/battalions/members/remove", { headers, data: removalCommand });
  expect(replay.status()).toBe(200);
  await expect(replay.json()).resolves.toMatchObject({ removed: true, userId: "demo-wing-user" });
  const collision = await page.request.post("/api/onboarding/battalions/members/remove", {
    headers,
    data: { ...removalCommand, expectedMembershipRevision: removalCommand.expectedMembershipRevision + 1 },
  });
  expect(collision.status()).toBe(409);
  await expect(collision.json()).resolves.toMatchObject({ error: { code: "COMMAND_ID_REUSED" } });
});

test("campaign staging directory joins and safely leaves before deployment", async ({ page }) => {
  const directoryResponse = await page.request.get("/api/campaigns", {
    headers: { "x-demo-user": "demo-user" },
  });
  expect(directoryResponse.status()).toBe(200);
  const directory = await directoryResponse.json() as {
    availableCampaigns?: Array<{ campaignId: string; name: string }>;
  };
  const target = directory.availableCampaigns?.[0];
  expect(target, "development world should expose an authored recruiting campaign").toBeDefined();

  await page.goto("/?view=campaigns&directory=1");
  await expect(page.getByRole("heading", { name: "Choose your next operation" })).toBeVisible();
  const availableCard = page.locator(".campaign-directory-card").filter({ hasText: target!.name });
  await expect(availableCard).toContainText("RECRUITING");
  await availableCard.getByRole("button", { name: "JOIN CAMPAIGN" }).click();
  await expect(page.getByRole("heading", { name: "Deployment planner", exact: true })).toBeVisible();
  await expect(page.getByText(/Campaign joined/)).toBeVisible();

  await page.getByRole("navigation", { name: "Primary" }).getByRole("button", { name: "Campaigns" }).click();
  await page.getByRole("button", { name: "BROWSE CAMPAIGNS", exact: true }).click();
  const joinedCard = page.locator(".campaign-directory-card.joined").filter({ hasText: target!.name });
  await expect(joinedCard).toContainText("NOT DEPLOYED");
  await expect(joinedCard.getByRole("button", { name: "PLAN DEPLOYMENT" })).toBeVisible();
  await joinedCard.getByRole("button", { name: "LEAVE CAMPAIGN" }).click();
  await expect(joinedCard.getByText(/Once units deploy, tactical extraction rules apply instead/)).toBeVisible();
  const withdrawalRequest = page.waitForRequest((request) => request.url().endsWith(`/api/campaigns/${target!.campaignId}/withdraw`) && request.method() === "POST");
  await joinedCard.getByRole("button", { name: "CONFIRM LEAVE" }).click();
  const committedRequest = await withdrawalRequest;
  await expect(page.getByText(new RegExp(`Left ${target!.name}`, "i"))).toBeVisible();

  const replayEvidence = await page.evaluate(async ({ campaignId, command }) => {
    async function send(body: Record<string, unknown>) {
      const response = await fetch(`/api/campaigns/${campaignId}/withdraw`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-demo-user": "demo-user" },
        body: JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    }
    return {
      exact: await send(command),
      conflict: await send({ ...command, expectedJoinedAt: Number(command.expectedJoinedAt) + 1 }),
    };
  }, { campaignId: target!.campaignId, command: committedRequest.postDataJSON() as Record<string, unknown> });
  expect(replayEvidence.exact).toEqual({ status: 200, body: { withdrawn: true, campaignId: target!.campaignId } });
  expect(replayEvidence.conflict).toMatchObject({ status: 409, body: { error: { code: "COMMAND_ID_REUSED" } } });

  const after = await page.request.get("/api/campaigns", {
    headers: { "x-demo-user": "demo-user" },
  });
  expect(after.status()).toBe(200);
  await expect(after.json()).resolves.toMatchObject({
    campaigns: expect.not.arrayContaining([expect.objectContaining({ campaignId: target!.campaignId })]),
    availableCampaigns: expect.arrayContaining([expect.objectContaining({ campaignId: target!.campaignId })]),
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoDocumentOverflow(page);
});

test("quartermaster purchases published combined-arms units exactly once", async ({ page }) => {
  const openingResponse = await page.request.get("/api/requisition", {
    headers: { "x-demo-user": "demo-user" },
  });
  expect(openingResponse.status()).toBe(200);
  const opening = await openingResponse.json() as { balance: number };

  await page.goto("/?view=forces");
  await expect(page.getByText("REGISTRY LIVE", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "REQUISITION UNIT" }).click();
  const dialog = page.getByRole("dialog", { name: "Requisition unit" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: /Infantry Fighting Vehicle/ }).click();
  await expect(dialog.getByText("8 RP", { exact: true })).toBeVisible();
  await dialog.getByLabel("UNIT NAME").fill("Economy Mechanised Carrier");
  await dialog.getByLabel("CALLSIGN").fill("IFV-NEW");
  const purchaseRequest = page.waitForRequest((request) =>
    request.url().endsWith("/api/requisition/purchases") && request.method() === "POST");
  await dialog.getByRole("button", { name: "PURCHASE UNIT" }).click();
  const committedRequest = await purchaseRequest;
  const loadout = page.getByRole("dialog", { name: /IFV-NEW loadout/i });
  await expect(loadout).toBeVisible();
  await loadout.getByRole("button", { name: "Close loadout" }).click();
  await expect(page.locator(".grouped-roster").getByRole("button", { name: /IFV-NEW/ }).first()).toBeVisible();

  const afterResponse = await page.request.get("/api/requisition", {
    headers: { "x-demo-user": "demo-user" },
  });
  expect(afterResponse.status()).toBe(200);
  const after = await afterResponse.json() as { balance: number };
  expect(after.balance).toBe(opening.balance - 8);

  const command = committedRequest.postDataJSON() as Record<string, unknown>;
  const replay = await page.request.post("/api/requisition/purchases", {
    headers: { "content-type": "application/json", "x-demo-user": "demo-user", origin: "http://127.0.0.1:4173" },
    data: command,
  });
  expect(replay.status()).toBe(201);
  await expect(replay.json()).resolves.toMatchObject({
    definitionId: "unit-infantry-fighting-vehicle",
    callsign: "IFV-NEW",
    requisitionSpent: 8,
  });
  const conflict = await page.request.post("/api/requisition/purchases", {
    headers: { "content-type": "application/json", "x-demo-user": "demo-user", origin: "http://127.0.0.1:4173" },
    data: { ...command, desiredName: "Forged Replay" },
  });
  expect(conflict.status()).toBe(409);

  await page.getByRole("button", { name: "REQUISITION UNIT" }).click();
  const tankDialog = page.getByRole("dialog", { name: "Requisition unit" });
  await tankDialog.getByRole("button", { name: /Main Battle Tank/ }).click();
  await expect(tankDialog.getByText("10 RP", { exact: true })).toBeVisible();
  await tankDialog.getByLabel("UNIT NAME").fill("Economy Armoured Platoon");
  await tankDialog.getByLabel("CALLSIGN").fill("MBT-NEW");
  const tankPurchaseRequest = page.waitForRequest((request) =>
    request.url().endsWith("/api/requisition/purchases") && request.method() === "POST");
  await tankDialog.getByRole("button", { name: "PURCHASE UNIT" }).click();
  const committedTankRequest = await tankPurchaseRequest;
  const tankLoadout = page.getByRole("dialog", { name: /MBT-NEW loadout/i });
  await expect(tankLoadout).toBeVisible();
  await tankLoadout.getByRole("button", { name: "Close loadout" }).click();
  await expect(page.locator(".grouped-roster").getByRole("button", { name: /MBT-NEW/ }).first()).toBeVisible();

  const finalBalanceResponse = await page.request.get("/api/requisition", {
    headers: { "x-demo-user": "demo-user" },
  });
  expect(finalBalanceResponse.status()).toBe(200);
  await expect(finalBalanceResponse.json()).resolves.toMatchObject({ balance: opening.balance - 18 });
  const tankCommand = committedTankRequest.postDataJSON() as Record<string, unknown>;
  const tankReplay = await page.request.post("/api/requisition/purchases", {
    headers: { "content-type": "application/json", "x-demo-user": "demo-user", origin: "http://127.0.0.1:4173" },
    data: tankCommand,
  });
  expect(tankReplay.status()).toBe(201);
  await expect(tankReplay.json()).resolves.toMatchObject({
    definitionId: "unit-main-battle-tank",
    callsign: "MBT-NEW",
    requisitionSpent: 10,
  });

  await page.getByRole("button", { name: "REQUISITION UNIT" }).click();
  const companionDialog = page.getByRole("dialog", { name: "Requisition unit" });
  await companionDialog.getByRole("button", { name: /^Sappers / }).click();
  await expect(companionDialog.getByText("6 RP", { exact: true })).toBeVisible();
  await companionDialog.getByLabel("UNIT NAME").fill("Quiet Field Engineering Cell");
  await companionDialog.getByLabel("CALLSIGN").fill("SAP-NEW");
  const companionPurchaseRequest = page.waitForRequest((request) =>
    request.url().endsWith("/api/requisition/purchases") && request.method() === "POST");
  await companionDialog.getByRole("button", { name: "PURCHASE UNIT" }).click();
  const committedCompanionRequest = await companionPurchaseRequest;
  const companionLoadout = page.getByRole("dialog", { name: /SAP-NEW loadout/i });
  await expect(companionLoadout).toBeVisible();
  await companionLoadout.getByRole("button", { name: "Close loadout" }).click();

  const companionCommand = committedCompanionRequest.postDataJSON() as Record<string, unknown>;
  expect(companionCommand).toMatchObject({ definitionId: "unit-sappers", callsign: "SAP-NEW" });
  const companionBalanceResponse = await page.request.get("/api/requisition", {
    headers: { "x-demo-user": "demo-user" },
  });
  expect(companionBalanceResponse.status()).toBe(200);
  await expect(companionBalanceResponse.json()).resolves.toMatchObject({ balance: opening.balance - 24 });
});

test("commander edits a persistent unit identity and sees the service record", async ({ page }) => {
  await page.goto("/?view=forces");
  await expect(page.getByText("REGISTRY LIVE", { exact: true })).toBeVisible();
  await page.locator(".grouped-roster").getByRole("button", { name: /SPECTRE/ }).click();
  await page.getByRole("button", { name: "EDIT IDENTITY" }).click();

  const dialog = page.getByRole("dialog", { name: "Edit unit identity" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("UNIT NAME").fill("Spectre Pathfinder Cell");
  await dialog.getByLabel("SERVICE DESCRIPTION").fill("Veteran pathfinders assigned to infiltration and reconnaissance duties.");
  await dialog.getByRole("button", { name: "SAVE IDENTITY" }).click();

  await expect(page.getByText(/SPECTRE identity saved to its persistent service record/i)).toBeVisible();
  await expect(page.getByText("Spectre Pathfinder Cell", { exact: true })).toBeVisible();
  await expect(page.getByText("Veteran pathfinders assigned to infiltration and reconnaissance duties.", { exact: true })).toBeVisible();
  await expect(page.getByText("RENAMED", { exact: true })).toBeVisible();

  const detail = await page.request.get("/api/forces/force-spectre", {
    headers: { "x-demo-user": "demo-user" },
  });
  expect(detail.status()).toBe(200);
  await expect(detail.json()).resolves.toMatchObject({
    unitId: "force-spectre",
    callsign: "SPECTRE",
    name: "Spectre Pathfinder Cell",
    description: "Veteran pathfinders assigned to infiltration and reconnaissance duties.",
    version: 2,
    history: expect.arrayContaining([
      expect.objectContaining({ type: "RENAMED" }),
    ]),
  });
});

test("strategic UI submits and resolves a Battlegroup disembark order", async ({ page }) => {
  type StrategicProjection = {
    map: { version: number };
    round: { round: number };
    battlegroups: Array<{
      id: string;
      status: string;
      revision?: number;
      currentNodeId: string | null;
      currentCarrierTaskForceId?: string | null;
    }>;
  };
  const readProjection = async (): Promise<StrategicProjection> => {
    const response = await page.request.get("/api/strategic/maps/strategic-map-corinth", {
      headers: { "x-demo-user": "demo-user" },
    });
    expect(response.status()).toBe(200);
    return response.json() as Promise<StrategicProjection>;
  };
  const initial = await readProjection();
  const initialHammer = initial.battlegroups.find((group) => group.id === "battlegroup-hammer");
  expect(initialHammer, "development world should contain Hammer Battlegroup").toBeDefined();

  await page.goto("/?view=galactic");
  await expect(page.getByRole("status").filter({ hasText: "Persistent world connected" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "The Corinth Expedition" })).toBeVisible();

  const formation = page.getByLabel("ORDERED FORMATION");
  await formation.selectOption("battlegroup-hammer");
  let ordered: StrategicProjection | undefined;
  if (initialHammer!.status === "EMBARKED") {
    await page.getByRole("button", { name: "DISEMBARK", exact: true }).click();
    await expect(page.getByText(/Hammer: order submitted for strategic round/i)).toBeVisible();
    ordered = await readProjection();
    await page.getByRole("button", { name: `RESOLVE ROUND ${ordered.round.round}` }).click();
    await expect(page.getByText(new RegExp(`Strategic round ${ordered.round.round} resolved`))).toBeVisible();
  } else {
    expect(initialHammer).toMatchObject({
      status: "READY",
      currentNodeId: "node-corinth-high-orbit",
    });
    await expect(page.getByRole("button", { name: "DISEMBARK", exact: true })).toHaveCount(0);
  }

  await expect.poll(async () => {
    const projection = await readProjection();
    const hammer = projection.battlegroups.find((group) => group.id === "battlegroup-hammer");
    return (!ordered || (
      projection.map.version === ordered.map.version + 1 &&
      projection.round.round === ordered.round.round + 1
    ))
      && hammer?.status === "READY"
      && hammer.currentNodeId === "node-corinth-high-orbit";
  }).toBe(true);
});

test("Galactic Operations projects a joined recruiting campaign before tactical launch", async ({ page }) => {
  const projectionResponse = await page.request.get("/api/strategic/maps/strategic-map-corinth", {
    headers: { "x-demo-user": "demo-user" },
  });
  expect(projectionResponse.status()).toBe(200);
  const projection = await projectionResponse.json() as {
    campaigns: Array<{ campaignId: string; name: string; status: string; strategicStatus: string; canEnter: boolean }>;
  };
  expect(projection.campaigns.find((campaign) => campaign.campaignId === "operation-iron-rain")).toMatchObject({
    name: "Operation Iron Rain",
    status: "RECRUITING",
    strategicStatus: "MUSTERING",
    canEnter: true,
  });

  await page.goto("/?view=galactic");
  await expect(page.getByRole("status").filter({ hasText: "Persistent world connected" })).toBeVisible();
  await page.getByRole("button", { name: "LOCATION LIST" }).click();
  const systemLocations = page.locator('[aria-label="Helion system objects list"]');
  await systemLocations.getByRole("button", { name: /^Corinth PLANET/ }).click();

  const viewport = page.getByRole("region", { name: "Strategic map viewport" });
  const recruitingMarker = viewport.locator(".campaign-map-marker").filter({ hasText: "Operation Iron Rain" });
  await expect(recruitingMarker).toBeVisible();
  await expect(recruitingMarker).toHaveAttribute("aria-label", /Operation Iron Rain, recruiting/);
  await expect(viewport.locator(".campaign-map-marker").filter({ hasText: "Operation Broken Road" })).toHaveCount(0);
});

test("strategic deployment authorization boots a persistent tactical operation", async ({ page }) => {
  type StrategicProjection = {
    map: { version: number };
    round: { round: number };
    operations: Array<{ id: string; status: string; deployedBattlegroupIds: string[] }>;
    battlegroups: Array<{
      id: string;
      status: string;
      currentOperationId: string | null;
      currentCarrierTaskForceId?: string | null;
    }>;
  };
  type TacticalProjection = {
    scenarioVersion: number;
    map: Array<{ coord: { q: number; r: number } }>;
    deployments: Array<{ ownerId: string; callsign: string }>;
  };
  const readStrategicProjection = async (): Promise<StrategicProjection> => {
    const response = await page.request.get("/api/strategic/maps/strategic-map-corinth", {
      headers: { "x-demo-user": "demo-user" },
    });
    expect(response.status()).toBe(200);
    return response.json() as Promise<StrategicProjection>;
  };
  const initial = await readStrategicProjection();
  const initialOperation = initial.operations.find((item) => item.id === "strategic-operation-iron-rain");
  const initialRaven = initial.battlegroups.find((group) => group.id === "battlegroup-raven");
  expect(initialOperation, "development world should contain Operation Iron Rain").toBeDefined();
  expect(initialRaven, "development world should contain Raven Battlegroup").toBeDefined();
  const alreadyAuthorised = initialOperation!.status === "ACTIVE" &&
    initialOperation!.deployedBattlegroupIds.includes("battlegroup-raven") &&
    initialRaven!.status === "DEPLOYING" &&
    initialRaven!.currentOperationId === "strategic-operation-iron-rain";

  await page.goto("/?view=galactic");
  await expect(page.getByRole("status").filter({ hasText: "Persistent world connected" })).toBeVisible();
  await page.getByRole("tab", { name: "OPERATIONS BOARD" }).click();
  await page.getByRole("button", { name: /Operation Iron Rain/ }).click();
  let ordered: StrategicProjection | undefined;
  if (!alreadyAuthorised) {
    expect(initialRaven).toMatchObject({ status: "EMBARKED" });
    await page.getByLabel("DEPLOYMENT FORMATION").selectOption("battlegroup-raven");
    await page.getByRole("button", { name: "AUTHORISE STANDARD LANDING" }).click();
    await expect(page.getByText(/Raven: order submitted for strategic round/i)).toBeVisible();
    ordered = await readStrategicProjection();
    await page.getByRole("tab", { name: "COMMAND MAP" }).click();
    await page.getByRole("button", { name: `RESOLVE ROUND ${ordered.round.round}` }).click();
    await expect(page.getByText(new RegExp(`Strategic round ${ordered.round.round} resolved`))).toBeVisible();
  }

  await expect.poll(async () => {
    const projection = await readStrategicProjection();
    const operation = projection.operations.find((item) => item.id === "strategic-operation-iron-rain");
    const raven = projection.battlegroups.find((group) => group.id === "battlegroup-raven");
    return (!ordered || (
      projection.map.version === ordered.map.version + 1 &&
      projection.round.round === ordered.round.round + 1
    ))
      && operation?.status === "ACTIVE"
      && operation.deployedBattlegroupIds.includes("battlegroup-raven")
      && raven?.status === "DEPLOYING"
      && raven.currentOperationId === "strategic-operation-iron-rain";
  }).toBe(true);

  await page.getByRole("tab", { name: "OPERATIONS BOARD" }).click();
  await page.getByRole("button", { name: /Operation Iron Rain/ }).click();
  const tacticalBefore = await page.request.get("/api/campaigns/operation-iron-rain/state", {
    headers: { "x-demo-user": "demo-user" },
  });
  const priorTactical = tacticalBefore.ok()
    ? await tacticalBefore.json() as TacticalProjection
    : undefined;
  const alreadyDeployed = new Set(priorTactical?.deployments
    .filter((unit) => unit.ownerId === "demo-user")
    .map((unit) => unit.callsign) ?? []);
  let deploymentTarget = alreadyDeployed.size;
  if (deploymentTarget === 0) {
    await page.getByRole("button", { name: "PLAN TACTICAL DEPLOYMENT" }).click();
    await expect(page.getByRole("heading", { name: "Deployment planner", exact: true })).toBeVisible();
    await expect(page.getByText("PLANNER LIVE", { exact: true })).toBeVisible();
    const ravenUnits = page.locator("label").filter({ hasText: "· Raven" }).locator('input[type="checkbox"]:enabled');
    const ravenUnitCount = await ravenUnits.count();
    expect(ravenUnitCount, "the authorised Raven formation should retain at least one deployable unit").toBeGreaterThan(0);
    const requiredDeployments = Math.min(2, ravenUnitCount);
    for (let index = 0; index < requiredDeployments; index += 1) {
      await ravenUnits.nth(index).check();
    }
    deploymentTarget = requiredDeployments;
    await page.getByRole("button", { name: /VALIDATE PLAN|REVALIDATE PLAN/ }).click();
    await expect(page.getByRole("heading", { name: "Ready for command" })).toBeVisible();
    await page.getByRole("button", { name: "COMMIT DEPLOYMENT" }).click();
  } else {
    await page.goto("/?view=campaigns&campaign=operation-iron-rain");
  }
  await expect(page.getByRole("region", { name: "Tactical operations map" })).toBeVisible();

  const campaign = await page.request.get("/api/campaigns/operation-iron-rain/state", {
    headers: { "x-demo-user": "demo-user" },
  });
  expect(campaign.status()).toBe(200);
  const tactical = await campaign.json() as TacticalProjection;
  expect(tactical.scenarioVersion).toBe(IRON_RAIN_SCENARIO_VERSION);
  expect(tactical.map).toHaveLength(311);
  expect(tactical.deployments.filter((unit) => unit.ownerId === "demo-user").length).toBeGreaterThanOrEqual(deploymentTarget);

  const tacticalCanvas = page.getByRole("application", { name: /Operation Iron Rain tactical hex map/ });
  await tacticalCanvas.focus();
  const cursorStatus = page.getByRole("status", { name: "Tactical keyboard cursor" });
  await expect(cursorStatus).toContainText(/Hex -6\.2/);
  await tacticalCanvas.press("ArrowRight");
  await expect(cursorStatus).toContainText(/Hex -5\.1/);
  await tacticalCanvas.press("Alt+ArrowLeft");
  await expect(cursorStatus).toContainText(/Hex -6\.1/);
  await tacticalCanvas.press("Enter");
  await expect(page.getByText(/1 HEX/).first()).toBeVisible();
});

test("Galactic Operations links the live campaign, fleet, and interactive system map", async ({ page }) => {
  type MapProjection = {
    planets: Array<{ planetId: string; name: string; locationId: string }>;
    nodes: Array<{ id: string; name: string; type: string; planetLocationId?: string }>;
    campaigns: Array<{
      campaignId: string;
      name: string;
      status: string;
      planetId: string;
      planetName: string;
      viewerDeploymentCount: number;
      canEnter: boolean;
    }>;
    taskForces: Array<{ id: string; name: string; shipIds: string[] }>;
    shipPresence: Array<{
      shipId: string;
      name: string;
      className: string;
      taskForceId: string;
      nodeId?: string;
      primary: boolean;
    }>;
  };
  type CampaignSummary = {
    campaignId: string;
    objectives: Array<{ id: string; name: string }>;
    viewerUnits: Array<{ id: string; callsign: string }>;
  };
  type DirectoryEntry = { campaignId: string; name: string; planetName: string; status: string };
  const headers = { "x-demo-user": "demo-user" };

  const projectionResponse = await page.request.get("/api/strategic/maps/strategic-map-corinth", { headers });
  expect(projectionResponse.status()).toBe(200);
  const projection = await projectionResponse.json() as MapProjection;
  expect(projection.planets.map((planet) => planet.name)).toEqual(expect.arrayContaining(["Corinth", "Corinth II"]));
  expect(projection.campaigns.every((campaign) => ["RECRUITING", "ACTIVE", "PAUSED"].includes(campaign.status))).toBe(true);

  const ironRain = projection.campaigns.find((campaign) => campaign.campaignId === "operation-iron-rain");
  expect(ironRain, "the joined Iron Rain campaign should project onto Corinth").toMatchObject({
    name: "Operation Iron Rain",
    planetName: "Corinth",
    canEnter: true,
  });
  expect(ironRain!.viewerDeploymentCount).toBeGreaterThan(0);

  const summaryResponse = await page.request.get(`/api/campaigns/${ironRain!.campaignId}/summary`, { headers });
  expect(summaryResponse.status()).toBe(200);
  const summary = await summaryResponse.json() as CampaignSummary;
  expect(summary.campaignId).toBe(ironRain!.campaignId);
  expect(summary.objectives.length).toBeGreaterThan(0);
  expect(summary.viewerUnits.length).toBeGreaterThan(0);

  const directoryResponse = await page.request.get("/api/campaigns", { headers });
  expect(directoryResponse.status()).toBe(200);
  const directory = await directoryResponse.json() as {
    campaigns?: DirectoryEntry[];
    availableCampaigns?: DirectoryEntry[];
  };
  const nonMapCorinthCampaigns = [
    ...(directory.campaigns ?? []),
    ...(directory.availableCampaigns ?? []),
  ].filter((campaign) => campaign.planetName === "Corinth" && !["RECRUITING", "ACTIVE", "PAUSED"].includes(campaign.status));

  const primaryShip = projection.shipPresence.find((ship) => ship.primary) ?? projection.shipPresence[0];
  expect(primaryShip, "the strategic projection should include the player's real ship").toBeDefined();
  const primaryTaskForce = projection.taskForces.find((force) => force.id === primaryShip.taskForceId);
  expect(primaryTaskForce).toBeDefined();
  const fleetShips = projection.shipPresence.filter((ship) => ship.taskForceId === primaryShip.taskForceId);
  expect(fleetShips.length).toBeGreaterThan(0);
  const corinth = projection.planets.find((planet) => planet.name === "Corinth")!;
  expect(projection.nodes.find((node) => node.id === primaryShip.nodeId)).toMatchObject({
    type: "ORBIT",
    planetLocationId: corinth.locationId,
  });

  await page.goto("/?view=galactic");
  await expect(page.getByRole("status").filter({ hasText: "Persistent world connected" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^HELION SYSTEM/ })).toHaveAttribute("aria-pressed", "true");

  const viewport = page.getByRole("region", { name: "Strategic map viewport" });
  const mapWorld = viewport.locator(".strategic-map-world");
  await expect(viewport).toBeVisible();
  const corinthPlanet = viewport.getByRole("button", { name: /^Corinth,/ });
  await expect(corinthPlanet).toBeVisible();
  await expect(viewport.getByRole("button", { name: /^Corinth II,/ })).toBeVisible();
  await expect(viewport.locator(".strategic-node").filter({ hasText: "Corinth High Orbit" })).toHaveCount(0);

  const fleetMarker = viewport.locator(".system-fleet-node").filter({ hasText: primaryTaskForce!.name });
  await expect(fleetMarker).toHaveCount(1);
  await expect(fleetMarker).toHaveAttribute("data-ship-count", `${fleetShips.length}`);
  await expect(fleetMarker).toHaveAttribute("aria-label", new RegExp(`${fleetShips.length} ship`));
  const expectedSpriteClass = primaryShip.className.toLowerCase().includes("battleship")
    ? "battleship"
    : primaryShip.className.toLowerCase().includes("corvette")
      ? "corvette"
      : primaryShip.className.toLowerCase().includes("cruiser")
        ? "cruiser"
        : "destroyer";
  await expect(fleetMarker.locator("img").first()).toHaveAttribute("data-ship-class", expectedSpriteClass);

  const zoom = page.getByLabel("Current map zoom");
  await expect(zoom).toHaveText("100%");
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(zoom).toHaveText("112%");
  await page.getByRole("button", { name: "Zoom out" }).click();
  await expect(zoom).toHaveText("100%");

  const initialTransform = await mapWorld.evaluate((element) => (element as HTMLElement).style.transform);
  await viewport.focus();
  await expect(viewport).toBeFocused();
  await viewport.press("Shift+ArrowRight");
  await expect.poll(() => mapWorld.evaluate((element) => (element as HTMLElement).style.transform)).not.toBe(initialTransform);
  await viewport.press("=");
  await expect(zoom).toHaveText("112%");
  await viewport.press("Home");
  await expect(zoom).toHaveText("100%");
  await expect.poll(() => mapWorld.evaluate((element) => (element as HTMLElement).style.transform)).toBe(initialTransform);

  const dragStart = await viewport.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    for (let y = bounds.top + 28; y < bounds.bottom - 72; y += 24) {
      for (let x = bounds.left + 28; x < bounds.right - 72; x += 24) {
        const hit = document.elementFromPoint(x, y) as HTMLElement | null;
        if (hit && element.contains(hit) && !hit.closest("button, a, input, select, textarea")) return { x, y };
      }
    }
    throw new Error("No non-interactive strategic viewport point was available for dragging.");
  });
  await page.mouse.move(dragStart.x, dragStart.y);
  await page.mouse.down();
  await page.mouse.move(dragStart.x + 42, dragStart.y + 26, { steps: 4 });
  await page.mouse.up();
  await expect.poll(() => mapWorld.evaluate((element) => (element as HTMLElement).style.transform)).not.toBe(initialTransform);
  await expect(page.getByRole("status", { name: "Strategic map status" })).toHaveText("Map position changed.");
  await page.getByRole("button", { name: "FIT MAP" }).click();
  await expect.poll(() => mapWorld.evaluate((element) => (element as HTMLElement).style.transform)).toBe(initialTransform);

  await page.getByRole("button", { name: "LOCATION LIST" }).click();
  await expect(viewport).toBeHidden();
  const systemLocations = page.locator('[aria-label="Helion system objects list"]');
  await expect(systemLocations).toBeVisible();
  await systemLocations.getByRole("button", { name: /^Corinth PLANET/ }).click();
  await expect(page.getByRole("button", { name: /^PLANET/ })).toHaveAttribute("aria-pressed", "true");

  const campaignMarker = viewport.locator(".campaign-map-marker").filter({ hasText: ironRain!.name });
  await expect(campaignMarker).toBeVisible();
  await expect(campaignMarker).toHaveAttribute("aria-label", new RegExp(`${ironRain!.viewerDeploymentCount} of your deployed units`));
  for (const campaign of nonMapCorinthCampaigns) {
    await expect(viewport.locator(".campaign-map-marker").filter({ hasText: campaign.name })).toHaveCount(0);
  }

  const campaignSummary = page.locator(".campaign-command-summary");
  await expect(campaignSummary.getByText("CURRENT OBJECTIVES", { exact: true })).toBeVisible();
  await expect(campaignSummary.getByText("MY ACTIVE UNITS", { exact: true })).toBeVisible();
  for (const objective of summary.objectives) {
    await expect(campaignSummary.getByText(objective.name, { exact: true })).toBeVisible();
  }
  for (const unit of summary.viewerUnits) {
    await expect(campaignSummary.getByText(unit.callsign, { exact: true })).toBeVisible();
  }

  await page.getByRole("button", { name: "LOCATION LIST" }).click();
  const corinthLocations = page.locator('[aria-label="Corinth campaign and location list"]');
  await expect(corinthLocations).toBeVisible();
  await expect(corinthLocations.locator(".campaign-list-entry").filter({ hasText: ironRain!.name })).toBeVisible();
  await page.getByRole("button", { name: "DISPLAY", exact: true }).click();

  await campaignMarker.click();
  await expect.poll(() => {
    const url = new URL(page.url());
    return { view: url.searchParams.get("view"), campaign: url.searchParams.get("campaign") };
  }).toEqual({ view: "campaigns", campaign: ironRain!.campaignId });
  await expect(page.getByRole("region", { name: "Tactical operations map" })).toBeVisible();
});

test("Galactic Operations remains operable on mobile with reduced motion", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?view=galactic");
  await expect(page.getByRole("status").filter({ hasText: "Persistent world connected" })).toBeVisible();

  const viewport = page.getByRole("region", { name: "Strategic map viewport" });
  await page.getByRole("button", { name: "LOCATION LIST" }).click();
  const systemLocations = page.locator('[aria-label="Helion system objects list"]');
  await expect(systemLocations).toBeVisible();
  await systemLocations.getByRole("button", { name: /^Corinth PLANET/ }).click();
  await expect(viewport.locator(".planet-projection")).toBeVisible();
  const animations = await viewport.locator(".planet-surface-drift, .planet-scan-sweep").evaluateAll((elements) =>
    elements.map((element) => getComputedStyle(element).animationName));
  expect(animations).toEqual(["none", "none"]);

  await page.getByRole("button", { name: "LOCATION LIST" }).click();
  await expect(page.locator('[aria-label="Corinth campaign and location list"]')).toBeVisible();
  await expectNoDocumentOverflow(page);
});

test("Task Force resupply consumes one Large Supply and extends strategic access", async ({ page }) => {
  type SupplyProjection = {
    map: { version: number };
    round: { round: number };
    taskForces: Array<{
      id: string;
      supply: { balances: Array<{ size: string; quantity: number }>; suppliedThroughRound: number | null };
    }>;
  };
  const headers = { "x-demo-user": "demo-user" };
  const readProjection = async () => {
    const response = await page.request.get("/api/strategic/maps/strategic-map-corinth", { headers });
    expect(response.status()).toBe(200);
    return response.json() as Promise<SupplyProjection>;
  };
  let projection = await readProjection();
  let resolute = projection.taskForces.find((force) => force.id === "task-force-resolute")!;
  while ((resolute.supply.suppliedThroughRound ?? -1) >= projection.round.round + 1) {
    const response = await page.request.post("/api/strategic/maps/strategic-map-corinth/resolve", {
      headers,
      data: {
        commandId: crypto.randomUUID(),
        expectedMapVersion: projection.map.version,
        expectedRound: projection.round.round,
      },
    });
    expect(response.status()).toBe(200);
    projection = await readProjection();
    resolute = projection.taskForces.find((force) => force.id === "task-force-resolute")!;
  }
  const resolvingRound = projection.round.round;
  const largeBefore = resolute.supply.balances.find((balance) => balance.size === "LARGE")!.quantity;

  await page.goto("/?view=galactic");
  await expect(page.getByRole("status").filter({ hasText: "Persistent world connected" })).toBeVisible();
  await page.getByLabel("ORDERED FORMATION").selectOption("task-force-resolute");
  const supplyOrder = page.getByRole("button", { name: `SUPPLY THROUGH ROUND ${resolvingRound + 1}` });
  await expect(page.getByText(`${largeBefore}/4 LARGE SUPPLY`, { exact: true })).toBeVisible();
  await expect(supplyOrder).toBeEnabled();
  await supplyOrder.click();
  await expect(page.getByText(/Resolute Task Force: order submitted for strategic round/i)).toBeVisible();
  await page.getByRole("button", { name: `RESOLVE ROUND ${resolvingRound}` }).click();
  await expect(page.getByText(new RegExp(`Strategic round ${resolvingRound} resolved`))).toBeVisible();

  await expect.poll(async () => {
    const next = await readProjection();
    const force = next.taskForces.find((candidate) => candidate.id === "task-force-resolute")!;
    return {
      round: next.round.round,
      large: force.supply.balances.find((balance) => balance.size === "LARGE")?.quantity,
      suppliedThroughRound: force.supply.suppliedThroughRound,
    };
  }).toEqual({
    round: resolvingRound + 1,
    large: largeBefore - 1,
    suppliedThroughRound: resolvingRound + 1,
  });
});

test("tactical API exposes Light Mech, VTOL, Fighter, Bomber, and HAT verticals and rejects client-authored action economy", async ({ page }) => {
  await page.goto("/");

  const foundation = await page.request.get("/api/campaigns/outpost-k17/state", {
    headers: { "x-demo-user": "demo-user" },
  });
  expect(foundation.status()).toBe(200);
  const foundationState = await foundation.json() as CampaignView;
  expect(foundationState).toMatchObject({
    deployments: expect.arrayContaining([
      expect.objectContaining({
        definitionId: "unit-infantry-fighting-vehicle",
        callsign: "CARR-6",
        allowedActions: expect.arrayContaining(["ATTACK", "CREW_REPAIR", "LOAD", "UNLOAD"]),
      }),
      expect.objectContaining({
        definitionId: "unit-light-mech",
        callsign: "STRIDER",
        allowedOrders: expect.arrayContaining(["EVASIVE"]),
        allowedActions: expect.arrayContaining(["ATTACK"]),
      }),
      expect.objectContaining({
        definitionId: "unit-vtol",
        callsign: "SKYHOOK",
        allowedOrders: expect.arrayContaining(["HOLD", "ADVANCE"]),
        allowedActions: expect.arrayContaining(["ATTACK", "LOAD", "UNLOAD", "LAND", "TAKE_OFF"]),
        tags: expect.arrayContaining(["AEROSPACE", "VTOL", "CANNOT_SPOT_GROUND"]),
        cargoProfile: expect.objectContaining({ id: "cargo-vtol-alternative" }),
      }),
      expect.objectContaining({
        definitionId: "unit-aerospace-fighter",
        callsign: "VULT-1",
        allowedOrders: expect.arrayContaining(["HOLD", "ADVANCE", "EVASIVE"]),
        allowedActions: expect.arrayContaining(["ATTACK", "LAND", "TAKE_OFF", "REARM_AEROSPACE"]),
        ammunition: { "weapon-fighter-snub-hmg": 1 },
        tags: expect.arrayContaining(["AEROSPACE", "LIMITED_FORWARD_ARC", "AEROSPACE_INTERCEPTOR", "CANNOT_SPOT_GROUND"]),
      }),
      expect.objectContaining({
        definitionId: "unit-aerospace-bomber",
        callsign: "HAVOC-2",
        allowedOrders: expect.arrayContaining(["HOLD", "ADVANCE"]),
        allowedActions: expect.arrayContaining(["ATTACK", "LAND", "TAKE_OFF", "REARM_AEROSPACE"]),
        ammunition: { "weapon-bomber-ordnance": 1 },
        tags: expect.arrayContaining(["AEROSPACE", "BOMBER", "FLY_OVER", "CANNOT_SPOT_GROUND"]),
      }),
      expect.objectContaining({
        definitionId: "unit-heavy-air-transport",
        callsign: "ATLAS-1",
        allowedOrders: expect.arrayContaining(["HOLD", "ADVANCE"]),
        allowedActions: expect.arrayContaining(["LOAD", "AIRDROP", "LAND", "TAKE_OFF"]),
        tags: expect.arrayContaining(["AEROSPACE", "AIRDROP", "CANNOT_SPOT_GROUND"]),
        cargoProfile: expect.objectContaining({ id: "cargo-hat-five-slot" }),
        cargo: [expect.objectContaining({ unitId: "dep-raven-drop", transportMode: "AIRLIFTED" })],
      }),
    ]),
  });

  const strider = foundationState.deployments.find((deployment) => deployment.callsign === "STRIDER")!;
  const striderOrder = await page.evaluate(async (command) => {
    const response = await fetch("/api/campaigns/outpost-k17/orders", {
      method: "POST",
      headers: { "content-type": "application/json", "x-demo-user": "demo-user" },
      body: JSON.stringify(command),
    });
    return { status: response.status, body: await response.text() };
  }, {
      commandId: `browser-strider-evasive-${foundationState.round}`,
      expectedCampaignVersion: foundationState.version,
      expectedOrderRevision: 0,
      unitId: strider.id,
      round: foundationState.round,
      orderType: "EVASIVE",
      lifecycle: "SUBMITTED",
      route: [strider.position, { q: 1, r: -2 }, { q: 1, r: -1 }, { q: 2, r: -1 }],
      facing: 2,
      actions: [],
      incidentalActions: [],
  });
  expect(striderOrder, striderOrder.body).toMatchObject({ status: 201 });

  await resolveCampaignRoundAsGameMaster(page, "outpost-k17");

  const afterMechRound = await page.request.get("/api/campaigns/outpost-k17/state", {
    headers: { "x-demo-user": "demo-user" },
  });
  expect(afterMechRound.status()).toBe(200);
  const aerospaceState = await afterMechRound.json() as CampaignView;
  expect(aerospaceState).toMatchObject({
    events: expect.arrayContaining([
      expect.objectContaining({
        type: "EVASIVE_MANEUVER",
        actor: strider.id,
        payload: expect.objectContaining({ active: true, actualDisplacement: 3 }),
      }),
    ]),
    deployments: expect.arrayContaining([
      expect.objectContaining({ id: strider.id, position: { q: 2, r: -1 } }),
    ]),
  });

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

test("Heavy Air Transport composer exposes a manifested clear-route drop", async ({ page }) => {
  const response = await page.request.get("/api/campaigns/outpost-k17/state", {
    headers: { "x-demo-user": "demo-user" },
  });
  expect(response.status()).toBe(200);
  const state = await response.json();
  await page.route("**/api/campaigns", async (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      campaigns: [{
        campaignId: "outpost-k17",
        name: "Outpost K-17",
        planetName: "Corinth",
        status: "ACTIVE",
        role: "PLAYER",
        scenarioAvailable: true,
        canEnter: true,
      }],
      availableCampaigns: [],
    }),
  }));
  await page.route("**/api/campaigns/outpost-k17/state", async (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify(state),
  }));
  await page.goto("/?view=campaigns");
  await expect(page.getByText("CAMPAIGN LIVE", { exact: true })).toBeVisible();
  await expect(page.locator(".unit-roster").getByRole("button", { name: /ATLAS-1/ })).toBeVisible();
  await page.locator(".unit-roster").getByRole("button", { name: /ATLAS-1/ }).click();
  const composer = page.locator(".right-panel");
  await expect(composer.getByRole("button", { name: "AIRDROP", exact: true })).toBeVisible();
  await composer.getByRole("button", { name: "AIRDROP", exact: true }).click();
  await expect(composer.getByLabel("MANIFESTED DROP UNIT")).toContainText("RAVEN-DROP");
  await expect(composer.getByText(/flight path must be straight/)).toBeVisible();
  await expect(composer.getByText(/hazardous drops fail closed/)).toBeVisible();
});

test("tactical composer exposes every currently executable action and no catalogue-only controls", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/?view=campaigns");
  await ensurePlayableK17(page, true);
  const openingRequisitionResponse = await page.request.get("/api/requisition", {
    headers: { "x-demo-user": "demo-user" },
  });
  expect(openingRequisitionResponse.status()).toBe(200);
  const openingRequisition = await openingRequisitionResponse.json() as { balance: number };
  await expect(page.getByText("CAMPAIGN LIVE", { exact: true })).toBeVisible();
  const composer = page.locator(".right-panel");

  await page.locator(".unit-roster").getByRole("button", { name: /BELLATR/ }).click();
  await expect(composer.getByRole("button", { name: "CREW REPAIR", exact: true })).toBeVisible();
  await composer.getByRole("button", { name: "CREW REPAIR", exact: true }).click();
  await expect(composer.getByText(/full stationary round/)).toBeVisible();
  await expect(composer.getByText(/receives no Armor benefit/)).toBeVisible();
  await expect(composer.getByLabel("DAMAGED SUBSYSTEM")).toContainText("MOBILITY");
  await composer.getByRole("button", { name: /SUBMIT ORDER|UPDATE ORDER/ }).click();
  await expect(page.getByText(/BELLATR order submitted to campaign command/)).toBeVisible();

  await page.locator(".unit-roster").getByRole("button", { name: /CARR-6/ }).click();
  await expect(composer.getByRole("button", { name: "CREW REPAIR", exact: true })).toBeVisible();
  await composer.getByRole("button", { name: "CREW REPAIR", exact: true }).click();
  await expect(composer.getByLabel("DAMAGED SUBSYSTEM")).toContainText("MOBILITY");
  await composer.getByRole("button", { name: /SUBMIT ORDER|UPDATE ORDER/ }).click();
  await expect(page.getByText(/CARR-6 order submitted to campaign command/)).toBeVisible();

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
  await expect(composer.getByRole("button", { name: "LOAD", exact: true })).toBeVisible();
  await expect(composer.getByRole("button", { name: "UNLOAD", exact: true })).toBeVisible();
  await composer.getByRole("button", { name: "RELOAD", exact: true }).click();
  await expect(composer.getByText(/SMALL SUPPLY:/)).toBeVisible();
  await expect(composer.getByRole("button", { name: "DEPLOY", exact: true })).toBeVisible();
  await expect(composer.getByRole("button", { name: "PACK_UP", exact: true })).toHaveCount(0);
  await composer.getByRole("button", { name: "DEPLOY", exact: true }).click();
  await expect(composer.getByText(/CURRENT STATE: PACKED/)).toBeVisible();
  await composer.getByRole("button", { name: /SUBMIT ORDER|UPDATE ORDER/ }).click();
  await expect(page.getByText(/LONGBOW order submitted to campaign command/)).toBeVisible();
  const orderReadiness = page.getByRole("region", { name: "Allied order readiness" });
  await expect(orderReadiness).toContainText("SUBMITTED");
  await expect(orderReadiness).toContainText("MISSING");
  const mapIntentions = page.getByRole("region", { name: "Submitted Allied map intentions" });
  await expect(mapIntentions).toContainText("LONGBOW");
  await expect(mapIntentions).toContainText("FORTIFY");
  await expect(mapIntentions).toContainText("DEPLOY");
  const longbowIntent = mapIntentions.getByRole("button", { name: /LONGBOW fortify intent/i });
  await longbowIntent.click();
  await expect(longbowIntent).toHaveAttribute("aria-pressed", "true");
  await longbowIntent.click();
  await expect(longbowIntent).toHaveAttribute("aria-pressed", "false");
  await composer.getByRole("button", { name: "WITHDRAW ORDER" }).click();
  await expect(composer.getByText(/returns to MISSING/)).toBeVisible();
  await composer.getByRole("button", { name: "CONFIRM WITHDRAW" }).click();
  await expect(page.getByText(/LONGBOW order withdrawn/)).toBeVisible();
  await expect(mapIntentions.getByText("LONGBOW", { exact: true })).toHaveCount(0);
  await composer.getByRole("button", { name: "DEPLOY", exact: true }).click();
  await composer.getByRole("button", { name: "SUBMIT ORDER" }).click();
  await expect(page.getByText(/LONGBOW order submitted to campaign command/)).toBeVisible();
  await expect(mapIntentions.getByText("LONGBOW", { exact: true })).toBeVisible();

  const tacticalState = await page.request.get("/api/campaigns/campaign-k17-relay/state", {
    headers: { "x-demo-user": "demo-user" },
  });
  const markerState = await tacticalState.json() as CampaignView;
  const markerHex = markerState.map.find((hex) => hex.visibility !== "UNKNOWN")!;
  const markerResponse = await page.evaluate(async ({ coord }) => {
    const response = await fetch("/api/campaigns/campaign-k17-relay/markers", {
      method: "POST",
      headers: { "content-type": "application/json", "x-demo-user": "demo-user" },
      body: JSON.stringify({
        commandId: `browser-marker-${crypto.randomUUID()}`,
        operation: "PLACE",
        kind: "ATTACK",
        coord,
        label: "FOCUS FIRE",
      }),
    });
    return { status: response.status, body: await response.text() };
  }, { coord: markerHex.coord });
  expect(markerResponse, markerResponse.body).toMatchObject({ status: 201 });
  const commandMarkers = page.getByRole("region", { name: "Shared Allied tactical markers" });
  await expect(commandMarkers).toContainText("ATTACK");
  await expect(commandMarkers).toContainText("FOCUS FIRE");
  await commandMarkers.getByRole("button", { name: /Clear ATTACK marker/ }).click();
  await expect(commandMarkers).toHaveCount(0);

  await page.locator(".unit-roster").getByRole("button", { name: /DOC-7/ }).click();
  await expect(composer.getByRole("button", { name: "HEAL", exact: true })).toBeVisible();
  await composer.getByRole("button", { name: "HEAL", exact: true }).click();
  await expect(composer.getByLabel("WOUNDED INFANTRY")).toContainText("POLAR-1");
  await expect(composer.getByText(/MEDICAL SUPPLY:/)).toBeVisible();
  await composer.getByRole("button", { name: /SUBMIT ORDER|UPDATE ORDER/ }).click();
  await expect(page.getByText(/DOC-7 order submitted to campaign command/)).toBeVisible();
  await expect(mapIntentions).toContainText("DOC-7");
  await expect(mapIntentions).toContainText("SUPPORT");
  await expect(mapIntentions).toContainText("HEAL");
  await mapIntentions.getByRole("button", { name: "HIDE" }).click();
  await expect(mapIntentions.getByText("LONGBOW", { exact: true })).toHaveCount(0);
  await mapIntentions.getByRole("button", { name: "SHOW" }).click();
  await expect(mapIntentions.getByText("LONGBOW", { exact: true })).toBeVisible();
  await submitRelayDefenceOrder(page);
  await submitEngineerRazorWire(page);
  await resolveCurrentK17Round(page);

  await expect.poll(async () => {
    const response = await page.request.get("/api/campaigns/campaign-k17-relay/state", {
      headers: { "x-demo-user": "demo-user" },
    });
    if (!response.ok()) return false;
    const state = await response.json() as {
      deployments?: Array<{ callsign: string; supplies?: Record<string, number>; statuses?: string[]; subsystems?: Array<{ subsystemId: string; state: string }> }>;
      events?: Array<{ type: string; actor?: string; payload?: Record<string, unknown> }>;
      map?: Array<{ structureIds: string[] }>;
    };
    const medic = state.deployments?.find((deployment) => deployment.callsign === "DOC-7");
    const artillery = state.deployments?.find((deployment) => deployment.callsign === "LONGBOW");
    const carrier = state.deployments?.find((deployment) => deployment.callsign === "CARR-6");
    const tank = state.deployments?.find((deployment) => deployment.callsign === "BELLATR");
    const razorWireBuilt = state.map?.some((hex) =>
      hex.structureIds.some((id) => id.startsWith("structure-razor-wire:"))
    );
    return medic?.supplies?.MEDICAL_SUPPLY === 3 &&
      artillery?.statuses?.includes("DEPLOYED") === true &&
      razorWireBuilt === true &&
      state.events?.some((event) => event.type === "EVASIVE_MANEUVER" && event.actor?.includes("force-nomad") && event.payload?.active === true) === true &&
      state.events?.some((event) => event.type === "UNIT_HEALED") === true &&
      carrier?.subsystems?.some((subsystem) => subsystem.subsystemId === "MOBILITY" && subsystem.state === "OPERATIONAL") === true &&
      tank?.subsystems?.some((subsystem) => subsystem.subsystemId === "MOBILITY" && subsystem.state === "OPERATIONAL") === true &&
      state.events.some((event) => event.type === "UNIT_REPAIRED" && event.actor?.includes("force-carrier-6") && event.payload.conflictId === "RC-V5-024") === true &&
      state.events.some((event) => event.type === "UNIT_REPAIRED" && event.actor?.includes("force-bellator") && event.payload.conflictId === "RC-V5-024") === true &&
      state.events.some((event) => event.type === "ARTILLERY_DEPLOYED") === true &&
      state.events.some((event) => event.type === "STRUCTURE_COMPLETED" && event.payload.structureDefinitionId === "structure-razor-wire") === true;
  }).toBe(true);

  await page.reload();
  await expect(page.getByText("CAMPAIGN LIVE", { exact: true })).toBeVisible();
  const persistedCarrier = await page.request.get("/api/forces/force-carrier-6", {
    headers: { "x-demo-user": "demo-user" },
  });
  expect(persistedCarrier.status()).toBe(200);
  await expect(persistedCarrier.json()).resolves.toMatchObject({
    definitionId: "unit-infantry-fighting-vehicle",
    callsign: "CARR-6",
    subsystems: expect.arrayContaining([{ subsystemId: "MOBILITY", state: "OPERATIONAL" }]),
  });
  const persistedTank = await page.request.get("/api/forces/force-bellator", {
    headers: { "x-demo-user": "demo-user" },
  });
  expect(persistedTank.status()).toBe(200);
  await expect(persistedTank.json()).resolves.toMatchObject({
    definitionId: "unit-main-battle-tank",
    callsign: "BELLATR",
    subsystems: expect.arrayContaining([{ subsystemId: "MOBILITY", state: "OPERATIONAL" }]),
  });
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
  await expect(composer.getByRole("button", { name: "LOAD", exact: true })).toBeVisible();
  await expect(composer.getByRole("button", { name: "UNLOAD", exact: true })).toBeVisible();
  await expect(composer.getByText(/CARGO 1\/2 SLOTS · 5 SMALL SUPPLY/)).toBeVisible();
  await expect(composer.getByRole("button", { name: "RESUPPLY", exact: true })).toBeVisible();
  await composer.getByRole("button", { name: "RESUPPLY", exact: true }).click();
  await expect(composer.getByLabel("FIELD RESUPPLY TARGET")).toContainText("LONGBOW");
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
    rewardStatus: "PUBLISHED",
    rewardAmount: 25,
  });

  await expect.poll(async () => {
    const response = await page.request.get("/api/requisition", {
      headers: { "x-demo-user": "demo-user" },
    });
    if (!response.ok()) return undefined;
    return ((await response.json()) as { balance: number }).balance;
  }).toBe(openingRequisition.balance + 25);

  await page.reload();
  await expect(page.getByText("MISSION ACCOMPLISHED", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "OPEN AFTER-ACTION REPORT" }).click();
  await expect(page.getByRole("heading", { name: "Campaign Reports" })).toBeVisible();
  await expect(page.getByText("MISSION ACCOMPLISHED", { exact: true })).toBeVisible();
  const rewards = page.getByRole("region", { name: "Campaign rewards" });
  await expect(rewards.getByText("RECORDED", { exact: true })).toBeVisible();
  await expect(rewards.getByText("+25 RP", { exact: true })).toBeVisible();
  await expect(rewards).toContainText("public-v1-economy@1");
  await page.getByRole("navigation", { name: "Resolved campaign rounds" }).getByRole("button", { name: /ROUND\s+1/ }).click();
  await expect(page.getByText(/CARR-6's exposed crew restored MOBILITY without Armor benefit/).first()).toBeVisible();
  await expect(page.getByText(/RC-V5-024/).first()).toBeVisible();
  await page.getByRole("navigation", { name: "Resolved campaign rounds" }).getByRole("button", { name: /ROUND\s+4/ }).click();
  const replay = page.getByRole("region", { name: "Round 4 event playback" });
  await expect(replay).toBeVisible();
  await expect(replay.getByRole("img", { name: "Round 4 tactical reconstruction" })).toBeVisible();
  await replay.getByRole("button", { name: "Restart playback" }).click();
  await expect(replay).toContainText("ROUND LOCKED");
  await replay.getByRole("button", { name: "Next event" }).click();
  await expect(replay).not.toContainText("EVENT 0 /");
  await expect(replay.getByLabel("Units at current playback step")).toContainText("ANVIL");
  const warEffects = page.getByRole("region", { name: "Strategic war effects" });
  await expect(warEffects.getByText("ACKNOWLEDGED WAR EFFECTS", { exact: true })).toBeVisible();
  await expect(warEffects).toContainText("No additional node, route, or follow-on operation change was authored for this result.");
  await warEffects.getByRole("button", { name: "RETURN SURVIVORS TO GALACTIC OPERATIONS" }).click();
  await expect(page.getByText(/GALACTIC OPERATIONS/).first()).toBeVisible();
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
  await expect(page.locator(".map-legend")).toContainText("MOVE");
  await expect(page.locator(".map-legend")).toContainText("ATTACK");
  await expect(page.locator(".map-legend")).toContainText("SUPPORT");
  await expect(page.locator(".map-legend")).toContainText("FORTIFY");
});

test("public and authenticated shells do not overflow a 390px viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto("/?signedout=1");
  await expect(page.getByRole("heading", { name: "Corinth is not lost. Not yet." })).toBeVisible();
  await expectNoDocumentOverflow(page);

  await page.goto("/?view=campaigns");
  await ensurePlayableK17(page);
  await expectNoDocumentOverflow(page);
});
