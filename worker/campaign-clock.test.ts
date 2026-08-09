import type { CampaignClock, CampaignPhase, CampaignRuntimeState } from "../packages/domain/src";
import { describe, expect, it } from "vitest";
import {
  CLOCK_PRESETS,
  isCurrentRoundOrderWindowOpen,
  makeRoundClock,
  nextScheduledTime,
  pauseClock,
  resumeClock,
} from "./campaign-clock";

const CAMPAIGN_ID = "clock-test";

function makeState(clock: CampaignClock, phase: CampaignPhase = "PLANNING"): CampaignRuntimeState {
  return {
    campaignId: CAMPAIGN_ID,
    campaignName: "Clock Test",
    planetName: "Corinth",
    rulesetVersion: "rules-v5",
    engineVersion: "engine-test",
    round: 4,
    phase,
    clock,
    map: [],
    deployments: [],
    orders: [],
    objectives: [],
    events: [],
    resolutions: {},
    pendingPersistentEffects: [],
    version: 7,
  };
}

describe("campaign clock presets", () => {
  it("keeps the supported preset durations stable", () => {
    expect(CLOCK_PRESETS).toEqual({
      manual: 0,
      "1m": 60_000,
      "5m": 300_000,
      "30m": 1_800_000,
      "24h": 86_400_000,
    });
  });

  it.each([
    ["1m", CLOCK_PRESETS["1m"]],
    ["5m", CLOCK_PRESETS["5m"]],
    ["30m", CLOCK_PRESETS["30m"]],
    ["24h", CLOCK_PRESETS["24h"]],
  ] as const)("creates the %s timed lock and resolution schedule", (_preset, durationMs) => {
    const clock = makeRoundClock(CAMPAIGN_ID, 4, 10_000, durationMs, 30_000);

    expect(clock).toMatchObject({
      durationMs,
      lockLeadMs: 30_000,
      roundStartedAt: 10_000,
      lockAt: 10_000 + durationMs - 30_000,
      resolvesAt: 10_000 + durationMs,
    });
    expect(clock.schedule).toEqual([
      { id: `${CAMPAIGN_ID}:4:lock`, type: "ORDER_LOCK", round: 4, runAt: clock.lockAt },
      { id: `${CAMPAIGN_ID}:4:resolve`, type: "ROUND_RESOLVE", round: 4, runAt: clock.resolvesAt },
    ]);
  });
});

describe("manual campaign clock", () => {
  it("has no deadlines or alarms and keeps current-round orders open while planning", () => {
    const clock = makeRoundClock(CAMPAIGN_ID, 4, 10_000, CLOCK_PRESETS.manual, 30_000);
    const state = makeState(clock);

    expect(clock).toEqual({
      durationMs: 0,
      lockLeadMs: 0,
      roundStartedAt: 10_000,
      lockAt: 0,
      resolvesAt: 0,
      schedule: [],
    });
    expect(nextScheduledTime(state)).toBeNull();
    expect(isCurrentRoundOrderWindowOpen(state, Number.MAX_SAFE_INTEGER)).toBe(true);
    expect(isCurrentRoundOrderWindowOpen({ ...state, phase: "LOCKED" }, 10_000)).toBe(false);
  });

  it("still closes a timed planning window at its lock deadline", () => {
    const clock = makeRoundClock(CAMPAIGN_ID, 4, 10_000, CLOCK_PRESETS["1m"], 10_000);
    const state = makeState(clock);

    expect(isCurrentRoundOrderWindowOpen(state, clock.lockAt - 1)).toBe(true);
    expect(isCurrentRoundOrderWindowOpen(state, clock.lockAt)).toBe(false);
  });
});

describe("campaign pause and resume", () => {
  it("restores planning, shifts deadlines, emits canonical events, and increments version", () => {
    const state = makeState(makeRoundClock(CAMPAIGN_ID, 4, 10_000, CLOCK_PRESETS["1m"], 10_000));

    const paused = pauseClock(state, 20_000);
    expect(paused.phase).toBe("PAUSED");
    expect(paused.clock).toMatchObject({ pausedAt: 20_000, phaseBeforePause: "PLANNING" });
    expect(paused.version).toBe(8);
    expect(paused.events.at(-1)).toEqual({
      eventId: `${CAMPAIGN_ID}:4:0001:CAMPAIGN_PAUSED`,
      campaignId: CAMPAIGN_ID,
      round: 4,
      sequence: 1,
      type: "CAMPAIGN_PAUSED",
      payload: { previousPhase: "PLANNING" },
      timestamp: 20_000,
      visibility: "PUBLIC",
    });
    expect(nextScheduledTime(paused)).toBeNull();
    expect(state.phase).toBe("PLANNING");
    expect(state.version).toBe(7);

    const resumed = resumeClock(paused, 50_000);
    expect(resumed.phase).toBe("PLANNING");
    expect(resumed.clock.pausedAt).toBeUndefined();
    expect(resumed.clock.phaseBeforePause).toBeUndefined();
    expect(resumed.clock.lockAt).toBe(state.clock.lockAt + 30_000);
    expect(resumed.clock.resolvesAt).toBe(state.clock.resolvesAt + 30_000);
    expect(resumed.clock.schedule.map((event) => event.runAt)).toEqual(
      state.clock.schedule.map((event) => event.runAt + 30_000),
    );
    expect(resumed.version).toBe(9);
    expect(resumed.events.at(-1)).toEqual({
      eventId: `${CAMPAIGN_ID}:4:0002:CAMPAIGN_RESUMED`,
      campaignId: CAMPAIGN_ID,
      round: 4,
      sequence: 2,
      type: "CAMPAIGN_RESUMED",
      payload: { resumedPhase: "PLANNING", pausedDurationMs: 30_000 },
      timestamp: 50_000,
      visibility: "PUBLIC",
    });
    expect(resumed.orders).toBe(state.orders);
  });

  it("restores LOCKED rather than reopening the planning window", () => {
    const clock = makeRoundClock(CAMPAIGN_ID, 4, 10_000, CLOCK_PRESETS["1m"], 10_000);
    clock.schedule = clock.schedule.filter((event) => event.type !== "ORDER_LOCK");
    const locked = makeState(clock, "LOCKED");

    const resumed = resumeClock(pauseClock(locked, 20_000), 25_000);

    expect(resumed.phase).toBe("LOCKED");
    expect(resumed.events.at(-1)).toMatchObject({
      type: "CAMPAIGN_RESUMED",
      payload: { resumedPhase: "LOCKED", pausedDurationMs: 5_000 },
    });
    expect(isCurrentRoundOrderWindowOpen(resumed, 25_000)).toBe(false);
  });

  it("infers LOCKED for older paused state that predates persisted prior-phase data", () => {
    const clock = makeRoundClock(CAMPAIGN_ID, 4, 10_000, CLOCK_PRESETS["1m"], 10_000);
    clock.pausedAt = 20_000;
    clock.schedule = clock.schedule.filter((event) => event.type !== "ORDER_LOCK");
    const legacyPaused = makeState(clock, "PAUSED");

    expect(resumeClock(legacyPaused, 25_000).phase).toBe("LOCKED");
  });

  it("preserves a manual clock through pause and resume without creating deadlines", () => {
    const state = makeState(makeRoundClock(CAMPAIGN_ID, 4, 10_000, CLOCK_PRESETS.manual, 30_000));

    const resumed = resumeClock(pauseClock(state, 20_000), 50_000);

    expect(resumed.phase).toBe("PLANNING");
    expect(resumed.clock).toMatchObject({ lockAt: 0, resolvesAt: 0, schedule: [] });
    expect(nextScheduledTime(resumed)).toBeNull();
    expect(isCurrentRoundOrderWindowOpen(resumed, Number.MAX_SAFE_INTEGER)).toBe(true);
  });

  it("treats repeated pause or resume requests as idempotent", () => {
    const state = makeState(makeRoundClock(CAMPAIGN_ID, 4, 10_000, CLOCK_PRESETS["1m"], 10_000));
    const paused = pauseClock(state, 20_000);

    expect(pauseClock(paused, 21_000)).toBe(paused);
    const resumed = resumeClock(paused, 25_000);
    expect(resumeClock(resumed, 26_000)).toBe(resumed);
  });
});
