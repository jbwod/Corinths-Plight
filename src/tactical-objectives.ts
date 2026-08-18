import type { ObjectiveState } from "../packages/domain/src";

export type TacticalObjectiveIcon = "TARGET" | "SECURED" | "FAILED";

export interface TacticalObjectiveVisual {
  color: string;
  fill: string;
  icon: TacticalObjectiveIcon;
  iconColor: string;
  primary: boolean;
  radius: number;
  badgeRadius: number;
  ringDash: readonly number[];
  nameLabel: string;
  detailLabel: string;
  opacity: number;
}

const OWNER_COLORS = {
  ALLIED: { color: "#77e2d5", fill: "rgba(16, 66, 67, .9)" },
  ENEMY: { color: "#ff8064", fill: "rgba(78, 28, 23, .9)" },
  NEUTRAL: { color: "#e5c56f", fill: "rgba(67, 53, 25, .9)" },
} as const;

export function tacticalObjectiveVisual(
  objective: Pick<ObjectiveState, "id" | "name" | "owner" | "status">,
  primaryObjectiveId?: string,
): TacticalObjectiveVisual {
  const owner = OWNER_COLORS[objective.owner];
  const primary = objective.id === primaryObjectiveId;
  const icon: TacticalObjectiveIcon = objective.status === "SECURED"
    ? "SECURED"
    : objective.status === "FAILED"
      ? "FAILED"
      : "TARGET";

  return {
    ...owner,
    icon,
    iconColor: objective.status === "FAILED" ? "#ff9a82" : owner.color,
    primary,
    radius: primary ? 27 : 23,
    badgeRadius: primary ? 10 : 8.5,
    ringDash: objective.status === "ACTIVE" ? [5, 3] : objective.status === "FAILED" ? [2, 4] : [],
    nameLabel: objective.name.trim().slice(0, 28).toUpperCase(),
    detailLabel: `${primary ? "PRIMARY" : "OBJECTIVE"} · ${objective.owner} · ${objective.status}`,
    opacity: objective.status === "FAILED" ? .68 : 1,
  };
}

export function tacticalObjectiveAriaLabel(
  objective: Pick<ObjectiveState, "id" | "name" | "owner" | "status">,
  primaryObjectiveId?: string,
): string {
  const kind = objective.id === primaryObjectiveId ? "Primary objective" : "Objective";
  return `${kind} ${objective.name}. ${objective.owner.toLowerCase()} control. ${objective.status.toLowerCase()}.`;
}
