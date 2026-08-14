import { describe, expect, it } from "vitest";
import type { ObjectiveState } from "../packages/domain/src";
import { tacticalObjectiveAriaLabel, tacticalObjectiveVisual } from "./tactical-objectives";

const objective = (patch: Partial<ObjectiveState> = {}): ObjectiveState => ({
  id: "objective-relay",
  name: "Relay Station",
  coord: { q: 1, r: -1 },
  owner: "NEUTRAL",
  status: "ACTIVE",
  description: "Secure the relay.",
  ...patch,
});

describe("tactical objective visuals", () => {
  it("distinguishes the primary objective without inventing a new rules state", () => {
    const primary = tacticalObjectiveVisual(objective(), "objective-relay");
    const secondary = tacticalObjectiveVisual(objective(), "objective-other");
    expect(primary.primary).toBe(true);
    expect(primary.radius).toBeGreaterThan(secondary.radius);
    expect(primary.detailLabel).toBe("PRIMARY · NEUTRAL · ACTIVE");
    expect(secondary.detailLabel).toBe("OBJECTIVE · NEUTRAL · ACTIVE");
  });

  it("maps authoritative owner and status fields to distinct treatments", () => {
    const allied = tacticalObjectiveVisual(objective({ owner: "ALLIED", status: "SECURED" }));
    const enemy = tacticalObjectiveVisual(objective({ owner: "ENEMY" }));
    const failed = tacticalObjectiveVisual(objective({ status: "FAILED" }));
    expect(allied.icon).toBe("SECURED");
    expect(allied.ringDash).toEqual([]);
    expect(enemy.color).not.toBe(allied.color);
    expect(failed.icon).toBe("FAILED");
    expect(failed.opacity).toBeLessThan(1);
  });

  it("provides a complete keyboard description", () => {
    expect(tacticalObjectiveAriaLabel(
      objective({ owner: "ALLIED", status: "SECURED" }),
      "objective-relay",
    )).toBe("Primary objective Relay Station. allied control. secured.");
  });
});
