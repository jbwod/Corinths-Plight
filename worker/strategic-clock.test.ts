import { describe, expect, it } from "vitest";
import {
  makeStrategicClock,
  nextStrategicAlarm,
  pauseStrategicClock,
  removeStrategicSchedule,
  resumeStrategicClock,
  strategicOrderWindowOpen,
} from "./strategic-clock";

describe("strategic clock", () => {
  it("schedules a lock and resolution for a timed asynchronous round", () => {
    const clock = makeStrategicClock("strategic-map-corinth", 7, 1_000, 300_000, 30_000);
    expect(clock.lockAt).toBe(271_000);
    expect(clock.resolvesAt).toBe(301_000);
    expect(clock.schedule.map((entry) => entry.type)).toEqual([
      "STRATEGIC_ORDER_LOCK",
      "STRATEGIC_ROUND_RESOLVE",
    ]);
    expect(nextStrategicAlarm(clock)).toBe(271_000);
  });

  it("keeps manual rounds open without a bogus epoch alarm", () => {
    const clock = makeStrategicClock("strategic-map-corinth", 7, 1_000, 0, 30_000);
    expect(clock.schedule).toEqual([]);
    expect(nextStrategicAlarm(clock)).toBeNull();
    expect(strategicOrderWindowOpen("PLANNING", clock, Date.now())).toBe(true);
  });

  it("closes submissions at the exact lock and removes consumed schedules", () => {
    const clock = makeStrategicClock("strategic-map-corinth", 7, 1_000, 60_000, 10_000);
    expect(strategicOrderWindowOpen("PLANNING", clock, 50_999)).toBe(true);
    expect(strategicOrderWindowOpen("PLANNING", clock, 51_000)).toBe(false);
    expect(removeStrategicSchedule(clock, "STRATEGIC_ORDER_LOCK").schedule).toHaveLength(1);
  });

  it("restores a locked phase without reopening strategic orders", () => {
    const clock = makeStrategicClock("strategic-map-corinth", 4, 10_000, 60_000, 10_000);
    const paused = pauseStrategicClock("LOCKED", clock, 40_000);
    const resumed = resumeStrategicClock(paused.phase, paused.clock, 50_000, "strategic-map-corinth", 4);
    expect(resumed.phase).toBe("LOCKED");
    expect(resumed.clock.schedule.map((entry) => entry.type)).toEqual(["STRATEGIC_ROUND_RESOLVE"]);
    expect(strategicOrderWindowOpen(resumed.phase, resumed.clock, 50_000)).toBe(false);
  });
});
