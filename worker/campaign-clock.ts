import type {
  CampaignClock,
  CampaignEvent,
  CampaignEventType,
  CampaignPhase,
  CampaignRuntimeState,
} from "../packages/domain/src";

export const CLOCK_PRESETS = {
  manual: 0,
  "1m": 60_000,
  "5m": 300_000,
  "30m": 1_800_000,
  "24h": 86_400_000,
} as const;

export type ClockPreset = keyof typeof CLOCK_PRESETS;
type ActiveCampaignPhase = Exclude<CampaignPhase, "PAUSED">;

function eventSequence(state: CampaignRuntimeState): number {
  return (
    Math.max(
      0,
      ...state.events.filter((event) => event.round === state.round).map((event) => event.sequence),
    ) + 1
  );
}

function appendClockEvent(
  state: CampaignRuntimeState,
  type: Extract<CampaignEventType, "CAMPAIGN_PAUSED" | "CAMPAIGN_RESUMED">,
  timestamp: number,
  payload: Record<string, unknown>,
): CampaignRuntimeState {
  const sequence = eventSequence(state);
  const event: CampaignEvent = {
    eventId: `${state.campaignId}:${state.round}:${String(sequence).padStart(4, "0")}:${type}`,
    campaignId: state.campaignId,
    round: state.round,
    sequence,
    type,
    payload,
    timestamp,
    visibility: "PUBLIC",
  };
  return { ...state, events: [...state.events, event], version: state.version + 1 };
}

function phaseToRestore(state: CampaignRuntimeState): ActiveCampaignPhase {
  if (state.clock.phaseBeforePause) return state.clock.phaseBeforePause;

  // Compatibility for paused state written before phaseBeforePause was persisted.
  const hasCurrentRoundLock = state.clock.schedule.some(
    (event) => event.round === state.round && event.type === "ORDER_LOCK",
  );
  const hasCurrentRoundResolution = state.clock.schedule.some(
    (event) => event.round === state.round && event.type === "ROUND_RESOLVE",
  );
  return !hasCurrentRoundLock && hasCurrentRoundResolution ? "LOCKED" : "PLANNING";
}

export function makeRoundClock(
  campaignId: string,
  round: number,
  now: number,
  durationMs: number,
  configuredLockLeadMs: number,
): CampaignClock {
  if (durationMs === 0) {
    return {
      durationMs,
      lockLeadMs: 0,
      roundStartedAt: now,
      lockAt: 0,
      resolvesAt: 0,
      schedule: [],
    };
  }
  const lockLeadMs = Math.min(Math.max(1_000, configuredLockLeadMs), Math.floor(durationMs / 2));
  const resolvesAt = now + durationMs;
  const lockAt = resolvesAt - lockLeadMs;
  return {
    durationMs,
    lockLeadMs,
    roundStartedAt: now,
    lockAt,
    resolvesAt,
    schedule: [
      { id: `${campaignId}:${round}:lock`, type: "ORDER_LOCK", round, runAt: lockAt },
      { id: `${campaignId}:${round}:resolve`, type: "ROUND_RESOLVE", round, runAt: resolvesAt },
    ],
  };
}

export function nextScheduledTime(state: CampaignRuntimeState): number | null {
  if (state.phase === "PAUSED") return null;
  return state.clock.schedule.length === 0
    ? null
    : Math.min(...state.clock.schedule.map((event) => event.runAt));
}

export function isCurrentRoundOrderWindowOpen(state: CampaignRuntimeState, now: number): boolean {
  return state.phase === "PLANNING" && (state.clock.durationMs === 0 || now < state.clock.lockAt);
}

export function removeScheduledEvent(state: CampaignRuntimeState, id: string): CampaignRuntimeState {
  return {
    ...state,
    clock: { ...state.clock, schedule: state.clock.schedule.filter((event) => event.id !== id) },
  };
}

export function pauseClock(state: CampaignRuntimeState, now: number): CampaignRuntimeState {
  if (state.phase === "PAUSED") return state;
  const previousPhase = state.phase;
  return appendClockEvent(
    {
      ...state,
      phase: "PAUSED",
      clock: { ...state.clock, pausedAt: now, phaseBeforePause: previousPhase },
    },
    "CAMPAIGN_PAUSED",
    now,
    { previousPhase },
  );
}

export function resumeClock(state: CampaignRuntimeState, now: number): CampaignRuntimeState {
  if (state.phase !== "PAUSED" || state.clock.pausedAt === undefined) return state;
  const pausedAt = state.clock.pausedAt;
  const shift = Math.max(0, now - pausedAt);
  const resumedPhase = phaseToRestore(state);
  const clock: CampaignClock = {
    ...state.clock,
    lockAt: state.clock.lockAt === 0 ? 0 : state.clock.lockAt + shift,
    resolvesAt: state.clock.resolvesAt === 0 ? 0 : state.clock.resolvesAt + shift,
    schedule: state.clock.schedule.map((event) => ({ ...event, runAt: event.runAt + shift })),
  };
  delete clock.pausedAt;
  delete clock.phaseBeforePause;
  return appendClockEvent(
    { ...state, phase: resumedPhase, clock },
    "CAMPAIGN_RESUMED",
    now,
    { resumedPhase, pausedDurationMs: shift },
  );
}
