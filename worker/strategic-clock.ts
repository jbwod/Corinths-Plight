export type StrategicClockPhase = "PLANNING" | "LOCKED" | "RESOLVING" | "PAUSED";
export type StrategicScheduleType = "STRATEGIC_ORDER_LOCK" | "STRATEGIC_ROUND_RESOLVE";

export interface StrategicScheduledEvent {
  id: string;
  mapId: string;
  round: number;
  type: StrategicScheduleType;
  runAt: number;
}

export interface StrategicClockState {
  durationMs: number;
  lockLeadMs: number;
  roundStartedAt: number;
  lockAt: number;
  resolvesAt: number;
  pausedAt?: number;
  phaseBeforePause?: Exclude<StrategicClockPhase, "PAUSED">;
  schedule: StrategicScheduledEvent[];
}

export function makeStrategicClock(
  mapId: string,
  round: number,
  startedAt: number,
  durationMs: number,
  lockLeadMs: number,
): StrategicClockState {
  if (!Number.isInteger(round) || round < 1) throw new Error("Strategic round must be positive.");
  if (!Number.isFinite(startedAt)) throw new Error("Strategic clock start is invalid.");
  if (!Number.isFinite(durationMs) || durationMs < 0) throw new Error("Strategic duration is invalid.");
  if (!Number.isFinite(lockLeadMs) || lockLeadMs < 0) throw new Error("Strategic lock lead is invalid.");

  if (durationMs === 0) {
    return {
      durationMs,
      lockLeadMs,
      roundStartedAt: startedAt,
      lockAt: 0,
      resolvesAt: 0,
      schedule: [],
    };
  }

  const resolvesAt = startedAt + durationMs;
  const lockAt = Math.max(startedAt, resolvesAt - Math.min(lockLeadMs, durationMs));
  return {
    durationMs,
    lockLeadMs,
    roundStartedAt: startedAt,
    lockAt,
    resolvesAt,
    schedule: [
      {
        id: `${mapId}:${round}:lock`,
        mapId,
        round,
        type: "STRATEGIC_ORDER_LOCK",
        runAt: lockAt,
      },
      {
        id: `${mapId}:${round}:resolve`,
        mapId,
        round,
        type: "STRATEGIC_ROUND_RESOLVE",
        runAt: resolvesAt,
      },
    ],
  };
}

export function strategicOrderWindowOpen(
  phase: StrategicClockPhase,
  clock: StrategicClockState,
  now: number,
): boolean {
  return phase === "PLANNING" && (clock.durationMs === 0 || now < clock.lockAt);
}

export function nextStrategicAlarm(clock: StrategicClockState): number | null {
  return clock.schedule.length === 0
    ? null
    : Math.min(...clock.schedule.map((scheduled) => scheduled.runAt));
}

export function removeStrategicSchedule(
  clock: StrategicClockState,
  type: StrategicScheduleType,
): StrategicClockState {
  return { ...clock, schedule: clock.schedule.filter((scheduled) => scheduled.type !== type) };
}

export function pauseStrategicClock(
  phase: StrategicClockPhase,
  clock: StrategicClockState,
  now: number,
): { phase: StrategicClockPhase; clock: StrategicClockState } {
  if (phase === "PAUSED") return { phase, clock };
  return {
    phase: "PAUSED",
    clock: { ...clock, pausedAt: now, phaseBeforePause: phase, schedule: [] },
  };
}

export function resumeStrategicClock(
  phase: StrategicClockPhase,
  clock: StrategicClockState,
  now: number,
  mapId: string,
  round: number,
): { phase: StrategicClockPhase; clock: StrategicClockState } {
  if (phase !== "PAUSED" || clock.pausedAt === undefined) return { phase, clock };
  const restoredPhase = clock.phaseBeforePause ?? "PLANNING";
  if (clock.durationMs === 0) {
    return {
      phase: restoredPhase,
      clock: { ...clock, pausedAt: undefined, phaseBeforePause: undefined, schedule: [] },
    };
  }
  const shiftedBy = Math.max(0, now - clock.pausedAt);
  const resumed = makeStrategicClock(
    mapId,
    round,
    clock.roundStartedAt + shiftedBy,
    clock.durationMs,
    clock.lockLeadMs,
  );
  if (restoredPhase === "LOCKED" || restoredPhase === "RESOLVING") {
    resumed.schedule = resumed.schedule.filter((scheduled) => scheduled.type !== "STRATEGIC_ORDER_LOCK");
  }
  return { phase: restoredPhase, clock: resumed };
}
