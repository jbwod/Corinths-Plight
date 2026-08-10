import type { CampaignEvent, CampaignRuntimeState, ViewerContext } from "../packages/domain/src";
import { projectCampaignState } from "../packages/rules-engine/src";

export interface CampaignRealtimeCursor {
  round: number;
  sequence: number;
  version: number;
}

export interface CampaignRealtimeProjection {
  cursor: CampaignRealtimeCursor;
  events: CampaignEvent[];
  truncated: boolean;
}

function afterCursor(event: CampaignEvent, cursor: CampaignRealtimeCursor): boolean {
  return event.round > cursor.round || (event.round === cursor.round && event.sequence > cursor.sequence);
}

export function campaignRealtimeProjection(
  state: CampaignRuntimeState,
  viewer: ViewerContext,
  since?: CampaignRealtimeCursor,
  limit = 100,
): CampaignRealtimeProjection {
  const projected = projectCampaignState(state, viewer, Date.now());
  const visibleEvents = [...projected.events]
    .sort((left, right) => left.round - right.round || left.sequence - right.sequence);
  const latest = visibleEvents.at(-1);
  const cursor = {
    round: latest?.round ?? state.round,
    sequence: latest?.sequence ?? 0,
    version: state.version,
  };
  if (!since) return { cursor, events: [], truncated: false };
  const missed = visibleEvents.filter((event) => afterCursor(event, since));
  return {
    cursor,
    events: missed.slice(-Math.max(1, limit)),
    truncated: missed.length > limit,
  };
}

export function parseCampaignRealtimeCursor(url: URL): CampaignRealtimeCursor | undefined {
  const round = Number(url.searchParams.get("sinceRound"));
  const sequence = Number(url.searchParams.get("sinceSequence"));
  const version = Number(url.searchParams.get("sinceVersion"));
  if (
    !Number.isInteger(round) || round < 1 ||
    !Number.isInteger(sequence) || sequence < 0 ||
    !Number.isInteger(version) || version < 0
  ) return undefined;
  return { round, sequence, version };
}
